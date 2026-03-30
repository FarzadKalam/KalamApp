-- =====================================================
-- KalamApp - Phase 30 Phone Identity Precheck Normalization
-- Date: 2026-03-23
-- Type: Additive / non-breaking migration
-- Goal: make phone-login precheck robust against GoTrue storing phone values
--       in slightly different normalized formats (for example 989... vs +989...)
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
  auth_count integer := 0;
  phone_identity_count integer := 0;
begin
  if normalized_phone is null then
    return jsonb_build_object(
      'normalized_phone', null,
      'exists_in_profiles', false,
      'exists_in_auth', false,
      'has_phone_identity', false
    );
  end if;

  select count(*)
    into profile_count
  from public.profiles p
  where public.normalize_iran_mobile_e164(coalesce(p.mobile_1, p.mobile)) = normalized_phone;

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
    'has_phone_identity', phone_identity_count > 0
  );
end;
$$;

revoke all on function public.check_phone_login_candidate(text) from public;
grant execute on function public.check_phone_login_candidate(text) to anon, authenticated;

commit;
