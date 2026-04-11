-- =====================================================
-- KalamApp - Phase 73 Task Runtime Timeline Fields
-- Date: 2026-04-10
-- Type: Additive / non-breaking migration
-- Goal: support actual task timings, variance hours and safer cross-module task relations
-- =====================================================

begin;

alter table if exists public.tasks
  add column if not exists actual_start_at timestamptz,
  add column if not exists actual_end_at timestamptz,
  add column if not exists schedule_variance_hours numeric(12,2);

update public.tasks
set actual_start_at = coalesce(actual_start_at, start_date)
where actual_start_at is null
  and start_date is not null;

update public.tasks
set actual_end_at = coalesce(actual_end_at, completed_at)
where actual_end_at is null
  and completed_at is not null;

update public.tasks
set schedule_variance_hours = round((((extract(epoch from (due_date - actual_end_at))) / 3600.0))::numeric, 2)
where due_date is not null
  and actual_end_at is not null
  and schedule_variance_hours is null;

create index if not exists idx_tasks_actual_start_at on public.tasks(actual_start_at);
create index if not exists idx_tasks_actual_end_at on public.tasks(actual_end_at);

commit;
