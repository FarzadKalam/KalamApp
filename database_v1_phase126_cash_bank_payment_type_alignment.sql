-- =====================================================
-- KalamApp - Phase 126 Cash/Bank Payment Type Alignment
-- Date: 2026-04-24
-- Type: Additive / non-breaking migration
-- Prerequisite: database_v1_phase125_cash_bank_canonical_sources.sql
-- =====================================================

alter table if exists public.cash_bank_operations
  drop constraint if exists chk_cash_bank_operations_payment_type;

alter table if exists public.cash_bank_operations
  add constraint chk_cash_bank_operations_payment_type
  check (payment_type in ('cash', 'bank', 'card', 'pos', 'transfer', 'cheque', 'online', 'barter'));
