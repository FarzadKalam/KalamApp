-- جمع‌های فیش فقط از اقلام و پرداخت‌های همان فیش مشتق می‌شوند.
-- این نگهبان دیتابیسی مانع اختلاف بین جدول اقلام و ستون‌های خلاصه می‌شود.

begin;

create or replace function public.payroll_safe_numeric(p_value text)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_value text := replace(replace(replace(trim(coalesce(p_value, '')), ',', ''), '٬', ''), '،', '');
begin
  if v_value !~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$' then
    return 0;
  end if;
  return v_value::numeric;
end;
$$;

create or replace function public.payroll_slip_line_amount(p_line jsonb)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_amount numeric := public.payroll_safe_numeric(p_line->>'amount');
  v_total_price numeric := public.payroll_safe_numeric(p_line->>'total_price');
  v_quantity numeric := public.payroll_safe_numeric(p_line->>'quantity');
  v_unit_price numeric := public.payroll_safe_numeric(p_line->>'unit_price');
begin
  if v_amount <> 0 then return abs(v_amount); end if;
  if v_total_price <> 0 then return abs(v_total_price); end if;
  if v_quantity > 0 and v_unit_price > 0 then return v_quantity * v_unit_price; end if;
  return 0;
end;
$$;

-- برای فیش‌های قبلی، سهم بیمهٔ کارفرما را به metadata نخستین قلم منتقل می‌کنیم
-- تا پس از فعال‌شدن trigger نیز منبع آن خود جدول اقلام باقی بماند.
do $$
declare
  v_slip record;
  v_lines jsonb;
begin
  for v_slip in
    select slip.id, slip.lines, slip.insurance_employer_amount
    from public.payroll_slips slip
    where coalesce(slip.insurance_employer_amount, 0) <> 0
      and jsonb_array_length(coalesce(slip.lines, '[]'::jsonb)) > 0
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(slip.lines, '[]'::jsonb)) as line(value)
        where line.value->'metadata' ? 'employer_insurance_amount'
      )
  loop
    select jsonb_agg(
      case when item.ordinality = 1 then
        jsonb_set(
          item.value,
          '{metadata}',
          coalesce(item.value->'metadata', '{}'::jsonb)
            || jsonb_build_object('employer_insurance_amount', coalesce(v_slip.insurance_employer_amount, 0)),
          true
        )
      else item.value end
      order by item.ordinality
    )
    into v_lines
    from jsonb_array_elements(coalesce(v_slip.lines, '[]'::jsonb)) with ordinality as item(value, ordinality);

    update public.payroll_slips
    set lines = coalesce(v_lines, '[]'::jsonb)
    where id = v_slip.id;
  end loop;
end;
$$;

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
    then
      continue;
    end if;
    v_paid_amount := v_paid_amount + abs(public.payroll_safe_numeric(v_payment->>'amount'));
  end loop;

  new.base_salary := v_base_salary;
  new.task_wage_total := v_task_wage_total;
  new.bonus_total := v_bonus_total;
  new.deduction_total := v_deduction_total;
  new.insurance_employee_amount := v_employee_insurance;
  new.insurance_employer_amount := case when v_has_employer_insurance then v_employer_insurance else 0 end;
  new.gross_amount := v_base_salary + v_task_wage_total + v_bonus_total - v_deduction_total;
  new.net_amount := new.gross_amount - v_paid_amount;
  return new;
end;
$$;

revoke all on function public.sync_payroll_slip_summary_from_lines() from public;

drop trigger if exists trg_payroll_slips_sync_summary_from_lines on public.payroll_slips;
create trigger trg_payroll_slips_sync_summary_from_lines
before insert or update on public.payroll_slips
for each row execute function public.sync_payroll_slip_summary_from_lines();

-- پس از نصب trigger، همهٔ جمع‌های موجود نیز با اقلام فیش همسان می‌شوند.
update public.payroll_slips
set lines = coalesce(lines, '[]'::jsonb);

notify pgrst, 'reload schema';

commit;
