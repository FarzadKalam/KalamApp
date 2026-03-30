-- =====================================================
-- KalamApp - Phase 48 Products Assignee Role Support
-- Date: 2026-03-25
-- Type: Additive / idempotent migration
-- Goal: allow assigning products to org roles as well as users
-- =====================================================

begin;

alter table public.products
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null;

create index if not exists idx_products_assignee
  on public.products(assignee_id, assignee_role_id);

commit;
