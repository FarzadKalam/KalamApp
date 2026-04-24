-- =====================================================
-- KalamApp - Phase 125 Cash/Bank Canonical Sources
-- Date: 2026-04-24
-- Type: Additive / non-breaking migration
-- Prerequisite: database_v1_phase117_cash_bank_transfers.sql
-- =====================================================

alter table if exists public.cash_bank_operations
  add column if not exists expense_document_id uuid references public.expense_documents(id) on delete set null,
  add column if not exists employee_advance_id uuid references public.employee_advances(id) on delete set null,
  add column if not exists payroll_slip_id uuid references public.payroll_slips(id) on delete set null;

create index if not exists idx_cash_bank_operations_expense_document
  on public.cash_bank_operations(expense_document_id)
  where expense_document_id is not null;

create index if not exists idx_cash_bank_operations_employee_advance
  on public.cash_bank_operations(employee_advance_id)
  where employee_advance_id is not null;

create index if not exists idx_cash_bank_operations_payroll_slip
  on public.cash_bank_operations(payroll_slip_id)
  where payroll_slip_id is not null;

alter table if exists public.cash_bank_operations
  drop constraint if exists chk_cash_bank_operations_linked_entity;

alter table if exists public.cash_bank_operations
  add constraint chk_cash_bank_operations_linked_entity
  check (
    (
      operation_type in ('receipt', 'payment')
      and (
        sales_invoice_id is not null
        or purchase_invoice_id is not null
        or expense_document_id is not null
        or employee_advance_id is not null
        or payroll_slip_id is not null
        or customer_id is not null
        or supplier_id is not null
        or employee_id is not null
      )
    )
    or (
      operation_type = 'transfer'
      and (
        payment_bank_account_id is not null
        or payment_cash_box_id is not null
        or payment_petty_fund_id is not null
      )
      and (
        receipt_bank_account_id is not null
        or receipt_cash_box_id is not null
        or receipt_petty_fund_id is not null
      )
    )
  );
