-- =====================================================
-- KalamApp - Phase 17 Cash/Bank allow barter payment type
-- Date: 2026-03-20
-- Type: Additive / non-breaking migration
-- Prerequisite: database_v1_phase9_cash_bank_operations.sql
-- =====================================================

begin;

alter table if exists public.cash_bank_operations
  drop constraint if exists chk_cash_bank_operations_payment_type;

alter table if exists public.cash_bank_operations
  add constraint chk_cash_bank_operations_payment_type
  check (payment_type in ('cash', 'card', 'transfer', 'cheque', 'online', 'barter'));

commit;
