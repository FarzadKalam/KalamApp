-- KalamApp - Phase 59
-- Reporting foundations for module-based report builder

create table if not exists public.report_definitions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  name text not null,
  description text,
  module_id text not null,
  report_type text not null default 'module_report',
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_report_definitions_type check (report_type in ('module_report'))
);

create index if not exists idx_report_definitions_org_module
  on public.report_definitions(org_id, module_id, is_active);

create table if not exists public.report_widgets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  report_definition_id uuid references public.report_definitions(id) on delete cascade,
  title text not null,
  widget_type text not null default 'chart',
  config jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_report_widgets_type check (widget_type in ('chart', 'kpi', 'table'))
);

create index if not exists idx_report_widgets_org_sort
  on public.report_widgets(org_id, sort_order, is_active);

create table if not exists public.report_data_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  name text not null,
  module_id text,
  source_type text not null default 'module',
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_report_data_sources_type check (source_type in ('module'))
);

create index if not exists idx_report_data_sources_org_module
  on public.report_data_sources(org_id, module_id, is_active);

drop trigger if exists trg_report_definitions_updated_at on public.report_definitions;
create trigger trg_report_definitions_updated_at
before update on public.report_definitions
for each row execute function public.set_updated_at();

drop trigger if exists trg_report_widgets_updated_at on public.report_widgets;
create trigger trg_report_widgets_updated_at
before update on public.report_widgets
for each row execute function public.set_updated_at();

drop trigger if exists trg_report_data_sources_updated_at on public.report_data_sources;
create trigger trg_report_data_sources_updated_at
before update on public.report_data_sources
for each row execute function public.set_updated_at();

alter table public.report_definitions enable row level security;
alter table public.report_widgets enable row level security;
alter table public.report_data_sources enable row level security;

drop policy if exists p_report_definitions_org_all on public.report_definitions;
create policy p_report_definitions_org_all
on public.report_definitions
for all
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

drop policy if exists p_report_widgets_org_all on public.report_widgets;
create policy p_report_widgets_org_all
on public.report_widgets
for all
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

drop policy if exists p_report_data_sources_org_all on public.report_data_sources;
create policy p_report_data_sources_org_all
on public.report_data_sources
for all
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());
