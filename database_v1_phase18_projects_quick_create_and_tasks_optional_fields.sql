-- =====================================================
-- KalamApp - Phase 18 Project Quick Create + Task Optional Fields
-- Date: 2026-03-20
-- Type: Additive / non-breaking migration
-- =====================================================

begin;

-- -----------------------------------------------------------------
-- Projects: keep source invoice links for quick-create flow
-- -----------------------------------------------------------------
alter table if exists public.projects
  add column if not exists source_invoice_id uuid,
  add column if not exists source_purchase_invoice_id uuid;

do $$
begin
  if to_regclass('public.invoices') is not null
     and not exists (select 1 from pg_constraint where conname = 'projects_source_invoice_id_fkey') then
    alter table public.projects
      add constraint projects_source_invoice_id_fkey
      foreign key (source_invoice_id) references public.invoices(id) on delete set null;
  end if;
end $$;

do $$
begin
  if to_regclass('public.purchase_invoices') is not null
     and not exists (select 1 from pg_constraint where conname = 'projects_source_purchase_invoice_id_fkey') then
    alter table public.projects
      add constraint projects_source_purchase_invoice_id_fkey
      foreign key (source_purchase_invoice_id) references public.purchase_invoices(id) on delete set null;
  end if;
end $$;

create index if not exists idx_projects_source_invoice on public.projects(source_invoice_id);
create index if not exists idx_projects_source_purchase_invoice on public.projects(source_purchase_invoice_id);

-- -----------------------------------------------------------------
-- Invoices / Purchase Invoices: back-link to project (if missing)
-- -----------------------------------------------------------------
alter table if exists public.invoices
  add column if not exists project_id uuid;

alter table if exists public.purchase_invoices
  add column if not exists project_id uuid;

do $$
begin
  if to_regclass('public.projects') is not null
     and not exists (select 1 from pg_constraint where conname = 'invoices_project_id_fkey') then
    alter table public.invoices
      add constraint invoices_project_id_fkey
      foreign key (project_id) references public.projects(id) on delete set null;
  end if;
end $$;

do $$
begin
  if to_regclass('public.projects') is not null
     and not exists (select 1 from pg_constraint where conname = 'purchase_invoices_project_id_fkey') then
    alter table public.purchase_invoices
      add constraint purchase_invoices_project_id_fkey
      foreign key (project_id) references public.projects(id) on delete set null;
  end if;
end $$;

create index if not exists idx_invoices_project_id on public.invoices(project_id);
create index if not exists idx_purchase_invoices_project_id on public.purchase_invoices(project_id);

-- -----------------------------------------------------------------
-- Tasks: optional fields used by process quick-create/popover
-- -----------------------------------------------------------------
alter table if exists public.tasks
  add column if not exists task_type text,
  add column if not exists task_report text,
  add column if not exists project_id uuid,
  add column if not exists purchase_invoice_id uuid,
  add column if not exists marketing_lead_id uuid;

do $$
begin
  if to_regclass('public.projects') is not null
     and not exists (select 1 from pg_constraint where conname = 'tasks_project_id_fkey') then
    alter table public.tasks
      add constraint tasks_project_id_fkey
      foreign key (project_id) references public.projects(id) on delete set null;
  end if;
end $$;

do $$
begin
  if to_regclass('public.purchase_invoices') is not null
     and not exists (select 1 from pg_constraint where conname = 'tasks_purchase_invoice_id_fkey') then
    alter table public.tasks
      add constraint tasks_purchase_invoice_id_fkey
      foreign key (purchase_invoice_id) references public.purchase_invoices(id) on delete set null;
  end if;
end $$;

do $$
begin
  if to_regclass('public.marketing_leads') is not null
     and not exists (select 1 from pg_constraint where conname = 'tasks_marketing_lead_id_fkey') then
    alter table public.tasks
      add constraint tasks_marketing_lead_id_fkey
      foreign key (marketing_lead_id) references public.marketing_leads(id) on delete set null;
  end if;
end $$;

create index if not exists idx_tasks_project on public.tasks(project_id);
create index if not exists idx_tasks_purchase_invoice on public.tasks(purchase_invoice_id);
create index if not exists idx_tasks_marketing_lead on public.tasks(marketing_lead_id);
create index if not exists idx_tasks_task_type on public.tasks(task_type);

commit;
