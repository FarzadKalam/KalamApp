-- =====================================================
-- KalamApp - Phase 49 Product Bundles Assignee Role Support
-- Date: 2026-03-26
-- Type: Additive / idempotent migration
-- Goal: allow assigning sales packages to org roles as well as users
-- =====================================================

begin;

alter table public.product_bundles
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null;

create index if not exists idx_product_bundles_assignee
  on public.product_bundles(assignee_id, assignee_role_id);

commit;
