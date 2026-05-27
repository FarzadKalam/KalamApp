-- =====================================================
-- KalamApp - Phase 172: Fix counterparty_bot_config org_id default
-- Date: 2026-05-27
-- Type: Security fix / idempotent
-- Goal: Add DEFAULT current_org_id() to counterparty_bot_config.org_id
--       so inserts without an explicit org_id still pass RLS.
--       Frontend now also sends org_id explicitly (belt-and-suspenders).
-- =====================================================

begin;

alter table public.counterparty_bot_config
  alter column org_id set default public.current_org_id();

notify pgrst, 'reload schema';

commit;
