-- =====================================================
-- KalamApp - Phase 158 phone ownership policy hardening
-- Date: 2026-05-19
-- Type: Corrective / non-breaking migration
-- Goal:
--   1) Enrich check_phone_login_candidate with org/profile ownership metadata
--   2) Prevent consuming phone signup invites when the phone belongs to another org/profile
-- =====================================================

begin;

create or replace function public.check_phone_login_candidate(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_phone text := public.normalize_iran_mobile_e164(p_phone);
  profile_count integer := 0;
  active_profile_count integer := 0;
  auth_count integer := 0;
  phone_identity_count integer := 0;
  single_profile record;
begin
  if normalized_phone is null then
    return jsonb_build_object(
      'normalized_phone', null,
      'exists_in_profiles', false,
      'exists_in_auth', false,
      'has_phone_identity', false,
      'is_active', false,
      'matched_profile_count', 0,
      'active_profile_count', 0,
      'org_id', null,
      'role_id', null,
      'role', null
    );
  end if;

  with matched_profiles as (
    select distinct on (p.id)
      p.id,
      p.org_id,
      p.role_id,
      p.role,
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
    order by p.id, p.created_at asc nulls last
  )
  select
    count(*),
    count(*) filter (where is_active)
  into profile_count, active_profile_count
  from matched_profiles;

  if profile_count = 1 then
    with matched_profiles as (
      select distinct on (p.id)
        p.id,
        p.org_id,
        p.role_id,
        p.role,
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
      order by p.id, p.created_at asc nulls last
    )
    select *
      into single_profile
    from matched_profiles
    limit 1;
  end if;

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
    'is_active', active_profile_count > 0,
    'matched_profile_count', profile_count,
    'active_profile_count', active_profile_count,
    'org_id', case when profile_count = 1 then single_profile.org_id else null end,
    'role_id', case when profile_count = 1 then single_profile.role_id else null end,
    'role', case when profile_count = 1 then single_profile.role else null end
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
  existing_profile public.profiles%rowtype;
  conflicting_profile public.profiles%rowtype;
  conflicting_profile_count integer := 0;
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

  select *
    into existing_profile
  from public.profiles
  where id = effective_user_id
  limit 1;

  with matched_profiles as (
    select
      p.*
    from public.profiles p
    left join auth.users u
      on u.id = p.id
    where (
      public.normalize_iran_mobile_e164(coalesce(p.mobile_1, p.mobile)) = normalized_phone
      or (
        public.normalize_iran_mobile_e164(coalesce(p.mobile_1, p.mobile)) is null
        and public.normalize_iran_mobile_e164(u.phone) = normalized_phone
      )
    )
      and p.id <> effective_user_id
  )
  select count(*)
    into conflicting_profile_count
  from matched_profiles;

  if conflicting_profile_count > 1 then
    return jsonb_build_object(
      'success', false,
      'reason', 'multiple_profiles',
      'invite_id', invite_row.id,
      'normalized_phone', normalized_phone
    );
  end if;

  if conflicting_profile_count = 1 then
    with matched_profiles as (
      select
        p.*
      from public.profiles p
      left join auth.users u
        on u.id = p.id
      where (
        public.normalize_iran_mobile_e164(coalesce(p.mobile_1, p.mobile)) = normalized_phone
        or (
          public.normalize_iran_mobile_e164(coalesce(p.mobile_1, p.mobile)) is null
          and public.normalize_iran_mobile_e164(u.phone) = normalized_phone
        )
      )
        and p.id <> effective_user_id
      order by p.created_at asc nulls last
      limit 1
    )
    select *
      into conflicting_profile
    from matched_profiles;

    return jsonb_build_object(
      'success', false,
      'reason', 'profile_org_conflict',
      'invite_id', invite_row.id,
      'normalized_phone', normalized_phone,
      'existing_org_id', conflicting_profile.org_id
    );
  end if;

  if existing_profile.id is not null and existing_profile.is_active = false then
    return jsonb_build_object(
      'success', false,
      'reason', 'profile_inactive',
      'invite_id', invite_row.id,
      'normalized_phone', normalized_phone
    );
  end if;

  if existing_profile.id is not null
     and existing_profile.org_id is not null
     and invite_row.org_id is not null
     and existing_profile.org_id <> invite_row.org_id then
    return jsonb_build_object(
      'success', false,
      'reason', 'profile_org_conflict',
      'invite_id', invite_row.id,
      'normalized_phone', normalized_phone,
      'existing_org_id', existing_profile.org_id
    );
  end if;

  mobile_local := regexp_replace(normalized_phone, '^\+98', '0');

  if existing_profile.id is null then
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
    'created_profile', (existing_profile.id is null)
  );
end;
$$;

revoke all on function public.check_phone_login_candidate(text) from public;
grant execute on function public.check_phone_login_candidate(text) to anon, authenticated;

revoke all on function public.consume_phone_signup_invite(text, uuid, text) from public;
grant execute on function public.consume_phone_signup_invite(text, uuid, text) to authenticated;

commit;
