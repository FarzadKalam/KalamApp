-- Phase 21: Product/Customer extensions + Ready Texts + Audit autofill

alter table public.products
  add column if not exists goods_subgroup text,
  add column if not exists service_subgroup text,
  add column if not exists material_type text,
  add column if not exists color_name text,
  add column if not exists feature_name text,
  add column if not exists size_value text,
  add column if not exists quality_level text,
  add column if not exists length_value numeric(18,3),
  add column if not exists width_value numeric(18,3),
  add column if not exists crm_code text,
  add column if not exists product_identifier bigint,
  add column if not exists commission_percentage numeric(10,4),
  add column if not exists accounting_code text;

alter table public.invoices
  add column if not exists notify_customer boolean not null default false;

alter table public.customers
  add column if not exists full_name text,
  add column if not exists legal_name text,
  add column if not exists is_employee boolean not null default false,
  add column if not exists related_employee_id uuid references public.profiles(id) on delete set null,
  add column if not exists industry text;

alter table public.suppliers
  add column if not exists is_employee boolean not null default false,
  add column if not exists related_employee_id uuid references public.profiles(id) on delete set null;

-- One-time backfill for customer full_name
update public.customers
set full_name = trim(
  regexp_replace(
    concat_ws(' ',
      nullif(prefix, ''),
      nullif(first_name, ''),
      nullif(last_name, ''),
      nullif(business_name, '')
    ),
    '\s+',
    ' ',
    'g'
  )
)
where coalesce(full_name, '') = '';

create table if not exists public.ready_texts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  module_id text,
  title text not null,
  content text not null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ready_texts_org_module_created_at
  on public.ready_texts(org_id, module_id, created_at desc);

create or replace function public.set_audit_user_fields()
returns trigger
language plpgsql
security definer
as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by := auth.uid();
    end if;
  end if;

  if new.updated_by is null then
    new.updated_by := auth.uid();
  else
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_audit_products on public.products;
create trigger trg_audit_products
before insert or update on public.products
for each row execute function public.set_audit_user_fields();

drop trigger if exists trg_audit_customers on public.customers;
create trigger trg_audit_customers
before insert or update on public.customers
for each row execute function public.set_audit_user_fields();

drop trigger if exists trg_audit_suppliers on public.suppliers;
create trigger trg_audit_suppliers
before insert or update on public.suppliers
for each row execute function public.set_audit_user_fields();

drop trigger if exists trg_audit_invoices on public.invoices;
create trigger trg_audit_invoices
before insert or update on public.invoices
for each row execute function public.set_audit_user_fields();

drop trigger if exists trg_audit_purchase_invoices on public.purchase_invoices;
create trigger trg_audit_purchase_invoices
before insert or update on public.purchase_invoices
for each row execute function public.set_audit_user_fields();
