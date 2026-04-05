-- KalamApp V1 Full Database (config-aligned)
-- Date: 2026-02-25
-- Scope: all current module configs + runtime support tables
-- Note: this script is additive and safe to run on partially-initialized databases.

begin;

create extension if not exists pgcrypto;

-- =====================================================
-- Core functions
-- =====================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =====================================================
-- Core tenancy / identity tables
-- =====================================================

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid()
);

alter table public.organizations
  add column if not exists name text not null default 'KalamApp',
  add column if not exists slug text,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_organizations_slug_unique
  on public.organizations (slug)
  where slug is not null;

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

-- =====================================================
-- Settings / support tables
-- =====================================================

create table if not exists public.company_settings (
  id uuid primary key default gen_random_uuid()
);

alter table public.company_settings
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists company_name text,
  add column if not exists company_full_name text,
  add column if not exists trade_name text,
  add column if not exists company_name_en text,
  add column if not exists brand_palette_key text not null default 'executive_indigo',
  add column if not exists currency_code text not null default 'IRT',
  add column if not exists currency_label text not null default 'تومان',
  add column if not exists ceo_name text,
  add column if not exists national_id text,
  add column if not exists mobile text,
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists website text,
  add column if not exists email text,
  add column if not exists instagram_id text,
  add column if not exists telegram_id text,
  add column if not exists youtube_url text,
  add column if not exists whatsapp_number text,
  add column if not exists eitaa_id text,
  add column if not exists rubika_id text,
  add column if not exists bale_id text,
  add column if not exists logo_url text,
  add column if not exists icon_url text,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'chk_company_settings_brand_palette_key'
  ) then
    alter table public.company_settings
      drop constraint chk_company_settings_brand_palette_key;
  end if;

  alter table public.company_settings
    add constraint chk_company_settings_brand_palette_key
    check (brand_palette_key in ('executive_indigo', 'corporate_blue', 'deep_ocean', 'ruby_red', 'amber_navy'));
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'chk_company_settings_currency_code'
  ) then
    alter table public.company_settings
      drop constraint chk_company_settings_currency_code;
  end if;

  alter table public.company_settings
    add constraint chk_company_settings_currency_code
    check (currency_code in ('IRT', 'IRR', 'USD', 'EUR'));
end
$$;

create index if not exists idx_company_settings_org_id on public.company_settings(org_id);

create table if not exists public.integration_settings (
  id uuid primary key default gen_random_uuid()
);

alter table public.integration_settings
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists connection_type text,
  add column if not exists provider text,
  add column if not exists settings jsonb not null default '{}'::jsonb,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'integration_settings_connection_type_check'
  ) then
    alter table public.integration_settings
      add constraint integration_settings_connection_type_check
      check (connection_type in ('sms', 'email', 'site', 'module_settings', 'print_templates'));
  end if;
end $$;

create unique index if not exists idx_integration_settings_connection_type
  on public.integration_settings(connection_type);

create index if not exists idx_integration_settings_org
  on public.integration_settings(org_id, connection_type);

create table if not exists public.dynamic_options (
  id uuid primary key default gen_random_uuid()
);

alter table public.dynamic_options
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists category text not null default 'general',
  add column if not exists label text not null default '',
  add column if not exists value text not null default '',
  add column if not exists display_order integer not null default 0,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_dynamic_options_org_category_value
  on public.dynamic_options (org_id, category, value);

create index if not exists idx_dynamic_options_lookup
  on public.dynamic_options (category, is_active, display_order);

create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid()
);

alter table public.saved_views
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists module_id text not null default '',
  add column if not exists name text not null default '',
  add column if not exists config jsonb not null default '{"columns":[],"filters":[]}'::jsonb,
  add column if not exists is_default boolean not null default false,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_saved_views_org_module on public.saved_views(org_id, module_id);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid()
);

alter table public.tags
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists title text not null default '',
  add column if not exists color text not null default '#1677ff',
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_tags_org_title
  on public.tags(org_id, lower(title));

create table if not exists public.record_tags (
  id uuid primary key default gen_random_uuid()
);

alter table public.record_tags
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists module_id text not null default '',
  add column if not exists record_id text not null default '',
  add column if not exists tag_id uuid references public.tags(id) on delete cascade,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists idx_record_tags_unique
  on public.record_tags (module_id, record_id, tag_id);

create index if not exists idx_record_tags_module_record
  on public.record_tags (module_id, record_id);

create table if not exists public.changelogs (
  id uuid primary key default gen_random_uuid()
);

alter table public.changelogs
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists module_id text not null default '',
  add column if not exists record_id text not null default '',
  add column if not exists action text not null default 'update',
  add column if not exists field_name text,
  add column if not exists field_label text,
  add column if not exists old_value text,
  add column if not exists new_value text,
  add column if not exists user_id uuid references public.profiles(id) on delete set null,
  add column if not exists record_title text,
  add column if not exists created_at timestamptz not null default now();

create index if not exists idx_changelogs_module_record
  on public.changelogs(module_id, record_id, created_at desc);

create table if not exists public.user_login_events (
  id uuid primary key default gen_random_uuid()
);

alter table public.user_login_events
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists user_id uuid references public.profiles(id) on delete cascade,
  add column if not exists login_method text not null default 'password',
  add column if not exists source text not null default 'web',
  add column if not exists user_agent text,
  add column if not exists created_at timestamptz not null default now();

create index if not exists idx_user_login_events_user_created_at
  on public.user_login_events(user_id, created_at desc)
  where user_id is not null;

create index if not exists idx_user_login_events_org_created_at
  on public.user_login_events(org_id, created_at desc);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid()
);

alter table public.notes
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists module_id text not null default '',
  add column if not exists record_id text not null default '',
  add column if not exists content text not null default '',
  add column if not exists mention_user_ids uuid[] not null default '{}'::uuid[],
  add column if not exists mention_role_ids uuid[] not null default '{}'::uuid[],
  add column if not exists reply_to uuid references public.notes(id) on delete set null,
  add column if not exists author_id uuid references public.profiles(id) on delete set null,
  add column if not exists author_name text,
  add column if not exists is_edited boolean not null default false,
  add column if not exists edited_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_notes_module_record on public.notes(module_id, record_id);
create index if not exists idx_notes_created_at on public.notes(created_at desc);

create or replace function public.normalize_note_scope()
returns trigger
language plpgsql
as $$
begin
  new.module_id := coalesce(nullif(trim(new.module_id), ''), '');
  new.record_id := coalesce(nullif(trim(new.record_id), ''), '');
  return new;
end;
$$;

drop trigger if exists trg_notes_normalize_scope on public.notes;

create trigger trg_notes_normalize_scope
before insert or update on public.notes
for each row
execute function public.normalize_note_scope();

create table if not exists public.sidebar_unread (
  id uuid primary key default gen_random_uuid()
);

