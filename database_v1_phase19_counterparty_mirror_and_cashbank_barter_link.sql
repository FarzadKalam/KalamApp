-- =====================================================
-- KalamApp - Phase 19 Counterparty Mirror + Cash/Bank Barter Link
-- Date: 2026-03-20
-- Type: Additive / non-breaking migration
-- Prerequisite:
--   - database_v1_phase9_cash_bank_operations.sql
--   - database_v1_phase16_barters.sql
-- =====================================================

begin;

-- -----------------------------------------------------
-- cash_bank_operations: add barter relation
-- -----------------------------------------------------

alter table if exists public.cash_bank_operations
  add column if not exists barter_id uuid references public.barters(id) on delete set null;

create index if not exists idx_cash_bank_operations_barter
  on public.cash_bank_operations(barter_id)
  where barter_id is not null;

alter table if exists public.cash_bank_operations
  drop constraint if exists chk_cash_bank_operations_payment_type;

alter table if exists public.cash_bank_operations
  add constraint chk_cash_bank_operations_payment_type
  check (payment_type in ('cash', 'card', 'transfer', 'cheque', 'online', 'barter'));

alter table if exists public.cash_bank_operations
  drop constraint if exists chk_cash_bank_operations_linked_entity;

alter table if exists public.cash_bank_operations
  add constraint chk_cash_bank_operations_linked_entity
  check (
    sales_invoice_id is not null
    or purchase_invoice_id is not null
    or customer_id is not null
    or supplier_id is not null
    or employee_id is not null
    or barter_id is not null
  );

-- -----------------------------------------------------
-- customers/suppliers: dual-role flags + mirror links
-- -----------------------------------------------------

alter table if exists public.customers
  add column if not exists is_supplier boolean not null default false,
  add column if not exists linked_supplier_id uuid references public.suppliers(id) on delete set null;

alter table if exists public.suppliers
  add column if not exists is_customer boolean not null default false,
  add column if not exists linked_customer_id uuid references public.customers(id) on delete set null;

create index if not exists idx_customers_linked_supplier_id
  on public.customers(linked_supplier_id)
  where linked_supplier_id is not null;

create index if not exists idx_suppliers_linked_customer_id
  on public.suppliers(linked_customer_id)
  where linked_customer_id is not null;

-- -----------------------------------------------------
-- Mirror sync: customer -> supplier
-- -----------------------------------------------------

create or replace function public.sync_customer_supplier_mirror()
returns trigger
language plpgsql
as $$
declare
  v_supplier_id uuid;
  v_business_name text;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if not coalesce(new.is_supplier, false) then
    if new.linked_supplier_id is not null then
      update public.suppliers s
      set is_customer = false
      where s.id = new.linked_supplier_id
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
    perform 1 from public.suppliers where id = v_supplier_id;
    if not found then
      v_supplier_id := null;
    end if;
  end if;

  if v_supplier_id is null then
    select s.id
    into v_supplier_id
    from public.suppliers s
    where s.linked_customer_id = new.id
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
    where s.id = v_supplier_id;
  end if;

  new.linked_supplier_id := v_supplier_id;
  return new;
end;
$$;

drop trigger if exists trg_customers_sync_supplier_mirror on public.customers;
create trigger trg_customers_sync_supplier_mirror
before insert or update on public.customers
for each row execute function public.sync_customer_supplier_mirror();

-- -----------------------------------------------------
-- Mirror sync: supplier -> customer
-- -----------------------------------------------------

create or replace function public.sync_supplier_customer_mirror()
returns trigger
language plpgsql
as $$
declare
  v_customer_id uuid;
  v_first_name text;
  v_last_name text;
  v_business_name text;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if not coalesce(new.is_customer, false) then
    if new.linked_customer_id is not null then
      update public.customers c
      set is_supplier = false
      where c.id = new.linked_customer_id
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
    perform 1 from public.customers where id = v_customer_id;
    if not found then
      v_customer_id := null;
    end if;
  end if;

  if v_customer_id is null then
    select c.id
    into v_customer_id
    from public.customers c
    where c.linked_supplier_id = new.id
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
    where c.id = v_customer_id;
  end if;

  new.linked_customer_id := v_customer_id;
  return new;
end;
$$;

drop trigger if exists trg_suppliers_sync_customer_mirror on public.suppliers;
create trigger trg_suppliers_sync_customer_mirror
before insert or update on public.suppliers
for each row execute function public.sync_supplier_customer_mirror();

-- Optional backfill for already-flagged records
update public.customers
set is_supplier = is_supplier
where is_supplier = true;

update public.suppliers
set is_customer = is_customer
where is_customer = true;

commit;
