-- =====================================================
-- KalamApp - Phase 50 Global Assignee Role Alignment
-- Date: 2026-03-26
-- Type: Additive / idempotent migration
-- Goal: align role-based assignee support across system-assignee modules
-- =====================================================

begin;

alter table if exists public.customers
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null;

alter table if exists public.production_orders
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null;

alter table if exists public.invoices
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null;

alter table if exists public.purchase_invoices
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null;

alter table if exists public.attendance_logs
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null;

update public.customers
set assignee_type = case
  when assignee_role_id is not null then 'role'
  when assignee_id is not null then 'user'
  else assignee_type
end
where assignee_role_id is not null
   or (assignee_id is not null and coalesce(assignee_type, '') = '');

update public.production_orders
set assignee_type = case
  when assignee_role_id is not null then 'role'
  when assignee_id is not null then 'user'
  else assignee_type
end
where assignee_role_id is not null
   or (assignee_id is not null and coalesce(assignee_type, '') = '');

update public.invoices
set assignee_type = case
  when assignee_role_id is not null then 'role'
  when assignee_id is not null then 'user'
  else assignee_type
end
where assignee_role_id is not null
   or (assignee_id is not null and coalesce(assignee_type, '') = '');

update public.purchase_invoices
set assignee_type = case
  when assignee_role_id is not null then 'role'
  when assignee_id is not null then 'user'
  else assignee_type
end
where assignee_role_id is not null
   or (assignee_id is not null and coalesce(assignee_type, '') = '');

update public.attendance_logs
set assignee_type = case
  when assignee_role_id is not null then 'role'
  when assignee_id is not null then 'user'
  else assignee_type
end
where assignee_role_id is not null
   or (assignee_id is not null and coalesce(assignee_type, '') = '');

create index if not exists idx_customers_assignee_scope
  on public.customers(assignee_id, assignee_role_id);

create index if not exists idx_production_orders_assignee_scope
  on public.production_orders(assignee_id, assignee_role_id);

create index if not exists idx_invoices_assignee_scope
  on public.invoices(assignee_id, assignee_role_id);

create index if not exists idx_purchase_invoices_assignee_scope
  on public.purchase_invoices(assignee_id, assignee_role_id);

create index if not exists idx_attendance_logs_assignee_scope
  on public.attendance_logs(assignee_id, assignee_role_id);

commit;
