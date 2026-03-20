create table if not exists public.billboards (
  id uuid primary key default gen_random_uuid()
);

alter table public.billboards
  add column if not exists org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists status text not null default 'free',
  add column if not exists related_to_module text,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists description text,
  add column if not exists address text,
  add column if not exists city_name text,
  add column if not exists location text,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists category text,
  add column if not exists grade text,
  add column if not exists features text,
  add column if not exists daily_rent numeric(18,2) not null default 0,
  add column if not exists monthly_rent numeric(18,2) not null default 0,
  add column if not exists print_cost numeric(18,2) not null default 0,
  add column if not exists related_supplier uuid references public.suppliers(id) on delete set null,
  add column if not exists related_customer uuid references public.customers(id) on delete set null,
  add column if not exists related_invoice uuid references public.invoices(id) on delete set null,
  add column if not exists width numeric(18,2) not null default 0,
  add column if not exists height numeric(18,2) not null default 0,

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

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'billboards_related_supplier_fkey') then
    alter table public.billboards
      add constraint billboards_related_supplier_fkey
      foreign key (related_supplier) references public.suppliers(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'billboards_related_customer_fkey') then
    alter table public.billboards
      add constraint billboards_related_customer_fkey
      foreign key (related_customer) references public.customers(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'billboards_process_template_id_fkey') then
    alter table public.billboards
      add constraint billboards_process_template_id_fkey
      foreign key (process_template_id) references public.process_templates(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'billboards_process_run_id_fkey') then
    alter table public.billboards
      add constraint billboards_process_run_id_fkey
      foreign key (process_run_id) references public.process_runs(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'billboards_project_id_fkey') then
    alter table public.billboards
      add constraint billboards_project_id_fkey
      foreign key (project_id) references public.projects(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_related_billboard_fkey') then
    alter table public.tasks
      add constraint tasks_related_billboard_fkey
      foreign key (related_billboard) references public.billboards(id) on delete set null
      not valid;
  end if;
end $$;

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
    'process_run_stages','ai_record_contexts','billboards'
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


do $$
declare
  t text;
begin
  foreach t in array array[
    'ai_record_contexts','billboards'
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

