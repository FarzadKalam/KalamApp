-- =====================================================
-- KalamApp - Phase 51 Phone Login Precheck Profile Sync
-- Date: 2026-03-27
-- Type: Additive / repair migration
-- Goal: reduce false negatives in phone OTP precheck for existing org users
-- =====================================================

begin;

update public.profiles p
set mobile_1 = regexp_replace(public.normalize_iran_mobile_e164(u.phone), '^\+98', '0')
from auth.users u
where u.id = p.id
  and coalesce(nullif(trim(p.mobile_1), ''), nullif(trim(p.mobile), '')) is null
  and public.normalize_iran_mobile_e164(u.phone) is not null;

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

  select
    count(*),
    coalesce(bool_or(coalesce(p.is_active, true)), false)
    into profile_count, active_profile_exists
  from public.profiles p
  left join auth.users u
    on u.id = p.id
  where
    public.normalize_iran_mobile_e164(coalesce(p.mobile_1, p.mobile)) = normalized_phone
    or (
      public.normalize_iran_mobile_e164(coalesce(p.mobile_1, p.mobile)) is null
      and public.normalize_iran_mobile_e164(u.phone) = normalized_phone
    );

  select count(*)
    into auth_count
  from auth.users u
  where public.normalize_iran_mobile_e164(u.phone) = normalized_phone;

  select count(*)
    into phone_identity_count
  from auth.identities i
  where i.provider = 'phone'
    and (
      public.normalize_iran_mobile_e164(i.identity_data ->> 'phone') = normalized_phone
      or i.user_id in (
        select u.id
        from auth.users u
        where public.normalize_iran_mobile_e164(u.phone) = normalized_phone
      )
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
