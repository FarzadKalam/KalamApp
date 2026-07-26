-- آزادسازی کامل منابع پورسانت پس از حذف یا لغو فیش حقوقی
-- پوشش محاسبه‌های قدیمی که جزئیات ردیف‌ها در آن‌ها کلید منبع نداشته است
-- قابل اجرا به‌صورت تکراری و محدود به همان سازمان

begin;

create or replace function public._release_payroll_sources_internal(
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

  -- هم کلید دقیق ردیف‌ها و هم محدودهٔ خود محاسبه نگه داشته می‌شود. محدوده
  -- دوم برای محاسبه‌های قدیمی است که کلید ردیف در snapshot آن‌ها وجود ندارد.
  with linked_commission_entries as (
    select entry.*
    from public.payroll_calculation_entries entry
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
  ), released_commission_keys as (
    select distinct nullif(trim(payroll_line.value->>'source_key'), '') as source_key
    from linked_commission_entries entry
    cross join lateral jsonb_array_elements(coalesce(entry.details->'rows', '[]'::jsonb)) as invoice_row(value)
    cross join lateral jsonb_array_elements(coalesce(invoice_row.value->'lines', '[]'::jsonb)) as payroll_line(value)
  ), released_commission_scopes as (
    select distinct
      entry.employee_id,
      entry.period_start,
      entry.period_end,
      nullif(trim(entry.details->>'basis'), '') as source_basis,
      nullif(trim(entry.details->>'percent_mode'), '') as percent_mode
    from linked_commission_entries entry
  )
  update public.commission_drafts draft
  set
    posted_amount = 0,
    remaining_amount = greatest(0, coalesce(draft.entitled_amount, 0)),
    draft_status = 'draft',
    updated_at = now()
  where draft.org_id = p_org_id
    and (
      draft.source_key in (select source_key from released_commission_keys where source_key is not null)
      or exists (
        select 1
        from released_commission_scopes scope
        where scope.employee_id = draft.employee_id
          and scope.period_start = draft.period_start
          and scope.period_end = draft.period_end
          and scope.source_basis = draft.source_basis
          and scope.percent_mode = draft.percent_mode
      )
    );

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
  where org_id = p_org_id and related_payroll_slip_id = p_payroll_slip_id;

  update public.employee_penalty_requests
  set related_payroll_slip_id = null, updated_at = now()
  where org_id = p_org_id and related_payroll_slip_id = p_payroll_slip_id;

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

revoke all on function public._release_payroll_sources_internal(uuid, uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
