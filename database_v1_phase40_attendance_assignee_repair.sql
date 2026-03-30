-- =====================================================
-- KalamApp - Phase 40 HR Foundation Bundle
-- Date: 2026-03-25
-- Type: Additive / idempotent migration
-- Goal: bundle HR foundation changes from phases 35-42 into one runnable script
-- =====================================================

begin;

alter table if exists public.products
  add column if not exists commission_percentage numeric(8,4) not null default 0;

create table if not exists public.work_schedules (
  id uuid primary key default gen_random_uuid()
);

alter table public.work_schedules
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists title text not null default '',
  add column if not exists employee_id uuid references public.employees(id) on delete set null,
  add column if not exists status text not null default 'draft',
  add column if not exists schedule_type text not null default 'fixed',
  add column if not exists is_active boolean not null default true,
  add column if not exists effective_from date,
  add column if not exists effective_to date,
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists flexible_start_time time,
  add column if not exists flexible_end_time time,
  add column if not exists expected_daily_minutes integer not null default 480,
  add column if not exists weekly_plan jsonb not null default '{}'::jsonb,
  add column if not exists weekly_days jsonb not null default '[]'::jsonb,
  add column if not exists notes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.work_schedules
set
  title = coalesce(title, ''),
  status = coalesce(nullif(status, ''), 'draft'),
  schedule_type = coalesce(nullif(schedule_type, ''), 'fixed'),
  is_active = coalesce(is_active, true),
  expected_daily_minutes = coalesce(expected_daily_minutes, 480),
  weekly_plan = coalesce(weekly_plan, '{}'::jsonb),
  weekly_days = coalesce(weekly_days, '[]'::jsonb)
where
  title is null
  or status is null
  or status = ''
  or schedule_type is null
  or schedule_type = ''
  or is_active is null
  or expected_daily_minutes is null
  or weekly_plan is null
  or weekly_days is null;

alter table public.work_schedules
  alter column title set default '',
  alter column title set not null,
  alter column status set default 'draft',
  alter column status set not null,
  alter column schedule_type set default 'fixed',
  alter column schedule_type set not null,
  alter column is_active set default true,
  alter column is_active set not null,
  alter column expected_daily_minutes set default 480,
  alter column expected_daily_minutes set not null,
  alter column weekly_plan set default '{}'::jsonb,
  alter column weekly_plan set not null,
  alter column weekly_days set default '[]'::jsonb,
  alter column weekly_days set not null;

create index if not exists idx_work_schedules_org_title on public.work_schedules(org_id, title);
create index if not exists idx_work_schedules_employee on public.work_schedules(employee_id)
  where employee_id is not null;

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_work_schedules_updated_at on public.work_schedules;
    create trigger trg_work_schedules_updated_at
      before update on public.work_schedules
      for each row execute function public.set_updated_at();
  end if;
end $$;

grant select, insert, update, delete on public.work_schedules to authenticated, service_role;

alter table public.work_schedules enable row level security;

drop policy if exists p_work_schedules_org_all on public.work_schedules;
create policy p_work_schedules_org_all on public.work_schedules
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

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid()
);

alter table public.employees
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists image_url text,
  add column if not exists full_name text,
  add column if not exists system_code text,
  add column if not exists related_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists employment_status text not null default 'active',
  add column if not exists employment_type text,
  add column if not exists salary_type text,
  add column if not exists department text,
  add column if not exists team text,
  add column if not exists job_title text,
  add column if not exists national_code text,
  add column if not exists father_name text,
  add column if not exists birth_certificate_number text,
  add column if not exists insurance_number text,
  add column if not exists gender text,
  add column if not exists birth_date date,
  add column if not exists hire_date date,
  add column if not exists termination_date date,
  add column if not exists mobile_1 text,
  add column if not exists mobile_2 text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists province text,
  add column if not exists city text,
  add column if not exists address text,
  add column if not exists default_work_schedule_id uuid references public.work_schedules(id) on delete set null,
  add column if not exists has_flexible_hours boolean not null default false,
  add column if not exists overtime_auto_approve boolean not null default false,
  add column if not exists leave_auto_approve boolean not null default false,
  add column if not exists mission_auto_approve boolean not null default false,
  add column if not exists expected_daily_minutes integer not null default 480,
  add column if not exists grace_minutes_for_late integer not null default 0,
  add column if not exists insurance_subject boolean not null default true,
  add column if not exists employee_insurance_rate numeric(8,4) not null default 7,
  add column if not exists employer_insurance_rate numeric(8,4) not null default 23,
  add column if not exists bank_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_card_number text,
  add column if not exists iban text,
  add column if not exists base_salary numeric(18,2) not null default 0,
  add column if not exists hourly_rate numeric(18,2) not null default 0,
  add column if not exists overtime_rate numeric(18,2) not null default 0,
  add column if not exists late_penalty_rate numeric(18,2) not null default 0,
  add column if not exists early_bonus_rate numeric(18,2) not null default 0,
  add column if not exists production_bonus_rate numeric(18,2) not null default 0,
  add column if not exists commission_percentage numeric(8,4) not null default 0,
  add column if not exists profit_share_percentage numeric(8,4) not null default 0,
  add column if not exists profit_share_basis text not null default 'net_profit',
  add column if not exists profit_share_cost_center_id uuid references public.cost_centers(id) on delete set null,
  add column if not exists notes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.employees
