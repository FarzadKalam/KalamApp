-- زیرساخت tenant-safe رزرواسیون: منبع‌ها، رزروها و تنظیمات اختصاصی سازمان.
create table if not exists public.reservation_resources (
  id uuid primary key default gen_random_uuid(), org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  name text not null, system_code text, resource_type text not null default 'other', status text not null default 'active',
  capacity integer not null default 1 check (capacity > 0), preparation_minutes integer not null default 0 check (preparation_minutes >= 0), cleanup_minutes integer not null default 0 check (cleanup_minutes >= 0),
  image_url text, description text, assignee_id uuid, tags jsonb not null default '[]'::jsonb,
  created_by uuid, updated_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(), org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  name text not null, system_code text, status text not null default 'pending', customer_id uuid references public.customers(id) on delete restrict,
  assignee_id uuid, start_at timestamptz not null, end_at timestamptz not null, sales_invoice_id uuid references public.invoices(id) on delete set null,
  deposit_amount numeric not null default 0 check (deposit_amount >= 0), notes text,
  process_template_id uuid references public.process_templates(id) on delete set null,
  execution_process_draft jsonb,
  "reservationItems" jsonb not null default '[]'::jsonb, tags jsonb not null default '[]'::jsonb,
  created_by uuid, updated_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint reservations_end_after_start check (end_at > start_at)
);

alter table if exists public.company_settings add column if not exists reservation_settings jsonb not null default '{}'::jsonb;
alter table if exists public.invoices add column if not exists reservation_id uuid references public.reservations(id) on delete set null;

create index if not exists reservation_resources_org_status_idx on public.reservation_resources (org_id, status, name);
create index if not exists reservations_org_schedule_idx on public.reservations (org_id, start_at, end_at);
create index if not exists reservations_org_customer_idx on public.reservations (org_id, customer_id, start_at desc);
create index if not exists invoices_reservation_id_idx on public.invoices (reservation_id) where reservation_id is not null;
create unique index if not exists reservation_resources_org_system_code_uidx on public.reservation_resources (org_id, system_code) where system_code is not null;
create unique index if not exists reservations_org_system_code_uidx on public.reservations (org_id, system_code) where system_code is not null;

alter table public.reservation_resources enable row level security;
alter table public.reservations enable row level security;

drop policy if exists reservation_resources_tenant_access on public.reservation_resources;
create policy reservation_resources_tenant_access on public.reservation_resources for all to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
drop policy if exists reservations_tenant_access on public.reservations;
create policy reservations_tenant_access on public.reservations for all to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());

grant select, insert, update, delete on public.reservation_resources to authenticated;
grant select, insert, update, delete on public.reservations to authenticated;

drop trigger if exists reservation_resources_assign_system_code on public.reservation_resources;
create trigger reservation_resources_assign_system_code
before insert on public.reservation_resources
for each row execute function public.assign_system_code_from_module_settings();

drop trigger if exists reservations_assign_system_code on public.reservations;
create trigger reservations_assign_system_code
before insert on public.reservations
for each row execute function public.assign_system_code_from_module_settings();

drop trigger if exists reservation_resources_set_updated_at on public.reservation_resources;
create trigger reservation_resources_set_updated_at
before update on public.reservation_resources
for each row execute function public.set_updated_at();

drop trigger if exists reservations_set_updated_at on public.reservations;
create trigger reservations_set_updated_at
before update on public.reservations
for each row execute function public.set_updated_at();
