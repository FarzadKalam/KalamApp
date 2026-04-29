-- Phase 135: Purchase invoice supplier notification flag

alter table public.purchase_invoices
  add column if not exists notify_supplier boolean not null default false;
