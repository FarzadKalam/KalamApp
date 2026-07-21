-- =====================================================
-- KalamApp - Phase 362 Payroll Atomic Create and Seniority Rates
-- Date: 2026-07-21
-- Type: Additive / idempotent migration
-- Goal: atomic payroll creation and data-driven statutory seniority rates
-- =====================================================

begin;

create table if not exists public.seniority_annual_rates (
  id uuid primary key default gen_random_uuid()
);

alter table public.seniority_annual_rates
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists persian_year integer not null,
  add column if not exists daily_rate_rials numeric(18,2) not null default 0,
  add column if not exists monthly_rate_30day_rials numeric(18,2) not null default 0,
  add column if not exists monthly_rate_31day_rials numeric(18,2) not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- نسخه‌های ابتدایی این جدول «سال» را به‌تنهایی یکتا کرده بودند. نرخ باید
-- برای هر سازمان جدا باشد؛ بنابراین قید قدیمی پیش از قید سازمان/سال حذف می‌شود.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.seniority_annual_rates'::regclass
      and conname = 'seniority_annual_rates_persian_year_key'
  ) then
    alter table public.seniority_annual_rates
      drop constraint seniority_annual_rates_persian_year_key;
  end if;
end;
$$;

create unique index if not exists idx_seniority_annual_rates_org_year
  on public.seniority_annual_rates(org_id, persian_year);

-- نرخ‌های پایه سنوات مصوب شورای عالی کار؛ برای هر سازمان جداگانه کپی می‌شوند.
insert into public.seniority_annual_rates (
  org_id, persian_year, daily_rate_rials, monthly_rate_30day_rials, monthly_rate_31day_rials
)
select
  organizations.id,
  rates.persian_year,
  rates.daily_rate_rials,
  rates.monthly_rate_30day_rials,
  rates.monthly_rate_31day_rials
from public.organizations
cross join (
  values
    (1404, 94000::numeric, 2820000::numeric, 2914000::numeric),
    (1405, 166667::numeric, 5000010::numeric, 5166677::numeric)
) as rates(persian_year, daily_rate_rials, monthly_rate_30day_rials, monthly_rate_31day_rials)
on conflict (org_id, persian_year) do nothing;

-- سازمان‌های جدید نیز از همان ابتدا نرخ‌های مصوبِ قابل استفاده را دریافت می‌کنند.
create or replace function public.seed_seniority_annual_rates_for_new_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.seniority_annual_rates (
    org_id, persian_year, daily_rate_rials, monthly_rate_30day_rials, monthly_rate_31day_rials
  ) values
    (new.id, 1404, 94000, 2820000, 2914000),
    (new.id, 1405, 166667, 5000010, 5166677)
  on conflict (org_id, persian_year) do nothing;
  return new;
end;
$$;

revoke all on function public.seed_seniority_annual_rates_for_new_org() from public;
drop trigger if exists trg_organizations_seed_seniority_annual_rates on public.organizations;
create trigger trg_organizations_seed_seniority_annual_rates
after insert on public.organizations
for each row
execute function public.seed_seniority_annual_rates_for_new_org();

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_seniority_annual_rates_updated_at on public.seniority_annual_rates;
    create trigger trg_seniority_annual_rates_updated_at
      before update on public.seniority_annual_rates
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.seniority_annual_rates enable row level security;
drop policy if exists p_seniority_annual_rates_org_select on public.seniority_annual_rates;
create policy p_seniority_annual_rates_org_select
on public.seniority_annual_rates
for select to authenticated
using (org_id = public.current_org_id());
grant select on public.seniority_annual_rates to authenticated;

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

  -- قفل کارمند، ایجاد هم‌زمان دو فیش برای یک بازه را سریالی می‌کند.
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

revoke all on function public.create_payroll_slip_from_wizard(jsonb, uuid[], uuid[], uuid[], uuid[]) from public;
grant execute on function public.create_payroll_slip_from_wizard(jsonb, uuid[], uuid[], uuid[], uuid[]) to authenticated;

notify pgrst, 'reload schema';

commit;
