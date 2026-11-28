create table if not exists public.organization_password_accounts (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  phone_e164 text not null,
  recovery_email text,
  primary key (org_id, user_id),
  unique (org_id, phone_e164),
  unique (org_id, recovery_email)
);
create index if not exists organization_password_accounts_phone_idx on public.organization_password_accounts (phone_e164, org_id);
create index if not exists organization_password_accounts_email_idx on public.organization_password_accounts (recovery_email, org_id);
alter table public.organization_password_accounts enable row level security;
revoke all on public.organization_password_accounts from anon, authenticated;
grant select, insert, update, delete on public.organization_password_accounts to service_role;

create or replace function public.protect_organization_auth_identifier()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if (new.phone is distinct from old.phone or new.email is distinct from old.email)
    and exists (select 1 from public.organization_password_accounts a where a.user_id=old.id) then
    raise exception 'شناسه ورود این حساب در تنظیمات سازمان مدیریت می‌شود.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_organization_auth_identifier() from public, anon, authenticated;
drop trigger if exists protect_organization_auth_identifier on auth.users;
create trigger protect_organization_auth_identifier before update of email, phone on auth.users
for each row execute function public.protect_organization_auth_identifier();

create or replace function public.list_organization_password_contacts()
returns table (user_id uuid, phone_e164 text, recovery_email text)
language sql stable security definer
set search_path = public
as $$
  select a.user_id, a.phone_e164, a.recovery_email
  from public.organization_password_accounts a
  where a.org_id = public.current_org_id() and public.can_manage_organization_members();
$$;
revoke all on function public.list_organization_password_contacts() from public, anon;
grant execute on function public.list_organization_password_contacts() to authenticated;

create or replace function public.organization_login_candidates(p_contact text, p_is_phone boolean)
returns table (
  org_id uuid, org_name text, resolved_host text, role_name text, is_owner boolean, user_id uuid,
  auth_email text, auth_phone text, recovery_email text, recovery_phone text, is_independent boolean
)
language sql stable security definer
set search_path = public
as $$
  with legacy as (
    select p.id from public.find_profile_by_phone_for_auth(case when p_is_phone then p_contact end) p
    where p_is_phone
    union
    select a.id from auth.users a where not p_is_phone and a.email = p_contact
    union
    select public.find_auth_user_ids_by_phone(p_contact) where p_is_phone
  ), candidates as (
    select m.org_id, m.user_id, m.role_id, m.is_owner, a.recovery_email, a.phone_e164, true as independent
    from public.organization_password_accounts a
    join public.user_organization_memberships m on (m.user_id, m.org_id) = (a.user_id, a.org_id) and m.is_active
    where case when p_is_phone then a.phone_e164 = p_contact else a.recovery_email = p_contact end
    union all
    select m.org_id, m.user_id, m.role_id, m.is_owner, null, null, false
    from legacy l join public.user_organization_memberships m on m.user_id = l.id and m.is_active
    where not exists (select 1 from public.organization_password_accounts a where a.user_id = m.user_id)
  )
  select c.org_id, public.organization_display_name(c.org_id), public.organization_access_host(c.org_id),
    r.title, c.is_owner, c.user_id, u.email, u.phone,
    case when c.independent then c.recovery_email when u.email_confirmed_at is not null then u.email end,
    case when c.independent then c.phone_e164 when u.phone_confirmed_at is not null then public.normalize_iran_mobile_e164(u.phone) end,
    c.independent
  from candidates c join auth.users u on u.id = c.user_id
  join public.profiles p on p.id = c.user_id and p.is_active is distinct from false
  join public.organizations o on o.id = c.org_id and o.is_active
  left join public.org_roles r on r.id = c.role_id and r.org_id = c.org_id
  where c.independent or not p_is_phone or nullif(u.phone,'') is null
    or public.normalize_iran_mobile_e164(u.phone) = p_contact;
$$;
revoke all on function public.organization_login_candidates(text, boolean) from public, anon, authenticated;
grant execute on function public.organization_login_candidates(text, boolean) to service_role;

