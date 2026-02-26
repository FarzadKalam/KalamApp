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
  add column if not exists ceo_name text,
  add column if not exists national_id text,
  add column if not exists mobile text,
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists website text,
  add column if not exists email text,
  add column if not exists logo_url text,
  add column if not exists icon_url text,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

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
      check (connection_type in ('sms', 'email', 'site'));
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
  add column if not exists rank text,
  add column if not exists mobile_1 text,
  add column if not exists prefix text,
  add column if not exists business_name text,
  add column if not exists birth_date date,
  add column if not exists lead_source text,
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
  add column if not exists status text not null default 'draft',
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists sale_source text,
  add column if not exists "invoiceItems" jsonb not null default '[]'::jsonb,
  add column if not exists payments jsonb not null default '[]'::jsonb,
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

create table if not exists public.purchase_invoices (
  id uuid primary key default gen_random_uuid()
);

alter table public.purchase_invoices
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists name text not null default '',
  add column if not exists invoice_date date,
  add column if not exists system_code text,
  add column if not exists status text not null default 'draft',
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null,
  add column if not exists purchase_source text,
  add column if not exists "invoiceItems" jsonb not null default '[]'::jsonb,
  add column if not exists payments jsonb not null default '[]'::jsonb,
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
-- Bundles
-- =====================================================

create table if not exists public.product_bundles (
  id uuid primary key default gen_random_uuid()
);

alter table public.product_bundles
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists bundle_number text,
  add column if not exists status text,
  add column if not exists shelf_id uuid references public.shelves(id) on delete set null,
  add column if not exists notes text,
  add column if not exists products jsonb not null default '[]'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

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
    'warehouses','shelves','suppliers','customers','products','product_images',
    'product_inventory','production_group_orders','production_boms','production_orders',
    'production_lines','stock_transfers','invoices','purchase_invoices','tasks',
    'calculation_formulas','product_bundles','bundle_items','projects','project_members',
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
    'saved_views','tags','record_tags','changelogs','notes','sidebar_unread',
    'workflows','workflow_logs','warehouses','shelves','suppliers','customers',
    'products','product_images','product_inventory','production_group_orders',
    'production_boms','production_orders','production_lines','product_lines',
    'stock_transfers','invoices','purchase_invoices','tasks','calculation_formulas',
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

do $$
declare
  t text;
begin
  foreach t in array array['organizations', 'process_template_stages', 'process_run_stages']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'drop policy if exists %I on public.%I',
      'p_' || t || '_auth_all',
      t
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      'p_' || t || '_auth_all',
      t
    );
  end loop;
end $$;

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


begin;

-- 1) fix: function search_path warning
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

-- 2) fix: current_org_id recursion risk
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

revoke all on function public.current_org_id() from public;
grant execute on function public.current_org_id() to authenticated, service_role;

-- 3) tighten open policies flagged by linter
drop policy if exists p_organizations_auth_all on public.organizations;
create policy p_organizations_auth_all
on public.organizations
for all to authenticated
using (id = public.current_org_id())
with check (id = public.current_org_id());

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

commit;
