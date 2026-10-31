-- Phase 567: avoid same-command row conflicts during linked-party balance updates.
-- Propagation runs AFTER the source row is stored; generated mirror IDs are
-- persisted with an org-scoped, distinct-only update guarded by trigger depth.
-- Only changes to mirrored identity/role fields may propagate to another row.
-- Financial summaries, opening balances and audit-only edits must not mirror.
-- Existing org scopes, trigger-depth guards, RLS, validation and grants remain.
begin;

create or replace function public.sync_customer_supplier_mirror()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_supplier_id uuid;
  v_business_name text;
begin

  if tg_op = 'UPDATE' and row(new.org_id, new.business_name, new.first_name, new.last_name, new.mobile_1, new.mobile_2, new.phone, new.prefix, new.province, new.city, new.address, new.location, new.image_url, new.is_supplier, new.linked_supplier_id)
     is not distinct from row(old.org_id, old.business_name, old.first_name, old.last_name, old.mobile_1, old.mobile_2, old.phone, old.prefix, old.province, old.city, old.address, old.location, old.image_url, old.is_supplier, old.linked_supplier_id) then
    return new;
  end if;
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if not coalesce(new.is_supplier, false) then
    if new.linked_supplier_id is not null then
      update public.suppliers s
      set is_customer = false
      where s.id = new.linked_supplier_id
        and s.org_id = new.org_id
        and s.linked_customer_id = new.id;
    end if;
    return new;
  end if;

  v_supplier_id := new.linked_supplier_id;
  v_business_name := nullif(trim(coalesce(new.business_name, '')), '');
  if v_business_name is null then
    v_business_name := nullif(trim(concat_ws(' ', new.first_name, new.last_name)), '');
  end if;
  if v_business_name is null then
    v_business_name := 'طرف حساب';
  end if;

  if v_supplier_id is not null then
    perform 1 from public.suppliers where id = v_supplier_id and org_id = new.org_id;
    if not found then
      v_supplier_id := null;
    end if;
  end if;

  if v_supplier_id is null then
    select s.id
    into v_supplier_id
    from public.suppliers s
    where s.linked_customer_id = new.id
      and s.org_id = new.org_id
    limit 1;
  end if;

  if v_supplier_id is null then
    insert into public.suppliers (
      org_id,
      business_name,
      first_name,
      last_name,
      mobile_1,
      mobile_2,
      phone,
      prefix,
      province,
      city,
      address,
      location,
      image_url,
      is_customer,
      linked_customer_id,
      created_by,
      updated_by
    ) values (
      new.org_id,
      v_business_name,
      new.first_name,
      new.last_name,
      new.mobile_1,
      new.mobile_2,
      new.phone,
      new.prefix,
      new.province,
      new.city,
      new.address,
      new.location,
      new.image_url,
      true,
      new.id,
      new.created_by,
      new.updated_by
    )
    returning id into v_supplier_id;
  else
    update public.suppliers s
    set
      org_id = coalesce(new.org_id, s.org_id),
      business_name = coalesce(v_business_name, s.business_name),
      first_name = coalesce(new.first_name, s.first_name),
      last_name = coalesce(new.last_name, s.last_name),
      mobile_1 = coalesce(new.mobile_1, s.mobile_1),
      mobile_2 = coalesce(new.mobile_2, s.mobile_2),
      phone = coalesce(new.phone, s.phone),
      prefix = coalesce(new.prefix, s.prefix),
      province = coalesce(new.province, s.province),
      city = coalesce(new.city, s.city),
      address = coalesce(new.address, s.address),
      location = coalesce(new.location, s.location),
      image_url = coalesce(new.image_url, s.image_url),
      is_customer = true,
      linked_customer_id = new.id,
      updated_by = coalesce(new.updated_by, s.updated_by),
      updated_at = now()
    where s.id = v_supplier_id and s.org_id = new.org_id;
  end if;

  update public.customers set linked_supplier_id = v_supplier_id
  where id = new.id and org_id = new.org_id
    and linked_supplier_id is distinct from v_supplier_id;
  new.linked_supplier_id := v_supplier_id;
  return new;
end;
$$;

create or replace function public.sync_supplier_customer_mirror()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_first_name text;
  v_last_name text;
  v_business_name text;
