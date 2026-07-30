-- =====================================================
-- KalamApp - Phase 428 Payroll Source Lock Context Repair
-- Date: 2026-07-31
-- Type: Additive / idempotent migration
-- Goal: allow only payroll bookkeeping updates to pass record locks during create, cancel, delete and recovery
-- =====================================================

begin;

-- The previous wrapper set this transaction-local flag before calling the
-- implementation function. Set it again in the implementation itself: a
-- SECURITY DEFINER function boundary must never make deletion dependent on
-- configuration scope inherited from its caller.
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

  perform set_config('app.payroll_source_sync', 'active', true);

  select coalesce(performance_snapshot, '{}'::jsonb)
    into v_snapshot
  from public.payroll_slips
  where id = p_payroll_slip_id
    and org_id = p_org_id;

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

-- The same guarantee is required while creating a new slip. The context is
-- established immediately before the source links are written, inside the
-- function that performs those writes.
create or replace function public._create_payroll_slip_from_wizard_internal(
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
  v_employee_id uuid := nullif(p_payload->>'employee_id', '')::uuid;
  v_period_start date := nullif(p_payload->>'period_start', '')::date;
  v_period_end date := nullif(p_payload->>'period_end', '')::date;
  v_slip_id uuid;
  v_requested_count integer;
  v_verified_count integer;
begin
  if v_org_id is null or v_employee_id is null or v_period_start is null or v_period_end is null then
    raise exception 'invalid_payroll_wizard_payload';
  end if;
  if v_period_end < v_period_start then
    raise exception 'invalid_payroll_period';
  end if;

  perform 1 from public.employees
  where id = v_employee_id and org_id = v_org_id
  for update;
  if not found then
    raise exception 'payroll_employee_not_found';
  end if;

  if exists (
    select 1 from public.payroll_slips
    where org_id = v_org_id
      and employee_id = v_employee_id
      and period_start = v_period_start
      and period_end = v_period_end
      and coalesce(status, 'draft') <> 'canceled'
  ) then
    raise exception 'payroll_slip_already_exists';
  end if;

  select count(*) into v_requested_count
  from (select distinct value from unnest(coalesce(p_ledger_entry_ids, array[]::uuid[])) as value) requested;
  select count(*) into v_verified_count
  from public.payroll_calculation_entries
  where org_id = v_org_id
    and employee_id = v_employee_id
    and period_start = v_period_start
    and period_end = v_period_end
    and status in ('draft', 'proposed')
    and id = any(coalesce(p_ledger_entry_ids, array[]::uuid[]));
  if v_requested_count <> v_verified_count then
    raise exception 'payroll_ledger_entries_changed';
  end if;

  -- Keep the context active for the complete write sequence, including any
  -- payroll-side trigger that runs while the new slip is inserted.
  perform set_config('app.payroll_source_sync', 'active', true);

  insert into public.payroll_slips (
    org_id, name, system_code, employee_id, period_start, period_end, status, assignee_id,
    base_salary, task_wage_total, bonus_total, deduction_total,
    insurance_employee_amount, insurance_employer_amount, gross_amount, net_amount,
    lines, payments, performance_snapshot, task_ids, notes
  ) values (
    v_org_id,
    coalesce(p_payload->>'name', ''),
    nullif(p_payload->>'system_code', ''),
    v_employee_id, v_period_start, v_period_end, coalesce(nullif(p_payload->>'status', ''), 'draft'),
    nullif(p_payload->>'assignee_id', '')::uuid,
    coalesce((p_payload->>'base_salary')::numeric, 0),
    coalesce((p_payload->>'task_wage_total')::numeric, 0),
    coalesce((p_payload->>'bonus_total')::numeric, 0),
    coalesce((p_payload->>'deduction_total')::numeric, 0),
    coalesce((p_payload->>'insurance_employee_amount')::numeric, 0),
    coalesce((p_payload->>'insurance_employer_amount')::numeric, 0),
    coalesce((p_payload->>'gross_amount')::numeric, 0),
    coalesce((p_payload->>'net_amount')::numeric, 0),
    coalesce(p_payload->'lines', '[]'::jsonb),
    coalesce(p_payload->'payments', '[]'::jsonb),
    coalesce(p_payload->'performance_snapshot', '{}'::jsonb),
    coalesce(p_payload->'task_ids', '[]'::jsonb),
    nullif(p_payload->>'notes', '')
  ) returning id into v_slip_id;

  update public.payroll_calculation_entries
  set status = 'included_in_payroll', payroll_slip_id = v_slip_id, updated_at = now()
  where id = any(coalesce(p_ledger_entry_ids, array[]::uuid[]))
    and org_id = v_org_id;

  select count(*) into v_requested_count from (select distinct value from unnest(coalesce(p_bonus_request_ids, array[]::uuid[])) as value) requested;
  select count(*) into v_verified_count from public.employee_bonus_requests
  where org_id = v_org_id and employee_id = v_employee_id and id = any(coalesce(p_bonus_request_ids, array[]::uuid[]))
    and related_payroll_slip_id is null;
  if v_requested_count <> v_verified_count then raise exception 'payroll_bonus_requests_changed'; end if;
  update public.employee_bonus_requests set related_payroll_slip_id = v_slip_id, updated_at = now()
  where id = any(coalesce(p_bonus_request_ids, array[]::uuid[])) and org_id = v_org_id;

  select count(*) into v_requested_count from (select distinct value from unnest(coalesce(p_penalty_request_ids, array[]::uuid[])) as value) requested;
  select count(*) into v_verified_count from public.employee_penalty_requests
  where org_id = v_org_id and employee_id = v_employee_id and id = any(coalesce(p_penalty_request_ids, array[]::uuid[]))
    and related_payroll_slip_id is null;
  if v_requested_count <> v_verified_count then raise exception 'payroll_penalty_requests_changed'; end if;
  update public.employee_penalty_requests set related_payroll_slip_id = v_slip_id, updated_at = now()
  where id = any(coalesce(p_penalty_request_ids, array[]::uuid[])) and org_id = v_org_id;

  select count(*) into v_requested_count from (select distinct value from unnest(coalesce(p_advance_ids, array[]::uuid[])) as value) requested;
  select count(*) into v_verified_count from public.employee_advances
  where org_id = v_org_id and employee_id = v_employee_id and id = any(coalesce(p_advance_ids, array[]::uuid[]))
    and related_payroll_slip_id is null;
  if v_requested_count <> v_verified_count then raise exception 'payroll_advances_changed'; end if;
  update public.employee_advances set related_payroll_slip_id = v_slip_id, updated_at = now()
  where id = any(coalesce(p_advance_ids, array[]::uuid[])) and org_id = v_org_id;

  return v_slip_id;
end;
$$;

revoke all on function public._create_payroll_slip_from_wizard_internal(jsonb, uuid[], uuid[], uuid[], uuid[])
  from public, anon, authenticated;

-- Recover all historical links one more time after the dependable context has
-- been installed. Only rows whose referenced payroll slip no longer exists are
-- released by this function.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in
    select distinct org_id
    from (
      select org_id from public.payroll_calculation_entries where status = 'included_in_payroll'
      union
      select org_id from public.employee_bonus_requests where related_payroll_slip_id is not null
      union
      select org_id from public.employee_penalty_requests where related_payroll_slip_id is not null
      union
      select org_id from public.employee_advances where related_payroll_slip_id is not null
    ) as payroll_source_orgs
    where org_id is not null
  loop
    perform public.release_orphaned_payroll_sources(v_org_id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
