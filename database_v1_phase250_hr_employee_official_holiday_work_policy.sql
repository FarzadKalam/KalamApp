-- =====================================================
-- KalamApp - Phase 250 HR Employee Official Holiday Work Policy
-- Date: 2026-06-09
-- Type: Additive / idempotent migration
-- Goal:
--   Add an employee-level setting to decide whether official holidays
--   count toward required attendance hours.
-- =====================================================

begin;

alter table public.employees
  add column if not exists works_on_official_holidays boolean not null default false;

notify pgrst, 'reload schema';

commit;
