-- =====================================================
-- KalamApp - Phase 35 Product Commission Percentage
-- Date: 2026-03-24
-- Type: Additive / non-breaking migration
-- Goal: persist product-level commission percentage in database
-- =====================================================

begin;

alter table if exists public.products
  add column if not exists commission_percentage numeric(8,4) not null default 0;

commit;
