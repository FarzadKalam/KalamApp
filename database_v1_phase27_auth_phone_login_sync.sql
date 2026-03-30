-- =====================================================
-- KalamApp - Phase 27 Auth Phone Login Sync
-- Date: 2026-03-22
-- Type: Additive / non-breaking migration
-- Goal: normalize internal mobile numbers and keep auth.users.phone synced with profiles
-- =====================================================

begin;

create or replace function public.normalize_iran_mobile_e164(value text)
returns text
language plpgsql
immutable
as $$
declare
  raw text := trim(coalesce(value, ''));
  digits text;
begin
  if raw = '' then
    return null;
  end if;

  digits := regexp_replace(raw, '\D', '', 'g');

  if digits ~ '^00989\d{9}$' then
    return '+' || substring(digits from 3);
  end if;

  if digits ~ '^989\d{9}$' then
    return '+' || digits;
  end if;

  if digits ~ '^09\d{9}$' then
    return '+98' || substring(digits from 2);
  end if;

  if digits ~ '^9\d{9}$' then
    return '+98' || digits;
  end if;

  return null;
end;
$$;

create index if not exists idx_profiles_mobile_e164
  on public.profiles ((public.normalize_iran_mobile_e164(coalesce(nullif(mobile_1, ''), nullif(mobile, '')))));

create or replace function public.validate_profile_mobile_uniqueness()
returns trigger
language plpgsql
as $$
declare
  normalized_mobile text;
begin
  normalized_mobile := public.normalize_iran_mobile_e164(coalesce(new.mobile_1, new.mobile));

  if normalized_mobile is not null and exists (
    select 1
    from public.profiles p
    where p.id <> new.id
      and public.normalize_iran_mobile_e164(coalesce(p.mobile_1, p.mobile)) = normalized_mobile
  ) then
    raise exception using
      errcode = '23505',
      message = 'شماره موبایل این کاربر قبلا برای کاربر دیگری ثبت شده است.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_validate_mobile_uniqueness on public.profiles;
create trigger trg_profiles_validate_mobile_uniqueness
  before insert or update of mobile_1, mobile on public.profiles
  for each row
  execute function public.validate_profile_mobile_uniqueness();

create or replace function public.sync_profile_contact_to_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_mobile text;
begin
  normalized_mobile := public.normalize_iran_mobile_e164(coalesce(new.mobile_1, new.mobile));

  update auth.users
     set phone = normalized_mobile,
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
           || jsonb_build_object(
             'full_name', coalesce(new.full_name, ''),
             'avatar_url', coalesce(new.avatar_url, '')
           )
   where id = new.id;

  return new;
end;
$$;

drop trigger if exists trg_profiles_sync_contact_to_auth_user on public.profiles;
create trigger trg_profiles_sync_contact_to_auth_user
  after insert or update of mobile_1, mobile, full_name, avatar_url on public.profiles
  for each row
  execute function public.sync_profile_contact_to_auth_user();

with normalized_profiles as (
  select
    p.id,
    public.normalize_iran_mobile_e164(coalesce(p.mobile_1, p.mobile)) as normalized_mobile,
    p.full_name,
    p.avatar_url,
    count(*) over (
      partition by public.normalize_iran_mobile_e164(coalesce(p.mobile_1, p.mobile))
    ) as phone_count
  from public.profiles p
)
update auth.users u
   set phone = np.normalized_mobile,
       raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
         || jsonb_build_object(
           'full_name', coalesce(np.full_name, ''),
           'avatar_url', coalesce(np.avatar_url, '')
         )
  from normalized_profiles np
 where u.id = np.id
   and np.normalized_mobile is not null
   and np.phone_count = 1;

commit;
