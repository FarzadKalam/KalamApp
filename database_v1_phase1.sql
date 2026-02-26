-- KalamApp V1 - Phase 1 Database Migration
-- Scope: Shared process engine + projects + marketing leads + generic relations
-- Strategy: additive-only (safe on existing DBs), with conditional constraints for legacy compatibility.

begin;

create extension if not exists pgcrypto;

-- Keep a minimal organizations table definition for environments that still come from legacy DB.
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.profiles
  add column if not exists org_id uuid references public.organizations(id) on delete set null;

create index if not exists idx_profiles_org_id on public.profiles(org_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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

-- =========================================================
-- Shared Process Engine
-- =========================================================

create table if not exists public.process_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  module_id text not null,
  process_kind text not null default 'generic'
    check (process_kind in ('production', 'execution', 'marketing', 'generic')),
  name text not null,
  description text,
  auto_copy_mode text not null default 'manual'
    check (auto_copy_mode in ('manual', 'on_create', 'on_status_change')),
  is_active boolean not null default true,
  source_bom_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_process_templates_org_module_name
  on public.process_templates (org_id, module_id, lower(name));
create index if not exists idx_process_templates_org_kind
  on public.process_templates (org_id, process_kind, is_active);

create table if not exists public.process_template_stages (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.process_templates(id) on delete cascade,
  stage_name text not null,
  sort_order integer not null default 10,
  default_status text not null default 'todo'
    check (default_status in ('todo', 'in_progress', 'done', 'blocked', 'canceled')),
  default_assignee_id uuid references public.profiles(id) on delete set null,
  default_assignee_role_id uuid references public.org_roles(id) on delete set null,
  auto_create_task boolean not null default true,
  wage numeric(18,2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_process_template_stages_unique
  on public.process_template_stages (template_id, sort_order, stage_name);
create index if not exists idx_process_template_stages_template
  on public.process_template_stages (template_id, sort_order);

create table if not exists public.process_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid references public.process_templates(id) on delete set null,
  module_id text not null,
  record_id uuid not null,
  process_name text not null,
  status text not null default 'active'
    check (status in ('draft', 'active', 'completed', 'canceled')),
  copied_mode text not null default 'manual'
    check (copied_mode in ('manual', 'auto')),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_process_runs_org_module_record
  on public.process_runs (org_id, module_id, record_id, created_at desc);
create index if not exists idx_process_runs_template
  on public.process_runs (template_id, status);

create table if not exists public.process_run_stages (
  id uuid primary key default gen_random_uuid(),
  process_run_id uuid not null references public.process_runs(id) on delete cascade,
  template_stage_id uuid references public.process_template_stages(id) on delete set null,
  stage_name text not null,
  sort_order integer not null default 10,
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'done', 'blocked', 'canceled')),
  task_id uuid,
  assignee_user_id uuid references public.profiles(id) on delete set null,
  assignee_role_id uuid references public.org_roles(id) on delete set null,
  line_no integer,
  planned_start_at timestamptz,
  planned_due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  wage numeric(18,2) not null default 0,
  produced_qty numeric(18,3) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_process_run_stages_run
  on public.process_run_stages (process_run_id, sort_order);
create index if not exists idx_process_run_stages_task
  on public.process_run_stages (task_id);

-- =========================================================
-- Projects + Marketing
-- =========================================================

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  system_code text,
  status text not null default 'draft'
    check (status in ('draft', 'planning', 'in_progress', 'on_hold', 'completed', 'canceled', 'archived')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  customer_id uuid,
  owner_id uuid references public.profiles(id) on delete set null,
  process_template_id uuid references public.process_templates(id) on delete set null,
  process_run_id uuid references public.process_runs(id) on delete set null,
  start_date date,
  due_date date,
  completed_at timestamptz,
  estimated_budget numeric(18,2) not null default 0,
  actual_cost numeric(18,2) not null default 0,
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  execution_process_draft jsonb not null default '[]'::jsonb,
  execution_process jsonb not null default '[]'::jsonb,
  location jsonb not null default '{}'::jsonb,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_projects_org_system_code
  on public.projects (org_id, system_code)
  where system_code is not null and system_code <> '';
create index if not exists idx_projects_org_status
  on public.projects (org_id, status, due_date);
create index if not exists idx_projects_customer
  on public.projects (customer_id);
create index if not exists idx_projects_owner
  on public.projects (owner_id);

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  member_role text not null default 'member',
  allocation_percent numeric(5,2) not null default 100,
  is_active boolean not null default true,
  joined_at date not null default current_date,
  left_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_project_members_project_user
  on public.project_members (project_id, user_id);
create index if not exists idx_project_members_org_project
  on public.project_members (org_id, project_id);

create table if not exists public.marketing_leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  business_name text,
  mobile text,
  email text,
  source text,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'archived')),
  score integer not null default 0,
  owner_id uuid references public.profiles(id) on delete set null,
  customer_id uuid,
  project_id uuid references public.projects(id) on delete set null,
  process_template_id uuid references public.process_templates(id) on delete set null,
  process_run_id uuid references public.process_runs(id) on delete set null,
  marketing_process_draft jsonb not null default '[]'::jsonb,
  marketing_process jsonb not null default '[]'::jsonb,
  location jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_leads_org_status
  on public.marketing_leads (org_id, status, created_at desc);
create index if not exists idx_marketing_leads_owner
  on public.marketing_leads (owner_id);
create index if not exists idx_marketing_leads_customer
  on public.marketing_leads (customer_id);
create index if not exists idx_marketing_leads_project
  on public.marketing_leads (project_id);

-- =========================================================
-- Generic Cross-Module Links + AI Context
-- =========================================================

create table if not exists public.module_relations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  from_module text not null,
  from_record_id uuid not null,
  to_module text not null,
  to_record_id uuid not null,
  relation_type text not null default 'linked',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_module_relations_unique
  on public.module_relations (
    org_id, from_module, from_record_id, to_module, to_record_id, relation_type
  );
create index if not exists idx_module_relations_from
  on public.module_relations (org_id, from_module, from_record_id);
create index if not exists idx_module_relations_to
  on public.module_relations (org_id, to_module, to_record_id);

create table if not exists public.ai_record_contexts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  module_id text not null,
  record_id uuid not null,
  context_type text not null default 'summary'
    check (context_type in ('summary', 'memory', 'instruction', 'action_log')),
  thread_ref text,
  content text,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_record_contexts_entity
  on public.ai_record_contexts (org_id, module_id, record_id, context_type);

-- =========================================================
-- Compatibility columns for current modules (non-breaking)
-- =========================================================

alter table if exists public.production_boms
  add column if not exists process_template_id uuid;

alter table if exists public.production_orders
  add column if not exists process_template_id uuid,
  add column if not exists process_run_id uuid;

alter table if exists public.customers
  add column if not exists process_template_id uuid,
  add column if not exists process_run_id uuid,
  add column if not exists location jsonb not null default '{}'::jsonb;

alter table if exists public.suppliers
  add column if not exists location jsonb not null default '{}'::jsonb;

alter table if exists public.tasks
  add column if not exists process_run_stage_id uuid,
  add column if not exists project_id uuid,
  add column if not exists marketing_lead_id uuid;

alter table if exists public.invoices
  add column if not exists project_id uuid;

alter table if exists public.purchase_invoices
  add column if not exists project_id uuid;

-- =========================================================
-- Conditional foreign keys (NOT VALID for safer rollout)
-- =========================================================

do $$
begin
  if to_regclass('public.production_boms') is not null
     and not exists (
       select 1 from pg_constraint where conname = 'fk_process_templates_source_bom'
     ) then
    execute '
      alter table public.process_templates
      add constraint fk_process_templates_source_bom
      foreign key (source_bom_id) references public.production_boms(id) on delete set null
      not valid
    ';
  end if;
end $$;

do $$
begin
  if to_regclass('public.tasks') is not null
     and not exists (
       select 1 from pg_constraint where conname = 'fk_process_run_stages_task'
     ) then
    execute '
      alter table public.process_run_stages
      add constraint fk_process_run_stages_task
      foreign key (task_id) references public.tasks(id) on delete set null
      not valid
    ';
  end if;
end $$;

do $$
begin
  if to_regclass('public.customers') is not null
     and not exists (
       select 1 from pg_constraint where conname = 'fk_projects_customer'
     ) then
    execute '
      alter table public.projects
      add constraint fk_projects_customer
      foreign key (customer_id) references public.customers(id) on delete set null
      not valid
    ';
  end if;
end $$;

do $$
begin
  if to_regclass('public.customers') is not null
     and not exists (
       select 1 from pg_constraint where conname = 'fk_marketing_leads_customer'
     ) then
    execute '
      alter table public.marketing_leads
      add constraint fk_marketing_leads_customer
      foreign key (customer_id) references public.customers(id) on delete set null
      not valid
    ';
  end if;
end $$;

do $$
begin
  if to_regclass('public.process_templates') is not null then
    if to_regclass('public.production_boms') is not null
       and not exists (select 1 from pg_constraint where conname = 'fk_production_boms_process_template') then
      execute '
        alter table public.production_boms
        add constraint fk_production_boms_process_template
        foreign key (process_template_id) references public.process_templates(id) on delete set null
        not valid
      ';
    end if;

    if to_regclass('public.production_orders') is not null
       and not exists (select 1 from pg_constraint where conname = 'fk_production_orders_process_template') then
      execute '
        alter table public.production_orders
        add constraint fk_production_orders_process_template
        foreign key (process_template_id) references public.process_templates(id) on delete set null
        not valid
      ';
    end if;

    if to_regclass('public.customers') is not null
       and not exists (select 1 from pg_constraint where conname = 'fk_customers_process_template') then
      execute '
        alter table public.customers
        add constraint fk_customers_process_template
        foreign key (process_template_id) references public.process_templates(id) on delete set null
        not valid
      ';
    end if;
  end if;
end $$;

do $$
begin
  if to_regclass('public.process_runs') is not null then
    if to_regclass('public.production_orders') is not null
       and not exists (select 1 from pg_constraint where conname = 'fk_production_orders_process_run') then
      execute '
        alter table public.production_orders
        add constraint fk_production_orders_process_run
        foreign key (process_run_id) references public.process_runs(id) on delete set null
        not valid
      ';
    end if;

    if to_regclass('public.customers') is not null
       and not exists (select 1 from pg_constraint where conname = 'fk_customers_process_run') then
      execute '
        alter table public.customers
        add constraint fk_customers_process_run
        foreign key (process_run_id) references public.process_runs(id) on delete set null
        not valid
      ';
    end if;
  end if;
end $$;

do $$
begin
  if to_regclass('public.projects') is not null then
    if to_regclass('public.tasks') is not null
       and not exists (select 1 from pg_constraint where conname = 'fk_tasks_project') then
      execute '
        alter table public.tasks
        add constraint fk_tasks_project
        foreign key (project_id) references public.projects(id) on delete set null
        not valid
      ';
    end if;

    if to_regclass('public.invoices') is not null
       and not exists (select 1 from pg_constraint where conname = 'fk_invoices_project') then
      execute '
        alter table public.invoices
        add constraint fk_invoices_project
        foreign key (project_id) references public.projects(id) on delete set null
        not valid
      ';
    end if;

    if to_regclass('public.purchase_invoices') is not null
       and not exists (select 1 from pg_constraint where conname = 'fk_purchase_invoices_project') then
      execute '
        alter table public.purchase_invoices
        add constraint fk_purchase_invoices_project
        foreign key (project_id) references public.projects(id) on delete set null
        not valid
      ';
    end if;
  end if;
end $$;

do $$
begin
  if to_regclass('public.marketing_leads') is not null
     and to_regclass('public.tasks') is not null
     and not exists (select 1 from pg_constraint where conname = 'fk_tasks_marketing_lead') then
    execute '
      alter table public.tasks
      add constraint fk_tasks_marketing_lead
      foreign key (marketing_lead_id) references public.marketing_leads(id) on delete set null
      not valid
    ';
  end if;
end $$;

do $$
begin
  if to_regclass('public.process_run_stages') is not null
     and to_regclass('public.tasks') is not null
     and not exists (select 1 from pg_constraint where conname = 'fk_tasks_process_run_stage') then
    execute '
      alter table public.tasks
      add constraint fk_tasks_process_run_stage
      foreign key (process_run_stage_id) references public.process_run_stages(id) on delete set null
      not valid
    ';
  end if;
end $$;

-- =========================================================
-- Process cloning helper
-- =========================================================

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

-- =========================================================
-- Updated-at triggers
-- =========================================================

drop trigger if exists trg_process_templates_updated_at on public.process_templates;
create trigger trg_process_templates_updated_at
before update on public.process_templates
for each row execute function public.set_updated_at();

drop trigger if exists trg_process_template_stages_updated_at on public.process_template_stages;
create trigger trg_process_template_stages_updated_at
before update on public.process_template_stages
for each row execute function public.set_updated_at();

drop trigger if exists trg_process_runs_updated_at on public.process_runs;
create trigger trg_process_runs_updated_at
before update on public.process_runs
for each row execute function public.set_updated_at();

drop trigger if exists trg_process_run_stages_updated_at on public.process_run_stages;
create trigger trg_process_run_stages_updated_at
before update on public.process_run_stages
for each row execute function public.set_updated_at();

drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists trg_project_members_updated_at on public.project_members;
create trigger trg_project_members_updated_at
before update on public.project_members
for each row execute function public.set_updated_at();

drop trigger if exists trg_marketing_leads_updated_at on public.marketing_leads;
create trigger trg_marketing_leads_updated_at
before update on public.marketing_leads
for each row execute function public.set_updated_at();

drop trigger if exists trg_ai_record_contexts_updated_at on public.ai_record_contexts;
create trigger trg_ai_record_contexts_updated_at
before update on public.ai_record_contexts
for each row execute function public.set_updated_at();

-- =========================================================
-- RLS (org-aware, bootstrap-friendly when profile.org_id is null)
-- =========================================================

alter table public.process_templates enable row level security;
alter table public.process_template_stages enable row level security;
alter table public.process_runs enable row level security;
alter table public.process_run_stages enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.marketing_leads enable row level security;
alter table public.module_relations enable row level security;
alter table public.ai_record_contexts enable row level security;

drop policy if exists p_process_templates_org_all on public.process_templates;
create policy p_process_templates_org_all on public.process_templates
for all to authenticated
using (public.current_org_id() is null or org_id = public.current_org_id())
with check (public.current_org_id() is null or org_id = public.current_org_id());

drop policy if exists p_process_template_stages_org_all on public.process_template_stages;
create policy p_process_template_stages_org_all on public.process_template_stages
for all to authenticated
using (
  exists (
    select 1
    from public.process_templates t
    where t.id = template_id
      and (public.current_org_id() is null or t.org_id = public.current_org_id())
  )
)
with check (
  exists (
    select 1
    from public.process_templates t
    where t.id = template_id
      and (public.current_org_id() is null or t.org_id = public.current_org_id())
  )
);

drop policy if exists p_process_runs_org_all on public.process_runs;
create policy p_process_runs_org_all on public.process_runs
for all to authenticated
using (public.current_org_id() is null or org_id = public.current_org_id())
with check (public.current_org_id() is null or org_id = public.current_org_id());

drop policy if exists p_process_run_stages_org_all on public.process_run_stages;
create policy p_process_run_stages_org_all on public.process_run_stages
for all to authenticated
using (
  exists (
    select 1
    from public.process_runs r
    where r.id = process_run_id
      and (public.current_org_id() is null or r.org_id = public.current_org_id())
  )
)
with check (
  exists (
    select 1
    from public.process_runs r
    where r.id = process_run_id
      and (public.current_org_id() is null or r.org_id = public.current_org_id())
  )
);

drop policy if exists p_projects_org_all on public.projects;
create policy p_projects_org_all on public.projects
for all to authenticated
using (public.current_org_id() is null or org_id = public.current_org_id())
with check (public.current_org_id() is null or org_id = public.current_org_id());

drop policy if exists p_project_members_org_all on public.project_members;
create policy p_project_members_org_all on public.project_members
for all to authenticated
using (public.current_org_id() is null or org_id = public.current_org_id())
with check (public.current_org_id() is null or org_id = public.current_org_id());

drop policy if exists p_marketing_leads_org_all on public.marketing_leads;
create policy p_marketing_leads_org_all on public.marketing_leads
for all to authenticated
using (public.current_org_id() is null or org_id = public.current_org_id())
with check (public.current_org_id() is null or org_id = public.current_org_id());

drop policy if exists p_module_relations_org_all on public.module_relations;
create policy p_module_relations_org_all on public.module_relations
for all to authenticated
using (public.current_org_id() is null or org_id = public.current_org_id())
with check (public.current_org_id() is null or org_id = public.current_org_id());

drop policy if exists p_ai_record_contexts_org_all on public.ai_record_contexts;
create policy p_ai_record_contexts_org_all on public.ai_record_contexts
for all to authenticated
using (public.current_org_id() is null or org_id = public.current_org_id())
with check (public.current_org_id() is null or org_id = public.current_org_id());

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on function public.create_process_run_from_template(uuid, uuid, text, uuid, text, text) to authenticated, service_role;

commit;
