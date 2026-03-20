-- =====================================================
-- KalamApp - Phase 14 Identity/Profile Compatibility
-- Date: 2026-03-18
-- Type: Additive / non-breaking migration
-- Prerequisite: database_v1_phase1.sql
-- =====================================================

begin;

create extension if not exists pgcrypto;

-- -----------------------------------------------------
-- Ensure core identity support tables exist
-- -----------------------------------------------------

create table if not exists public.org_roles (
  id uuid primary key default gen_random_uuid()
);

alter table public.org_roles
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists title text not null default 'viewer',
  add column if not exists permissions jsonb not null default '{}'::jsonb,
  add column if not exists is_system boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_org_roles_org_title_unique
  on public.org_roles (org_id, lower(title));

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade
);

alter table public.profiles
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists system_code text,
  add column if not exists full_name text,
  add column if not exists email text,
  add column if not exists mobile text,
  add column if not exists mobile_1 text,
  add column if not exists mobile_2 text,
  add column if not exists job_title text,
  add column if not exists position text,
  add column if not exists team text,
  add column if not exists hire_date date,
  add column if not exists avatar_url text,
  add column if not exists bio text,
  add column if not exists role text not null default 'viewer',
  add column if not exists role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_profiles_org_id on public.profiles(org_id);
create index if not exists idx_profiles_role_id on public.profiles(role_id);
create index if not exists idx_profiles_full_name on public.profiles(full_name);
create unique index if not exists idx_profiles_org_system_code
  on public.profiles(org_id, system_code)
  where system_code is not null and system_code <> '';

-- -----------------------------------------------------
-- Compatibility columns used in UI selects
-- -----------------------------------------------------

alter table if exists public.bank_accounts
  add column if not exists system_code text;

create unique index if not exists idx_bank_accounts_org_system_code
  on public.bank_accounts(org_id, system_code)
  where system_code is not null and system_code <> '';

-- -----------------------------------------------------
-- Keep current_org_id consistent with profiles
-- -----------------------------------------------------

create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.org_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1
$$;

-- -----------------------------------------------------
-- Trigger safety for updated_at
-- -----------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- -----------------------------------------------------
-- Seed baseline roles + backfill profiles from auth.users
-- -----------------------------------------------------

insert into public.org_roles (org_id, title, permissions, is_system)
select null, v.title, '{}'::jsonb, true
from (values ('super_admin'), ('admin'), ('manager'), ('viewer')) as v(title)
where not exists (
  select 1
  from public.org_roles r
  where r.org_id is null
    and lower(r.title) = lower(v.title)
);

with first_org as (
  select id
  from public.organizations
  order by created_at asc nulls last, id
  limit 1
),
default_role as (
  select id
  from public.org_roles
  where lower(title) = 'super_admin'
  order by created_at asc nulls last, id
  limit 1
)
insert into public.profiles (id, org_id, full_name, email, role, role_id, is_active)
select
  u.id,
  (select id from first_org),
  coalesce(u.raw_user_meta_data->>'full_name', split_part(coalesce(u.email,''), '@', 1)),
  u.email,
  'super_admin',
  (select id from default_role),
  true
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- Backfill compatibility system_code values where needed
update public.profiles p
set system_code = 'USR-' || right(replace(p.id::text, '-', ''), 8)
where (p.system_code is null or p.system_code = '');

update public.bank_accounts b
set system_code = b.code
where (b.system_code is null or b.system_code = '')
  and b.code is not null
  and b.code <> '';

commit;