alter table public.sidebar_unread
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists user_id uuid references public.profiles(id) on delete cascade,
  add column if not exists module_id text not null default '',
  add column if not exists record_id text not null default '',
  add column if not exists tab_key text not null default '',
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_sidebar_unread_unique
  on public.sidebar_unread(user_id, module_id, record_id, tab_key);

create index if not exists idx_sidebar_unread_user
  on public.sidebar_unread(user_id, module_id, record_id);

create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid()
);

alter table public.workflows
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists module_id text not null default '',
  add column if not exists name text not null default '',
  add column if not exists description text,
  add column if not exists trigger_type text not null default 'on_create',
  add column if not exists execution_mode text not null default 'first_match',
  add column if not exists interval_value integer,
  add column if not exists interval_unit text,
  add column if not exists interval_at text,
  add column if not exists batch_size integer,
  add column if not exists conditions_all jsonb not null default '[]'::jsonb,
  add column if not exists conditions_any jsonb not null default '[]'::jsonb,
  add column if not exists actions jsonb not null default '[]'::jsonb,
  add column if not exists is_active boolean not null default true,
  add column if not exists last_run_at timestamptz,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workflows_trigger_type_check'
  ) then
    alter table public.workflows
      add constraint workflows_trigger_type_check
      check (trigger_type in ('on_create', 'on_upsert', 'interval'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workflows_execution_mode_check'
  ) then
    alter table public.workflows
      add constraint workflows_execution_mode_check
      check (execution_mode in ('first_match', 'every_match'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workflows_interval_unit_check'
  ) then
    alter table public.workflows
      add constraint workflows_interval_unit_check
      check (interval_unit is null or interval_unit in ('hour', 'day', 'month'));
  end if;
end $$;

create index if not exists idx_workflows_module_active on public.workflows(module_id, is_active);

create table if not exists public.workflow_logs (
  id uuid primary key default gen_random_uuid()
);

alter table public.workflow_logs
  add column if not exists workflow_id uuid references public.workflows(id) on delete cascade,
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists run_type text not null default 'event',
  add column if not exists status text not null default 'success',
  add column if not exists module_id text,
  add column if not exists record_id text,
  add column if not exists message text,
  add column if not exists details jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now();

create index if not exists idx_workflow_logs_workflow
  on public.workflow_logs(workflow_id, created_at desc);

-- =====================================================
-- Warehouse / CRM / Products
-- =====================================================

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid()
);

alter table public.warehouses
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists category text not null default 'inside',
  add column if not exists location text,
  add column if not exists manager_id uuid references public.profiles(id) on delete set null,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_warehouses_org_system_code
  on public.warehouses(org_id, system_code)
  where system_code is not null and system_code <> '';

create index if not exists idx_warehouses_org_name on public.warehouses(org_id, name);

create table if not exists public.shelves (
  id uuid primary key default gen_random_uuid()
);

alter table public.shelves
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists warehouse_id uuid references public.warehouses(id) on delete cascade,
  add column if not exists name text,
  add column if not exists shelf_number text,
  add column if not exists system_code text,
  add column if not exists location_detail text,
  add column if not exists responsible_id uuid references public.profiles(id) on delete set null,
  add column if not exists image_url text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_shelves_warehouse_id on public.shelves(warehouse_id);
create index if not exists idx_shelves_org_number on public.shelves(org_id, shelf_number);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid()
);

alter table public.suppliers
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists image_url text,
  add column if not exists business_name text,
  add column if not exists last_name text,
  add column if not exists supply_type text,
  add column if not exists rank text,
  add column if not exists mobile_1 text,
  add column if not exists mobile_2 text,
  add column if not exists phone text,
  add column if not exists prefix text,
  add column if not exists first_name text,
  add column if not exists system_code text,
  add column if not exists website text,
  add column if not exists province text,
  add column if not exists city text,
  add column if not exists address text,
  add column if not exists location text,
  add column if not exists bank_account_number text,
  add column if not exists first_supply_date date,
  add column if not exists supply_count numeric(18,3) not null default 0,
  add column if not exists total_paid numeric(18,2) not null default 0,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_suppliers_org_name on public.suppliers(org_id, business_name);
create unique index if not exists idx_suppliers_org_system_code
  on public.suppliers(org_id, system_code)
  where system_code is not null and system_code <> '';

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid()
);

alter table public.customers
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists image_url text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists system_code text,
  add column if not exists legacy_contact_code text,
  add column if not exists rank text,
  add column if not exists mobile_1 text,
  add column if not exists prefix text,
  add column if not exists business_name text,
  add column if not exists accounting_code text,
  add column if not exists email text,
  add column if not exists assistant_phone text,
  add column if not exists birth_date date,
  add column if not exists lead_source text,
  add column if not exists referrer_module text,
  add column if not exists referrer_customer_id uuid references public.customers(id) on delete set null,
  add column if not exists referrer_employee_id uuid,
  add column if not exists referrer_supplier_id uuid references public.suppliers(id) on delete set null,
  add column if not exists mobile_2 text,
  add column if not exists phone text,
  add column if not exists province text,
  add column if not exists city text,
  add column if not exists address text,
  add column if not exists notes text,
  add column if not exists location text,
  add column if not exists instagram_id text,
  add column if not exists telegram_id text,
  add column if not exists first_purchase_date date,
  add column if not exists last_purchase_date date,
  add column if not exists purchase_count numeric(18,3) not null default 0,
  add column if not exists total_spend numeric(18,2) not null default 0,
  add column if not exists total_paid_amount numeric(18,2) not null default 0,
  add column if not exists organization_position text,
  add column if not exists acquaintance_days integer,
  add column if not exists cooperation_days integer,
  add column if not exists customer_interests jsonb not null default '[]'::jsonb,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists process_template_id uuid,
  add column if not exists process_run_id uuid,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_customers_org_name on public.customers(org_id, first_name, last_name);
create unique index if not exists idx_customers_org_system_code
  on public.customers(org_id, system_code)
  where system_code is not null and system_code <> '';
create index if not exists idx_customers_legacy_contact_code
  on public.customers(org_id, legacy_contact_code)
  where legacy_contact_code is not null and legacy_contact_code <> '';

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

create table if not exists public.products (
  id uuid primary key default gen_random_uuid()
);

