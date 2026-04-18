-- =====================================================
-- KalamApp - Phase 110 Expense Documents Image Support
-- Date: 2026-04-18
-- Type: Additive / non-breaking migration
-- Goal: align expense document image/file UX with other operational modules
-- =====================================================

begin;

alter table if exists public.expense_documents
  add column if not exists image_url text;

commit;
