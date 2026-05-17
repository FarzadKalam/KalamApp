-- =====================================================
-- KalamApp - Phase 150 Demo seed manifest + phone login ready
-- Date: 2026-05-17
-- Type: Additive / non-breaking migration
-- Goal:
--   1) Track seeded demo records for safe cleanup
--   2) Treat confirmed phone users as ready for OTP even if auth.identities is incomplete
--   3) Normalize system org-role label for seeded SaaS admins
-- =====================================================

begin;

create table if not exists public.demo_seed_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  pack_key text not null default 'general_v1',
  industry_key text,
  status text not null default 'seeding',
  seeded_records_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  seeded_by uuid references auth.users(id) on delete set null,
  cleared_by uuid references auth.users(id) on delete set null,
  cleared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.demo_seed_batches
  add constraint chk_demo_seed_batches_status
  check (status in ('seeding', 'seeded', 'clearing', 'cleared', 'failed'));

create index if not exists idx_demo_seed_batches_org_status
  on public.demo_seed_batches(org_id, status, created_at desc);

create table if not exists public.demo_seed_records (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.demo_seed_batches(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete cascade,
  table_name text not null,
  record_id uuid not null,
  delete_order integer not null default 100,
  label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_demo_seed_records_batch_table_record
  on public.demo_seed_records(batch_id, table_name, record_id);

create index if not exists idx_demo_seed_records_org_order
  on public.demo_seed_records(org_id, delete_order desc, created_at desc);

drop trigger if exists trg_demo_seed_batches_updated_at on public.demo_seed_batches;
create trigger trg_demo_seed_batches_updated_at
before update on public.demo_seed_batches
for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.demo_seed_batches to authenticated, service_role;
grant select, insert, update, delete on public.demo_seed_records to authenticated, service_role;

alter table public.demo_seed_batches enable row level security;
alter table public.demo_seed_records enable row level security;

drop policy if exists p_demo_seed_batches_org_select on public.demo_seed_batches;
create policy p_demo_seed_batches_org_select on public.demo_seed_batches
for select
to authenticated
using (
  org_id = public.current_org_id()
);

drop policy if exists p_demo_seed_records_org_select on public.demo_seed_records;
create policy p_demo_seed_records_org_select on public.demo_seed_records
for select
to authenticated
using (
  org_id = public.current_org_id()
);

update public.org_roles
set title = 'ادمین'
where is_system = true
  and lower(coalesce(title, '')) = 'admin';

create or replace function public.check_phone_login_candidate(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_phone text := public.normalize_iran_mobile_e164(p_phone);
  profile_count integer := 0;
  auth_count integer := 0;
  phone_identity_count integer := 0;
  active_profile_exists boolean := false;
begin
  if normalized_phone is null then
    return jsonb_build_object(
      'normalized_phone', null,
      'exists_in_profiles', false,
      'exists_in_auth', false,
      'has_phone_identity', false,
      'is_active', false
    );
  end if;

  with matched_profiles as (
    select
      p.id,
      coalesce(p.is_active, true) as is_active
    from public.profiles p
    left join auth.users u
      on u.id = p.id
    where
      public.normalize_iran_mobile_e164(coalesce(p.mobile_1, p.mobile)) = normalized_phone
      or (
        public.normalize_iran_mobile_e164(coalesce(p.mobile_1, p.mobile)) is null
        and public.normalize_iran_mobile_e164(u.phone) = normalized_phone
      )
  )
  select
    count(*),
    coalesce(bool_or(is_active), false)
  into profile_count, active_profile_exists
  from matched_profiles;

  with matched_profiles as (
    select p.id
    from public.profiles p
    left join auth.users u
      on u.id = p.id
    where
      public.normalize_iran_mobile_e164(coalesce(p.mobile_1, p.mobile)) = normalized_phone
      or (
        public.normalize_iran_mobile_e164(coalesce(p.mobile_1, p.mobile)) is null
        and public.normalize_iran_mobile_e164(u.phone) = normalized_phone
      )
  )
  select count(*)
  into auth_count
  from auth.users u
  where public.normalize_iran_mobile_e164(u.phone) = normalized_phone
    and exists (
      select 1
      from matched_profiles mp
      where mp.id = u.id
    );

  with matched_profiles as (
    select p.id
    from public.profiles p
    left join auth.users u
      on u.id = p.id
    where
      public.normalize_iran_mobile_e164(coalesce(p.mobile_1, p.mobile)) = normalized_phone
      or (
        public.normalize_iran_mobile_e164(coalesce(p.mobile_1, p.mobile)) is null
        and public.normalize_iran_mobile_e164(u.phone) = normalized_phone
      )
  )
  select count(*)
  into phone_identity_count
  from auth.users u
  where public.normalize_iran_mobile_e164(u.phone) = normalized_phone
    and u.phone_confirmed_at is not null
    and exists (
      select 1
      from matched_profiles mp
      where mp.id = u.id
    )
    and (
      exists (
        select 1
        from auth.identities i
        where i.user_id = u.id
          and i.provider = 'phone'
          and (
            public.normalize_iran_mobile_e164(i.identity_data ->> 'phone') = normalized_phone
            or coalesce((i.identity_data ->> 'phone_verified')::boolean, false) = true
          )
      )
      or public.normalize_iran_mobile_e164(u.phone) = normalized_phone
    );

  return jsonb_build_object(
    'normalized_phone', normalized_phone,
    'exists_in_profiles', profile_count > 0,
    'exists_in_auth', auth_count > 0,
    'has_phone_identity', phone_identity_count > 0,
    'is_active', active_profile_exists
  );
end;
$$;

revoke all on function public.check_phone_login_candidate(text) from public;
grant execute on function public.check_phone_login_candidate(text) to anon, authenticated;

commit;
