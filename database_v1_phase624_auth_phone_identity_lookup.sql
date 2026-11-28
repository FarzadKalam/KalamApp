create index if not exists identities_phone_lookup_idx
  on auth.identities ((identity_data ->> 'phone')) where provider = 'phone';

create or replace function public.find_auth_user_ids_by_phone(p_phone text)
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  with normalized as (select public.normalize_iran_mobile_e164(p_phone) as phone),
  formats as (
    select array[phone, substring(phone from 2), '0' || substring(phone from 4), '00' || substring(phone from 2)] as phones
    from normalized where phone is not null
  )
  select u.id from formats f join auth.users u on u.phone = any(f.phones)
  union
  select i.user_id from formats f join auth.identities i on i.provider = 'phone'
    and i.identity_data ->> 'phone' = any(f.phones)
  limit 2;
$$;

revoke all on function public.find_auth_user_ids_by_phone(text) from public, anon, authenticated;
grant execute on function public.find_auth_user_ids_by_phone(text) to service_role;

notify pgrst, 'reload schema';
