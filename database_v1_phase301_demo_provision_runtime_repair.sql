-- =====================================================
-- KalamApp - Phase 301 Demo Provision Runtime Repair
-- Date: 2026-06-30
-- Type: Corrective / idempotent migration
-- Goal:
--   Keep self-service demo provisioning compatible with databases where
--   marketing_leads.description is missing because of production drift.
-- =====================================================

begin;

alter table if exists public.marketing_leads
  add column if not exists description text;

notify pgrst, 'reload schema';

commit;
