-- =====================================================
-- KalamApp - Phase 2 Accounting Core (Double-Entry)
-- Date: 2026-02-26
-- Type: Additive / non-breaking migration
-- Prerequisite: database_v1_full.sql (or equivalent core tables/functions)
-- =====================================================

-- -----------------------------------------------------
-- Fiscal years
-- -----------------------------------------------------
create table if not exists public.fiscal_years (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  title text not null,
  start_date date not null,
  end_date date not null,
  is_active boolean not null default false,
  is_closed boolean not null default false,
  closed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_fiscal_year_range check (start_date <= end_date)
);

create unique index if not exists idx_fiscal_years_org_title
  on public.fiscal_years(org_id, lower(title));

create unique index if not exists idx_fiscal_years_single_active_per_org
  on public.fiscal_years(org_id)
  where is_active = true and is_closed = false;

create index if not exists idx_fiscal_years_org_dates
  on public.fiscal_years(org_id, start_date, end_date);

-- -----------------------------------------------------
-- Chart of accounts
-- -----------------------------------------------------
create table if not exists public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  code text not null,
  name text not null,
  account_type text not null,
  account_level text not null default 'detail',
  nature text not null default 'none',
  parent_id uuid references public.chart_of_accounts(id) on delete restrict,
  is_leaf boolean not null default true,
  is_system boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_chart_account_type check (account_type in ('asset','liability','equity','income','expense')),
  constraint chk_chart_account_level check (account_level in ('group','general','subsidiary','detail')),
  constraint chk_chart_account_nature check (nature in ('debit','credit','none')),
  constraint chk_chart_account_parent_not_self check (parent_id is null or parent_id <> id)
);

create unique index if not exists idx_chart_of_accounts_org_code
  on public.chart_of_accounts(org_id, code);

create index if not exists idx_chart_of_accounts_parent
  on public.chart_of_accounts(parent_id);

create index if not exists idx_chart_of_accounts_org_type
  on public.chart_of_accounts(org_id, account_type, is_active);

-- -----------------------------------------------------
-- Cost centers
-- -----------------------------------------------------
create table if not exists public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  code text not null,
  name text not null,
  parent_id uuid references public.cost_centers(id) on delete restrict,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_cost_centers_parent_not_self check (parent_id is null or parent_id <> id)
);

create unique index if not exists idx_cost_centers_org_code
  on public.cost_centers(org_id, code);

create index if not exists idx_cost_centers_parent
  on public.cost_centers(parent_id);

-- -----------------------------------------------------
-- Cash boxes
-- -----------------------------------------------------
create table if not exists public.cash_boxes (
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

create unique index if not exists idx_cash_boxes_org_code
  on public.cash_boxes(org_id, code)
  where code is not null and code <> '';

create index if not exists idx_cash_boxes_org_active
  on public.cash_boxes(org_id, is_active);

-- -----------------------------------------------------
-- Bank accounts
-- -----------------------------------------------------
create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  code text,
  bank_name text not null,
  branch_name text,
  account_holder_name text,
  account_number text,
  shaba text,
  card_number text,
  account_id uuid references public.chart_of_accounts(id) on delete set null,
  opening_balance numeric(18,2) not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_bank_accounts_org_code
  on public.bank_accounts(org_id, code)
  where code is not null and code <> '';

create index if not exists idx_bank_accounts_org_active
  on public.bank_accounts(org_id, is_active);

create index if not exists idx_bank_accounts_account_number
  on public.bank_accounts(account_number);

create index if not exists idx_bank_accounts_shaba
  on public.bank_accounts(shaba);

-- -----------------------------------------------------
-- Journal entries (voucher header)
-- -----------------------------------------------------
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  fiscal_year_id uuid references public.fiscal_years(id) on delete set null,
  entry_no text,
  entry_date date not null default current_date,
  description text,
  status text not null default 'draft',
  source_module text,
  source_table text,
  source_record_id uuid,
  reversal_of_entry_id uuid references public.journal_entries(id) on delete set null,
  posted_at timestamptz,
  posted_by uuid references auth.users(id) on delete set null,
  total_debit numeric(18,2) not null default 0,
  total_credit numeric(18,2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_journal_entries_status check (status in ('draft','posted','reversed')),
  constraint chk_journal_entries_totals_non_negative check (total_debit >= 0 and total_credit >= 0)
);

create unique index if not exists idx_journal_entries_org_fiscal_entry_no
  on public.journal_entries(org_id, fiscal_year_id, entry_no)
  where entry_no is not null and entry_no <> '';

create index if not exists idx_journal_entries_org_date
  on public.journal_entries(org_id, entry_date desc);

create index if not exists idx_journal_entries_source
  on public.journal_entries(source_table, source_record_id);

-- -----------------------------------------------------
-- Journal lines (voucher rows)
-- -----------------------------------------------------
create table if not exists public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  line_no integer not null,
  account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  description text,
  debit numeric(18,2) not null default 0,
  credit numeric(18,2) not null default 0,
  cost_center_id uuid references public.cost_centers(id) on delete set null,
  project_id uuid,
  party_type text,
  party_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_journal_lines_non_negative check (debit >= 0 and credit >= 0),
  constraint chk_journal_lines_exactly_one_side check (
    (debit > 0 and credit = 0) or (credit > 0 and debit = 0)
  )
);

