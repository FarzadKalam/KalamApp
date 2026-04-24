-- =====================================================
-- KalamApp - Phase 117 Cash/Bank Transfers
-- Date: 2026-04-24
-- Type: Additive / non-breaking migration
-- Prerequisite: database_v1_phase110_petty_funds.sql
-- =====================================================

alter table if exists public.cash_bank_operations
  add column if not exists receipt_bank_account_id uuid references public.bank_accounts(id) on delete set null,
  add column if not exists receipt_cash_box_id uuid references public.cash_boxes(id) on delete set null,
  add column if not exists receipt_petty_fund_id uuid references public.petty_funds(id) on delete set null,
  add column if not exists payment_bank_account_id uuid references public.bank_accounts(id) on delete set null,
  add column if not exists payment_cash_box_id uuid references public.cash_boxes(id) on delete set null,
  add column if not exists payment_petty_fund_id uuid references public.petty_funds(id) on delete set null;

alter table if exists public.cash_bank_operations
  drop constraint if exists chk_cash_bank_operations_type;

alter table if exists public.cash_bank_operations
  add constraint chk_cash_bank_operations_type
  check (operation_type in ('receipt', 'payment', 'transfer'));

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

create index if not exists idx_cash_bank_operations_receipt_account
  on public.cash_bank_operations(receipt_bank_account_id, receipt_cash_box_id, receipt_petty_fund_id);

create index if not exists idx_cash_bank_operations_payment_account
  on public.cash_bank_operations(payment_bank_account_id, payment_cash_box_id, payment_petty_fund_id);
