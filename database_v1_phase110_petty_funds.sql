-- =====================================================
-- KalamApp - Phase 110 Petty Funds
-- Date: 2026-04-18
-- Type: Additive / non-breaking migration
-- Prerequisite: database_v1_phase2_accounting.sql, database_v1_phase9_cash_bank_operations.sql
-- =====================================================

create table if not exists public.petty_funds (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  code text,
  name text not null,
  account_id uuid references public.chart_of_accounts(id) on delete set null,
  responsible_id uuid references public.profiles(id) on delete set null,
  opening_balance numeric(18,2) not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_petty_funds_org_code
  on public.petty_funds(org_id, code)
  where code is not null and code <> '';

create index if not exists idx_petty_funds_org_active
  on public.petty_funds(org_id, is_active);

alter table public.cash_bank_operations
  add column if not exists petty_fund_id uuid references public.petty_funds(id) on delete set null;

create index if not exists idx_cash_bank_operations_petty_fund
  on public.cash_bank_operations(petty_fund_id)
  where petty_fund_id is not null;

drop trigger if exists trg_petty_funds_updated_at on public.petty_funds;
create trigger trg_petty_funds_updated_at
before update on public.petty_funds
for each row execute function public.set_updated_at();

grant select, insert, update, delete on table
  public.petty_funds
to authenticated, service_role;

alter table public.petty_funds enable row level security;
drop policy if exists p_petty_funds_org_all on public.petty_funds;
create policy p_petty_funds_org_all
on public.petty_funds
for all to authenticated
using (public.current_org_id() is null or org_id is null or org_id = public.current_org_id())
with check (public.current_org_id() is null or org_id is null or org_id = public.current_org_id());