alter table public.products
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists image_url text,
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists manual_code text,
  add column if not exists status text not null default 'active',
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists product_type text not null default 'raw',
  add column if not exists category text,
  add column if not exists main_unit text,
  add column if not exists sub_unit text,
  add column if not exists product_category text,
  add column if not exists brand_name text,
  add column if not exists related_bom uuid,
  add column if not exists production_order_id uuid,
  add column if not exists related_supplier uuid,
  add column if not exists stock numeric(18,3) not null default 0,
  add column if not exists sub_stock numeric(18,3) not null default 0,
  add column if not exists waste_rate numeric(12,4) not null default 0,
  add column if not exists buy_price numeric(18,2) not null default 0,
  add column if not exists sell_price numeric(18,2) not null default 0,
  add column if not exists total_sold_amount numeric(18,2) not null default 0,
  add column if not exists total_sold_quantity numeric(18,3) not null default 0,
  add column if not exists invoice_count integer not null default 0,
  add column if not exists monthly_rent numeric(18,2) not null default 0,
  add column if not exists vat_percentage numeric(8,4) not null default 10,
  add column if not exists is_vat_exempt boolean not null default true,
  add column if not exists description text,
  add column if not exists delivery_time text,
  add column if not exists required_quantity numeric(18,3) not null default 0,
  add column if not exists commission_percentage numeric(8,4) not null default 0,
  add column if not exists production_cost numeric(18,2) not null default 0,
  add column if not exists auto_name_enabled boolean not null default false,
  add column if not exists grid_materials jsonb not null default '[]'::jsonb,
  add column if not exists leather_type text,
  add column if not exists leather_colors jsonb not null default '[]'::jsonb,
  add column if not exists leather_finish_1 text,
  add column if not exists leather_effect jsonb not null default '[]'::jsonb,
  add column if not exists leather_sort text,
  add column if not exists lining_material text,
  add column if not exists lining_color text,
  add column if not exists lining_width text,
  add column if not exists acc_material text,
  add column if not exists fitting_type text,
  add column if not exists fitting_colors jsonb not null default '[]'::jsonb,
  add column if not exists fitting_size text,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_products_org_system_code
  on public.products(org_id, system_code)
  where system_code is not null and system_code <> '';

create index if not exists idx_products_org_name on public.products(org_id, name);
create index if not exists idx_products_category on public.products(category);
create index if not exists idx_products_product_type on public.products(product_type);
create index if not exists idx_products_assignee on public.products(assignee_id, assignee_role_id);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid()
);

alter table public.product_images
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists product_id uuid references public.products(id) on delete cascade,
  add column if not exists image_url text not null default '',
  add column if not exists sort_order integer not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_product_images_product on public.product_images(product_id, sort_order);

create table if not exists public.product_inventory (
  id uuid primary key default gen_random_uuid()
);

alter table public.product_inventory
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists product_id uuid references public.products(id) on delete cascade,
  add column if not exists shelf_id uuid references public.shelves(id) on delete cascade,
  add column if not exists warehouse_id uuid references public.warehouses(id) on delete set null,
  add column if not exists stock numeric(18,3) not null default 0,
  add column if not exists sub_stock numeric(18,3) not null default 0,
  add column if not exists reserved_stock numeric(18,3) not null default 0,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_product_inventory_unique
  on public.product_inventory(product_id, shelf_id);

create index if not exists idx_product_inventory_shelf on public.product_inventory(shelf_id);

-- =====================================================
-- Production tables
-- =====================================================

create table if not exists public.production_group_orders (
  id uuid primary key default gen_random_uuid()
);

alter table public.production_group_orders
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists status text not null default 'pending',
  add column if not exists production_order_ids jsonb not null default '[]'::jsonb,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_production_group_orders_org_status
  on public.production_group_orders(org_id, status, created_at desc);

create table if not exists public.production_boms (
  id uuid primary key default gen_random_uuid()
);

alter table public.production_boms
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists status text not null default 'active',
  add column if not exists product_category text,
  add column if not exists production_stages jsonb not null default '[]'::jsonb,
  add column if not exists production_stages_draft jsonb not null default '[]'::jsonb,
  add column if not exists grid_materials jsonb not null default '[]'::jsonb,
  add column if not exists items_leather jsonb not null default '[]'::jsonb,
  add column if not exists items_lining jsonb not null default '[]'::jsonb,
  add column if not exists items_fitting jsonb not null default '[]'::jsonb,
  add column if not exists items_accessory jsonb not null default '[]'::jsonb,
  add column if not exists process_template_id uuid,
  add column if not exists production_cost numeric(18,2) not null default 0,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_production_boms_org_system_code
  on public.production_boms(org_id, system_code)
  where system_code is not null and system_code <> '';

create index if not exists idx_production_boms_org_name
  on public.production_boms(org_id, name);

create table if not exists public.production_orders (
  id uuid primary key default gen_random_uuid()
);

alter table public.production_orders
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists bom_id uuid,
  add column if not exists production_group_order_id uuid references public.production_group_orders(id) on delete set null,
  add column if not exists product_category text,
  add column if not exists color text,
  add column if not exists auto_name_enabled boolean not null default false,
  add column if not exists quantity numeric(18,3) not null default 0,
  add column if not exists production_cost numeric(18,2) not null default 0,
  add column if not exists status text not null default 'pending',
  add column if not exists production_started_at timestamptz,
  add column if not exists production_stopped_at timestamptz,
  add column if not exists production_completed_at timestamptz,
  add column if not exists production_stages jsonb not null default '[]'::jsonb,
  add column if not exists production_stages_draft jsonb not null default '[]'::jsonb,
  add column if not exists grid_materials jsonb not null default '[]'::jsonb,
  add column if not exists items_leather jsonb not null default '[]'::jsonb,
  add column if not exists items_lining jsonb not null default '[]'::jsonb,
  add column if not exists items_fitting jsonb not null default '[]'::jsonb,
  add column if not exists items_accessory jsonb not null default '[]'::jsonb,
  add column if not exists production_moves jsonb not null default '[]'::jsonb,
  add column if not exists production_shelf_id uuid references public.shelves(id) on delete set null,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists process_template_id uuid,
  add column if not exists process_run_id uuid,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_production_orders_org_system_code
  on public.production_orders(org_id, system_code)
  where system_code is not null and system_code <> '';

create index if not exists idx_production_orders_status on public.production_orders(org_id, status, created_at desc);
create index if not exists idx_production_orders_group on public.production_orders(production_group_order_id);

create table if not exists public.production_lines (
  id uuid primary key default gen_random_uuid()
);

alter table public.production_lines
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists production_order_id uuid references public.production_orders(id) on delete cascade,
  add column if not exists line_no integer not null default 1,
  add column if not exists quantity numeric(18,3) not null default 0,
  add column if not exists note text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_production_lines_order_line_no
  on public.production_lines(production_order_id, line_no);

create index if not exists idx_production_lines_order on public.production_lines(production_order_id);

create table if not exists public.product_lines (
  id uuid primary key default gen_random_uuid()
);

alter table public.product_lines
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists product_id uuid references public.products(id) on delete cascade,
  add column if not exists production_order_id uuid references public.production_orders(id) on delete cascade,
  add column if not exists line_no integer,
  add column if not exists quantity numeric(18,3) not null default 0,
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists idx_product_lines_unique
  on public.product_lines(product_id, production_order_id);

create table if not exists public.stock_transfers (
  id uuid primary key default gen_random_uuid()
);

