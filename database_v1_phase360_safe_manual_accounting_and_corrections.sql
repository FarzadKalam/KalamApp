-- =====================================================
-- KalamApp - Phase 360: safe manual accounting and corrections
-- Type: additive / idempotent / tenant scoped
-- Important: this migration does not rewrite or delete existing records.
-- =====================================================

-- -----------------------------------------------------
-- Supplemental detail accounts. Existing accounts are never renamed or changed.
-- -----------------------------------------------------
do $$
declare
  v_org_id uuid;
  v_parent_id uuid;
  r record;
begin
  for v_org_id in select id from public.organizations loop
    for r in
      select * from (values
        ('1103'::text, 'تنخواه', 'asset'::text, 'detail'::text, 'debit'::text, '110'::text),
        ('1122'::text, 'مساعده کارکنان', 'asset'::text, 'detail'::text, 'debit'::text, '112'::text),
        ('2122'::text, 'مالیات حقوق پرداختنی', 'liability'::text, 'detail'::text, 'credit'::text, '212'::text),
        ('2123'::text, 'بیمه پرداختنی', 'liability'::text, 'detail'::text, 'credit'::text, '212'::text),
        ('2124'::text, 'حساب واسط تهاتر', 'liability'::text, 'detail'::text, 'credit'::text, '212'::text),
        ('5203'::text, 'هزینه بیمه سهم کارفرما', 'expense'::text, 'detail'::text, 'debit'::text, '520'::text),
        ('5204'::text, 'هزینه‌های عمومی و اداری', 'expense'::text, 'detail'::text, 'debit'::text, '520'::text)
      ) as seed(code, name, account_type, account_level, nature, parent_code)
    loop
      select id into v_parent_id
      from public.chart_of_accounts
      where org_id = v_org_id and code = r.parent_code
      limit 1;

      insert into public.chart_of_accounts (
        org_id, code, name, account_type, account_level, nature,
        parent_id, is_leaf, is_system, is_active
      )
      values (
        v_org_id, r.code, r.name, r.account_type, r.account_level, r.nature,
        v_parent_id, true, true, true
      )
      on conflict (org_id, code) do nothing;

    end loop;
  end loop;
end $$;

-- Fill only missing operational mappings. Existing organization choices win.
do $$
declare
  v_org_id uuid;
  v_settings_id uuid;
  v_settings jsonb;
  v_existing jsonb;
  v_seed jsonb;
