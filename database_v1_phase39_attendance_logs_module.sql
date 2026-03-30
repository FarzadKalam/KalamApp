-- =====================================================
-- KalamApp - Phase 39 Attendance Logs Module Foundation
-- Date: 2026-03-24
-- Type: Additive / non-breaking migration
-- Goal: add raw attendance logs foundation for HR attendance workflows
-- =====================================================

begin;

create table if not exists public.attendance_logs (
  id uuid primary key default gen_random_uuid()
);

alter table public.attendance_logs
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists employee_id uuid references public.employees(id) on delete set null,
  add column if not exists related_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null default auth.uid(),
  add column if not exists assignee_type text not null default 'user',
  add column if not exists log_type text not null default 'check_in',
  add column if not exists occurred_at timestamptz not null default now(),
  add column if not exists source_type text not null default 'manual',
  add column if not exists location_text text,
  add column if not exists notes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.attendance_logs
set
  assignee_id = coalesce(assignee_id, related_profile_id, created_by),
  assignee_type = coalesce(nullif(assignee_type, ''), 'user'),
  log_type = coalesce(nullif(log_type, ''), 'check_in'),
  source_type = coalesce(nullif(source_type, ''), 'manual'),
  occurred_at = coalesce(occurred_at, now())
where
  assignee_id is null
  or assignee_type is null
  or assignee_type = ''
  or log_type is null
  or log_type = ''
  or source_type is null
  or source_type = ''
  or occurred_at is null;

alter table public.attendance_logs
  alter column assignee_id set default auth.uid(),
  alter column assignee_type set default 'user',
  alter column assignee_type set not null,
  alter column log_type set default 'check_in',
  alter column log_type set not null,
  alter column occurred_at set default now(),
  alter column occurred_at set not null,
  alter column source_type set default 'manual',
  alter column source_type set not null;

create index if not exists idx_attendance_logs_org_time
  on public.attendance_logs(org_id, occurred_at desc);
create index if not exists idx_attendance_logs_employee_time
  on public.attendance_logs(employee_id, occurred_at desc)
  where employee_id is not null;
create index if not exists idx_attendance_logs_profile_time
  on public.attendance_logs(related_profile_id, occurred_at desc)
  where related_profile_id is not null;
create index if not exists idx_attendance_logs_assignee_time
  on public.attendance_logs(assignee_id, occurred_at desc)
  where assignee_id is not null;

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_attendance_logs_updated_at on public.attendance_logs;
    create trigger trg_attendance_logs_updated_at
      before update on public.attendance_logs
      for each row execute function public.set_updated_at();
  end if;
end $$;

grant select, insert, update, delete on public.attendance_logs to authenticated, service_role;

alter table public.attendance_logs enable row level security;

drop policy if exists p_attendance_logs_org_all on public.attendance_logs;
create policy p_attendance_logs_org_all on public.attendance_logs
  for all to authenticated
  using (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id is null
    or org_id = public.current_org_id()
  )
  with check (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id is null
    or org_id = public.current_org_id()
  );

commit;
