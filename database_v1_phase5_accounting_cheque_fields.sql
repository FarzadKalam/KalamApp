-- =====================================================
-- KalamApp - Phase 5 Cheque Print Fields (Iran)
-- Date: 2026-02-27
-- Type: Additive / non-breaking migration
-- Prerequisite: database_v1_phase2_accounting.sql
-- =====================================================

alter table if exists public.cheques
  add column if not exists branch_code text,
  add column if not exists payee_name text,
  add column if not exists payee_identifier text,
  add column if not exists account_holder_name text;

create index if not exists idx_cheques_payee_identifier
  on public.cheques(payee_identifier)
  where payee_identifier is not null and payee_identifier <> '';
