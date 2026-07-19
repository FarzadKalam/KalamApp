-- اتصال نقش‌های مالی مشتری، تامین‌کننده و کارمند
-- قابل اجرا به‌صورت تکراری و محدود به سازمان جاری

begin;

alter table if exists public.customers
  add column if not exists linked_employee_id uuid references public.employees(id) on delete set null;

alter table if exists public.suppliers
  add column if not exists linked_employee_id uuid references public.employees(id) on delete set null;

alter table if exists public.employees
  add column if not exists is_customer boolean not null default false,
  add column if not exists is_supplier boolean not null default false,
  add column if not exists linked_customer_id uuid references public.customers(id) on delete set null,
  add column if not exists linked_supplier_id uuid references public.suppliers(id) on delete set null;

create index if not exists idx_customers_org_linked_employee
  on public.customers(org_id, linked_employee_id) where linked_employee_id is not null;
create index if not exists idx_suppliers_org_linked_employee
  on public.suppliers(org_id, linked_employee_id) where linked_employee_id is not null;
create index if not exists idx_employees_org_linked_customer
  on public.employees(org_id, linked_customer_id) where linked_customer_id is not null;
create index if not exists idx_employees_org_linked_supplier
  on public.employees(org_id, linked_supplier_id) where linked_supplier_id is not null;

create or replace function public.validate_counterparty_financial_role_links()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'customers' then
    if new.linked_supplier_id is not null and not exists (
      select 1 from public.suppliers where id = new.linked_supplier_id and org_id = new.org_id
    ) then raise exception 'تامین‌کننده مرتبط باید متعلق به همین سازمان باشد'; end if;
    if new.linked_employee_id is not null and not exists (
      select 1 from public.employees where id = new.linked_employee_id and org_id = new.org_id
    ) then raise exception 'کارمند مرتبط باید متعلق به همین سازمان باشد'; end if;
  elsif tg_table_name = 'suppliers' then
    if new.linked_customer_id is not null and not exists (
      select 1 from public.customers where id = new.linked_customer_id and org_id = new.org_id
    ) then raise exception 'مشتری مرتبط باید متعلق به همین سازمان باشد'; end if;
    if new.linked_employee_id is not null and not exists (
      select 1 from public.employees where id = new.linked_employee_id and org_id = new.org_id
    ) then raise exception 'کارمند مرتبط باید متعلق به همین سازمان باشد'; end if;
  elsif tg_table_name = 'employees' then
    if new.linked_customer_id is not null and not exists (
      select 1 from public.customers where id = new.linked_customer_id and org_id = new.org_id
    ) then raise exception 'مشتری مرتبط باید متعلق به همین سازمان باشد'; end if;
    if new.linked_supplier_id is not null and not exists (
      select 1 from public.suppliers where id = new.linked_supplier_id and org_id = new.org_id
    ) then raise exception 'تامین‌کننده مرتبط باید متعلق به همین سازمان باشد'; end if;
  end if;
  return new;
end;
$$;

create or replace function public.sync_employee_counterparty_financial_role_links()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;

  if tg_table_name = 'customers' then
    if coalesce(new.is_employee, false) and new.linked_employee_id is not null then
      update public.employees
      set is_customer = true, linked_customer_id = new.id, updated_at = now()
      where id = new.linked_employee_id and org_id = new.org_id;
    elsif not coalesce(new.is_employee, false) then
      update public.employees set is_customer = false, updated_at = now()
      where linked_customer_id = new.id and org_id = new.org_id;
    end if;
  elsif tg_table_name = 'suppliers' then
    if coalesce(new.is_employee, false) and new.linked_employee_id is not null then
      update public.employees
      set is_supplier = true, linked_supplier_id = new.id, updated_at = now()
      where id = new.linked_employee_id and org_id = new.org_id;
    elsif not coalesce(new.is_employee, false) then
      update public.employees set is_supplier = false, updated_at = now()
      where linked_supplier_id = new.id and org_id = new.org_id;
    end if;
  elsif tg_table_name = 'employees' then
    if coalesce(new.is_customer, false) and new.linked_customer_id is not null then
      update public.customers
      set is_employee = true, linked_employee_id = new.id, updated_at = now()
      where id = new.linked_customer_id and org_id = new.org_id;
    end if;
    if coalesce(new.is_supplier, false) and new.linked_supplier_id is not null then
      update public.suppliers
      set is_employee = true, linked_employee_id = new.id, updated_at = now()
      where id = new.linked_supplier_id and org_id = new.org_id;
    end if;
    if not coalesce(new.is_customer, false) then
      update public.customers set is_employee = false, updated_at = now()
      where linked_employee_id = new.id and org_id = new.org_id;
    end if;
    if not coalesce(new.is_supplier, false) then
      update public.suppliers set is_employee = false, updated_at = now()
      where linked_employee_id = new.id and org_id = new.org_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_customers_validate_financial_role_links on public.customers;
create trigger trg_customers_validate_financial_role_links before insert or update on public.customers
for each row execute function public.validate_counterparty_financial_role_links();
drop trigger if exists trg_suppliers_validate_financial_role_links on public.suppliers;
create trigger trg_suppliers_validate_financial_role_links before insert or update on public.suppliers
for each row execute function public.validate_counterparty_financial_role_links();
drop trigger if exists trg_employees_validate_financial_role_links on public.employees;
create trigger trg_employees_validate_financial_role_links before insert or update on public.employees
for each row execute function public.validate_counterparty_financial_role_links();

drop trigger if exists trg_customers_sync_employee_financial_role_link on public.customers;
create trigger trg_customers_sync_employee_financial_role_link before insert or update on public.customers
for each row execute function public.sync_employee_counterparty_financial_role_links();
drop trigger if exists trg_suppliers_sync_employee_financial_role_link on public.suppliers;
create trigger trg_suppliers_sync_employee_financial_role_link before insert or update on public.suppliers
for each row execute function public.sync_employee_counterparty_financial_role_links();
drop trigger if exists trg_employees_sync_counterparty_financial_role_links on public.employees;
create trigger trg_employees_sync_counterparty_financial_role_links before insert or update on public.employees
for each row execute function public.sync_employee_counterparty_financial_role_links();

revoke all on function public.validate_counterparty_financial_role_links() from public;
revoke all on function public.sync_employee_counterparty_financial_role_links() from public;

commit;
