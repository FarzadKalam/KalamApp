-- KalamApp V1 - Phase 96
-- Remove the taxpayer-system measure unit code field from products.

begin;

alter table if exists public.products
  drop column if exists taxpayer_measure_unit_code;

notify pgrst, 'reload schema';

commit;
