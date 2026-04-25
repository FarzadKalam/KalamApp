-- =====================================================
-- KalamApp - Phase 129 Cash/Bank Schema Consolidation
-- Date: 2026-04-25
-- Type: Additive / repair / idempotent migration
-- Purpose:
--   Bring cash_bank_operations in sync with the current runtime even if
--   phases 117, 125, 126, 127, or 128 were skipped in an environment.
-- =====================================================

begin;

alter table if exists public.cash_bank_operations
  add column if not exists receipt_bank_account_id uuid references public.bank_accounts(id) on delete set null,
  add column if not exists receipt_cash_box_id uuid references public.cash_boxes(id) on delete set null,
  add column if not exists receipt_petty_fund_id uuid references public.petty_funds(id) on delete set null,
  add column if not exists payment_bank_account_id uuid references public.bank_accounts(id) on delete set null,
  add column if not exists payment_cash_box_id uuid references public.cash_boxes(id) on delete set null,
  add column if not exists payment_petty_fund_id uuid references public.petty_funds(id) on delete set null,
  add column if not exists expense_document_id uuid references public.expense_documents(id) on delete set null,
  add column if not exists employee_advance_id uuid references public.employee_advances(id) on delete set null,
  add column if not exists payroll_slip_id uuid references public.payroll_slips(id) on delete set null,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists image_url text;

update public.cash_bank_operations
set payment_type = case
    when coalesce(payment_type, '') in ('bank_account', 'bankaccount') then 'bank'
    when coalesce(payment_type, '') in ('card_to_card', 'card to card') then 'card'
    when coalesce(payment_type, '') in ('card_reader', 'card reader', 'cardreader', 'card_machine', 'card machine') then 'pos'
    when coalesce(payment_type, '') in ('tehator') then 'barter'
    else payment_type
  end
where coalesce(payment_type, '') in (
  'bank_account',
  'bankaccount',
  'card_to_card',
  'card to card',
  'card_reader',
  'card reader',
  'cardreader',
  'card_machine',
  'card machine',
  'tehator'
);

update public.cash_bank_operations
set assignee_id = coalesce(assignee_id, employee_id),
    assignee_type = case
      when assignee_role_id is not null then 'role'
      when coalesce(assignee_id, employee_id) is not null then 'user'
      else nullif(assignee_type, '')
    end,
    image_url = coalesce(nullif(image_url, ''), nullif(attachment_url, ''))
where assignee_id is null
   or coalesce(assignee_type, '') = ''
   or coalesce(nullif(image_url, ''), '') = '';

alter table if exists public.cash_bank_operations
  drop constraint if exists chk_cash_bank_operations_type;

alter table if exists public.cash_bank_operations
  add constraint chk_cash_bank_operations_type
  check (operation_type in ('receipt', 'payment', 'transfer'));

alter table if exists public.cash_bank_operations
  drop constraint if exists chk_cash_bank_operations_payment_type;

alter table if exists public.cash_bank_operations
  add constraint chk_cash_bank_operations_payment_type
  check (payment_type in ('cash', 'bank', 'card', 'pos', 'transfer', 'cheque', 'online', 'barter', 'credit'));

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

create index if not exists idx_cash_bank_operations_receipt_account
  on public.cash_bank_operations(receipt_bank_account_id, receipt_cash_box_id, receipt_petty_fund_id);

create index if not exists idx_cash_bank_operations_payment_account
  on public.cash_bank_operations(payment_bank_account_id, payment_cash_box_id, payment_petty_fund_id);

create index if not exists idx_cash_bank_operations_expense_document
  on public.cash_bank_operations(expense_document_id)
  where expense_document_id is not null;

create index if not exists idx_cash_bank_operations_employee_advance
  on public.cash_bank_operations(employee_advance_id)
  where employee_advance_id is not null;

create index if not exists idx_cash_bank_operations_payroll_slip
  on public.cash_bank_operations(payroll_slip_id)
  where payroll_slip_id is not null;

create index if not exists idx_cash_bank_operations_assignee_scope
  on public.cash_bank_operations(assignee_id, assignee_role_id);

commit;
