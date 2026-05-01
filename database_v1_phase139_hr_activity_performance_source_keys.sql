-- =====================================================
-- KalamApp - Phase 139 HR Activity Performance Source Keys
-- Date: 2026-05-01
-- Type: Additive / idempotent migration
-- Goal: prevent duplicate activity performance payroll entries
-- =====================================================

begin;

alter table public.payroll_calculation_entries
  add column if not exists source_key text;

create unique index if not exists idx_payroll_calc_entries_source_key_once
  on public.payroll_calculation_entries(org_id, employee_id, source_type, source_key, period_start, period_end)
  where source_key is not null and status <> 'voided';

notify pgrst, 'reload schema';

commit;
