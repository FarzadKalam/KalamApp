-- =====================================================
-- KalamApp - Phase 43 Customer import and assignee alignment
-- Date: 2026-03-25
-- Type: Additive / idempotent migration
-- Goal: add missing customer import fields and align assignee type support across modules
-- =====================================================

begin;

alter table if exists public.customers
  add column if not exists email text,
  add column if not exists assistant_phone text,
  add column if not exists lead_source text,
  add column if not exists referrer_module text,
  add column if not exists referrer_customer_id uuid,
  add column if not exists referrer_employee_id uuid,
  add column if not exists referrer_supplier_id uuid,
  add column if not exists first_purchase_date date,
  add column if not exists last_purchase_date date,
  add column if not exists purchase_count numeric(18,3) not null default 0,
  add column if not exists total_spend numeric(18,2) not null default 0,
  add column if not exists total_paid_amount numeric(18,2) not null default 0,
  add column if not exists organization_position text,
  add column if not exists acquaintance_days integer,
  add column if not exists cooperation_days integer,
  add column if not exists customer_interests jsonb not null default '[]'::jsonb,
  add column if not exists assignee_id uuid,
  add column if not exists assignee_type text default 'user';

alter table if exists public.products
  add column if not exists assignee_type text default 'user';

alter table if exists public.production_orders
  add column if not exists assignee_type text default 'user';

alter table if exists public.invoices
  add column if not exists assignee_type text default 'user';

alter table if exists public.purchase_invoices
  add column if not exists assignee_type text default 'user';

alter table if exists public.tasks
  add column if not exists assignee_type text default 'user';

update public.customers
set
  purchase_count = coalesce(purchase_count, 0),
  total_spend = coalesce(total_spend, 0),
  total_paid_amount = coalesce(total_paid_amount, 0),
  customer_interests = coalesce(customer_interests, '[]'::jsonb),
  assignee_type = case
    when coalesce(assignee_type, '') <> '' then assignee_type
    when assignee_id is not null then 'user'
    else assignee_type
  end
where
  purchase_count is null
  or total_spend is null
  or total_paid_amount is null
  or customer_interests is null
  or (assignee_id is not null and coalesce(assignee_type, '') = '');

update public.products
set assignee_type = 'user'
where assignee_id is not null
  and coalesce(assignee_type, '') = '';

update public.production_orders
set assignee_type = 'user'
where assignee_id is not null
  and coalesce(assignee_type, '') = '';

update public.invoices
set assignee_type = 'user'
where assignee_id is not null
  and coalesce(assignee_type, '') = '';

update public.purchase_invoices
set assignee_type = 'user'
where assignee_id is not null
  and coalesce(assignee_type, '') = '';

update public.tasks
set assignee_type = case
  when assignee_role_id is not null then 'role'
  when assignee_id is not null then 'user'
  else assignee_type
end
where coalesce(assignee_type, '') = '';

alter table if exists public.customers
  alter column purchase_count set default 0,
  alter column total_spend set default 0,
  alter column total_paid_amount set default 0,
  alter column customer_interests set default '[]'::jsonb,
  alter column assignee_type set default 'user';

alter table if exists public.customers
  drop constraint if exists chk_customers_referrer_module;

alter table if exists public.customers
  add constraint chk_customers_referrer_module
  check (
    referrer_module is null
    or referrer_module in ('customers', 'employees', 'suppliers')
  );

do $$
begin
  if to_regclass('public.profiles') is not null
     and not exists (select 1 from pg_constraint where conname = 'customers_assignee_id_fkey') then
    alter table public.customers
      add constraint customers_assignee_id_fkey
      foreign key (assignee_id) references public.profiles(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customers_referrer_customer_id_fkey') then
    alter table public.customers
      add constraint customers_referrer_customer_id_fkey
      foreign key (referrer_customer_id) references public.customers(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if to_regclass('public.employees') is not null
     and not exists (select 1 from pg_constraint where conname = 'customers_referrer_employee_id_fkey') then
    alter table public.customers
      add constraint customers_referrer_employee_id_fkey
      foreign key (referrer_employee_id) references public.employees(id) on delete set null
      not valid;
  end if;
end $$;

do $$
begin
  if to_regclass('public.suppliers') is not null
     and not exists (select 1 from pg_constraint where conname = 'customers_referrer_supplier_id_fkey') then
    alter table public.customers
      add constraint customers_referrer_supplier_id_fkey
      foreign key (referrer_supplier_id) references public.suppliers(id) on delete set null
      not valid;
  end if;
end $$;

create index if not exists idx_customers_assignee
  on public.customers(assignee_id)
  where assignee_id is not null;

create index if not exists idx_customers_referrer_customer
  on public.customers(referrer_customer_id)
  where referrer_customer_id is not null;

create index if not exists idx_customers_referrer_employee
  on public.customers(referrer_employee_id)
  where referrer_employee_id is not null;

create index if not exists idx_customers_referrer_supplier
  on public.customers(referrer_supplier_id)
  where referrer_supplier_id is not null;

commit;
