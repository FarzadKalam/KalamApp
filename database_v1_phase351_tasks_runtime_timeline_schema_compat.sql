-- Phase 351: Ensure task-list timeline columns exist without running a
-- data backfill that can invoke process scheduling triggers in SQL Editor.

begin;

alter table if exists public.tasks
  add column if not exists actual_start_at timestamptz,
  add column if not exists actual_end_at timestamptz,
  add column if not exists schedule_variance_hours numeric(12,2);

create index if not exists idx_tasks_actual_start_at
  on public.tasks(actual_start_at);

create index if not exists idx_tasks_actual_end_at
  on public.tasks(actual_end_at);

commit;
