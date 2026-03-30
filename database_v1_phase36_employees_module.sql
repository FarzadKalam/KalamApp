-- =====================================================
-- KalamApp - Phase 36 Employees Module Foundation
-- Date: 2026-03-24
-- Type: Additive / non-breaking migration
-- Goal: add standalone employees table for HR domain without changing current profiles flow
-- =====================================================

begin;

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
  add column if not exists notes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

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

create index if not exists idx_employees_org_name on public.employees(org_id, full_name);
create unique index if not exists idx_employees_org_system_code
  on public.employees(org_id, system_code)
  where system_code is not null and system_code <> '';
create unique index if not exists idx_employees_related_profile
  on public.employees(related_profile_id)
  where related_profile_id is not null;

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

commit;
