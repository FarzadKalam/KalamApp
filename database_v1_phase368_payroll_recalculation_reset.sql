-- بازنشانی امن فیش‌ها برای محاسبه دوباره حقوق
-- فیش حذف نمی‌شود؛ ابطال می‌شود تا سابقه مالی باقی بماند و trigger موجود اقلام وابسته را آزاد کند.

begin;

create or replace function public.reset_payroll_for_recalculation(
  p_period_start date default null,
  p_period_end date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_canceled_slips integer := 0;
  v_released_entries integer := 0;
begin
  if v_org_id is null then
    raise exception 'organization_context_required';
  end if;

  if not public.current_user_has_role_permission_entry('payroll_slips', 'edit', null, true) then
    raise exception 'payroll_recalculation_not_allowed';
  end if;

  -- ابطال، trigger آزادسازی منابع فیش را اجرا می‌کند و اتصال پاداش، جریمه، مساعده و پورسانت را برمی‌دارد.
  update public.payroll_slips
  set status = 'canceled', updated_at = now()
  where org_id = v_org_id
    and coalesce(status, 'draft') <> 'canceled'
    and (p_period_start is null or period_end >= p_period_start)
    and (p_period_end is null or period_start <= p_period_end);
  get diagnostics v_canceled_slips = row_count;

  -- هر قلمی که پیش‌تر به فیش متصل بوده، دوباره در وضعیت قابل محاسبه قرار می‌گیرد.
  update public.payroll_calculation_entries
  set status = 'draft', payroll_slip_id = null, updated_at = now()
  where org_id = v_org_id
    and status = 'included_in_payroll'
    and (p_period_start is null or period_end >= p_period_start)
    and (p_period_end is null or period_start <= p_period_end);
  get diagnostics v_released_entries = row_count;

  return jsonb_build_object(
    'canceled_slips', v_canceled_slips,
    'released_entries', v_released_entries
  );
end;
$$;

revoke all on function public.reset_payroll_for_recalculation(date, date) from public;
grant execute on function public.reset_payroll_for_recalculation(date, date) to authenticated;

notify pgrst, 'reload schema';

commit;