alter table public.stock_transfers
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists transfer_type text,
  add column if not exists product_id uuid references public.products(id) on delete cascade,
  add column if not exists delivered_qty numeric(18,3) not null default 0,
  add column if not exists required_qty numeric(18,3) not null default 0,
  add column if not exists from_shelf_id uuid references public.shelves(id) on delete set null,
  add column if not exists to_shelf_id uuid references public.shelves(id) on delete set null,
  add column if not exists invoice_id uuid,
  add column if not exists purchase_invoice_id uuid,
  add column if not exists production_order_id uuid references public.production_orders(id) on delete set null,
  add column if not exists sender_id uuid references public.profiles(id) on delete set null,
  add column if not exists receiver_id uuid references public.profiles(id) on delete set null,
  add column if not exists notes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_stock_transfers_product_created_at
  on public.stock_transfers(product_id, created_at desc);

create index if not exists idx_stock_transfers_invoice on public.stock_transfers(invoice_id);
create index if not exists idx_stock_transfers_purchase_invoice on public.stock_transfers(purchase_invoice_id);
create index if not exists idx_stock_transfers_production_order on public.stock_transfers(production_order_id);

-- =====================================================
-- Sales / purchase / tasks
-- =====================================================

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid()
);

alter table public.invoices
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists name text not null default '',
  add column if not exists invoice_date date,
  add column if not exists system_code text,
  add column if not exists legacy_invoice_number text,
  add column if not exists status text not null default 'draft',
  add column if not exists legacy_status text,
  add column if not exists legacy_accounting_status text,
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists sale_source text,
  add column if not exists legacy_source text,
  add column if not exists "invoiceItems" jsonb not null default '[]'::jsonb,
  add column if not exists payments jsonb not null default '[]'::jsonb,
  add column if not exists legacy_ready_text text,
  add column if not exists total_invoice_amount numeric(18,2) not null default 0,
  add column if not exists total_received_amount numeric(18,2) not null default 0,
  add column if not exists remaining_balance numeric(18,2) not null default 0,
  add column if not exists project_id uuid,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_invoices_org_system_code
  on public.invoices(org_id, system_code)
  where system_code is not null and system_code <> '';

create index if not exists idx_invoices_customer_id on public.invoices(customer_id);
create index if not exists idx_invoices_status_date on public.invoices(org_id, status, invoice_date);
create index if not exists idx_invoices_legacy_invoice_number
  on public.invoices(org_id, legacy_invoice_number)
  where legacy_invoice_number is not null and legacy_invoice_number <> '';

create table if not exists public.purchase_invoices (
  id uuid primary key default gen_random_uuid()
);

alter table public.purchase_invoices
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists name text not null default '',
  add column if not exists invoice_date date,
  add column if not exists system_code text,
  add column if not exists legacy_invoice_number text,
  add column if not exists status text not null default 'draft',
  add column if not exists legacy_status text,
  add column if not exists legacy_accounting_status text,
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null,
  add column if not exists purchase_source text,
  add column if not exists legacy_source text,
  add column if not exists "invoiceItems" jsonb not null default '[]'::jsonb,
  add column if not exists payments jsonb not null default '[]'::jsonb,
  add column if not exists legacy_ready_text text,
  add column if not exists total_invoice_amount numeric(18,2) not null default 0,
  add column if not exists total_received_amount numeric(18,2) not null default 0,
  add column if not exists remaining_balance numeric(18,2) not null default 0,
  add column if not exists project_id uuid,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_purchase_invoices_org_system_code
  on public.purchase_invoices(org_id, system_code)
  where system_code is not null and system_code <> '';

create index if not exists idx_purchase_invoices_supplier_id on public.purchase_invoices(supplier_id);
create index if not exists idx_purchase_invoices_status_date on public.purchase_invoices(org_id, status, invoice_date);
create index if not exists idx_purchase_invoices_legacy_invoice_number
  on public.purchase_invoices(org_id, legacy_invoice_number)
  where legacy_invoice_number is not null and legacy_invoice_number <> '';

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid()
);

alter table public.tasks
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists status text not null default 'todo',
  add column if not exists priority text not null default 'medium',
  add column if not exists related_to_module text,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists description text,
  add column if not exists start_date date,
  add column if not exists due_date timestamptz,
  add column if not exists estimated_hours numeric(10,2),
  add column if not exists spent_hours numeric(10,2) not null default 0,
  add column if not exists start_time text,
  add column if not exists wage numeric(18,2) not null default 0,
  add column if not exists produced_qty numeric(18,3) not null default 0,
  add column if not exists production_shelf_id uuid references public.shelves(id) on delete set null,
  add column if not exists related_product uuid references public.products(id) on delete set null,
  add column if not exists related_customer uuid references public.customers(id) on delete set null,
  add column if not exists related_supplier uuid references public.suppliers(id) on delete set null,
  add column if not exists related_production_order uuid references public.production_orders(id) on delete set null,
  add column if not exists related_invoice uuid references public.invoices(id) on delete set null,
  add column if not exists project_id uuid,
  add column if not exists marketing_lead_id uuid,
  add column if not exists process_run_stage_id uuid,
  add column if not exists production_line_id uuid references public.production_lines(id) on delete set null,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists sort_order integer,
  add column if not exists recurrence_info jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_tasks_related_order on public.tasks(related_production_order, sort_order);
create index if not exists idx_tasks_assignee on public.tasks(assignee_id, assignee_role_id);
create index if not exists idx_tasks_project on public.tasks(project_id);
create index if not exists idx_tasks_marketing_lead on public.tasks(marketing_lead_id);

create table if not exists public.calculation_formulas (
  id uuid primary key default gen_random_uuid()
);

alter table public.calculation_formulas
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists name text not null default '',
  add column if not exists formula text not null default '',
  add column if not exists description text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_calculation_formulas_org_name
  on public.calculation_formulas(org_id, name);

-- =====================================================
-- Price lists
-- =====================================================

create table if not exists public.price_lists (
  id uuid primary key default gen_random_uuid()
);

alter table public.price_lists
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists name text not null default '',
  add column if not exists status text not null default 'active',
  add column if not exists description text,
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.price_lists
set
  name = coalesce(name, ''),
  status = case
    when coalesce(nullif(status, ''), 'active') in ('active', 'draft') then coalesce(nullif(status, ''), 'active')
    else 'active'
  end,
  items = coalesce(items, '[]'::jsonb)
where
  name is null
  or status is null
  or status = ''
  or status not in ('active', 'draft')
  or items is null;

alter table public.price_lists
  alter column name set default '',
  alter column name set not null,
  alter column status set default 'active',
  alter column status set not null,
  alter column items set default '[]'::jsonb,
  alter column items set not null;

create index if not exists idx_price_lists_org_name
  on public.price_lists(org_id, name);

-- =====================================================
-- Bundles
-- =====================================================

create table if not exists public.product_bundles (
  id uuid primary key default gen_random_uuid()
);

