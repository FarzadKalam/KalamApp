-- =====================================================
-- KalamApp - Phase 37 Employees Defaults Repair
-- Date: 2026-03-24
-- Type: Additive / repair migration
-- Goal: repair employees payroll defaults for databases that already ran phase 36
-- =====================================================

begin;

update public.employees
set
  employment_status = coalesce(nullif(employment_status, ''), 'active'),
  base_salary = coalesce(base_salary, 0),
  hourly_rate = coalesce(hourly_rate, 0),
  overtime_rate = coalesce(overtime_rate, 0),
  late_penalty_rate = coalesce(late_penalty_rate, 0),
  early_bonus_rate = coalesce(early_bonus_rate, 0),
  production_bonus_rate = coalesce(production_bonus_rate, 0),
  commission_percentage = coalesce(commission_percentage, 0)
where
  employment_status is null
  or employment_status = ''
  or base_salary is null
  or hourly_rate is null
  or overtime_rate is null
  or late_penalty_rate is null
  or early_bonus_rate is null
  or production_bonus_rate is null
  or commission_percentage is null;

alter table public.employees
  alter column employment_status set default 'active',
  alter column employment_status set not null,
  alter column base_salary set default 0,
  alter column base_salary set not null,
  alter column hourly_rate set default 0,
  alter column hourly_rate set not null,
  alter column overtime_rate set default 0,
  alter column overtime_rate set not null,
  alter column late_penalty_rate set default 0,
  alter column late_penalty_rate set not null,
  alter column early_bonus_rate set default 0,
  alter column early_bonus_rate set not null,
  alter column production_bonus_rate set default 0,
  alter column production_bonus_rate set not null,
  alter column commission_percentage set default 0,
  alter column commission_percentage set not null;

commit;
