-- =====================================================
-- KalamApp - Phase 34 Legacy import fields
-- Date: 2026-03-24
-- Type: Additive / non-breaking migration
-- Goal: preserve old CRM identifiers and statuses during Excel migration
-- =====================================================

begin;

alter table if exists public.customers
  add column if not exists legacy_contact_code text,
  add column if not exists accounting_code text;

create index if not exists idx_customers_legacy_contact_code
  on public.customers(org_id, legacy_contact_code)
  where legacy_contact_code is not null and legacy_contact_code <> '';

alter table if exists public.invoices
  add column if not exists legacy_invoice_number text,
  add column if not exists legacy_status text,
  add column if not exists legacy_accounting_status text,
  add column if not exists legacy_source text,
  add column if not exists legacy_ready_text text;

create index if not exists idx_invoices_legacy_invoice_number
  on public.invoices(org_id, legacy_invoice_number)
  where legacy_invoice_number is not null and legacy_invoice_number <> '';

alter table if exists public.purchase_invoices
  add column if not exists legacy_invoice_number text,
  add column if not exists legacy_status text,
  add column if not exists legacy_accounting_status text,
  add column if not exists legacy_source text,
  add column if not exists legacy_ready_text text;

create index if not exists idx_purchase_invoices_legacy_invoice_number
  on public.purchase_invoices(org_id, legacy_invoice_number)
  where legacy_invoice_number is not null and legacy_invoice_number <> '';

commit;
