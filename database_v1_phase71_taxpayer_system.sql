-- KalamApp V1 - Phase 71
-- Direct taxpayer-system integration foundation for sales invoices.

begin;

alter table if exists public.company_settings
  add column if not exists economic_code text,
  add column if not exists registration_number text,
  add column if not exists postal_code text;

alter table if exists public.customers
  add column if not exists person_type text,
  add column if not exists legal_name text,
  add column if not exists national_code text,
  add column if not exists national_id text,
  add column if not exists registration_number text,
  add column if not exists economic_code text,
  add column if not exists postal_code text;

alter table if exists public.products
  add column if not exists product_identifier text,
  add column if not exists vat_percentage numeric(8,4) not null default 10,
  add column if not exists is_vat_exempt boolean not null default false;

alter table if exists public.invoices
  add column if not exists taxpayer_invoice_type text not null default '1',
  add column if not exists taxpayer_invoice_pattern text not null default '1',
  add column if not exists taxpayer_invoice_subject text not null default '1',
  add column if not exists taxpayer_settlement_method text;

create table if not exists public.taxpayer_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  provider text not null default 'self_tsp',
  base_url text not null default 'https://tp.tax.gov.ir/req',
  fiscal_id text not null default '',
  seller_economic_code text,
  private_key_encrypted text,
  public_key text,
  certificate_pem text,
  signature_key_id text,
  legacy_last_serial bigint not null default 0,
  server_information jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.taxpayer_settings
  add column if not exists provider text not null default 'self_tsp',
  add column if not exists base_url text not null default 'https://tp.tax.gov.ir/req',
  add column if not exists fiscal_id text not null default '',
  add column if not exists seller_economic_code text,
  add column if not exists private_key_encrypted text,
  add column if not exists public_key text,
  add column if not exists certificate_pem text,
  add column if not exists signature_key_id text,
  add column if not exists legacy_last_serial bigint not null default 0,
  add column if not exists server_information jsonb not null default '{}'::jsonb,
  add column if not exists is_active boolean not null default false,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_taxpayer_settings_org_id
  on public.taxpayer_settings(org_id);

create table if not exists public.taxpayer_invoice_sequences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  fiscal_id text not null,
  last_serial bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.taxpayer_invoice_sequences
  add column if not exists org_id uuid references public.organizations(id) on delete cascade,
  add column if not exists fiscal_id text,
  add column if not exists last_serial bigint not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_taxpayer_invoice_sequences_org_fiscal
  on public.taxpayer_invoice_sequences(org_id, fiscal_id);

create table if not exists public.taxpayer_invoice_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  invoice_id uuid references public.invoices(id) on delete cascade,
  fiscal_id text not null,
  internal_serial bigint,
  taxid text,
  uid text,
  reference_number text,
  status text not null default 'draft',
  invoice_type text,
  invoice_pattern text,
  invoice_subject text,
  settlement_method text,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  inquiry_payload jsonb not null default '{}'::jsonb,
  error_message text,
  sent_at timestamptz,
  last_inquiry_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.taxpayer_invoice_submissions
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists invoice_id uuid references public.invoices(id) on delete cascade,
  add column if not exists fiscal_id text,
  add column if not exists internal_serial bigint,
  add column if not exists taxid text,
  add column if not exists uid text,
  add column if not exists reference_number text,
  add column if not exists status text not null default 'draft',
  add column if not exists invoice_type text,
  add column if not exists invoice_pattern text,
  add column if not exists invoice_subject text,
  add column if not exists settlement_method text,
  add column if not exists request_payload jsonb not null default '{}'::jsonb,
  add column if not exists response_payload jsonb not null default '{}'::jsonb,
  add column if not exists inquiry_payload jsonb not null default '{}'::jsonb,
  add column if not exists error_message text,
  add column if not exists sent_at timestamptz,
  add column if not exists last_inquiry_at timestamptz,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_taxpayer_invoice_submissions_invoice
  on public.taxpayer_invoice_submissions(invoice_id, created_at desc);

create index if not exists idx_taxpayer_invoice_submissions_org_status
  on public.taxpayer_invoice_submissions(org_id, status, created_at desc);

create index if not exists idx_taxpayer_invoice_submissions_uid
  on public.taxpayer_invoice_submissions(uid)
  where uid is not null and uid <> '';

create or replace function public.reserve_taxpayer_invoice_serial(
  p_org_id uuid,
  p_fiscal_id text,
  p_min_last_serial bigint default 0
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_serial bigint;
  v_fiscal_id text := upper(nullif(btrim(coalesce(p_fiscal_id, '')), ''));
  v_min_last_serial bigint := greatest(coalesce(p_min_last_serial, 0), 0);
begin
  if p_org_id is null then
    raise exception 'org_id is required';
  end if;

  if v_fiscal_id is null then
    raise exception 'fiscal_id is required';
  end if;

  insert into public.taxpayer_invoice_sequences (org_id, fiscal_id, last_serial)
  values (p_org_id, v_fiscal_id, v_min_last_serial + 1)
  on conflict (org_id, fiscal_id)
  do update set
    last_serial = greatest(public.taxpayer_invoice_sequences.last_serial, v_min_last_serial) + 1,
    updated_at = now()
  returning last_serial into v_serial;

  return v_serial;
end;
$$;

revoke all on public.taxpayer_settings from anon, authenticated;
revoke all on public.taxpayer_invoice_sequences from anon, authenticated;
revoke all on public.taxpayer_invoice_submissions from anon, authenticated;
revoke all on function public.reserve_taxpayer_invoice_serial(uuid, text, bigint) from public;

grant all on public.taxpayer_settings to service_role;
grant all on public.taxpayer_invoice_sequences to service_role;
grant select on public.taxpayer_invoice_submissions to authenticated;
grant all on public.taxpayer_invoice_submissions to service_role;
grant execute on function public.reserve_taxpayer_invoice_serial(uuid, text, bigint) to service_role;

alter table public.taxpayer_settings enable row level security;
alter table public.taxpayer_invoice_sequences enable row level security;
alter table public.taxpayer_invoice_submissions enable row level security;

drop policy if exists p_taxpayer_settings_service_role on public.taxpayer_settings;
create policy p_taxpayer_settings_service_role
on public.taxpayer_settings
for all
to service_role
using (true)
with check (true);

drop policy if exists p_taxpayer_invoice_sequences_service_role on public.taxpayer_invoice_sequences;
create policy p_taxpayer_invoice_sequences_service_role
on public.taxpayer_invoice_sequences
for all
to service_role
using (true)
with check (true);

drop policy if exists p_taxpayer_invoice_submissions_select on public.taxpayer_invoice_submissions;
create policy p_taxpayer_invoice_submissions_select
on public.taxpayer_invoice_submissions
for select
to authenticated
using (public.current_org_id() is null or org_id is null or org_id = public.current_org_id());

drop policy if exists p_taxpayer_invoice_submissions_service_role on public.taxpayer_invoice_submissions;
create policy p_taxpayer_invoice_submissions_service_role
on public.taxpayer_invoice_submissions
for all
to service_role
using (true)
with check (true);

commit;