set
  employment_status = coalesce(nullif(employment_status, ''), 'active'),
  has_flexible_hours = coalesce(has_flexible_hours, false),
  overtime_auto_approve = coalesce(overtime_auto_approve, false),
  leave_auto_approve = coalesce(leave_auto_approve, false),
  mission_auto_approve = coalesce(mission_auto_approve, false),
  expected_daily_minutes = coalesce(expected_daily_minutes, 480),
  grace_minutes_for_late = coalesce(grace_minutes_for_late, 0),
  insurance_subject = coalesce(insurance_subject, true),
  employee_insurance_rate = coalesce(employee_insurance_rate, 7),
  employer_insurance_rate = coalesce(employer_insurance_rate, 23),
  base_salary = coalesce(base_salary, 0),
  hourly_rate = coalesce(hourly_rate, 0),
  overtime_rate = coalesce(overtime_rate, 0),
  late_penalty_rate = coalesce(late_penalty_rate, 0),
  early_bonus_rate = coalesce(early_bonus_rate, 0),
  production_bonus_rate = coalesce(production_bonus_rate, 0),
  commission_percentage = coalesce(commission_percentage, 0),
  profit_share_percentage = coalesce(profit_share_percentage, 0),
  profit_share_basis = coalesce(nullif(profit_share_basis, ''), 'net_profit')
where
  employment_status is null
  or employment_status = ''
  or has_flexible_hours is null
  or overtime_auto_approve is null
  or leave_auto_approve is null
  or mission_auto_approve is null
  or expected_daily_minutes is null
  or grace_minutes_for_late is null
  or insurance_subject is null
  or employee_insurance_rate is null
  or employer_insurance_rate is null
  or base_salary is null
  or hourly_rate is null
  or overtime_rate is null
  or late_penalty_rate is null
  or early_bonus_rate is null
  or production_bonus_rate is null
  or commission_percentage is null
  or profit_share_percentage is null
  or profit_share_basis is null
  or profit_share_basis = '';

alter table public.employees
  alter column employment_status set default 'active',
  alter column employment_status set not null,
  alter column has_flexible_hours set default false,
  alter column has_flexible_hours set not null,
  alter column overtime_auto_approve set default false,
  alter column overtime_auto_approve set not null,
  alter column leave_auto_approve set default false,
  alter column leave_auto_approve set not null,
  alter column mission_auto_approve set default false,
  alter column mission_auto_approve set not null,
  alter column expected_daily_minutes set default 480,
  alter column expected_daily_minutes set not null,
  alter column grace_minutes_for_late set default 0,
  alter column grace_minutes_for_late set not null,
  alter column insurance_subject set default true,
  alter column insurance_subject set not null,
  alter column employee_insurance_rate set default 7,
  alter column employee_insurance_rate set not null,
  alter column employer_insurance_rate set default 23,
  alter column employer_insurance_rate set not null,
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
  alter column commission_percentage set not null,
  alter column profit_share_percentage set default 0,
  alter column profit_share_percentage set not null,
  alter column profit_share_basis set default 'net_profit',
  alter column profit_share_basis set not null;

create index if not exists idx_employees_org_name on public.employees(org_id, full_name);
create unique index if not exists idx_employees_org_system_code
  on public.employees(org_id, system_code)
  where system_code is not null and system_code <> '';
create unique index if not exists idx_employees_related_profile
  on public.employees(related_profile_id)
  where related_profile_id is not null;
create index if not exists idx_employees_default_work_schedule
  on public.employees(default_work_schedule_id)
  where default_work_schedule_id is not null;
create index if not exists idx_employees_profit_share_cost_center
  on public.employees(profit_share_cost_center_id)
  where profit_share_cost_center_id is not null;

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_employees_updated_at on public.employees;
    create trigger trg_employees_updated_at
      before update on public.employees
      for each row execute function public.set_updated_at();
  end if;
end $$;

grant select, insert, update, delete on public.employees to authenticated, service_role;

alter table public.employees enable row level security;

drop policy if exists p_employees_org_all on public.employees;
create policy p_employees_org_all on public.employees
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
