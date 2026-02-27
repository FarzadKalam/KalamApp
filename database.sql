-- KalamApp Core DB (Option A)
-- هدف: بالا آوردن سریع هسته سیستم برای Login/Settings/Workflows/Notes/Connections

begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.org_roles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_org_roles_title_lower
on public.org_roles (lower(title));

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete set null,
  full_name text,
  email text,
  mobile text,
  mobile_1 text,
  mobile_2 text,
  job_title text,
  position text,
  team text,
  hire_date date,
  avatar_url text,
  bio text,
  role text not null default 'viewer',
  role_id uuid references public.org_roles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_org_id on public.profiles(org_id);
create index if not exists idx_profiles_role_id on public.profiles(role_id);

create table if not exists public.company_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  company_name text,
  company_full_name text,
  trade_name text,
  company_name_en text,
  brand_palette_key text not null default 'executive_indigo'
    check (brand_palette_key in ('executive_indigo', 'corporate_blue', 'deep_ocean', 'ruby_red', 'amber_navy')),
  currency_code text not null default 'IRT'
    check (currency_code in ('IRT', 'IRR', 'USD', 'EUR')),
  currency_label text not null default 'تومان',
  ceo_name text,
  national_id text,
  mobile text,
  phone text,
  address text,
  website text,
  email text,
  logo_url text,
  icon_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_company_settings_org_id on public.company_settings(org_id);

create table if not exists public.integration_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  connection_type text not null check (connection_type in ('sms','email','site')),
  provider text,
  settings jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create unique index if not exists idx_integration_settings_connection_type
on public.integration_settings(connection_type);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  module_id text not null,
  record_id text not null,
  content text not null,
  mention_user_ids uuid[] not null default '{}'::uuid[],
  mention_role_ids uuid[] not null default '{}'::uuid[],
  reply_to uuid references public.notes(id) on delete set null,
  author_id uuid references auth.users(id) on delete set null,
  author_name text,
  is_edited boolean not null default false,
  edited_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notes_module_record on public.notes(module_id, record_id);
create index if not exists idx_notes_created_at on public.notes(created_at desc);

create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  module_id text not null,
  name text not null,
  description text,
  trigger_type text not null default 'on_create' check (trigger_type in ('on_create','on_upsert','interval')),
  interval_value integer,
  interval_unit text check (interval_unit in ('hour','day','month')),
  interval_at text,
  batch_size integer,
  conditions_all jsonb not null default '[]'::jsonb,
  conditions_any jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_workflows_module_active on public.workflows(module_id, is_active);

create table if not exists public.workflow_logs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references public.workflows(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete set null,
  run_type text not null default 'event',
  status text not null default 'success',
  module_id text,
  record_id text,
  message text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_workflow_logs_workflow on public.workflow_logs(workflow_id, created_at desc);

create table if not exists public.dynamic_options (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  label text not null,
  value text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_dynamic_options_category_value
on public.dynamic_options(category, value);

drop trigger if exists trg_organizations_updated_at on public.organizations;
create trigger trg_organizations_updated_at before update on public.organizations
for each row execute function public.set_updated_at();

drop trigger if exists trg_org_roles_updated_at on public.org_roles;
create trigger trg_org_roles_updated_at before update on public.org_roles
for each row execute function public.set_updated_at();

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_company_settings_updated_at on public.company_settings;
create trigger trg_company_settings_updated_at before update on public.company_settings
for each row execute function public.set_updated_at();

drop trigger if exists trg_integration_settings_updated_at on public.integration_settings;
create trigger trg_integration_settings_updated_at before update on public.integration_settings
for each row execute function public.set_updated_at();

drop trigger if exists trg_workflows_updated_at on public.workflows;
create trigger trg_workflows_updated_at before update on public.workflows
for each row execute function public.set_updated_at();

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

alter table public.organizations enable row level security;
alter table public.org_roles enable row level security;
alter table public.profiles enable row level security;
alter table public.company_settings enable row level security;
alter table public.integration_settings enable row level security;
alter table public.notes enable row level security;
alter table public.workflows enable row level security;
alter table public.workflow_logs enable row level security;
alter table public.dynamic_options enable row level security;

drop policy if exists p_organizations_auth_all on public.organizations;
create policy p_organizations_auth_all on public.organizations for all to authenticated using (true) with check (true);

drop policy if exists p_org_roles_auth_all on public.org_roles;
create policy p_org_roles_auth_all on public.org_roles for all to authenticated using (true) with check (true);

drop policy if exists p_profiles_auth_all on public.profiles;
create policy p_profiles_auth_all on public.profiles for all to authenticated using (true) with check (true);

drop policy if exists p_company_settings_auth_all on public.company_settings;
create policy p_company_settings_auth_all on public.company_settings for all to authenticated using (true) with check (true);

drop policy if exists p_integration_settings_auth_all on public.integration_settings;
create policy p_integration_settings_auth_all on public.integration_settings for all to authenticated using (true) with check (true);

drop policy if exists p_notes_auth_all on public.notes;
create policy p_notes_auth_all on public.notes for all to authenticated using (true) with check (true);

drop policy if exists p_workflows_auth_all on public.workflows;
create policy p_workflows_auth_all on public.workflows for all to authenticated using (true) with check (true);

drop policy if exists p_workflow_logs_auth_all on public.workflow_logs;
create policy p_workflow_logs_auth_all on public.workflow_logs for all to authenticated using (true) with check (true);

drop policy if exists p_dynamic_options_auth_all on public.dynamic_options;
create policy p_dynamic_options_auth_all on public.dynamic_options for all to authenticated using (true) with check (true);

insert into public.org_roles (title, permissions)
select v.title, '{}'::jsonb
from (values ('super_admin'), ('admin'), ('manager'), ('viewer')) as v(title)
where not exists (
  select 1 from public.org_roles r where lower(r.title) = lower(v.title)
);

insert into public.organizations (name, slug)
select 'KalamApp', 'kalamapp'
where not exists (select 1 from public.organizations);

with org as (
  select id from public.organizations order by created_at asc limit 1
), sr as (
  select id from public.org_roles where lower(title) = 'super_admin' limit 1
)
insert into public.profiles (id, org_id, full_name, email, role, role_id, is_active)
select
  u.id,
  org.id,
  coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1)),
  u.email,
  'super_admin',
  sr.id,
  true
from auth.users u
cross join org
cross join sr
left join public.profiles p on p.id = u.id
where p.id is null;

with org as (
  select id from public.organizations order by created_at asc limit 1
)
insert into public.company_settings (org_id, company_name)
select org.id, 'KalamApp'
from org
where not exists (select 1 from public.company_settings);

commit;
