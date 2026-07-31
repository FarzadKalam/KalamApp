-- =====================================================
-- KalamApp - Phase 429 Payroll Source Lock Scopes
-- Date: 2026-07-31
-- Type: Additive / idempotent migration
-- =====================================================

begin;

-- مجوز اتصال به فیش برای همان سطرهای منبع و فقط در همان تراکنش نگهداری می‌شود.
create table if not exists public.payroll_source_mutation_scopes (
  scope_token uuid not null,
  org_id uuid not null references public.organizations(id) on delete cascade,
  table_name text not null check (table_name in (
    'payroll_calculation_entries',
    'employee_bonus_requests',
    'employee_penalty_requests',
    'employee_advances',
    'commission_drafts'
  )),
  record_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (scope_token, table_name, record_id)
);

alter table public.payroll_source_mutation_scopes
  drop constraint if exists payroll_source_mutation_scopes_table_name_check;
alter table public.payroll_source_mutation_scopes
  add constraint payroll_source_mutation_scopes_table_name_check
  check (table_name in (
    'payroll_calculation_entries',
    'employee_bonus_requests',
    'employee_penalty_requests',
    'employee_advances',
    'commission_drafts'
  ));

create index if not exists idx_payroll_source_mutation_scopes_lookup
  on public.payroll_source_mutation_scopes(org_id, table_name, record_id);

alter table public.payroll_source_mutation_scopes enable row level security;
revoke all on table public.payroll_source_mutation_scopes from public, anon, authenticated;

-- اجرای ناموفق RPC تراکنش را rollback می‌کند؛ این پاکسازی فقط پوشش باقی‌مانده‌های
-- قدیمی است و مجوزی دائمی ایجاد نمی‌کند.
delete from public.payroll_source_mutation_scopes
where created_at < now() - interval '15 minutes';

create or replace function public.prevent_locked_record_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked boolean := false;
  v_payroll_source_sync boolean := false;
  v_scoped_payroll_source_sync boolean := false;
begin
  if tg_op not in ('UPDATE', 'DELETE') then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    v_scoped_payroll_source_sync := exists (
      select 1
      from public.payroll_source_mutation_scopes scope
      where scope.org_id = old.org_id
        and scope.table_name = tg_table_name
        and scope.record_id = old.id
    );

    if v_scoped_payroll_source_sync
      or current_setting('app.payroll_source_sync', true) = 'active'
    then
      v_payroll_source_sync := case tg_table_name
        when 'payroll_calculation_entries' then
          (to_jsonb(new) - array['status', 'payroll_slip_id', 'updated_at'])
            is not distinct from
          (to_jsonb(old) - array['status', 'payroll_slip_id', 'updated_at'])
        when 'employee_bonus_requests' then
          (to_jsonb(new) - array['related_payroll_slip_id', 'updated_at'])
            is not distinct from
          (to_jsonb(old) - array['related_payroll_slip_id', 'updated_at'])
        when 'employee_penalty_requests' then
          (to_jsonb(new) - array['related_payroll_slip_id', 'updated_at'])
            is not distinct from
          (to_jsonb(old) - array['related_payroll_slip_id', 'updated_at'])
        when 'employee_advances' then
          (to_jsonb(new) - array['related_payroll_slip_id', 'updated_at'])
            is not distinct from
          (to_jsonb(old) - array['related_payroll_slip_id', 'updated_at'])
        when 'commission_drafts' then
          (to_jsonb(new) - array['posted_amount', 'remaining_amount', 'draft_status', 'updated_at'])
            is not distinct from
          (to_jsonb(old) - array['posted_amount', 'remaining_amount', 'draft_status', 'updated_at'])
        else false
      end;

      if v_payroll_source_sync then
        return new;
      end if;
    end if;
  end if;

  select exists (
    select 1
    from public.record_locks lock_row
    where lock_row.org_id = old.org_id
      and lock_row.record_id = old.id
      and (
        lock_row.module_id = tg_table_name
        or lock_row.metadata ->> 'table_name' = tg_table_name
      )
  )
  into v_locked;

  if v_locked then
    raise exception 'این رکورد قفل شده و قابل تغییر یا حذف نیست.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.release_payroll_sources(
  p_org_id uuid,
  p_payroll_slip_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope_token uuid := gen_random_uuid();
  v_snapshot jsonb := '{}'::jsonb;
