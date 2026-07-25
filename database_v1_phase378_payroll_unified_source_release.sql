-- یکپارچه‌سازی چرخهٔ اقلام فیش: همهٔ اقلام ابتدا ledger هستند و با حذف/لغو فیش آزاد می‌شوند.
-- این migration نسبت به اجرای تکراری ایمن است و فقط در محدودهٔ همان سازمان عمل می‌کند.

begin;

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

  -- پورسانت‌های همین فیش باید دوباره قابل محاسبه باشند.
  with released_commission_keys as (
    select distinct nullif(trim(payroll_line.value->>'source_key'), '') as source_key
    from public.payroll_calculation_entries entry
    cross join lateral jsonb_array_elements(coalesce(entry.details->'rows', '[]'::jsonb)) as invoice_row(value)
    cross join lateral jsonb_array_elements(coalesce(invoice_row.value->'lines', '[]'::jsonb)) as payroll_line(value)
    where entry.org_id = p_org_id
      and entry.source_type = 'commission'
      and (
        entry.payroll_slip_id = p_payroll_slip_id
        or entry.id in (
          select snapshot_entry.value::uuid
          from jsonb_array_elements_text(coalesce(v_snapshot->'payroll_ledger_entry_ids', '[]'::jsonb)) as snapshot_entry(value)
          where snapshot_entry.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
      )
  )
  update public.commission_drafts draft
  set
    posted_amount = 0,
    remaining_amount = greatest(0, coalesce(draft.entitled_amount, 0)),
    draft_status = 'draft',
    updated_at = now()
  where draft.org_id = p_org_id
    and draft.source_key in (select source_key from released_commission_keys where source_key is not null);

  -- تمام انواع آیتم‌های حقوقی (هدف، تردد، عملکرد، پورسانت، سنوات و ...) از ledger آزاد می‌شوند.
  update public.payroll_calculation_entries entry
  set
    status = case when entry.status = 'included_in_payroll' then 'draft' else entry.status end,
    payroll_slip_id = null,
    updated_at = now()
  where entry.org_id = p_org_id
    and (
      entry.payroll_slip_id = p_payroll_slip_id
      or entry.id in (
        select snapshot_entry.value::uuid
        from jsonb_array_elements_text(coalesce(v_snapshot->'payroll_ledger_entry_ids', '[]'::jsonb)) as snapshot_entry(value)
        where snapshot_entry.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
    );

  update public.employee_bonus_requests
  set related_payroll_slip_id = null, updated_at = now()
  where org_id = p_org_id
    and related_payroll_slip_id = p_payroll_slip_id;

  update public.employee_penalty_requests
  set related_payroll_slip_id = null, updated_at = now()
  where org_id = p_org_id
    and related_payroll_slip_id = p_payroll_slip_id;

  -- مساعده علاوه بر اتصال مستقیم، از snapshot فیش نیز آزاد می‌شود تا رکوردهای قدیمی گیر نکنند.
  update public.employee_advances advance
  set related_payroll_slip_id = null, updated_at = now()
  where advance.org_id = p_org_id
    and (
      advance.related_payroll_slip_id = p_payroll_slip_id
      or advance.id in (
        select snapshot_entry.value::uuid
        from jsonb_array_elements_text(coalesce(v_snapshot->'employee_advance_ids', '[]'::jsonb)) as snapshot_entry(value)
        where snapshot_entry.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
    );
end;
$$;

revoke all on function public.release_payroll_sources(uuid, uuid) from public;

-- حذف و لغو هر دو از همان مسیر آزادسازی استفاده می‌کنند.
create or replace function public.release_payroll_sources_on_remove()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := case when tg_op = 'DELETE' then old.org_id else new.org_id end;
  v_payroll_slip_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  perform public.release_payroll_sources(v_org_id, v_payroll_slip_id);
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.release_payroll_sources_on_remove() from public;

drop trigger if exists trg_payroll_slips_release_sources_before_delete on public.payroll_slips;
create trigger trg_payroll_slips_release_sources_before_delete
before delete on public.payroll_slips
for each row execute function public.release_payroll_sources_on_remove();

drop trigger if exists trg_payroll_slips_release_sources_after_cancel on public.payroll_slips;
create trigger trg_payroll_slips_release_sources_after_cancel
after update of status on public.payroll_slips
for each row
when (lower(coalesce(new.status, '')) = 'canceled' and lower(coalesce(old.status, '')) is distinct from 'canceled')
execute function public.release_payroll_sources_on_remove();

notify pgrst, 'reload schema';

commit;
