-- =====================================================
-- KalamApp - Phase 164 HR Tasks/Profiles Schema Compatibility
-- Date: 2026-05-20
-- Type: Additive / idempotent repair migration
-- Goal:
--   1) Ensure legacy/partial environments have HR-required task columns
--   2) Ensure profile payroll compatibility columns exist
--   3) Reload PostgREST schema cache
-- =====================================================

begin;

alter table if exists public.tasks
  add column if not exists assignee_type text,
  add column if not exists due_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists actual_hours numeric(12,2),
  add column if not exists duration_hours numeric(12,2),
  add column if not exists weight numeric(18,3);

alter table if exists public.tasks
  alter column weight set default 0;

update public.tasks
set weight = coalesce(weight, wage, 0)
where weight is null;

alter table if exists public.profiles
  add column if not exists salary_type text,
  add column if not exists default_work_schedule_id uuid,
  add column if not exists has_flexible_hours boolean not null default false,
  add column if not exists expected_daily_minutes integer not null default 480,
  add column if not exists grace_minutes_for_late integer not null default 0,
  add column if not exists overtime_auto_approve boolean not null default false,
  add column if not exists leave_auto_approve boolean not null default false,
  add column if not exists mission_auto_approve boolean not null default false,
  add column if not exists base_salary numeric(18,2) not null default 0,
  add column if not exists hourly_rate numeric(18,2) not null default 0,
  add column if not exists overtime_rate numeric(18,2) not null default 0,
  add column if not exists late_penalty_rate numeric(18,2) not null default 0,
  add column if not exists early_bonus_rate numeric(18,2) not null default 0,
  add column if not exists production_bonus_rate numeric(18,2) not null default 0,
  add column if not exists commission_percentage numeric(8,4) not null default 0;

update public.profiles
set salary_type = coalesce(nullif(salary_type, ''), 'fixed_and_performance')
where salary_type is null or salary_type = '';

notify pgrst, 'reload schema';

commit;