begin
  if p_org_id is null or p_payroll_slip_id is null then
    return;
  end if;

  select coalesce(performance_snapshot, '{}'::jsonb)
    into v_snapshot
  from public.payroll_slips
  where id = p_payroll_slip_id
    and org_id = p_org_id;

  insert into public.payroll_source_mutation_scopes (scope_token, org_id, table_name, record_id)
  select v_scope_token, p_org_id, source.table_name, source.record_id
  from (
    select 'payroll_calculation_entries'::text as table_name, entry.id as record_id
    from public.payroll_calculation_entries entry
    where entry.org_id = p_org_id
      and (
        entry.payroll_slip_id = p_payroll_slip_id
        or entry.id in (
          select item.value::uuid
          from jsonb_array_elements_text(coalesce(v_snapshot->'payroll_ledger_entry_ids', '[]'::jsonb)) as item(value)
          where item.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
      )
    union all
    select 'employee_bonus_requests'::text, request.id
    from public.employee_bonus_requests request
    where request.org_id = p_org_id
      and request.related_payroll_slip_id = p_payroll_slip_id
    union all
    select 'employee_penalty_requests'::text, request.id
    from public.employee_penalty_requests request
    where request.org_id = p_org_id
      and request.related_payroll_slip_id = p_payroll_slip_id
    union all
    select 'employee_advances'::text, advance.id
    from public.employee_advances advance
    where advance.org_id = p_org_id
      and (
        advance.related_payroll_slip_id = p_payroll_slip_id
        or advance.id in (
          select item.value::uuid
          from jsonb_array_elements_text(coalesce(v_snapshot->'employee_advance_ids', '[]'::jsonb)) as item(value)
          where item.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
      )
    union all
    select 'commission_drafts'::text, draft.id
    from public.commission_drafts draft
    where draft.org_id = p_org_id
      and exists (
        select 1
        from public.payroll_calculation_entries entry
        where entry.org_id = p_org_id
          and entry.source_type = 'commission'
          and entry.employee_id = draft.employee_id
          and entry.period_start = draft.period_start
          and entry.period_end = draft.period_end
          and (
            entry.payroll_slip_id = p_payroll_slip_id
            or entry.id in (
              select item.value::uuid
              from jsonb_array_elements_text(coalesce(v_snapshot->'payroll_ledger_entry_ids', '[]'::jsonb)) as item(value)
              where item.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            )
          )
      )
  ) as source
  on conflict do nothing;

  perform public._release_payroll_sources_internal(p_org_id, p_payroll_slip_id);

  delete from public.payroll_source_mutation_scopes
  where scope_token = v_scope_token;
end;
$$;

revoke all on function public.release_payroll_sources(uuid, uuid) from public, anon, authenticated;

create or replace function public.create_payroll_slip_from_wizard(
  p_payload jsonb,
  p_ledger_entry_ids uuid[] default array[]::uuid[],
  p_bonus_request_ids uuid[] default array[]::uuid[],
  p_penalty_request_ids uuid[] default array[]::uuid[],
  p_advance_ids uuid[] default array[]::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_employee_id uuid := nullif(trim(p_payload->>'employee_id'), '')::uuid;
  v_period_start date := nullif(trim(p_payload->>'period_start'), '')::date;
  v_period_end date := nullif(trim(p_payload->>'period_end'), '')::date;
  v_ledger_ids uuid[] := array[]::uuid[];
  v_advance_ids uuid[] := array[]::uuid[];
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_scope_token uuid := gen_random_uuid();
  v_slip_id uuid;
begin
  if v_org_id is null or v_employee_id is null or v_period_start is null or v_period_end is null then
    raise exception 'invalid_payroll_wizard_payload';
  end if;
  if not public.current_user_has_role_permission_entry('payroll_slips', 'edit', null, true) then
    raise exception 'payroll_creation_not_allowed';
  end if;

  select coalesce(array_agg(distinct item), array[]::uuid[])
    into v_ledger_ids
  from unnest(coalesce(p_ledger_entry_ids, array[]::uuid[])) as item;
  select coalesce(array_agg(distinct item), array[]::uuid[])
    into v_advance_ids
  from unnest(coalesce(p_advance_ids, array[]::uuid[])) as item;

  -- داخلیِ RPC همهٔ این شناسه‌ها را با سازمان، کارمند، دوره و وضعیت اعتبارسنجی
  -- می‌کند. اگر هر مورد نامعتبر باشد، rollback همین scope را هم پاک می‌کند.
  insert into public.payroll_source_mutation_scopes (scope_token, org_id, table_name, record_id)
  select v_scope_token, v_org_id, source.table_name, source.record_id
  from (
    select 'payroll_calculation_entries'::text as table_name, item as record_id
    from unnest(v_ledger_ids) as item
    union all
    select 'employee_bonus_requests'::text, item
    from unnest(coalesce(p_bonus_request_ids, array[]::uuid[])) as item
    union all
    select 'employee_penalty_requests'::text, item
    from unnest(coalesce(p_penalty_request_ids, array[]::uuid[])) as item
    union all
    select 'employee_advances'::text, item
    from unnest(v_advance_ids) as item
  ) as source
  where source.record_id is not null
  on conflict do nothing;

  v_payload := v_payload || jsonb_build_object(
    'performance_snapshot',
    coalesce(v_payload->'performance_snapshot', '{}'::jsonb)
      || jsonb_build_object(
        'payroll_ledger_entry_ids', to_jsonb(v_ledger_ids),
        'employee_advance_ids', to_jsonb(v_advance_ids)
      )
  );

  v_slip_id := public._create_payroll_slip_from_wizard_internal(
    v_payload,
    v_ledger_ids,
    p_bonus_request_ids,
    p_penalty_request_ids,
    v_advance_ids
  );

  delete from public.payroll_source_mutation_scopes
  where scope_token = v_scope_token;

  return v_slip_id;
end;
$$;

revoke all on function public.create_payroll_slip_from_wizard(jsonb, uuid[], uuid[], uuid[], uuid[])
  from public, anon;
grant execute on function public.create_payroll_slip_from_wizard(jsonb, uuid[], uuid[], uuid[], uuid[]) to authenticated;

notify pgrst, 'reload schema';

commit;
