-- =====================================================
-- KalamApp - Phase 42 Customer fields and assignee type alignment
-- Date: 2026-03-25
-- Type: Additive / non-breaking migration
-- Goal: add missing customer CRM fields and enable user/team assignee selection across assignee-enabled modules
-- =====================================================

begin;

alter table if exists public.customers
  add column if not exists email text,
  add column if not exists assistant_phone text,
  add column if not exists referrer_module text,
  add column if not exists referrer_customer_id uuid references public.customers(id) on delete set null,
  add column if not exists referrer_employee_id uuid references public.employees(id) on delete set null,
  add column if not exists referrer_supplier_id uuid references public.suppliers(id) on delete set null,
  add column if not exists total_paid_amount numeric(18,2) not null default 0,
  add column if not exists organization_position text,
  add column if not exists acquaintance_days integer,
  add column if not exists cooperation_days integer,
  add column if not exists customer_interests jsonb not null default '[]'::jsonb,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_type text default 'user';

alter table if exists public.products
  add column if not exists assignee_type text default 'user';

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

update public.customers
set assignee_type = 'user'
where assignee_id is not null
  and coalesce(assignee_type, '') = '';

alter table if exists public.customers
  drop constraint if exists chk_customers_referrer_module;

alter table if exists public.customers
  add constraint chk_customers_referrer_module
  check (referrer_module is null or referrer_module in ('customers', 'employees', 'suppliers'));

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