create unique index if not exists idx_journal_lines_entry_line_no
  on public.journal_lines(entry_id, line_no);

create index if not exists idx_journal_lines_account
  on public.journal_lines(account_id);

create index if not exists idx_journal_lines_cost_center
  on public.journal_lines(cost_center_id);

-- -----------------------------------------------------
-- Accounting event rules (auto-posting map)
-- -----------------------------------------------------
create table if not exists public.accounting_event_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  event_key text not null,
  title text not null,
  rule_mode text not null default 'simple',
  debit_account_id uuid references public.chart_of_accounts(id) on delete set null,
  credit_account_id uuid references public.chart_of_accounts(id) on delete set null,
  vat_account_id uuid references public.chart_of_accounts(id) on delete set null,
  receivable_account_id uuid references public.chart_of_accounts(id) on delete set null,
  payable_account_id uuid references public.chart_of_accounts(id) on delete set null,
  rule_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_accounting_event_rules_mode check (rule_mode in ('simple','template'))
);

create unique index if not exists idx_accounting_event_rules_org_event
  on public.accounting_event_rules(org_id, event_key);

-- -----------------------------------------------------
-- Journal entry links (idempotency for source events)
-- -----------------------------------------------------
create table if not exists public.journal_entry_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  event_key text not null,
  source_table text not null,
  source_record_id uuid not null,
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_journal_entry_links_unique_source
  on public.journal_entry_links(org_id, event_key, source_table, source_record_id);

create index if not exists idx_journal_entry_links_journal_entry
  on public.journal_entry_links(journal_entry_id);

-- -----------------------------------------------------
-- Cheques (Iran market essentials)
-- -----------------------------------------------------
create table if not exists public.cheques (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  cheque_type text not null,
  status text not null default 'new',
  sayad_id text,
  serial_no text,
  bank_name text,
  branch_name text,
  amount numeric(18,2) not null default 0,
  due_date date,
  issue_date date,
  party_type text,
  party_id uuid,
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_cheques_type check (cheque_type in ('received','issued')),
  constraint chk_cheques_status check (status in ('new','in_bank','cleared','bounced','returned','canceled')),
  constraint chk_cheques_amount_non_negative check (amount >= 0)
);

create index if not exists idx_cheques_org_status_due_date
  on public.cheques(org_id, status, due_date);

create index if not exists idx_cheques_sayad_id
  on public.cheques(sayad_id);

-- -----------------------------------------------------
-- Seed default event keys (without account mapping)
-- -----------------------------------------------------
do $$
declare
  v_org_id uuid := public.current_org_id();
  v_event_key text;
  v_title text;
begin
  for v_event_key, v_title in
    select *
    from (values
      ('sales_invoice_finalized', 'Sales Invoice Finalized'),
      ('purchase_invoice_finalized', 'Purchase Invoice Finalized'),
      ('sales_payment_received', 'Sales Payment Received'),
      ('purchase_payment_paid', 'Purchase Payment Paid'),
      ('sales_return', 'Sales Return'),
      ('purchase_return', 'Purchase Return')
    ) as t(event_key, title)
  loop
    if not exists (
      select 1
      from public.accounting_event_rules r
      where r.event_key = v_event_key
        and r.org_id is not distinct from v_org_id
    ) then
      insert into public.accounting_event_rules (org_id, event_key, title, rule_mode, is_active)
      values (v_org_id, v_event_key, v_title, 'simple', true);
    end if;
  end loop;
end $$;