alter table public.product_bundles
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists bundle_number text,
  add column if not exists name text not null default '',
  add column if not exists image_url text,
  add column if not exists status text not null default 'active',
  add column if not exists shelf_id uuid references public.shelves(id) on delete set null,
  add column if not exists notes text,
  add column if not exists products jsonb not null default '[]'::jsonb,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.product_bundles
set
  name = coalesce(nullif(name, ''), nullif(bundle_number, ''), ''),
  status = case
    when coalesce(nullif(status, ''), 'active') in ('active', 'draft') then coalesce(nullif(status, ''), 'active')
    else 'active'
  end
where
  name is null
  or name = ''
  or status is null
  or status = ''
  or status not in ('active', 'draft');

alter table public.product_bundles
  alter column name set default '',
  alter column name set not null,
  alter column status set default 'active',
  alter column status set not null;

create index if not exists idx_product_bundles_org_status
  on public.product_bundles(org_id, status, created_at desc);

create table if not exists public.bundle_items (
  id uuid primary key default gen_random_uuid()
);

alter table public.bundle_items
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists bundle_id uuid references public.product_bundles(id) on delete cascade,
  add column if not exists product_id uuid references public.products(id) on delete set null,
  add column if not exists quantity numeric(18,3) not null default 0,
  add column if not exists unit text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_bundle_items_bundle on public.bundle_items(bundle_id);

-- =====================================================
-- Shared process engine
-- =====================================================

create table if not exists public.process_templates (
  id uuid primary key default gen_random_uuid()
);

alter table public.process_templates
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists module_id text not null default '',
  add column if not exists module_ids text[] not null default '{}'::text[],
  add column if not exists process_kind text not null default 'generic',
  add column if not exists name text not null default '',
  add column if not exists description text,
  add column if not exists auto_copy_mode text not null default 'manual',
  add column if not exists is_active boolean not null default true,
  add column if not exists source_bom_id uuid,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'process_templates_process_kind_check') then
    alter table public.process_templates
      add constraint process_templates_process_kind_check
      check (process_kind in ('production', 'execution', 'marketing', 'generic'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'process_templates_auto_copy_mode_check') then
    alter table public.process_templates
      add constraint process_templates_auto_copy_mode_check
      check (auto_copy_mode in ('manual', 'on_create', 'on_status_change'));
  end if;
end $$;

create unique index if not exists idx_process_templates_org_module_name
  on public.process_templates(org_id, module_id, lower(name));

create index if not exists idx_process_templates_module_ids
  on public.process_templates using gin(module_ids);

create index if not exists idx_process_templates_org_kind
  on public.process_templates(org_id, process_kind, is_active);

create table if not exists public.process_template_stages (
  id uuid primary key default gen_random_uuid()
);

alter table public.process_template_stages
  add column if not exists template_id uuid references public.process_templates(id) on delete cascade,
  add column if not exists stage_name text not null default '',
  add column if not exists sort_order integer not null default 10,
  add column if not exists default_status text not null default 'todo',
  add column if not exists default_assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists default_assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists auto_create_task boolean not null default true,
  add column if not exists wage numeric(18,2) not null default 0,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'process_template_stages_default_status_check') then
    alter table public.process_template_stages
      add constraint process_template_stages_default_status_check
      check (default_status in ('todo', 'in_progress', 'done', 'blocked', 'canceled'));
  end if;
end $$;

create unique index if not exists idx_process_template_stages_unique
  on public.process_template_stages(template_id, sort_order, stage_name);

create table if not exists public.process_runs (
  id uuid primary key default gen_random_uuid()
);

alter table public.process_runs
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists module_id text not null default '',
  add column if not exists record_id uuid,
  add column if not exists process_name text not null default '',
  add column if not exists status text not null default 'active',
  add column if not exists copied_mode text not null default 'manual',
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'process_runs_status_check') then
    alter table public.process_runs
      add constraint process_runs_status_check
      check (status in ('draft', 'active', 'completed', 'canceled'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'process_runs_copied_mode_check') then
    alter table public.process_runs
      add constraint process_runs_copied_mode_check
      check (copied_mode in ('manual', 'auto'));
  end if;
end $$;

create index if not exists idx_process_runs_org_module_record
  on public.process_runs(org_id, module_id, record_id, created_at desc);

create table if not exists public.process_run_links (
  id uuid primary key default gen_random_uuid()
);

alter table public.process_run_links
  add column if not exists process_run_id uuid not null references public.process_runs(id) on delete cascade,
  add column if not exists module_id text not null default '',
  add column if not exists record_id uuid not null,
  add column if not exists is_primary boolean not null default false,
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists idx_process_run_links_unique
  on public.process_run_links(process_run_id, module_id, record_id);

create index if not exists idx_process_run_links_process
  on public.process_run_links(process_run_id, is_primary);

create index if not exists idx_process_run_links_module_record
  on public.process_run_links(module_id, record_id);

create table if not exists public.process_run_stages (
  id uuid primary key default gen_random_uuid()
);

alter table public.process_run_stages
  add column if not exists process_run_id uuid references public.process_runs(id) on delete cascade,
  add column if not exists template_stage_id uuid references public.process_template_stages(id) on delete set null,
  add column if not exists stage_name text not null default '',
  add column if not exists sort_order integer not null default 10,
  add column if not exists status text not null default 'todo',
  add column if not exists task_id uuid,
  add column if not exists assignee_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists line_no integer,
  add column if not exists planned_start_at timestamptz,
  add column if not exists planned_due_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists wage numeric(18,2) not null default 0,
  add column if not exists produced_qty numeric(18,3) not null default 0,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'process_run_stages_status_check') then
    alter table public.process_run_stages
      add constraint process_run_stages_status_check
      check (status in ('todo', 'in_progress', 'done', 'blocked', 'canceled'));
  end if;
end $$;

create index if not exists idx_process_run_stages_run
  on public.process_run_stages(process_run_id, sort_order);

-- =====================================================
-- Projects / Marketing / AI
-- =====================================================

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid()
);

alter table public.projects
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists image_url text,
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists status text not null default 'draft',
  add column if not exists priority text not null default 'medium',
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists process_run_id uuid references public.process_runs(id) on delete set null,
  add column if not exists start_date date,
  add column if not exists due_date date,
  add column if not exists completed_at timestamptz,
  add column if not exists estimated_budget numeric(18,2) not null default 0,
  add column if not exists actual_cost numeric(18,2) not null default 0,
  add column if not exists progress_percent integer not null default 0,
  add column if not exists execution_process_draft jsonb not null default '[]'::jsonb,
  add column if not exists execution_process jsonb not null default '[]'::jsonb,
  add column if not exists location text,
  add column if not exists description text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_progress_percent_check') then
    alter table public.projects
      add constraint projects_progress_percent_check
      check (progress_percent between 0 and 100);
  end if;
end $$;

create unique index if not exists idx_projects_org_system_code
  on public.projects(org_id, system_code)
  where system_code is not null and system_code <> '';

