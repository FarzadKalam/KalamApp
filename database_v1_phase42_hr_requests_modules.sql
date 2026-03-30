-- =====================================================
-- KalamApp - Phase 42 HR Requests Modules
-- Date: 2026-03-25
-- Type: Additive / non-breaking migration
-- Goal: add leave, overtime, and mission request tables for HR workflows
-- =====================================================

begin;

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid()
);

alter table public.leave_requests
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists employee_id uuid references public.employees(id) on delete set null,
  add column if not exists status text not null default 'pending',
  add column if not exists leave_type text not null default 'daily',
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists total_days numeric(10,2) not null default 0,
  add column if not exists total_minutes integer not null default 0,
  add column if not exists notes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.leave_requests
set
  status = coalesce(nullif(status, ''), 'pending'),
  leave_type = coalesce(nullif(leave_type, ''), 'daily'),
  total_days = coalesce(total_days, 0),
  total_minutes = coalesce(total_minutes, 0)
where
  status is null
  or status = ''
  or leave_type is null
  or leave_type = ''
  or total_days is null
  or total_minutes is null;

alter table public.leave_requests
  alter column status set default 'pending',
  alter column status set not null,
  alter column leave_type set default 'daily',
  alter column leave_type set not null,
  alter column total_days set default 0,
  alter column total_days set not null,
  alter column total_minutes set default 0,
  alter column total_minutes set not null;

create index if not exists idx_leave_requests_org_dates on public.leave_requests(org_id, start_date, end_date);
create index if not exists idx_leave_requests_employee on public.leave_requests(employee_id) where employee_id is not null;

create table if not exists public.overtime_requests (
  id uuid primary key default gen_random_uuid()
);

alter table public.overtime_requests
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists employee_id uuid references public.employees(id) on delete set null,
  add column if not exists status text not null default 'pending',
  add column if not exists work_date date,
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists total_minutes integer not null default 0,
  add column if not exists notes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.overtime_requests
set
  status = coalesce(nullif(status, ''), 'pending'),
  total_minutes = coalesce(total_minutes, 0)
where
  status is null
  or status = ''
  or total_minutes is null;

alter table public.overtime_requests
  alter column status set default 'pending',
  alter column status set not null,
  alter column total_minutes set default 0,
  alter column total_minutes set not null;

create index if not exists idx_overtime_requests_org_work_date on public.overtime_requests(org_id, work_date);
create index if not exists idx_overtime_requests_employee on public.overtime_requests(employee_id) where employee_id is not null;

create table if not exists public.mission_requests (
  id uuid primary key default gen_random_uuid()
);

alter table public.mission_requests
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists employee_id uuid references public.employees(id) on delete set null,
  add column if not exists status text not null default 'pending',
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists destination text,
  add column if not exists notes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.mission_requests
set
  status = coalesce(nullif(status, ''), 'pending')
where
  status is null
  or status = '';

alter table public.mission_requests
  alter column status set default 'pending',
  alter column status set not null;

create index if not exists idx_mission_requests_org_dates on public.mission_requests(org_id, start_date, end_date);
create index if not exists idx_mission_requests_employee on public.mission_requests(employee_id) where employee_id is not null;

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_leave_requests_updated_at on public.leave_requests;
    create trigger trg_leave_requests_updated_at before update on public.leave_requests for each row execute function public.set_updated_at();

    drop trigger if exists trg_overtime_requests_updated_at on public.overtime_requests;
    create trigger trg_overtime_requests_updated_at before update on public.overtime_requests for each row execute function public.set_updated_at();

    drop trigger if exists trg_mission_requests_updated_at on public.mission_requests;
    create trigger trg_mission_requests_updated_at before update on public.mission_requests for each row execute function public.set_updated_at();
  end if;
end $$;

grant select, insert, update, delete on public.leave_requests to authenticated, service_role;
grant select, insert, update, delete on public.overtime_requests to authenticated, service_role;
grant select, insert, update, delete on public.mission_requests to authenticated, service_role;

alter table public.leave_requests enable row level security;
alter table public.overtime_requests enable row level security;
alter table public.mission_requests enable row level security;

drop policy if exists p_leave_requests_org_all on public.leave_requests;
create policy p_leave_requests_org_all on public.leave_requests
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

drop policy if exists p_overtime_requests_org_all on public.overtime_requests;
create policy p_overtime_requests_org_all on public.overtime_requests
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

drop policy if exists p_mission_requests_org_all on public.mission_requests;
create policy p_mission_requests_org_all on public.mission_requests
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
