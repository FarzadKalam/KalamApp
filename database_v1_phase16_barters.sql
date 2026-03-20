-- =====================================================
-- KalamApp - Phase 16 Barters Module
-- Date: 2026-03-20
-- Type: Additive / non-breaking migration
-- Prerequisite: database_v1_phase14_identity_profiles_compat.sql
-- =====================================================

begin;

create table if not exists public.barters (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null default public.current_org_id(),
  name text not null,
  system_code text,
  barter_date date not null default current_date,
  barter_type text not null default 'incoming',
  status text not null default 'open',
  initial_amount numeric(18,2) not null default 0,
  spent_amount numeric(18,2) not null default 0,
  remaining_amount numeric(18,2) not null default 0,
  customer_id uuid references public.customers(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  employee_id uuid references public.profiles(id) on delete set null,
  source_invoice_id uuid references public.invoices(id) on delete set null,
  source_purchase_invoice_id uuid references public.purchase_invoices(id) on delete set null,
  allocations jsonb not null default '[]'::jsonb,
  notes text,
  attachment_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_barters_type') then
    alter table public.barters
      add constraint chk_barters_type
      check (barter_type in ('incoming', 'outgoing'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_barters_status') then
    alter table public.barters
      add constraint chk_barters_status
      check (status in ('open', 'partial', 'closed', 'canceled'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_barters_amount_non_negative') then
    alter table public.barters
      add constraint chk_barters_amount_non_negative
      check (initial_amount >= 0 and spent_amount >= 0 and remaining_amount >= 0);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_barters_remaining_le_initial') then
    alter table public.barters
      add constraint chk_barters_remaining_le_initial
      check (remaining_amount <= initial_amount);
  end if;
end $$;

create index if not exists idx_barters_org_date on public.barters(org_id, barter_date desc);
create index if not exists idx_barters_org_status on public.barters(org_id, status, created_at desc);
create index if not exists idx_barters_customer on public.barters(customer_id) where customer_id is not null;
create index if not exists idx_barters_supplier on public.barters(supplier_id) where supplier_id is not null;

create unique index if not exists idx_barters_org_system_code
  on public.barters(org_id, system_code)
  where system_code is not null and system_code <> '';

update public.barters b
set system_code = 'BRT-' || right(replace(b.id::text, '-', ''), 8)
where (b.system_code is null or b.system_code = '');

drop trigger if exists trg_barters_updated_at on public.barters;
create trigger trg_barters_updated_at
before update on public.barters
for each row execute function public.set_updated_at();

alter table public.barters enable row level security;
drop policy if exists p_barters_org_all on public.barters;
create policy p_barters_org_all
on public.barters
for all to authenticated
using (public.current_org_id() is null or org_id is null or org_id = public.current_org_id())
with check (public.current_org_id() is null or org_id is null or org_id = public.current_org_id());

commit;