create index if not exists idx_projects_org_status on public.projects(org_id, status, due_date);

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid()
);

alter table public.project_members
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists project_id uuid references public.projects(id) on delete cascade,
  add column if not exists user_id uuid references public.profiles(id) on delete set null,
  add column if not exists member_role text not null default 'member',
  add column if not exists allocation_percent numeric(5,2) not null default 100,
  add column if not exists is_active boolean not null default true,
  add column if not exists joined_at date not null default current_date,
  add column if not exists left_at date,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_project_members_project_user
  on public.project_members(project_id, user_id);

create table if not exists public.marketing_leads (
  id uuid primary key default gen_random_uuid()
);

alter table public.marketing_leads
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists name text not null default '',
  add column if not exists business_name text,
  add column if not exists mobile text,
  add column if not exists email text,
  add column if not exists source text,
  add column if not exists status text not null default 'new',
  add column if not exists score integer not null default 0,
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists process_run_id uuid references public.process_runs(id) on delete set null,
  add column if not exists marketing_process_draft jsonb not null default '[]'::jsonb,
  add column if not exists marketing_process jsonb not null default '[]'::jsonb,
  add column if not exists location text,
  add column if not exists notes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_marketing_leads_org_status
  on public.marketing_leads(org_id, status, created_at desc);

create table if not exists public.module_relations (
  id uuid primary key default gen_random_uuid()
);

alter table public.module_relations
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists from_module text not null default '',
  add column if not exists from_record_id uuid,
  add column if not exists to_module text not null default '',
  add column if not exists to_record_id uuid,
  add column if not exists relation_type text not null default 'linked',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists idx_module_relations_unique
  on public.module_relations(org_id, from_module, from_record_id, to_module, to_record_id, relation_type);

create table if not exists public.ai_record_contexts (
  id uuid primary key default gen_random_uuid()
);

alter table public.ai_record_contexts
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists module_id text not null default '',
  add column if not exists record_id uuid,
  add column if not exists context_type text not null default 'summary',
  add column if not exists thread_ref text,
  add column if not exists content text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists last_synced_at timestamptz,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ai_record_contexts_context_type_check') then
    alter table public.ai_record_contexts
      add constraint ai_record_contexts_context_type_check
      check (context_type in ('summary', 'memory', 'instruction', 'action_log'));
  end if;
end $$;

create index if not exists idx_ai_record_contexts_entity
  on public.ai_record_contexts(org_id, module_id, record_id, context_type);