-- -----------------------------------------------------
-- Helper functions: keep voucher totals synced and enforce posted balance
-- -----------------------------------------------------
create or replace function public.refresh_journal_entry_totals(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_debit numeric(18,2);
  v_total_credit numeric(18,2);
begin
  select
    coalesce(sum(l.debit), 0)::numeric(18,2),
    coalesce(sum(l.credit), 0)::numeric(18,2)
  into v_total_debit, v_total_credit
  from public.journal_lines l
  where l.entry_id = p_entry_id;

  update public.journal_entries e
  set total_debit = v_total_debit,
      total_credit = v_total_credit,
      updated_at = now()
  where e.id = p_entry_id;
end;
$$;

create or replace function public.trg_refresh_journal_entry_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'DELETE') then
    perform public.refresh_journal_entry_totals(old.entry_id);
    return old;
  end if;

  perform public.refresh_journal_entry_totals(new.entry_id);

  if (tg_op = 'UPDATE' and old.entry_id is distinct from new.entry_id) then
    perform public.refresh_journal_entry_totals(old.entry_id);
  end if;

  return new;
end;
$$;

create or replace function public.trg_validate_posted_journal_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_debit numeric(18,2);
  v_total_credit numeric(18,2);
begin
  if (new.status = 'posted' and coalesce(old.status, '') <> 'posted') then
    perform public.refresh_journal_entry_totals(new.id);

    select e.total_debit, e.total_credit
    into v_total_debit, v_total_credit
    from public.journal_entries e
    where e.id = new.id;

    if v_total_debit <= 0 or v_total_credit <= 0 then
      raise exception 'Posted journal entry must have non-zero debit and credit totals.';
    end if;

    if abs(v_total_debit - v_total_credit) > 0.009 then
      raise exception 'Journal entry is not balanced (debit=% credit=%).', v_total_debit, v_total_credit;
    end if;

    new.posted_at = coalesce(new.posted_at, now());
    new.posted_by = coalesce(new.posted_by, auth.uid());
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------
-- Updated-at triggers
-- -----------------------------------------------------
drop trigger if exists trg_fiscal_years_updated_at on public.fiscal_years;
create trigger trg_fiscal_years_updated_at
before update on public.fiscal_years
for each row execute function public.set_updated_at();

drop trigger if exists trg_chart_of_accounts_updated_at on public.chart_of_accounts;
create trigger trg_chart_of_accounts_updated_at
before update on public.chart_of_accounts
for each row execute function public.set_updated_at();

drop trigger if exists trg_cost_centers_updated_at on public.cost_centers;
create trigger trg_cost_centers_updated_at
before update on public.cost_centers
for each row execute function public.set_updated_at();

drop trigger if exists trg_cash_boxes_updated_at on public.cash_boxes;
create trigger trg_cash_boxes_updated_at
before update on public.cash_boxes
for each row execute function public.set_updated_at();

drop trigger if exists trg_bank_accounts_updated_at on public.bank_accounts;
create trigger trg_bank_accounts_updated_at
before update on public.bank_accounts
for each row execute function public.set_updated_at();

drop trigger if exists trg_journal_entries_updated_at on public.journal_entries;
create trigger trg_journal_entries_updated_at
before update on public.journal_entries
for each row execute function public.set_updated_at();

drop trigger if exists trg_journal_lines_updated_at on public.journal_lines;
create trigger trg_journal_lines_updated_at
before update on public.journal_lines
for each row execute function public.set_updated_at();

drop trigger if exists trg_accounting_event_rules_updated_at on public.accounting_event_rules;
create trigger trg_accounting_event_rules_updated_at
before update on public.accounting_event_rules
for each row execute function public.set_updated_at();

drop trigger if exists trg_cheques_updated_at on public.cheques;
create trigger trg_cheques_updated_at
before update on public.cheques
for each row execute function public.set_updated_at();

drop trigger if exists trg_journal_lines_refresh_entry_totals on public.journal_lines;
create trigger trg_journal_lines_refresh_entry_totals
after insert or update or delete on public.journal_lines
for each row execute function public.trg_refresh_journal_entry_totals();

drop trigger if exists trg_journal_entries_validate_posted on public.journal_entries;
create trigger trg_journal_entries_validate_posted
before update on public.journal_entries
for each row execute function public.trg_validate_posted_journal_entry();

-- -----------------------------------------------------
-- Grants
-- -----------------------------------------------------
grant select, insert, update, delete on table
  public.fiscal_years,
  public.chart_of_accounts,
  public.cost_centers,
  public.cash_boxes,
  public.bank_accounts,
  public.journal_entries,
  public.journal_lines,
  public.accounting_event_rules,
  public.journal_entry_links,
  public.cheques
to authenticated, service_role;

