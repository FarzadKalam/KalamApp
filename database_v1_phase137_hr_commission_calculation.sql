-- =====================================================
-- KalamApp - Phase 137 HR Commission Calculation
-- Date: 2026-04-30
-- Type: Additive / idempotent migration
-- Goal: store calculated HR commissions as payroll ledger entries
-- =====================================================

begin;

alter table public.payroll_calculation_entries
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null;

alter table public.payroll_calculation_entries
  alter column created_by set default auth.uid(),
  alter column updated_by set default auth.uid();

create index if not exists idx_payroll_calc_entries_commission_period
  on public.payroll_calculation_entries(org_id, source_type, employee_id, period_start, period_end, status)
  where source_type = 'commission';

create index if not exists idx_payroll_calc_entries_assignee
  on public.payroll_calculation_entries(org_id, assignee_id)
  where assignee_id is not null;

commit;