-- =====================================================
-- Compatibility constraints (add only if missing)
-- =====================================================

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'process_templates_source_bom_id_fkey') then
    alter table public.process_templates
      add constraint process_templates_source_bom_id_fkey
      foreign key (source_bom_id) references public.production_boms(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'production_boms_process_template_id_fkey') then
    alter table public.production_boms
      add constraint production_boms_process_template_id_fkey
      foreign key (process_template_id) references public.process_templates(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'production_orders_bom_id_fkey') then
    alter table public.production_orders
      add constraint production_orders_bom_id_fkey
      foreign key (bom_id) references public.production_boms(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'production_orders_process_template_id_fkey') then
    alter table public.production_orders
      add constraint production_orders_process_template_id_fkey
      foreign key (process_template_id) references public.process_templates(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'production_orders_process_run_id_fkey') then
    alter table public.production_orders
      add constraint production_orders_process_run_id_fkey
      foreign key (process_run_id) references public.process_runs(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_related_bom_fkey') then
    alter table public.products
      add constraint products_related_bom_fkey
      foreign key (related_bom) references public.production_boms(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_production_order_id_fkey') then
    alter table public.products
      add constraint products_production_order_id_fkey
      foreign key (production_order_id) references public.production_orders(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_related_supplier_fkey') then
    alter table public.products
      add constraint products_related_supplier_fkey
      foreign key (related_supplier) references public.suppliers(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customers_process_template_id_fkey') then
    alter table public.customers
      add constraint customers_process_template_id_fkey
      foreign key (process_template_id) references public.process_templates(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customers_process_run_id_fkey') then
    alter table public.customers
      add constraint customers_process_run_id_fkey
      foreign key (process_run_id) references public.process_runs(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customers_referrer_employee_id_fkey') then
    alter table public.customers
      add constraint customers_referrer_employee_id_fkey
      foreign key (referrer_employee_id) references public.employees(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_project_id_fkey') then
    alter table public.invoices
      add constraint invoices_project_id_fkey
      foreign key (project_id) references public.projects(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'purchase_invoices_project_id_fkey') then
    alter table public.purchase_invoices
      add constraint purchase_invoices_project_id_fkey
      foreign key (project_id) references public.projects(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_project_id_fkey') then
    alter table public.tasks
      add constraint tasks_project_id_fkey
      foreign key (project_id) references public.projects(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_marketing_lead_id_fkey') then
    alter table public.tasks
      add constraint tasks_marketing_lead_id_fkey
      foreign key (marketing_lead_id) references public.marketing_leads(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_process_run_stage_id_fkey') then
    alter table public.tasks
      add constraint tasks_process_run_stage_id_fkey
      foreign key (process_run_stage_id) references public.process_run_stages(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'process_run_stages_task_id_fkey') then
    alter table public.process_run_stages
      add constraint process_run_stages_task_id_fkey
      foreign key (task_id) references public.tasks(id) on delete set null
      not valid;
  end if;
end $$;

-- =====================================================
-- Process clone helper
-- =====================================================

create or replace function public.create_process_run_from_template(
  p_org_id uuid,
  p_template_id uuid,
  p_module_id text,
  p_record_id uuid,
  p_process_name text default null,
  p_copied_mode text default 'manual'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
  v_template_name text;
begin
  select t.name
    into v_template_name
  from public.process_templates t
  where t.id = p_template_id
    and t.org_id = p_org_id;

  if v_template_name is null then
    raise exception 'process template not found for org_id=% template_id=%', p_org_id, p_template_id;
  end if;

  insert into public.process_runs (
    org_id,
    template_id,
    module_id,
    record_id,
    process_name,
    status,
    copied_mode,
    started_at,
    created_by,
    updated_by
  )
  values (
    p_org_id,
    p_template_id,
    p_module_id,
    p_record_id,
    coalesce(nullif(p_process_name, ''), v_template_name),
    'active',
    case when p_copied_mode in ('manual', 'auto') then p_copied_mode else 'manual' end,
    now(),
    auth.uid(),
    auth.uid()
  )
  returning id into v_run_id;

  if p_record_id is not null and nullif(trim(coalesce(p_module_id, '')), '') is not null then
    insert into public.process_run_links (process_run_id, module_id, record_id, is_primary)
    values (v_run_id, p_module_id, p_record_id, true)
    on conflict (process_run_id, module_id, record_id) do update
      set is_primary = excluded.is_primary;
  end if;

  insert into public.process_run_stages (
    process_run_id,
    template_stage_id,
    stage_name,
    sort_order,
    status,
    assignee_user_id,
    assignee_role_id,
    wage,
    metadata
  )
  select
    v_run_id,
    s.id,
    s.stage_name,
    s.sort_order,
    s.default_status,
    s.default_assignee_id,
    s.default_assignee_role_id,
    s.wage,
    s.metadata
  from public.process_template_stages s
  where s.template_id = p_template_id
  order by s.sort_order, s.created_at;

  return v_run_id;
end;
$$;

-- =====================================================
-- Updated-at triggers (only where column exists)
-- =====================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations','org_roles','profiles','company_settings','integration_settings',
    'dynamic_options','saved_views','tags','notes','sidebar_unread','workflows',
    'warehouses','shelves','suppliers','customers','work_schedules','employees','attendance_logs','products','product_images',
    'product_inventory','production_group_orders','production_boms','production_orders',
    'production_lines','stock_transfers','invoices','purchase_invoices','tasks',
    'calculation_formulas','price_lists','product_bundles','bundle_items','projects','project_members',
    'marketing_leads','process_templates','process_template_stages','process_runs',
    'process_run_stages','ai_record_contexts'
  ]
  loop
    if exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = t
        and c.column_name = 'updated_at'
    ) then
      execute format(
        'drop trigger if exists %I on public.%I',
        'trg_' || t || '_updated_at',
        t
      );
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
        'trg_' || t || '_updated_at',
        t
      );
    end if;
  end loop;
end $$;

-- =====================================================
-- Grants
-- =====================================================

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
revoke all on function public.current_org_id() from public;
grant execute on function public.current_org_id() to authenticated, service_role;
grant execute on function public.create_process_run_from_template(uuid, uuid, text, uuid, text, text) to authenticated, service_role;

-- =====================================================
-- RLS policies
-- =====================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'org_roles','profiles','company_settings','integration_settings','dynamic_options',
    'saved_views','tags','record_tags','changelogs','user_login_events','notes','sidebar_unread',
    'workflows','workflow_logs','warehouses','shelves','suppliers','customers','work_schedules','employees','attendance_logs',
    'products','product_images','product_inventory','production_group_orders',
    'production_boms','production_orders','production_lines','product_lines',
    'stock_transfers','invoices','purchase_invoices','tasks','calculation_formulas',
    'price_lists',
    'product_bundles','bundle_items','process_templates','process_runs','projects',
    'project_members','marketing_leads','module_relations','ai_record_contexts'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'drop policy if exists %I on public.%I',
      'p_' || t || '_org_all',
      t
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.current_org_id() is null or org_id is null or org_id = public.current_org_id()) with check (public.current_org_id() is null or org_id is null or org_id = public.current_org_id())',
      'p_' || t || '_org_all',
      t
    );
  end loop;
end $$;

alter table public.organizations enable row level security;
drop policy if exists p_organizations_auth_all on public.organizations;
create policy p_organizations_auth_all
on public.organizations
for all to authenticated
using (public.current_org_id() is null or id = public.current_org_id())
with check (id = public.current_org_id());

alter table public.process_template_stages enable row level security;
drop policy if exists p_process_template_stages_auth_all on public.process_template_stages;
create policy p_process_template_stages_auth_all
on public.process_template_stages
for all to authenticated
using (
  exists (
    select 1
    from public.process_templates t
    where t.id = process_template_stages.template_id
      and t.org_id = public.current_org_id()
  )
)
with check (
  exists (
    select 1
    from public.process_templates t
    where t.id = process_template_stages.template_id
      and t.org_id = public.current_org_id()
  )
);

alter table public.process_run_stages enable row level security;
drop policy if exists p_process_run_stages_auth_all on public.process_run_stages;
create policy p_process_run_stages_auth_all
on public.process_run_stages
for all to authenticated
using (
  exists (
    select 1
    from public.process_runs r
    where r.id = process_run_stages.process_run_id
      and r.org_id = public.current_org_id()
  )
)
with check (
  exists (
    select 1
    from public.process_runs r
    where r.id = process_run_stages.process_run_id
      and r.org_id = public.current_org_id()
  )
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

create index if not exists idx_leave_requests_org_dates on public.leave_requests(org_id, start_date, end_date);
create index if not exists idx_leave_requests_employee on public.leave_requests(employee_id)
  where employee_id is not null;

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

create index if not exists idx_overtime_requests_org_work_date on public.overtime_requests(org_id, work_date);
create index if not exists idx_overtime_requests_employee on public.overtime_requests(employee_id)
  where employee_id is not null;

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

create index if not exists idx_mission_requests_org_dates on public.mission_requests(org_id, start_date, end_date);
create index if not exists idx_mission_requests_employee on public.mission_requests(employee_id)
  where employee_id is not null;

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_leave_requests_updated_at on public.leave_requests;
    create trigger trg_leave_requests_updated_at
      before update on public.leave_requests
      for each row execute function public.set_updated_at();

    drop trigger if exists trg_overtime_requests_updated_at on public.overtime_requests;
    create trigger trg_overtime_requests_updated_at
      before update on public.overtime_requests
      for each row execute function public.set_updated_at();

    drop trigger if exists trg_mission_requests_updated_at on public.mission_requests;
    create trigger trg_mission_requests_updated_at
      before update on public.mission_requests
      for each row execute function public.set_updated_at();
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

-- =====================================================
-- Pattern for future tables (tenant-safe defaults)
-- =====================================================
-- 1) Always add `org_id uuid references public.organizations(id)` on tenant tables.
-- 2) Add default `public.current_org_id()` when table is tenant-owned.
-- 3) Enable RLS and create tenant policy:
--    using (public.current_org_id() is null or org_id is null or org_id = public.current_org_id())
--    with check (public.current_org_id() is null or org_id is null or org_id = public.current_org_id())
-- 4) Avoid policy/function chains that query the same table under RLS unless function is SECURITY DEFINER.

-- =====================================================
-- Phase 62 - Goals / target setting
-- =====================================================

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  module_id text not null,
  name text not null,
  description text,
  goal_scope text not null default 'personal',
  period_unit text not null default 'month',
  subperiod_unit text not null default 'week',
  metric_type text not null default 'count',
  metric_field_key text,
  date_field_key text default 'created_at',
  target_value numeric,
  levels_enabled boolean not null default false,
  bronze_value numeric,
  silver_value numeric,
  gold_value numeric,
  assignee_user_ids jsonb not null default '[]'::jsonb,
  assignee_role_ids jsonb not null default '[]'::jsonb,
  conditions_all jsonb not null default '[]'::jsonb,
  conditions_any jsonb not null default '[]'::jsonb,
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_goals_scope check (goal_scope in ('personal', 'team')),
  constraint chk_goals_period_unit check (period_unit in ('day', 'week', 'month', 'quarter', 'half_year', 'year')),
  constraint chk_goals_subperiod_unit check (subperiod_unit in ('day', 'week', 'month', 'quarter', 'half_year', 'year')),
  constraint chk_goals_metric_type check (metric_type in ('count', 'sum', 'avg')),
  constraint chk_goals_name check (length(trim(name)) > 0)
);

alter table public.goals
  add column if not exists description text,
  add column if not exists goal_scope text default 'personal',
  add column if not exists period_unit text default 'month',
  add column if not exists subperiod_unit text default 'week',
  add column if not exists metric_type text default 'count',
  add column if not exists metric_field_key text,
  add column if not exists date_field_key text default 'created_at',
  add column if not exists target_value numeric,
  add column if not exists levels_enabled boolean not null default false,
  add column if not exists bronze_value numeric,
  add column if not exists silver_value numeric,
  add column if not exists gold_value numeric,
  add column if not exists assignee_user_ids jsonb not null default '[]'::jsonb,
  add column if not exists assignee_role_ids jsonb not null default '[]'::jsonb,
  add column if not exists conditions_all jsonb not null default '[]'::jsonb,
  add column if not exists conditions_any jsonb not null default '[]'::jsonb,
  add column if not exists config jsonb not null default '{}'::jsonb,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.goals
set goal_scope = 'personal'
where goal_scope is null
   or trim(goal_scope) = '';

update public.goals
set period_unit = 'month'
where period_unit is null
   or trim(period_unit) = '';

update public.goals
set subperiod_unit = 'week'
where subperiod_unit is null
   or trim(subperiod_unit) = '';

update public.goals
set metric_type = 'count'
where metric_type is null
   or trim(metric_type) = '';

update public.goals
set date_field_key = 'created_at'
where date_field_key is null
   or trim(date_field_key) = '';

update public.goals
set assignee_user_ids = '[]'::jsonb
where assignee_user_ids is null
   or jsonb_typeof(assignee_user_ids) is distinct from 'array';

update public.goals
set assignee_role_ids = '[]'::jsonb
where assignee_role_ids is null
   or jsonb_typeof(assignee_role_ids) is distinct from 'array';

update public.goals
set conditions_all = '[]'::jsonb
where conditions_all is null
   or jsonb_typeof(conditions_all) is distinct from 'array';

update public.goals
set conditions_any = '[]'::jsonb
where conditions_any is null
   or jsonb_typeof(conditions_any) is distinct from 'array';

update public.goals
set config = '{}'::jsonb
where config is null
   or jsonb_typeof(config) is distinct from 'object';

update public.goals
set is_active = true
where is_active is null;

update public.goals
set levels_enabled = false
where levels_enabled is null;

alter table public.goals alter column goal_scope set default 'personal';
alter table public.goals alter column period_unit set default 'month';
alter table public.goals alter column subperiod_unit set default 'week';
alter table public.goals alter column metric_type set default 'count';
alter table public.goals alter column date_field_key set default 'created_at';
alter table public.goals alter column assignee_user_ids set default '[]'::jsonb;
alter table public.goals alter column assignee_role_ids set default '[]'::jsonb;
alter table public.goals alter column conditions_all set default '[]'::jsonb;
alter table public.goals alter column conditions_any set default '[]'::jsonb;
alter table public.goals alter column config set default '{}'::jsonb;
alter table public.goals alter column is_active set default true;
alter table public.goals alter column created_at set default now();
alter table public.goals alter column updated_at set default now();

alter table public.goals drop constraint if exists chk_goals_scope;
alter table public.goals drop constraint if exists chk_goals_period_unit;
alter table public.goals drop constraint if exists chk_goals_subperiod_unit;
alter table public.goals drop constraint if exists chk_goals_metric_type;
alter table public.goals drop constraint if exists chk_goals_name;

alter table public.goals
  add constraint chk_goals_scope check (goal_scope in ('personal', 'team'));

alter table public.goals
  add constraint chk_goals_period_unit check (period_unit in ('day', 'week', 'month', 'quarter', 'half_year', 'year'));

alter table public.goals
  add constraint chk_goals_subperiod_unit check (subperiod_unit in ('day', 'week', 'month', 'quarter', 'half_year', 'year'));

alter table public.goals
  add constraint chk_goals_metric_type check (metric_type in ('count', 'sum', 'avg'));

alter table public.goals
  add constraint chk_goals_name check (length(trim(name)) > 0);

create index if not exists idx_goals_org_module_active
  on public.goals(org_id, module_id, is_active);

create index if not exists idx_goals_org_updated
  on public.goals(org_id, updated_at desc);

drop trigger if exists trg_goals_updated_at on public.goals;
create trigger trg_goals_updated_at
before update on public.goals
for each row execute function public.set_updated_at();

alter table public.goals enable row level security;

drop policy if exists p_goals_org_all on public.goals;
create policy p_goals_org_all
on public.goals
for all
to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

insert into public.goals (
  org_id,
  module_id,
  name,
  description,
  goal_scope,
  period_unit,
  subperiod_unit,
  metric_type,
  metric_field_key,
  date_field_key,
  target_value,
  levels_enabled,
  bronze_value,
  silver_value,
  gold_value,
  assignee_user_ids,
  assignee_role_ids,
  conditions_all,
  conditions_any,
  config,
  is_active
)
select
  public.current_org_id(),
  'invoices',
  'فروش ماهانه تسویه‌شده',
  'جمع مبلغ فاکتورهای فروش با وضعیت تسویه‌شده یا تکمیل‌شده در بازه ماه جاری',
  'team',
  'month',
  'week',
  'sum',
  'total_invoice_amount',
  'invoice_date',
  null,
  true,
  500000000,
  1000000000,
  1500000000,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[{"id":"seed_goal_condition_invoices_paid","field":"status","operator":"in","value":["settled","completed"]}]'::jsonb,
  '{"seed_key":"sales_invoices_monthly_paid_total_v1","assignment_users_mode":"all","is_seeded_default":true}'::jsonb,
  true
where not exists (
  select 1
  from public.goals g
  where g.module_id = 'invoices'
    and coalesce(g.config->>'seed_key', '') = 'sales_invoices_monthly_paid_total_v1'
);

-- =====================================================
-- Bootstrap seed data
-- =====================================================

insert into public.organizations (name, slug)
select 'KalamApp', 'kalamapp'
where not exists (select 1 from public.organizations);

with org as (
  select id from public.organizations order by created_at asc limit 1
)
insert into public.org_roles (org_id, title, permissions, is_system)
select org.id, v.title, '{}'::jsonb, true
from org
cross join (values ('super_admin'), ('admin'), ('manager'), ('viewer')) as v(title)
where not exists (
  select 1
  from public.org_roles r
  where r.org_id = org.id
    and lower(r.title) = lower(v.title)
);

with org as (
  select id from public.organizations order by created_at asc limit 1
), sr as (
  select id
  from public.org_roles
  where lower(title) = 'super_admin'
  order by created_at asc
  limit 1
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
