-- KalamApp V1 - Phase 146
-- Add sales invoice fields needed for grouped legacy invoice imports.

begin;

alter table if exists public.invoices
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists legacy_organization_name text,
  add column if not exists legacy_invoice_type text,
  add column if not exists legacy_accounting_type text,
  add column if not exists legacy_items_total_amount numeric(18,2),
  add column if not exists subtotal_before_tax numeric(18,2),
  add column if not exists shipping_amount numeric(18,2),
  add column if not exists invoice_discount_amount numeric(18,2),
  add column if not exists invoice_discount_percent numeric(8,3),
  add column if not exists liam_code text,
  add column if not exists marketer_accounting_code text,
  add column if not exists execution_departments jsonb not null default '[]'::jsonb,
  add column if not exists province text,
  add column if not exists city text,
  add column if not exists postal_code text,
  add column if not exists address text;

commit;
