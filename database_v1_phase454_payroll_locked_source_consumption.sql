-- =====================================================
-- KalamApp - Phase 454 Payroll Locked Source Consumption
-- Date: 2026-08-24
-- Type: Additive / idempotent migration
-- هدف: قفل منبع فقط مانع ویرایش عملیاتی باشد، نه ثبت مصرف اتمی آن در فیش.
-- =====================================================

begin;

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

  -- قفل ردیف برای جلوگیری از مصرف هم‌زمان است و با record lock تفاوت دارد.
  perform 1 from public.payroll_calculation_entries
  where org_id = v_org_id and employee_id = v_employee_id
    and period_start = v_period_start and period_end = v_period_end
    and status in ('draft', 'proposed') and id = any(v_ledger_ids)
  for update;
  perform 1 from public.employee_bonus_requests
  where org_id = v_org_id and employee_id = v_employee_id and related_payroll_slip_id is null
    and id = any(coalesce(p_bonus_request_ids, array[]::uuid[]))
  for update;
  perform 1 from public.employee_penalty_requests
  where org_id = v_org_id and employee_id = v_employee_id and related_payroll_slip_id is null
    and id = any(coalesce(p_penalty_request_ids, array[]::uuid[]))
  for update;
  perform 1 from public.employee_advances
  where org_id = v_org_id and employee_id = v_employee_id and related_payroll_slip_id is null
    and id = any(v_advance_ids)
  for update;

  -- فقط ردیف‌های مصرف‌شده در همین تراکنش اجازهٔ تغییر محدود مالی دارند.
  -- فعالیت، تردد، مرخصی، اضافه‌کاری، مأموریت، فاکتور و پرداخت فقط خوانده و
  -- در ledger snapshot می‌شوند؛ بنابراین قفلشان هرگز محاسبه را متوقف نمی‌کند.
  insert into public.payroll_source_mutation_scopes (scope_token, org_id, table_name, record_id)
  select v_scope_token, v_org_id, source.table_name, source.record_id
  from (
    select 'payroll_calculation_entries'::text as table_name, item as record_id from unnest(v_ledger_ids) as item
    union all select 'employee_bonus_requests'::text, item from unnest(coalesce(p_bonus_request_ids, array[]::uuid[])) as item
    union all select 'employee_penalty_requests'::text, item from unnest(coalesce(p_penalty_request_ids, array[]::uuid[])) as item
    union all select 'employee_advances'::text, item from unnest(v_advance_ids) as item
  ) source
  where source.record_id is not null
  on conflict do nothing;

  v_payload := v_payload || jsonb_build_object(
    'performance_snapshot', coalesce(v_payload->'performance_snapshot', '{}'::jsonb)
      || jsonb_build_object(
        'payroll_ledger_entry_ids', to_jsonb(v_ledger_ids),
        'employee_advance_ids', to_jsonb(v_advance_ids)
      )
  );

  perform set_config('app.payroll_source_sync', 'active', true);
  v_slip_id := public._create_payroll_slip_from_wizard_internal(
    v_payload, v_ledger_ids, p_bonus_request_ids, p_penalty_request_ids, v_advance_ids
  );

  delete from public.payroll_source_mutation_scopes where scope_token = v_scope_token;
  return v_slip_id;
end;
$$;

revoke all on function public.create_payroll_slip_from_wizard(jsonb, uuid[], uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.create_payroll_slip_from_wizard(jsonb, uuid[], uuid[], uuid[], uuid[]) to authenticated;

notify pgrst, 'reload schema';

commit;