create or replace function public.provision_organization_password_account(
  p_org_id uuid, p_actor_id uuid, p_user_id uuid, p_phone text, p_email text,
  p_full_name text, p_role_id uuid, p_software_role text, p_is_active boolean, p_avatar_url text
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_phone text := public.normalize_iran_mobile_e164(p_phone);
begin
  perform 1 from public.organizations where id = p_org_id and is_active for update;
  if not found then raise exception 'سازمان فعال نیست.' using errcode='42501'; end if;
  select m.software_role into v_actor_role
  from public.user_organization_memberships m
  left join public.org_roles r on r.id=m.role_id and r.org_id=m.org_id
  where m.org_id=p_org_id and m.user_id=p_actor_id and m.is_active
    and (m.software_role in ('super_admin','admin','manager') or r.title in ('مدیر ارشد','مدیر سیستم','مدیر سازمان','مدیر'));
  if not found or v_phone is null or p_software_role not in ('super_admin','admin','manager','editor','viewer')
    or (p_software_role='super_admin' and v_actor_role is distinct from 'super_admin')
    or (p_role_id is not null and not exists (select 1 from public.org_roles where id=p_role_id and org_id=p_org_id)) then
    raise exception 'ساخت حساب با این مشخصات مجاز نیست.' using errcode='42501';
  end if;
  if not exists (select 1 from auth.users where id=p_user_id and email like '%@org-login.invalid') then
    raise exception 'حساب ورود سازمانی آماده نیست.' using errcode='22023';
  end if;
  if exists (select 1 from public.organization_login_candidates(v_phone,true) c where c.org_id=p_org_id)
    or exists (select 1 from public.user_organization_memberships m where m.org_id=p_org_id and m.user_id in (
      select p.id from public.find_profile_by_phone_for_auth(v_phone) p
      union select public.find_auth_user_ids_by_phone(v_phone)
    )) then
    raise exception 'برای این شماره در همین سازمان حساب وجود دارد.' using errcode='23505';
  end if;
  if p_email is not null and exists (
    select 1 from public.organization_login_candidates(p_email,false) c where c.org_id=p_org_id
  ) then raise exception 'برای این ایمیل در همین سازمان حساب وجود دارد.' using errcode='23505'; end if;
  insert into public.profiles(id,org_id,full_name,role_id,role,is_active,avatar_url)
  values(p_user_id,p_org_id,p_full_name,p_role_id,p_software_role,p_is_active,p_avatar_url)
  on conflict(id) do update set org_id=excluded.org_id,full_name=excluded.full_name,email=null,mobile_1=null,
    role_id=excluded.role_id,role=excluded.role,is_active=excluded.is_active,avatar_url=excluded.avatar_url;
  insert into public.user_organization_memberships(user_id,org_id,role_id,software_role,is_active)
  values(p_user_id,p_org_id,p_role_id,p_software_role,p_is_active) on conflict(user_id,org_id) do nothing;
  insert into public.organization_password_accounts(org_id,user_id,phone_e164,recovery_email)
  values(p_org_id,p_user_id,v_phone,p_email);
  update public.phone_signup_invites set consumed_at=now(),consumed_by=p_user_id
  where org_id=p_org_id and phone_e164=v_phone and is_active and consumed_at is null;
end;
$$;
revoke all on function public.provision_organization_password_account(uuid,uuid,uuid,text,text,text,uuid,text,boolean,text) from public, anon, authenticated;
grant execute on function public.provision_organization_password_account(uuid,uuid,uuid,text,text,text,uuid,text,boolean,text) to service_role;

create table if not exists public.organization_auth_challenges (
  id uuid primary key,
  purpose text not null check (purpose in ('discover','recover')),
  contact text not null,
  org_id uuid references public.organizations(id) on delete cascade,
  target_user_id uuid,
  delivery_channel text check (delivery_channel in ('sms','email')),
  delivery_address text,
  digest text not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  verified_at timestamptz,
  used_at timestamptz
);
create index if not exists organization_auth_challenges_contact_idx on public.organization_auth_challenges(contact, created_at);
create index if not exists organization_auth_challenges_expiry_idx on public.organization_auth_challenges(expires_at);
alter table public.organization_auth_challenges enable row level security;
revoke all on public.organization_auth_challenges from anon, authenticated;
grant select, insert, update, delete on public.organization_auth_challenges to service_role;

create or replace function public.issue_organization_auth_challenge(
  p_id uuid, p_purpose text, p_contact text, p_org_id uuid, p_target_user_id uuid,
  p_digest text, p_channel text, p_destination text
)
returns boolean
language plpgsql security invoker
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_contact, 625));
  delete from public.organization_auth_challenges where expires_at < now() - interval '1 hour';
  if exists (select 1 from public.organization_auth_challenges where contact=p_contact and created_at>now()-interval '60 seconds')
    or (select count(*) from public.organization_auth_challenges where contact=p_contact and created_at>now()-interval '1 hour')>=5 then
    return false;
  end if;
  insert into public.organization_auth_challenges(id,purpose,contact,org_id,target_user_id,digest,delivery_channel,delivery_address)
  values(p_id,p_purpose,p_contact,p_org_id,p_target_user_id,p_digest,p_channel,p_destination);
  return true;
end;
$$;
create or replace function public.verify_organization_auth_challenge(p_id uuid, p_purpose text, p_digest text)
returns jsonb
language plpgsql security invoker
set search_path = public
as $$
declare v public.organization_auth_challenges%rowtype;
begin
  update public.organization_auth_challenges set attempts=attempts+1
  where id=p_id and purpose=p_purpose and expires_at>now() and verified_at is null and attempts<5 returning * into v;
  if not found or v.digest<>p_digest then return null; end if;
  update public.organization_auth_challenges set verified_at=now() where id=p_id;
  return jsonb_build_object('contact',v.contact,'org_id',v.org_id,'user_id',v.target_user_id,
    'delivery_channel',v.delivery_channel,'delivery_address',v.delivery_address);
end;
$$;
create or replace function public.consume_organization_password_recovery(p_id uuid)
returns jsonb
language plpgsql security invoker
set search_path = public
as $$
declare v public.organization_auth_challenges%rowtype;
begin
  update public.organization_auth_challenges set used_at=now()
  where id=p_id and purpose='recover' and expires_at>now() and verified_at is not null and used_at is null
  returning * into v;
  if not found then return null; end if;
  return jsonb_build_object('contact',v.contact,'org_id',v.org_id,'user_id',v.target_user_id,
    'delivery_channel',v.delivery_channel,'delivery_address',v.delivery_address);
end;
$$;
revoke all on function public.consume_organization_password_recovery(uuid) from public, anon, authenticated;
grant execute on function public.consume_organization_password_recovery(uuid) to service_role;
revoke all on function public.issue_organization_auth_challenge(uuid,text,text,uuid,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.verify_organization_auth_challenge(uuid,text,text) from public, anon, authenticated;
grant execute on function public.issue_organization_auth_challenge(uuid,text,text,uuid,uuid,text,text,text) to service_role;
grant execute on function public.verify_organization_auth_challenge(uuid,text,text) to service_role;
notify pgrst, 'reload schema';