begin
  for v_org_id in select id from public.organizations loop
    select id, coalesce(settings, '{}'::jsonb)
    into v_settings_id, v_settings
    from public.integration_settings
    where org_id = v_org_id and connection_type = 'module_settings'
    limit 1;
    v_settings := coalesce(v_settings, '{}'::jsonb);

    select coalesce(jsonb_object_agg(seed.setting_key, coa.id::text), '{}'::jsonb)
    into v_seed
    from (values
      ('default_expense_account_id'::text, '5204'::text),
      ('default_expense_payable_id'::text, '2101'::text),
      ('default_employee_advance_id'::text, '1122'::text),
      ('default_payroll_expense_id'::text, '5201'::text),
      ('default_payroll_payable_id'::text, '2121'::text),
      ('default_payroll_tax_id'::text, '2122'::text),
      ('default_employee_insurance_payable_id'::text, '2123'::text),
      ('default_employer_insurance_expense_id'::text, '5203'::text),
      ('default_cheques_payable_id'::text, '2102'::text),
      ('default_cheques_receivable_id'::text, '1112'::text),
      ('default_barter_clearing_id'::text, '2124'::text),
      ('default_purchase_tax_id'::text, '5301'::text)
    ) as seed(setting_key, code)
    join public.chart_of_accounts coa
      on coa.org_id = v_org_id and coa.code = seed.code;

    v_existing := coalesce(v_settings #> '{modules,accounting,defaults}', '{}'::jsonb);
    v_settings := jsonb_set(v_settings, '{modules}', coalesce(v_settings->'modules', '{}'::jsonb), true);
    v_settings := jsonb_set(v_settings, '{modules,accounting}', coalesce(v_settings #> '{modules,accounting}', '{}'::jsonb), true);
    v_settings := jsonb_set(v_settings, '{modules,accounting,defaults}', v_seed || v_existing, true);

    insert into public.integration_settings (id, org_id, connection_type, provider, is_active, settings)
    values (coalesce(v_settings_id, gen_random_uuid()), v_org_id, 'module_settings', 'core', true, v_settings)
    on conflict (org_id, connection_type) do update
      set settings = excluded.settings, provider = excluded.provider, is_active = true;
  end loop;
end $$;

-- -----------------------------------------------------
-- Audit trail for controlled correction/reversal of posted entries.
-- -----------------------------------------------------
create table if not exists public.journal_entry_corrections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade default public.current_org_id(),
  original_entry_id uuid not null references public.journal_entries(id) on delete restrict,
  correction_entry_id uuid not null references public.journal_entries(id) on delete restrict,
  reason text not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  before_snapshot jsonb not null default '{}'::jsonb,
  after_snapshot jsonb not null default '{}'::jsonb
);

create index if not exists idx_journal_entry_corrections_org_created
  on public.journal_entry_corrections(org_id, created_at desc);
create index if not exists idx_journal_entry_corrections_original
  on public.journal_entry_corrections(original_entry_id);
create index if not exists idx_journal_entry_corrections_correction
  on public.journal_entry_corrections(correction_entry_id);

alter table public.journal_entry_corrections enable row level security;
drop policy if exists p_journal_entry_corrections_org_all on public.journal_entry_corrections;
create policy p_journal_entry_corrections_org_all
on public.journal_entry_corrections
for all to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

-- The source key is retained in metadata for legacy payment rows. This index is
-- intentionally non-unique because old data may contain duplicates and must not
-- be rewritten by this migration.
create index if not exists idx_cash_bank_operations_source_metadata
  on public.cash_bank_operations(org_id, (metadata->>'source_table'), (metadata->>'source_record_id'), (metadata->>'source_row_key'));

-- -----------------------------------------------------
-- Controlled reversal: original posted entry stays available, while a new draft
-- with reversed lines and a complete audit record is created atomically.
-- -----------------------------------------------------
create or replace function public.create_journal_entry_correction(
  p_entry_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_user_id uuid := auth.uid();
  v_original public.journal_entries%rowtype;
  v_correction_id uuid;
  v_line record;
  v_total_debit numeric(18,2) := 0;
  v_total_credit numeric(18,2) := 0;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_user_id is null or v_org_id is null then
    raise exception 'دسترسی به سازمان جاری معتبر نیست.' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'دلیل اصلاح سند الزامی است.' using errcode = '22023';
  end if;

  select * into v_original
  from public.journal_entries
  where id = p_entry_id
    and org_id = v_org_id
  for update;

  if not found then
    raise exception 'سند موردنظر یافت نشد.' using errcode = 'P0002';
  end if;
  if v_original.status <> 'posted' then
    raise exception 'فقط سند ثبت‌شده قابل اصلاح کنترل‌شده است.' using errcode = '22023';
  end if;

  insert into public.journal_entries (
    org_id, fiscal_year_id, entry_date, description, status,
    source_module, source_table, source_record_id, reversal_of_entry_id,
    metadata, created_by, updated_by
  ) values (
    v_org_id, v_original.fiscal_year_id, v_original.entry_date,
    'پیش‌نویس اصلاح سند: ' || coalesce(v_original.entry_no, v_original.id::text),
    'draft', v_original.source_module, v_original.source_table,
    v_original.source_record_id, v_original.id,
    jsonb_build_object(
      'posting_mode', 'controlled_correction',
      'correction_reason', v_reason,
      'original_entry_id', v_original.id
    ),
    v_user_id, v_user_id
  ) returning id into v_correction_id;

  for v_line in
    select account_id, line_no, description, debit, credit, cost_center_id, project_id, party_type, party_id, metadata, tags
    from public.journal_lines
    where entry_id = v_original.id
    order by line_no
  loop
    insert into public.journal_lines (
      entry_id, line_no, account_id, description, debit, credit,
      cost_center_id, project_id, party_type, party_id, metadata, tags
    ) values (
      v_correction_id, v_line.line_no, v_line.account_id,
      'اصلاح: ' || coalesce(v_line.description, ''),
      v_line.credit, v_line.debit, v_line.cost_center_id,
      v_line.project_id, v_line.party_type, v_line.party_id,
      coalesce(v_line.metadata, '{}'::jsonb) || jsonb_build_object('correction_of_line', v_line.line_no),
      coalesce(v_line.tags, '[]'::jsonb)
    );
    v_total_debit := v_total_debit + coalesce(v_line.credit, 0);
    v_total_credit := v_total_credit + coalesce(v_line.debit, 0);
  end loop;

  update public.journal_entries
  set total_debit = v_total_debit,
      total_credit = v_total_credit,
      updated_at = now(),
      updated_by = v_user_id
  where id = v_correction_id;

  update public.journal_entries
  set status = 'reversed', updated_at = now(), updated_by = v_user_id
  where id = v_original.id;

  insert into public.journal_entry_corrections (
    org_id, original_entry_id, correction_entry_id, reason, created_by,
    before_snapshot, after_snapshot
  ) values (
    v_org_id, v_original.id, v_correction_id, v_reason, v_user_id,
    jsonb_build_object('status', v_original.status, 'entry_no', v_original.entry_no,
      'total_debit', v_original.total_debit, 'total_credit', v_original.total_credit),
    jsonb_build_object('status', 'draft', 'entry_id', v_correction_id,
      'total_debit', v_total_debit, 'total_credit', v_total_credit)
  );

  return v_correction_id;
end;
$$;

revoke all on function public.create_journal_entry_correction(uuid, text) from public;
grant execute on function public.create_journal_entry_correction(uuid, text) to authenticated;
