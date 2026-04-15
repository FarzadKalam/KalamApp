-- KalamApp V1 - Phase 94
-- Repair missing image columns used by module configs and refresh PostgREST schema cache.
-- Safe to replay on older/self-hosted installs.

begin;

alter table if exists public.projects
  add column if not exists image_url text;

alter table if exists public.tasks
  add column if not exists image_url text;

alter table if exists public.billboards
  add column if not exists image_url text;

alter table if exists public.invoices
  add column if not exists image_url text;

alter table if exists public.purchase_invoices
  add column if not exists image_url text;

alter table if exists public.cheques
  add column if not exists image_url text;

alter table if exists public.customers
  add column if not exists image_url text;

alter table if exists public.suppliers
  add column if not exists image_url text;

alter table if exists public.employees
  add column if not exists image_url text;

alter table if exists public.products
  add column if not exists image_url text;

alter table if exists public.product_bundles
  add column if not exists image_url text;

alter table if exists public.shelves
  add column if not exists image_url text;

-- Keep company print assets compatible with the print-template UI.
alter table if exists public.organizations
  add column if not exists signature_image_url text,
  add column if not exists stamp_image_url text;

-- Ask PostgREST/Supabase API to reload its schema cache after DDL.
notify pgrst, 'reload schema';

commit;