grant execute on function public.refresh_journal_entry_totals(uuid) to authenticated, service_role;
grant execute on function public.trg_refresh_journal_entry_totals() to authenticated, service_role;
grant execute on function public.trg_validate_posted_journal_entry() to authenticated, service_role;

-- -----------------------------------------------------
-- RLS policies
-- -----------------------------------------------------
alter table public.fiscal_years enable row level security;
drop policy if exists p_fiscal_years_org_all on public.fiscal_years;
create policy p_fiscal_years_org_all
on public.fiscal_years
for all to authenticated
using (public.current_org_id() is null or org_id is null or org_id = public.current_org_id())
with check (public.current_org_id() is null or org_id is null or org_id = public.current_org_id());

alter table public.chart_of_accounts enable row level security;
drop policy if exists p_chart_of_accounts_org_all on public.chart_of_accounts;
create policy p_chart_of_accounts_org_all
on public.chart_of_accounts
for all to authenticated
using (public.current_org_id() is null or org_id is null or org_id = public.current_org_id())
with check (public.current_org_id() is null or org_id is null or org_id = public.current_org_id());

alter table public.cost_centers enable row level security;
drop policy if exists p_cost_centers_org_all on public.cost_centers;
create policy p_cost_centers_org_all
on public.cost_centers
for all to authenticated
using (public.current_org_id() is null or org_id is null or org_id = public.current_org_id())
with check (public.current_org_id() is null or org_id is null or org_id = public.current_org_id());

alter table public.cash_boxes enable row level security;
drop policy if exists p_cash_boxes_org_all on public.cash_boxes;
create policy p_cash_boxes_org_all
on public.cash_boxes
for all to authenticated
using (public.current_org_id() is null or org_id is null or org_id = public.current_org_id())
with check (public.current_org_id() is null or org_id is null or org_id = public.current_org_id());

alter table public.bank_accounts enable row level security;
drop policy if exists p_bank_accounts_org_all on public.bank_accounts;
create policy p_bank_accounts_org_all
on public.bank_accounts
for all to authenticated
using (public.current_org_id() is null or org_id is null or org_id = public.current_org_id())
with check (public.current_org_id() is null or org_id is null or org_id = public.current_org_id());

alter table public.journal_entries enable row level security;
drop policy if exists p_journal_entries_org_all on public.journal_entries;
create policy p_journal_entries_org_all
on public.journal_entries
for all to authenticated
using (public.current_org_id() is null or org_id is null or org_id = public.current_org_id())
with check (public.current_org_id() is null or org_id is null or org_id = public.current_org_id());

alter table public.journal_lines enable row level security;
drop policy if exists p_journal_lines_org_all on public.journal_lines;
create policy p_journal_lines_org_all
on public.journal_lines
for all to authenticated
using (
  exists (
    select 1
    from public.journal_entries e
    where e.id = journal_lines.entry_id
      and (public.current_org_id() is null or e.org_id is null or e.org_id = public.current_org_id())
  )
)
with check (
  exists (
    select 1
    from public.journal_entries e
    where e.id = journal_lines.entry_id
      and (public.current_org_id() is null or e.org_id is null or e.org_id = public.current_org_id())
  )
);

alter table public.accounting_event_rules enable row level security;
drop policy if exists p_accounting_event_rules_org_all on public.accounting_event_rules;
create policy p_accounting_event_rules_org_all
on public.accounting_event_rules
for all to authenticated
using (public.current_org_id() is null or org_id is null or org_id = public.current_org_id())
with check (public.current_org_id() is null or org_id is null or org_id = public.current_org_id());

alter table public.journal_entry_links enable row level security;
drop policy if exists p_journal_entry_links_org_all on public.journal_entry_links;
create policy p_journal_entry_links_org_all
on public.journal_entry_links
for all to authenticated
using (public.current_org_id() is null or org_id is null or org_id = public.current_org_id())
with check (public.current_org_id() is null or org_id is null or org_id = public.current_org_id());

alter table public.cheques enable row level security;
drop policy if exists p_cheques_org_all on public.cheques;
create policy p_cheques_org_all
on public.cheques
for all to authenticated
using (public.current_org_id() is null or org_id is null or org_id = public.current_org_id())
with check (public.current_org_id() is null or org_id is null or org_id = public.current_org_id());

-- -----------------------------------------------------
-- Notes
-- 1) This phase only adds accounting core schema.
-- 2) Auto-posting execution can be added in app service or DB function in next step.
-- 3) Existing modules (invoices/purchase_invoices) are untouched in this migration.
-- -----------------------------------------------------