begin

  if tg_op = 'UPDATE' and row(new.org_id, new.business_name, new.first_name, new.last_name, new.mobile_1, new.mobile_2, new.phone, new.prefix, new.province, new.city, new.address, new.location, new.image_url, new.is_customer, new.linked_customer_id)
     is not distinct from row(old.org_id, old.business_name, old.first_name, old.last_name, old.mobile_1, old.mobile_2, old.phone, old.prefix, old.province, old.city, old.address, old.location, old.image_url, old.is_customer, old.linked_customer_id) then
    return new;
  end if;
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if not coalesce(new.is_customer, false) then
    if new.linked_customer_id is not null then
      update public.customers c
      set is_supplier = false
      where c.id = new.linked_customer_id
        and c.org_id = new.org_id
        and c.linked_supplier_id = new.id;
    end if;
    return new;
  end if;

  v_customer_id := new.linked_customer_id;
  v_business_name := nullif(trim(coalesce(new.business_name, '')), '');
  v_first_name := nullif(trim(coalesce(new.first_name, '')), '');
  v_last_name := nullif(trim(coalesce(new.last_name, '')), '');

  if v_first_name is null then
    v_first_name := coalesce(v_business_name, 'طرف');
  end if;
  if v_last_name is null then
    v_last_name := 'حساب';
  end if;

  if v_customer_id is not null then
    perform 1 from public.customers where id = v_customer_id and org_id = new.org_id;
    if not found then
      v_customer_id := null;
    end if;
  end if;

  if v_customer_id is null then
    select c.id
    into v_customer_id
    from public.customers c
    where c.linked_supplier_id = new.id
      and c.org_id = new.org_id
    limit 1;
  end if;

  if v_customer_id is null then
    insert into public.customers (
      org_id,
      first_name,
      last_name,
      business_name,
      mobile_1,
      mobile_2,
      phone,
      prefix,
      province,
      city,
      address,
      location,
      image_url,
      is_supplier,
      linked_supplier_id,
      created_by,
      updated_by
    ) values (
      new.org_id,
      v_first_name,
      v_last_name,
      v_business_name,
      new.mobile_1,
      new.mobile_2,
      new.phone,
      new.prefix,
      new.province,
      new.city,
      new.address,
      new.location,
      new.image_url,
      true,
      new.id,
      new.created_by,
      new.updated_by
    )
    returning id into v_customer_id;
  else
    update public.customers c
    set
      org_id = coalesce(new.org_id, c.org_id),
      first_name = coalesce(v_first_name, c.first_name),
      last_name = coalesce(v_last_name, c.last_name),
      business_name = coalesce(v_business_name, c.business_name),
      mobile_1 = coalesce(new.mobile_1, c.mobile_1),
      mobile_2 = coalesce(new.mobile_2, c.mobile_2),
      phone = coalesce(new.phone, c.phone),
      prefix = coalesce(new.prefix, c.prefix),
      province = coalesce(new.province, c.province),
      city = coalesce(new.city, c.city),
      address = coalesce(new.address, c.address),
      location = coalesce(new.location, c.location),
      image_url = coalesce(new.image_url, c.image_url),
      is_supplier = true,
      linked_supplier_id = new.id,
      updated_by = coalesce(new.updated_by, c.updated_by),
      updated_at = now()
    where c.id = v_customer_id and c.org_id = new.org_id;
  end if;

  update public.suppliers set linked_customer_id = v_customer_id
  where id = new.id and org_id = new.org_id
    and linked_customer_id is distinct from v_customer_id;
  new.linked_customer_id := v_customer_id;
  return new;
end;
$$;

create or replace function public.sync_employee_counterparty_financial_role_links()
returns trigger
language plpgsql
set search_path = public
as $$
begin

  if tg_op = 'UPDATE' then
    if tg_table_name in ('customers', 'suppliers') then
      if row(new.org_id, new.is_employee, new.linked_employee_id)
         is not distinct from row(old.org_id, old.is_employee, old.linked_employee_id) then
        return new;
      end if;
    elsif tg_table_name = 'employees' then
      if row(new.org_id, new.is_customer, new.is_supplier, new.linked_customer_id, new.linked_supplier_id)
         is not distinct from row(old.org_id, old.is_customer, old.is_supplier, old.linked_customer_id, old.linked_supplier_id) then
        return new;
      end if;
    end if;
  end if;
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


-- BEFORE validation stays in place. All cross-row propagation uses AFTER.
drop trigger if exists trg_customers_sync_supplier_mirror on public.customers;
create trigger trg_customers_sync_supplier_mirror after insert or update on public.customers
for each row execute function public.sync_customer_supplier_mirror();
drop trigger if exists trg_suppliers_sync_customer_mirror on public.suppliers;
create trigger trg_suppliers_sync_customer_mirror after insert or update on public.suppliers
for each row execute function public.sync_supplier_customer_mirror();
drop trigger if exists trg_customers_sync_employee_financial_role_link on public.customers;
create trigger trg_customers_sync_employee_financial_role_link after insert or update on public.customers
for each row execute function public.sync_employee_counterparty_financial_role_links();
drop trigger if exists trg_suppliers_sync_employee_financial_role_link on public.suppliers;
create trigger trg_suppliers_sync_employee_financial_role_link after insert or update on public.suppliers
for each row execute function public.sync_employee_counterparty_financial_role_links();
drop trigger if exists trg_employees_sync_counterparty_financial_role_links on public.employees;
create trigger trg_employees_sync_counterparty_financial_role_links after insert or update on public.employees
for each row execute function public.sync_employee_counterparty_financial_role_links();

commit;
