-- KalamApp V1 - Phase 12
-- Scope:
-- 1) Process draft fields for customers / invoices / purchase_invoices
-- 2) Task weight + purchase invoice linkage

begin;

alter table if exists public.customers
  add column if not exists execution_process_draft jsonb not null default '[]'::jsonb;

alter table if exists public.invoices
  add column if not exists process_template_id uuid,
  add column if not exists execution_process_draft jsonb not null default '[]'::jsonb;

alter table if exists public.purchase_invoices
  add column if not exists process_template_id uuid,
  add column if not exists execution_process_draft jsonb not null default '[]'::jsonb;

alter table if exists public.tasks
  add column if not exists weight numeric(10,2) not null default 0,
  add column if not exists purchase_invoice_id uuid;

do $$
begin
  if to_regclass('public.process_templates') is not null then
    if not exists (select 1 from pg_constraint where conname = 'invoices_process_template_id_fkey') then
      alter table public.invoices
        add constraint invoices_process_template_id_fkey
        foreign key (process_template_id) references public.process_templates(id) on delete set null
        not valid;
    end if;

    if not exists (select 1 from pg_constraint where conname = 'purchase_invoices_process_template_id_fkey') then
      alter table public.purchase_invoices
        add constraint purchase_invoices_process_template_id_fkey
        foreign key (process_template_id) references public.process_templates(id) on delete set null
        not valid;
    end if;
  end if;
end $$;

do $$
begin
  if to_regclass('public.purchase_invoices') is not null
     and not exists (select 1 from pg_constraint where conname = 'tasks_purchase_invoice_id_fkey') then
    alter table public.tasks
      add constraint tasks_purchase_invoice_id_fkey
      foreign key (purchase_invoice_id) references public.purchase_invoices(id) on delete set null
      not valid;
  end if;
end $$;

create index if not exists idx_tasks_purchase_invoice on public.tasks(purchase_invoice_id);

commit;
