-- =====================================================
-- KalamApp - Phase 153 HR Employee Salary Type + Monthly Paid Leave Hours
-- Date: 2026-05-18
-- Type: Additive / idempotent migration
-- Goal:
--   1) Add monthly_paid_leave_hours column to employees
--   2) Rename/expand salary_type values to 8 new types
-- =====================================================

begin;

-- Add monthly paid leave hours cap (hours per month that count as paid)
alter table public.employees
  add column if not exists monthly_paid_leave_hours numeric(6,2) not null default 0;

-- Migrate old salary_type values to new ones
-- Old: performance → fixed_and_performance
-- Old: hourly     → hourly_only
-- Old: commission → fixed_performance_commission
-- Old: profit_share → profit_share_only
-- Old: mixed      → fixed_and_performance
update public.employees
set salary_type = case salary_type
  when 'performance'   then 'fixed_and_performance'
  when 'hourly'        then 'hourly_only'
  when 'commission'    then 'fixed_performance_commission'
  when 'profit_share'  then 'profit_share_only'
  when 'mixed'         then 'fixed_and_performance'
  else salary_type
end
where salary_type in ('performance', 'hourly', 'commission', 'profit_share', 'mixed');

-- Same migration for profiles table if salary_type exists there
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'salary_type'
  ) then
    update public.profiles
    set salary_type = case salary_type
      when 'performance'   then 'fixed_and_performance'
      when 'hourly'        then 'hourly_only'
      when 'commission'    then 'fixed_performance_commission'
      when 'profit_share'  then 'profit_share_only'
      when 'mixed'         then 'fixed_and_performance'
      else salary_type
    end
    where salary_type in ('performance', 'hourly', 'commission', 'profit_share', 'mixed');
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
