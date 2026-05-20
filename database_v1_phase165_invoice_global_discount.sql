-- Phase 165: Add global discount support for sales and purchase invoices
-- Idempotent migration

alter table if exists public.invoices
  add column if not exists global_discount_type text;

alter table if exists public.invoices
  add column if not exists global_discount_value numeric(18,2);

alter table if exists public.invoices
  alter column global_discount_type set default 'amount';

alter table if exists public.invoices
  alter column global_discount_value set default 0;

alter table if exists public.purchase_invoices
  add column if not exists global_discount_type text;

alter table if exists public.purchase_invoices
  add column if not exists global_discount_value numeric(18,2);

alter table if exists public.purchase_invoices
  alter column global_discount_type set default 'amount';

alter table if exists public.purchase_invoices
  alter column global_discount_value set default 0;

update public.invoices
set
  global_discount_type = coalesce(nullif(trim(global_discount_type), ''), 'amount'),
  global_discount_value = coalesce(global_discount_value, 0)
where global_discount_type is null
   or trim(global_discount_type) = ''
   or global_discount_value is null;

update public.purchase_invoices
set
  global_discount_type = coalesce(nullif(trim(global_discount_type), ''), 'amount'),
  global_discount_value = coalesce(global_discount_value, 0)
where global_discount_type is null
   or trim(global_discount_type) = ''
   or global_discount_value is null;
