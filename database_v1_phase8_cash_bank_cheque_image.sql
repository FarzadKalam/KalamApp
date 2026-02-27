-- =====================================================
-- KalamApp - Phase 8 Cash/Bank Cheque Image
-- Date: 2026-02-27
-- Type: Additive / non-breaking migration
-- Prerequisite: database_v1_phase2_accounting.sql
-- =====================================================

alter table if exists public.cheques
  add column if not exists image_url text;

