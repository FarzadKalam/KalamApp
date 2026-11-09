-- Canonical phone handling at database/Auth boundaries. No confirmation bypass.
begin;

create or replace function public.normalize_iran_mobile_e164(value text)
returns text language plpgsql immutable set search_path = public as $$
declare
  raw text := translate(trim(coalesce(value, '')), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789');
  digits text;
begin
  -- Keep validation consistent with the shared browser/Edge helper.
  raw := regexp_replace(raw, '[‌-‏‪-‮⁦-⁩]', '', 'g');
  if raw = '' or raw ~ '[^+0-9[:space:]().-]' then return null; end if;
  digits := regexp_replace(raw, '[^0-9]', '', 'g');
  if digits like '0098%' then digits := substr(digits,5);
  elsif digits like '098%' and length(digits)>=13 then digits := substr(digits,4);
  elsif digits like '98%' and length(digits)>=12 then digits := substr(digits,3); end if;
  if left(digits,1)='0' then digits := substr(digits,2); end if;
  if digits ~ '^9[0-9]{9}$' then return '+98'||digits; end if;
  return null;
end;
$$;

-- Global identity lookup is private to the service, never exposed to tenants.
-- Uses the existing normalized-mobile expression index, including legacy formats.
create or replace function public.find_profile_by_phone_for_auth(p_phone text, p_exclude_user_id uuid default null)
returns setof public.profiles language sql stable security invoker set search_path = public as $$
  select p.* from public.profiles p
  where public.normalize_iran_mobile_e164(coalesce(nullif(p.mobile_1,''),nullif(p.mobile,'')))
      = public.normalize_iran_mobile_e164(p_phone)
    and (p_exclude_user_id is null or p.id<>p_exclude_user_id)
  limit 2;
$$;
revoke all on function public.find_profile_by_phone_for_auth(text,uuid) from public, anon, authenticated;
grant execute on function public.find_profile_by_phone_for_auth(text,uuid) to service_role;

create or replace function public.kalam_phone_lookup_key(p_value text)
returns text language plpgsql immutable set search_path = public as $$
declare
  mobile text := public.normalize_iran_mobile_e164(p_value);
  digits text;
begin
  if mobile is not null then return substr(mobile,4); end if;
  digits := regexp_replace(translate(coalesce(p_value,''), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'), '[^0-9]', '', 'g');
  if digits like '0098%' then digits := substr(digits,5);
  elsif digits like '98%' and length(digits)>=12 then digits := substr(digits,3); end if;
  if length(digits)>10 and left(digits,1)='0' then digits := substr(digits,2); end if;
  return digits;
end;
$$;

-- Privileged trigger only: Auth stores international digits WITHOUT '+'.
-- GoTrue still owns passwords, identities and phone verification.
create or replace function public.canonicalize_auth_user_phone()
returns trigger language plpgsql set search_path = public as $$
declare canonical text;
begin
  if new.phone is null or new.phone='' then return new; end if;
  canonical := public.normalize_iran_mobile_e164(new.phone);
  if canonical is not null then new.phone := substr(canonical,2);
  else
    new.phone := translate(trim(new.phone), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789');
    new.phone := regexp_replace(new.phone, '[+[:space:]().‌-‏-]', '', 'g');
    if new.phone like '00%' then new.phone := substr(new.phone,3); end if;
    if new.phone !~ '^[1-9][0-9]{1,14}$' then
      raise exception 'شماره تلفن معتبر نیست.' using errcode='22023';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.canonicalize_auth_user_phone() from public, anon, authenticated;
drop trigger if exists canonicalize_auth_user_phone on auth.users;
create trigger canonicalize_auth_user_phone before insert or update of phone on auth.users
for each row execute function public.canonicalize_auth_user_phone();

create or replace function public.sync_profile_contact_to_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare normalized_mobile text;
begin
  normalized_mobile := public.normalize_iran_mobile_e164(coalesce(nullif(new.mobile_1,''),new.mobile));
  update auth.users
    set phone = case when normalized_mobile is null then null else substr(normalized_mobile,2) end,
        phone_confirmed_at = case
          when public.normalize_iran_mobile_e164(phone) is not distinct from normalized_mobile then phone_confirmed_at
          else null end,
        raw_user_meta_data = coalesce(raw_user_meta_data,'{}'::jsonb)
          || jsonb_build_object('full_name',coalesce(new.full_name,''),'avatar_url',coalesce(new.avatar_url,''))
    where id=new.id;
  return new;
end;
$$;
revoke all on function public.sync_profile_contact_to_auth_user() from public, anon, authenticated;

-- Abort instead of choosing or merging owners when two accounts share a number.
do $$
begin
  if exists (
    select public.normalize_iran_mobile_e164(phone) from auth.users
    where public.normalize_iran_mobile_e164(phone) is not null
    group by 1 having count(*)>1
  ) then raise exception 'تعارض مالکیت شماره‌ها؛ اصلاح خودکار متوقف شد.'; end if;
end;
$$;
update auth.users set phone=substr(public.normalize_iran_mobile_e164(phone),2)
where public.normalize_iran_mobile_e164(phone) is not null
  and phone is distinct from substr(public.normalize_iran_mobile_e164(phone),2);

-- Existing phone identities keep their identity and verification state.
update auth.identities i
set identity_data=jsonb_set(i.identity_data,'{phone}',to_jsonb(u.phone))
from auth.users u
where i.user_id=u.id and i.provider='phone'
  and public.normalize_iran_mobile_e164(i.identity_data->>'phone')=public.normalize_iran_mobile_e164(u.phone)
  and i.identity_data->>'phone' is distinct from u.phone;

-- Immutable function changes require rebuilding their expression indexes.
do $$
declare idx record;
begin
  for idx in
    select distinct n.nspname,c.relname from pg_depend d
    join pg_class c on c.oid=d.objid and c.relkind='i'
    join pg_namespace n on n.oid=c.relnamespace
    where d.refobjid in ('public.normalize_iran_mobile_e164(text)'::regprocedure,
      'public.kalam_phone_lookup_key(text)'::regprocedure)
  loop execute format('reindex index %I.%I',idx.nspname,idx.relname); end loop;
end;
$$;
notify pgrst, 'reload schema';
commit;
