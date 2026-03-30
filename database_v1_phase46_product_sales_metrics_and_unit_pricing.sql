-- =====================================================
-- KalamApp - Phase 46 Product Sales Metrics and Unit Pricing
-- Date: 2026-03-25
-- Type: Additive / idempotent migration
-- Goal: extend products with sales metrics, pricing metadata, and description
-- =====================================================

begin;

alter table public.products
  add column if not exists total_sold_amount numeric(18,2) not null default 0,
  add column if not exists total_sold_quantity numeric(18,3) not null default 0,
  add column if not exists invoice_count integer not null default 0,
  add column if not exists monthly_rent numeric(18,2) not null default 0,
  add column if not exists vat_percentage numeric(8,4) not null default 10,
  add column if not exists is_vat_exempt boolean not null default true,
  add column if not exists description text,
  add column if not exists required_quantity numeric(18,3) not null default 0;

update public.products
set
  total_sold_amount = coalesce(total_sold_amount, 0),
  total_sold_quantity = coalesce(total_sold_quantity, 0),
  invoice_count = coalesce(invoice_count, 0),
  monthly_rent = coalesce(monthly_rent, 0),
  vat_percentage = coalesce(vat_percentage, 10),
  is_vat_exempt = coalesce(is_vat_exempt, true),
  required_quantity = coalesce(required_quantity, 0)
where
  total_sold_amount is null
  or total_sold_quantity is null
  or invoice_count is null
  or monthly_rent is null
  or vat_percentage is null
  or is_vat_exempt is null
  or required_quantity is null;

alter table public.products
  alter column total_sold_amount set default 0,
  alter column total_sold_amount set not null,
  alter column total_sold_quantity set default 0,
  alter column total_sold_quantity set not null,
  alter column invoice_count set default 0,
  alter column invoice_count set not null,
  alter column monthly_rent set default 0,
  alter column monthly_rent set not null,
  alter column vat_percentage set default 10,
  alter column vat_percentage set not null,
  alter column is_vat_exempt set default true,
  alter column is_vat_exempt set not null,
  alter column required_quantity set default 0,
  alter column required_quantity set not null;

commit;
