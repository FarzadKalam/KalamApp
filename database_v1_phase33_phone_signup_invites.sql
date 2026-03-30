-- =====================================================
-- KalamApp - Phase 33 Phone Signup Invites
-- Date: 2026-03-24
-- Type: Additive / non-breaking migration
-- Goal: support controlled phone-first signup/login for org-approved users
-- =====================================================

begin;

create table if not exists public.phone_signup_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  full_name text not null,
  phone_e164 text not null,
  email text,
  role_id uuid references public.org_roles(id) on delete set null,
  role text,
  is_active boolean not null default true,
  consumed_at timestamptz,
  consumed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_phone_signup_invites_phone_pending
  on public.phone_signup_invites (phone_e164)
  where consumed_at is null;

create index if not exists idx_phone_signup_invites_org_pending
  on public.phone_signup_invites (org_id, created_at desc)
  where consumed_at is null;

do $$
begin
  if to_regprocedure('public.current_org_id()') is not null then
    alter table public.phone_signup_invites
      alter column org_id set default public.current_org_id();
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_phone_signup_invites_updated_at on public.phone_signup_invites;
    create trigger trg_phone_signup_invites_updated_at
      before update on public.phone_signup_invites
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.phone_signup_invites enable row level security;

drop policy if exists p_phone_signup_invites_org_all on public.phone_signup_invites;
create policy p_phone_signup_invites_org_all on public.phone_signup_invites
  for all to authenticated
  using (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id is null
    or org_id = public.current_org_id()
  )
  with check (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id is null
    or org_id = public.current_org_id()
  );

create or replace function public.lookup_phone_signup_invite(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_phone text := public.normalize_iran_mobile_e164(p_phone);
  invite_row public.phone_signup_invites%rowtype;
begin
  if normalized_phone is null then
    return jsonb_build_object(
      'normalized_phone', null,
      'exists', false,
      'is_active', false
    );
  end if;

  select *
    into invite_row
  from public.phone_signup_invites
  where phone_e164 = normalized_phone
    and consumed_at is null
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'normalized_phone', normalized_phone,
      'exists', false,
      'is_active', false
    );
  end if;

  return jsonb_build_object(
    'id', invite_row.id,
    'normalized_phone', normalized_phone,
    'exists', true,
    'org_id', invite_row.org_id,
    'full_name', invite_row.full_name,
    'email', invite_row.email,
    'role_id', invite_row.role_id,
    'role', invite_row.role,
    'is_active', invite_row.is_active
  );
end;
$$;

create or replace function public.consume_phone_signup_invite(
  p_phone text,
  p_user_id uuid default null,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_phone text := public.normalize_iran_mobile_e164(p_phone);
  effective_user_id uuid := coalesce(p_user_id, auth.uid());
  caller_user_id uuid := auth.uid();
  invite_row public.phone_signup_invites%rowtype;
  has_profile boolean := false;
  mobile_local text;
begin
  if normalized_phone is null then
    return jsonb_build_object(
      'success', false,
      'reason', 'invalid_phone'
    );
  end if;

  if effective_user_id is null then
    return jsonb_build_object(
      'success', false,
      'reason', 'missing_user'
    );
  end if;

  if caller_user_id is not null and caller_user_id <> effective_user_id then
    raise exception using
      errcode = '42501',
      message = 'consume_phone_signup_invite can only be used for the current user';
  end if;

  select *
    into invite_row
  from public.phone_signup_invites
  where phone_e164 = normalized_phone
    and consumed_at is null
  order by created_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'reason', 'invite_not_found',
      'normalized_phone', normalized_phone
    );
  end if;

  if invite_row.is_active = false then
    return jsonb_build_object(
      'success', false,
      'reason', 'invite_inactive',
      'invite_id', invite_row.id,
      'normalized_phone', normalized_phone
    );
  end if;

  select exists(
    select 1
    from public.profiles
    where id = effective_user_id
  )
  into has_profile;

  mobile_local := regexp_replace(normalized_phone, '^\+98', '0');

  if not has_profile then
    insert into public.profiles (
      id,
      org_id,
      full_name,
      email,
      mobile_1,
      role_id,
      role,
      is_active
    ) values (
      effective_user_id,
      invite_row.org_id,
      nullif(trim(invite_row.full_name), ''),
      coalesce(nullif(trim(p_email), ''), nullif(trim(invite_row.email), '')),
      mobile_local,
      invite_row.role_id,
      coalesce(nullif(trim(invite_row.role), ''), 'viewer'),
      true
    );
  else
    update public.profiles
       set org_id = coalesce(public.profiles.org_id, invite_row.org_id),
           full_name = coalesce(nullif(public.profiles.full_name, ''), nullif(trim(invite_row.full_name), '')),
           email = coalesce(nullif(public.profiles.email, ''), coalesce(nullif(trim(p_email), ''), nullif(trim(invite_row.email), ''))),
           mobile_1 = coalesce(nullif(public.profiles.mobile_1, ''), mobile_local),
           role_id = coalesce(public.profiles.role_id, invite_row.role_id),
           role = coalesce(nullif(public.profiles.role, ''), nullif(trim(invite_row.role), ''), 'viewer')
     where id = effective_user_id;
  end if;

  update public.phone_signup_invites
     set consumed_at = now(),
         consumed_by = effective_user_id
   where id = invite_row.id;

  return jsonb_build_object(
    'success', true,
    'invite_id', invite_row.id,
    'profile_id', effective_user_id,
    'org_id', invite_row.org_id,
    'created_profile', (not has_profile)
  );
end;
$$;

revoke all on function public.lookup_phone_signup_invite(text) from public;
grant execute on function public.lookup_phone_signup_invite(text) to anon, authenticated;

revoke all on function public.consume_phone_signup_invite(text, uuid, text) from public;
grant execute on function public.consume_phone_signup_invite(text, uuid, text) to authenticated;

commit;
