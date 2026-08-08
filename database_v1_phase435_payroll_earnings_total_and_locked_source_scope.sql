-- =====================================================
-- KalamApp - Phase 435 Payroll Earnings Total and Locked Source Scope
-- Date: 2026-08-08
-- Type: Additive / idempotent migration
-- =====================================================

begin;

alter table public.payroll_slips
  add column if not exists earnings_total numeric(18,2) not null default 0;

-- همهٔ کارت‌ها، جدول اقلام و خروجی ویزارد از همین جمع سروری استفاده می‌کنند.
-- earnings_total فقط حقوق و مزایا است و deduction_total جداگانه کسر می‌شود.
create or replace function public.sync_payroll_slip_summary_from_lines()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line jsonb;
  v_payment jsonb;
  v_line_type text;
  v_line_key text;
  v_amount numeric;
  v_base_salary numeric := 0;
  v_task_wage_total numeric := 0;
  v_bonus_total numeric := 0;
  v_deduction_total numeric := 0;
  v_employee_insurance numeric := 0;
  v_employer_insurance numeric := 0;
  v_paid_amount numeric := 0;
  v_has_payment_status boolean := false;
  v_has_employer_insurance boolean := false;
  v_payment_status text;
begin
  for v_line in
    select value from jsonb_array_elements(coalesce(new.lines, '[]'::jsonb))
  loop
    v_line_type := lower(trim(coalesce(v_line->>'line_type', 'earning')));
    v_line_key := lower(trim(coalesce(v_line->>'key', '')));
    v_amount := public.payroll_slip_line_amount(v_line);

    if v_line->'metadata' ? 'employer_insurance_amount' then
      v_employer_insurance := v_employer_insurance
        + abs(public.payroll_safe_numeric(v_line->'metadata'->>'employer_insurance_amount'));
      v_has_employer_insurance := true;
    end if;
    if v_amount = 0 then continue; end if;

    if v_line_type = 'deduction' then
      v_deduction_total := v_deduction_total + v_amount;
      if v_line_key = 'employee_insurance'
        or lower(coalesce(v_line->>'title', '')) like '%بیمه سهم کارمند%'
      then
        v_employee_insurance := v_employee_insurance + v_amount;
      end if;
    elsif v_line_type = 'bonus' then
      v_bonus_total := v_bonus_total + v_amount;
    elsif v_line_key = 'task_wage'
      or lower(coalesce(v_line->>'title', '')) like '%حقوق عملکردی فعالیت%'
    then
      v_task_wage_total := v_task_wage_total + v_amount;
    else
      v_base_salary := v_base_salary + v_amount;
    end if;
  end loop;

  select exists (
    select 1
    from jsonb_array_elements(coalesce(new.payments, '[]'::jsonb)) as payment(value)
    where payment.value ? 'status'
  ) into v_has_payment_status;
  for v_payment in
    select value from jsonb_array_elements(coalesce(new.payments, '[]'::jsonb))
  loop
    v_payment_status := lower(trim(coalesce(v_payment->>'status', '')));
    if v_has_payment_status
      and v_payment_status <> ''
      and v_payment_status not in ('received', 'paid', 'approved', 'cleared')
    then continue; end if;
    v_paid_amount := v_paid_amount + abs(public.payroll_safe_numeric(v_payment->>'amount'));
  end loop;

  new.base_salary := v_base_salary;
  new.task_wage_total := v_task_wage_total;
  new.bonus_total := v_bonus_total;
  new.earnings_total := v_base_salary + v_task_wage_total + v_bonus_total;
  new.deduction_total := v_deduction_total;
  new.insurance_employee_amount := v_employee_insurance;
  new.insurance_employer_amount := case when v_has_employer_insurance then v_employer_insurance else 0 end;
  new.gross_amount := new.earnings_total - v_deduction_total;
  new.net_amount := new.gross_amount - v_paid_amount;
  return new;
end;
$$;

revoke all on function public.sync_payroll_slip_summary_from_lines() from public, anon, authenticated;

drop trigger if exists trg_payroll_slips_sync_summary_from_lines on public.payroll_slips;
create trigger trg_payroll_slips_sync_summary_from_lines
before insert or update on public.payroll_slips
for each row execute function public.sync_payroll_slip_summary_from_lines();

-- در ویزارد فقط اتصال داخلی منبع به فیش و جمع‌های مشتق‌شده مجاز است. بنابراین
-- قفل مرخصی، مأموریت، اضافه‌کاری، فعالیت یا مساعده مانع ثبت فیش نمی‌شود و
-- هیچ مقدار عملیاتی از آن رکوردها تغییر نمی‌کند.
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
  if tg_op not in ('UPDATE', 'DELETE') then return coalesce(new, old); end if;

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
          (to_jsonb(new) - array['related_payroll_slip_id', 'paid_amount', 'remaining_amount', 'updated_at'])
            is not distinct from
          (to_jsonb(old) - array['related_payroll_slip_id', 'paid_amount', 'remaining_amount', 'updated_at'])
        when 'payroll_slips' then
          (to_jsonb(new) - array[
            'base_salary', 'task_wage_total', 'bonus_total', 'earnings_total', 'deduction_total',
            'insurance_employee_amount', 'insurance_employer_amount',
            'gross_amount', 'net_amount', 'updated_at'
          ]) is not distinct from
          (to_jsonb(old) - array[
            'base_salary', 'task_wage_total', 'bonus_total', 'earnings_total', 'deduction_total',
            'insurance_employee_amount', 'insurance_employer_amount',
            'gross_amount', 'net_amount', 'updated_at'
          ])
        when 'commission_drafts' then
          (to_jsonb(new) - array['posted_amount', 'remaining_amount', 'draft_status', 'updated_at'])
            is not distinct from
          (to_jsonb(old) - array['posted_amount', 'remaining_amount', 'draft_status', 'updated_at'])
        else false
      end;
      if v_payroll_source_sync then return new; end if;
    end if;
  end if;

  select exists (
    select 1
    from public.record_locks lock_row
    where lock_row.org_id = old.org_id
      and lock_row.record_id = old.id
      and (lock_row.module_id = tg_table_name or lock_row.metadata ->> 'table_name' = tg_table_name)
  ) into v_locked;
  if v_locked then raise exception 'این رکورد قفل شده و قابل تغییر یا حذف نیست.'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.prevent_locked_record_mutation() from public, anon, authenticated;

-- بازسازی فقط فیلدهای محاسباتی است؛ دادهٔ عملیاتی یا ردیف‌های فیش تغییر نمی‌کند.
select set_config('app.payroll_source_sync', 'active', true);
update public.payroll_slips
set earnings_total = coalesce(earnings_total, 0);

notify pgrst, 'reload schema';

commit;
