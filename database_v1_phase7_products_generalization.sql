-- =====================================================
-- KalamApp - Phase 7 Product Generalization (Goods/Services)
-- Date: 2026-02-27
-- Type: Safe migration / additive
-- =====================================================

alter table if exists public.products
  add column if not exists cost_center_id uuid references public.cost_centers(id) on delete set null;

-- Normalize legacy product types to the new model
update public.products
set product_type = 'goods'
where product_type in ('raw', 'semi', 'final');

alter table if exists public.products
  alter column product_type set default 'goods';

create index if not exists idx_products_cost_center_id
  on public.products(cost_center_id);
