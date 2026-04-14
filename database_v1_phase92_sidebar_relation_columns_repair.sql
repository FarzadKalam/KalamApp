-- Repair: missing JSONB columns used by sidebar related-tabs queries
-- Date: 2026-04-14
-- Safe to run multiple times.

begin;

-- 1) Core JSONB columns commonly used in related queries.
alter table if exists public.invoices
  add column if not exists "invoiceItems" jsonb not null default '[]'::jsonb,
  add column if not exists payments jsonb not null default '[]'::jsonb;

alter table if exists public.purchase_invoices
  add column if not exists "invoiceItems" jsonb not null default '[]'::jsonb,
  add column if not exists payments jsonb not null default '[]'::jsonb;

-- In some older DBs, related-tab config points to projects.invoiceItems.
-- Add defensively to prevent runtime 42703 errors.
alter table if exists public.projects
  add column if not exists "invoiceItems" jsonb not null default '[]'::jsonb;

-- 2) Optional indexes for jsonb contains queries.
create index if not exists idx_invoices_invoice_items_gin
  on public.invoices using gin ("invoiceItems");

create index if not exists idx_purchase_invoices_invoice_items_gin
  on public.purchase_invoices using gin ("invoiceItems");

create index if not exists idx_projects_invoice_items_gin
  on public.projects using gin ("invoiceItems");

commit;

-- 3) Verification query (run after migration)
-- select table_name, column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and (
--     (table_name = 'invoices' and column_name in ('invoiceItems', 'payments'))
--     or (table_name = 'purchase_invoices' and column_name in ('invoiceItems', 'payments'))
--     or (table_name = 'projects' and column_name in ('invoiceItems'))
--   )
-- order by table_name, column_name;
