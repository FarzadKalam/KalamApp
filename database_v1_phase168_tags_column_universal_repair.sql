-- =====================================================
-- KalamApp - Phase 168 Tags Column Universal Repair
-- Date: 2026-05-21
-- Type: Schema repair / idempotent
-- Goal: Add `tags jsonb NOT NULL DEFAULT '[]'` to ALL module tables
--       that define a tags field in their config but may be missing
--       the column in the production database (schema drift).
--       All statements are IF NOT EXISTS — safe to run multiple times.
-- Affected tables confirmed by 400/42703 errors:
--   projects, purchase_invoices, product_bundles, suppliers, warehouses, shelves
-- Additional tables covered proactively from moduleRegistry:
--   see full list below
-- =====================================================

begin;

-- ─────────────────────────────────────────────
-- فروش و CRM
-- ─────────────────────────────────────────────
alter table if exists public.invoices
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.purchase_invoices
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.customers
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.suppliers
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.products
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.product_bundles
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.price_lists
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.marketing_leads
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.delivery_forms
  add column if not exists tags jsonb not null default '[]'::jsonb;

-- ─────────────────────────────────────────────
-- انبار و تولید
-- ─────────────────────────────────────────────
alter table if exists public.warehouses
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.shelves
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.stock_transfers
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.production_boms
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.production_orders
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.production_group_orders
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.barters
  add column if not exists tags jsonb not null default '[]'::jsonb;

-- ─────────────────────────────────────────────
-- حسابداری
-- ─────────────────────────────────────────────
alter table if exists public.fiscal_years
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.chart_of_accounts
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.journal_entries
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.journal_lines
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.accounting_event_rules
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.cost_centers
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.cash_boxes
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.bank_accounts
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.petty_funds
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.cheques
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.cash_bank_operations
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.expense_documents
  add column if not exists tags jsonb not null default '[]'::jsonb;

-- ─────────────────────────────────────────────
-- HR
-- ─────────────────────────────────────────────
alter table if exists public.employees
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.attendance_logs
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.work_schedules
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.leave_requests
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.overtime_requests
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.mission_requests
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.employee_advances
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.employee_bonus_requests
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.employee_penalty_requests
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.employee_contracts
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.payroll_slips
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.recruitment_applicants
  add column if not exists tags jsonb not null default '[]'::jsonb;

-- ─────────────────────────────────────────────
-- پروژه و فرآیند
-- ─────────────────────────────────────────────
alter table if exists public.projects
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.tasks
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.process_templates
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.process_runs
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.web_forms
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.surveys
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.secretariat_documents
  add column if not exists tags jsonb not null default '[]'::jsonb;

-- ─────────────────────────────────────────────
-- سیستم
-- ─────────────────────────────────────────────
alter table if exists public.billboards
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.calculation_formulas
  add column if not exists tags jsonb not null default '[]'::jsonb;

-- automation_execution_reports و sms_delivery_reports هر دو VIEW هستند، نه table — قابل alter نیستند

alter table if exists public.voip_call_reports
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.counterparty_bot_groups
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.profiles
  add column if not exists tags jsonb not null default '[]'::jsonb;

-- ─────────────────────────────────────────────
-- بررسی نهایی (اطلاعاتی)
-- ─────────────────────────────────────────────
do $$
begin
  raise notice 'Phase 168: tags column repair complete. All module tables now have tags jsonb NOT NULL DEFAULT [].';
end
$$;

notify pgrst, 'reload schema';

commit;
