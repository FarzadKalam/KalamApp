-- =====================================================
-- KalamApp - Phase 81 Marketing Leads Legacy System Code
-- Date: 2026-04-12
-- Type: Additive / idempotent migration
-- Goal: add legacy system code field to marketing leads
-- =====================================================

begin;

alter table public.marketing_leads
  add column if not exists legacy_system_code text;

commit;
