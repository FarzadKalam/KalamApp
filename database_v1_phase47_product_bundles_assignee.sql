-- =====================================================
-- KalamApp - Phase 47 Product Bundles Assignee
-- Date: 2026-03-25
-- Type: Additive / idempotent migration
-- Goal: add assignee support to sales packages
-- =====================================================

begin;

alter table public.product_bundles
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text;

commit;
