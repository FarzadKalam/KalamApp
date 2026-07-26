-- ایمن‌سازی نهایی ساخت فیش: کنترل دسترسی و قفل منابع تا پایان تراکنش
-- از تغییر هم‌زمان پورسانت یا دیگر اقلام بین پیش‌نمایش و ثبت فیش جلوگیری می‌کند.

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

  -- قفل‌ها پیش از ساخت فیش گرفته می‌شوند. تابع داخلی تعداد و محدودهٔ دقیق
  -- همهٔ آن‌ها را نیز بررسی می‌کند؛ بنابراین رکوردی که لحظه‌ای تغییر کرده
  -- باشد نه به فیش می‌رود و نه دوباره‌ثبت می‌شود.
  perform 1
  from public.payroll_calculation_entries
  where org_id = v_org_id
    and employee_id = v_employee_id
    and period_start = v_period_start
    and period_end = v_period_end
    and status in ('draft', 'proposed')
    and id = any(v_ledger_ids)
  for update;

  perform 1
  from public.employee_bonus_requests
  where org_id = v_org_id and employee_id = v_employee_id
    and related_payroll_slip_id is null
    and id = any(coalesce(p_bonus_request_ids, array[]::uuid[]))
  for update;

  perform 1
  from public.employee_penalty_requests
  where org_id = v_org_id and employee_id = v_employee_id
    and related_payroll_slip_id is null
    and id = any(coalesce(p_penalty_request_ids, array[]::uuid[]))
  for update;

  perform 1
  from public.employee_advances
  where org_id = v_org_id and employee_id = v_employee_id
    and related_payroll_slip_id is null
    and id = any(v_advance_ids)
  for update;

  -- snapshot فیش باید دقیقاً به همان منابعی اشاره کند که در همین تراکنش
  -- به فیش متصل می‌شوند، نه به دادهٔ قابل‌دستکاری سمت مرورگر.
  v_payload := v_payload || jsonb_build_object(
    'performance_snapshot',
    coalesce(v_payload->'performance_snapshot', '{}'::jsonb)
      || jsonb_build_object(
        'payroll_ledger_entry_ids', to_jsonb(v_ledger_ids),
        'employee_advance_ids', to_jsonb(v_advance_ids)
      )
  );

  perform set_config('app.payroll_source_sync', 'active', true);
  return public._create_payroll_slip_from_wizard_internal(
    v_payload,
    v_ledger_ids,
    p_bonus_request_ids,
    p_penalty_request_ids,
    v_advance_ids
  );
end;
$$;

revoke all on function public.create_payroll_slip_from_wizard(jsonb, uuid[], uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.create_payroll_slip_from_wizard(jsonb, uuid[], uuid[], uuid[], uuid[]) to authenticated;

notify pgrst, 'reload schema';

commit;
