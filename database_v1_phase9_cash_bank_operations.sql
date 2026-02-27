-- =====================================================
-- KalamApp - Phase 9 Cash/Bank Operations
-- Date: 2026-02-27
-- Type: Additive / non-breaking migration
-- Prerequisite: database_v1_phase2_accounting.sql
-- =====================================================

create table if not exists public.cash_bank_operations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  operation_type text not null,
  payment_type text not null,
  status text not null default 'received',
  operation_date date not null default current_date,
  amount numeric(18,2) not null default 0,
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  cash_box_id uuid references public.cash_boxes(id) on delete set null,
  sales_invoice_id uuid references public.invoices(id) on delete set null,
  purchase_invoice_id uuid references public.purchase_invoices(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  employee_id uuid references public.profiles(id) on delete set null,
  cheque_id uuid references public.cheques(id) on delete set null,
  description text,
  attachment_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_cash_bank_operations_type') then
    alter table public.cash_bank_operations
      add constraint chk_cash_bank_operations_type
      check (operation_type in ('receipt', 'payment'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_cash_bank_operations_payment_type') then
    alter table public.cash_bank_operations
      add constraint chk_cash_bank_operations_payment_type
      check (payment_type in ('cash', 'card', 'transfer', 'cheque', 'online'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_cash_bank_operations_status') then
    alter table public.cash_bank_operations
      add constraint chk_cash_bank_operations_status
      check (status in ('pending', 'received', 'returned', 'canceled'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_cash_bank_operations_amount_non_negative') then
    alter table public.cash_bank_operations
      add constraint chk_cash_bank_operations_amount_non_negative
      check (amount >= 0);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_cash_bank_operations_linked_entity') then
    alter table public.cash_bank_operations
      add constraint chk_cash_bank_operations_linked_entity
      check (
        sales_invoice_id is not null
        or purchase_invoice_id is not null
        or customer_id is not null
        or supplier_id is not null
        or employee_id is not null
      );
  end if;
end $$;

create index if not exists idx_cash_bank_operations_org_date
  on public.cash_bank_operations(org_id, operation_date desc);

create index if not exists idx_cash_bank_operations_org_type
  on public.cash_bank_operations(org_id, operation_type, payment_type, status);

create index if not exists idx_cash_bank_operations_cheque
  on public.cash_bank_operations(cheque_id)
  where cheque_id is not null;

drop trigger if exists trg_cash_bank_operations_updated_at on public.cash_bank_operations;
create trigger trg_cash_bank_operations_updated_at
before update on public.cash_bank_operations
for each row execute function public.set_updated_at();

alter table public.cash_bank_operations enable row level security;
drop policy if exists p_cash_bank_operations_org_all on public.cash_bank_operations;
create policy p_cash_bank_operations_org_all
on public.cash_bank_operations
for all to authenticated
using (public.current_org_id() is null or org_id is null or org_id = public.current_org_id())
with check (public.current_org_id() is null or org_id is null or org_id = public.current_org_id());

