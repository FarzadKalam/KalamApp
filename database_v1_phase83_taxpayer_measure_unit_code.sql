-- KalamApp V1 - Phase 83
-- Persist official taxpayer-system measure unit code on products.

begin;

alter table if exists public.products
  add column if not exists taxpayer_measure_unit_code integer;

commit;
