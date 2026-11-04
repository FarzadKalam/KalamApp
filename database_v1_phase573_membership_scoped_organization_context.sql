-- Membership is durable; request context must never move a shared profile.
begin;

alter table public.user_organization_memberships
  add column if not exists settings jsonb not null default '{}'::jsonb;

-- Preserve existing organization-specific telephone settings before separating identity.
update public.user_organization_memberships m
set settings = jsonb_build_object(
  'voip_enabled', p.voip_enabled, 'voip_operator_code', p.voip_operator_code,
  'voip_extension', p.voip_extension, 'voip_service_id', p.voip_service_id,
  'voip_dial_mode', p.voip_dial_mode
) || m.settings
from public.profiles p where p.id=m.user_id and p.org_id=m.org_id;

-- SECURITY DEFINER helpers expose only a name or the authenticated member's context.
-- They bypass profile RLS to avoid circular policies; every entry point validates membership.
create or replace function public.organization_display_name(p_org_id uuid)
returns text language sql stable security definer set search_path=public as $$
  select coalesce(
    (select coalesce(nullif(trim(cs.company_full_name),''),nullif(trim(cs.company_name),''),nullif(trim(cs.trade_name),''))
       from public.company_settings cs where cs.org_id=p_org_id
       order by cs.updated_at desc nulls last,cs.created_at desc nulls last limit 1),
    nullif(trim(o.name),''),'سازمان')
  from public.organizations o where o.id=p_org_id;
$$;
revoke all on function public.organization_display_name(uuid) from public,anon,authenticated;

create or replace function public.organization_access_host(p_org_id uuid)
returns text language sql stable security definer set search_path=public as $$
  select coalesce((select nullif(trim(s.resolved_host),'') from public.saas_org_settings s where s.org_id=p_org_id),
    case when exists(select 1 from public.get_public_branding('kalam.tazesystem.ir') b where b.org_id=p_org_id)
      then 'kalam.tazesystem.ir' end);
$$;
revoke all on function public.organization_access_host(uuid) from public,anon,authenticated;

create or replace function public.current_org_id()
returns uuid language plpgsql stable security definer set search_path=public as $$
declare v_headers jsonb; v_host text; v_org uuid; v_requested text;
begin
  if auth.uid() is null then return null; end if;
  begin v_headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  exception when others then return null; end;
  v_host:=lower(split_part(split_part(regexp_replace(coalesce(v_headers->>'origin',''),'^https?://',''), '/',1),':',1));
  -- Host binding wins over caller-provided context, including the internal and provider panels.
  if v_host not in ('','localhost','127.0.0.1','app.tazesystem.ir','tazesystem.ir','www.tazesystem.ir') then
    select b.org_id into v_org from public.get_public_branding(v_host) b limit 1;
    if v_org is null then return null; end if;
  else
    -- x-client-info is already allowed by Supabase CORS; no gateway configuration change is needed.
    v_requested:=coalesce(nullif(trim(v_headers->>'x-organization-id'),''),
      substring(coalesce(v_headers->>'x-client-info','') from '(?:^|;\s*)org=([0-9a-fA-F-]{36})(?:;|$)'));
    if v_requested is not null then
      begin v_org:=v_requested::uuid; exception when invalid_text_representation then return null; end;
    elsif v_host in ('app.tazesystem.ir','tazesystem.ir','www.tazesystem.ir') then
      return null; -- Shared login is not a tenant and must not inherit another tab's organization.
    else
      -- Compatibility for trusted server requests without Origin and local development.
      select org_id into v_org from public.profiles where id=auth.uid();
    end if;
  end if;
  if exists(select 1 from public.user_organization_memberships m
    join public.organizations o on o.id=m.org_id and o.is_active
    where m.user_id=auth.uid() and m.org_id=v_org and m.is_active)
  then return v_org; end if;
  return null;
end;
$$;

create or replace function public.get_current_organization_context()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('org_id',m.org_id,'org_name',public.organization_display_name(m.org_id),
    'role_id',m.role_id,'role',m.software_role,'is_active',m.is_active,
    'role_name',r.title,'permissions',coalesce(r.permissions,'{}'::jsonb),'settings',m.settings)
  from public.user_organization_memberships m
  left join public.org_roles r on r.id=m.role_id and r.org_id=m.org_id
  where m.user_id=auth.uid() and m.org_id=public.current_org_id() and m.is_active;
$$;

create or replace function public.get_current_user_organization_accesses()
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'org_id',m.org_id,'org_name',public.organization_display_name(m.org_id),
    'role_name',coalesce(r.title,case m.software_role when 'super_admin' then 'مدیر ارشد'
      when 'admin' then 'مدیر سیستم' when 'manager' then 'مدیر' when 'editor' then 'ویرایشگر' else 'مشاهده‌گر' end),
    'is_owner',m.is_owner,'slug',s.slug,'resolved_host',public.organization_access_host(m.org_id),'is_saas_org',s.org_id is not null
  ) order by m.is_owner desc,public.organization_display_name(m.org_id)),'[]'::jsonb)
  from public.user_organization_memberships m join public.organizations o on o.id=m.org_id and o.is_active
  left join public.org_roles r on r.id=m.role_id and r.org_id=m.org_id
  left join public.saas_org_settings s on s.org_id=m.org_id
  where m.user_id=auth.uid() and m.is_active;
$$;

create or replace function public.activate_current_user_organization(p_org_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.user_organization_memberships m
    join public.organizations o on o.id=m.org_id and o.is_active
    where m.user_id=auth.uid() and m.org_id=p_org_id and m.is_active)
  then raise exception 'دسترسی شما به این سازمان فعال نیست.' using errcode='42501'; end if;
  return jsonb_build_object('success',true,'org_id',p_org_id,'organization_name',public.organization_display_name(p_org_id),
    'resolved_host',public.organization_access_host(p_org_id));
end;
$$;

create or replace function public.activate_saas_admin_panel_context()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_org uuid;
begin
  select s.org_id into v_org from public.saas_org_settings s where s.is_billing_provider
    and lower(s.resolved_host)='panel.tazesystem.ir' limit 1;
  if not exists(select 1 from public.user_organization_memberships m
    join public.org_roles r on r.id=m.role_id and r.org_id=m.org_id
    where m.user_id=auth.uid() and m.org_id=v_org and m.is_active
      and coalesce((r.permissions->'__saas_admin'->>'view')::boolean,false)) then
    -- Preserve the existing explicitly granted SaaS-admin eligibility, without moving identity.
    if not exists(select 1 from public.user_organization_memberships m
      join public.org_roles r on r.id=m.role_id and r.org_id=m.org_id
      where m.user_id=auth.uid() and m.is_active
        and public.org_is_saas_admin(m.org_id)
        and coalesce((r.permissions->'__saas_admin'->>'view')::boolean,false)) then
      raise exception 'دسترسی به پنل مدیریت تازه سیستم برای این حساب فعال نیست.' using errcode='42501';
    end if;
    insert into public.user_organization_memberships(user_id,org_id,role_id,software_role,is_active)
    select auth.uid(),v_org,r.id,'admin',true from public.org_roles r where r.org_id=v_org
      and coalesce((r.permissions->'__saas_admin'->>'view')::boolean,false) order by r.created_at limit 1
    on conflict(user_id,org_id) do nothing;
  end if;
  return public.activate_current_user_organization(v_org);
end;
$$;

create or replace function public.can_manage_organization_members()
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(exists(select 1 from public.user_organization_memberships m
    left join public.org_roles r on r.id=m.role_id and r.org_id=m.org_id
    where m.user_id=auth.uid() and m.org_id=public.current_org_id() and m.is_active
    and (m.software_role in ('super_admin','admin','manager')
      or r.title in ('مدیر ارشد','مدیر سیستم','مدیر سازمان','مدیر'))),false);
$$;

-- A dedicated, column-limited directory; no broadening of profiles RLS or salary exposure.
create or replace function public.list_organization_members(p_org_id uuid,p_limit integer default 300,p_offset integer default 0,p_active_only boolean default false,p_user_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_result jsonb; v_manage boolean:=public.can_manage_organization_members();
begin
  if p_org_id is null or p_org_id is distinct from public.current_org_id() then
    raise exception 'دسترسی به اعضای این سازمان مجاز نیست.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(item order by item->>'full_name',item->>'id'),'[]'::jsonb) into v_result from (
    select jsonb_build_object('id',p.id,'org_id',m.org_id,'role_id',m.role_id,'role',m.software_role,
      'full_name',p.full_name,'avatar_url',p.avatar_url,'job_title',p.job_title,
      'email',case when v_manage or p.id=auth.uid() then p.email end,
      'mobile_1',case when v_manage or p.id=auth.uid() then p.mobile_1 end,
      'is_active',m.is_active,'created_at',m.created_at,'org_roles',jsonb_build_object('title',r.title),
      'can_edit_identity',p.id=auth.uid() or (v_manage and not exists(
        select 1 from public.user_organization_memberships other where other.user_id=p.id and other.org_id<>m.org_id)),
      'voip_enabled',m.settings->'voip_enabled','voip_operator_code',m.settings->'voip_operator_code',
      'voip_extension',m.settings->'voip_extension','voip_service_id',m.settings->'voip_service_id',
      'voip_dial_mode',m.settings->'voip_dial_mode') as item
    from public.user_organization_memberships m join public.profiles p on p.id=m.user_id
    left join public.org_roles r on r.id=m.role_id and r.org_id=m.org_id
    where m.org_id=p_org_id and (not p_active_only or m.is_active) and (p_user_id is null or m.user_id=p_user_id)
    order by p.full_name,p.id limit least(greatest(p_limit,1),1000) offset greatest(p_offset,0)
  ) rows;
  return v_result;
end;
$$;

create or replace function public.manage_organization_member(p_user_id uuid,p_patch jsonb default '{}'::jsonb,p_remove boolean default false,p_validate_only boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_org uuid:=public.current_org_id(); v_old public.user_organization_memberships%rowtype;
  v_new public.user_organization_memberships%rowtype; v_caller_role text; v_role uuid; v_software text;
begin
  if v_org is null or not public.can_manage_organization_members() then
    raise exception 'دسترسی کافی برای مدیریت اعضای این سازمان ندارید.' using errcode='42501'; end if;
  -- Serialize edits/removals and prevent losing the last administrator through concurrent requests.
  perform 1 from public.organizations where id=v_org for update;
  select * into v_old from public.user_organization_memberships where user_id=p_user_id and org_id=v_org for update;
  if not found then raise exception 'عضویت کاربر در این سازمان پیدا نشد.' using errcode='P0002'; end if;
  if jsonb_typeof(p_patch)<>'object' or jsonb_typeof(coalesce(p_patch->'settings','{}'::jsonb))<>'object'
    or exists(select 1 from jsonb_object_keys(coalesce(p_patch->'settings','{}'::jsonb)) key
      where key not in ('voip_enabled','voip_operator_code','voip_extension','voip_service_id','voip_dial_mode')) then
    raise exception 'تنظیمات عضویت معتبر نیست.'; end if;
  select software_role into v_caller_role from public.user_organization_memberships
    where user_id=auth.uid() and org_id=v_org and is_active;
  v_role:=case when p_patch ? 'role_id' then nullif(p_patch->>'role_id','')::uuid else v_old.role_id end;
  v_software:=coalesce(p_patch->>'role',v_old.software_role);
  if v_software not in ('super_admin','admin','manager','editor','viewer') then
    raise exception 'نقش انتخاب‌شده معتبر نیست.'; end if;
  if (v_old.software_role='super_admin' or v_software='super_admin') and v_caller_role<>'super_admin' then
    raise exception 'فقط مدیر ارشد می‌تواند این نقش را مدیریت کند.' using errcode='42501'; end if;
  if v_role is not null and not exists(select 1 from public.org_roles where id=v_role and org_id=v_org) then
    raise exception 'جایگاه انتخاب‌شده متعلق به این سازمان نیست.' using errcode='42501'; end if;
  if p_user_id=auth.uid() and (p_remove or coalesce((p_patch->>'is_active')::boolean,true)=false) then
    raise exception 'نمی‌توانید عضویت خودتان را حذف یا غیرفعال کنید.'; end if;
  if v_old.is_owner and (p_remove or coalesce((p_patch->>'is_active')::boolean,true)=false) then
    raise exception 'ابتدا مالکیت سازمان را از بخش مدیریت حساب منتقل کنید.'; end if;
  if v_old.is_active and v_old.software_role in ('admin','super_admin','manager')
    and (p_remove or coalesce((p_patch->>'is_active')::boolean,v_old.is_active)=false or v_software not in ('admin','super_admin','manager'))
    and not exists(select 1 from public.user_organization_memberships where org_id=v_org
      and user_id<>p_user_id and is_active and software_role in ('admin','super_admin','manager')) then
    raise exception 'سازمان باید حداقل یک مدیر فعال داشته باشد.'; end if;
  if p_validate_only then return jsonb_build_object('success',true); end if;
  if p_remove then
    delete from public.user_organization_memberships where user_id=p_user_id and org_id=v_org;
  else
    update public.user_organization_memberships set role_id=v_role,software_role=v_software,
      is_active=coalesce((p_patch->>'is_active')::boolean,is_active),
      settings=settings || coalesce(p_patch->'settings','{}'::jsonb),updated_at=now()
    where user_id=p_user_id and org_id=v_org returning * into v_new;
  end if;
  insert into public.changelogs(org_id,module_id,record_id,action,user_id,record_title,metadata)
    values(v_org,'profiles',p_user_id::text,case when p_remove then 'delete' else 'update' end,
      auth.uid(),(select full_name from public.profiles where id=p_user_id),
      jsonb_build_object('scope','organization_membership','previous',to_jsonb(v_old),'current',to_jsonb(v_new)));
  return jsonb_build_object('success',true,'org_id',v_org);
end;
$$;

-- Membership-only edits must not be undone by unrelated identity/avatar updates.
create or replace function public.sync_profile_organization_membership()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.org_id is not null and tg_op='INSERT' then
    insert into public.user_organization_memberships(user_id,org_id,role_id,software_role,is_active)
      values(new.id,new.org_id,new.role_id,new.role,coalesce(new.is_active,true))
      on conflict(user_id,org_id) do nothing;
  end if;
  return new;
end;
$$;

-- Block older clients from silently changing a person's memberships through profiles.
create or replace function public.guard_profile_membership_identity_update()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.role()='authenticated' then
    if (new.org_id,new.role_id,new.role,new.is_active) is distinct from (old.org_id,old.role_id,old.role,old.is_active) then
      raise exception 'نقش و وضعیت عضویت را از بخش اعضای سازمان تغییر دهید.' using errcode='42501'; end if;
    if old.id<>auth.uid() and exists(select 1 from public.user_organization_memberships where user_id=old.id and org_id<>old.org_id)
      and (new.full_name,new.email,new.mobile_1,new.avatar_url) is distinct from (old.full_name,old.email,old.mobile_1,old.avatar_url) then
      raise exception 'اطلاعات شخصی مشترک را خود شخص باید ویرایش کند.' using errcode='42501'; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_profile_membership_identity_update() from public,anon,authenticated;
drop trigger if exists aa_guard_profile_membership_identity_update on public.profiles;
create trigger aa_guard_profile_membership_identity_update before update on public.profiles
  for each row execute function public.guard_profile_membership_identity_update();

create or replace function public.update_own_profile_avatar(p_avatar_url text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'نشست ورود معتبر نیست.' using errcode='42501'; end if;
  update public.profiles set avatar_url=p_avatar_url where id=auth.uid();
  if not found then raise exception 'پروفایل پیدا نشد.'; end if;
end;
$$;
revoke all on function public.update_own_profile_avatar(text) from public,anon;
grant execute on function public.update_own_profile_avatar(text) to authenticated;

-- Org-scoped realtime invalidation, with the same fail-closed tenant predicate.
drop policy if exists p_user_organization_memberships_select_org on public.user_organization_memberships;
create policy p_user_organization_memberships_select_org on public.user_organization_memberships
  for select to authenticated using(org_id=public.current_org_id());
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='user_organization_memberships'
  ) then alter publication supabase_realtime add table public.user_organization_memberships; end if;
end $$;

revoke all on function public.current_org_id() from public,anon;
revoke all on function public.get_current_organization_context() from public,anon;
revoke all on function public.get_current_user_organization_accesses() from public,anon;
revoke all on function public.activate_current_user_organization(uuid) from public,anon;
revoke all on function public.activate_saas_admin_panel_context() from public,anon;
revoke all on function public.can_manage_organization_members() from public,anon;
revoke all on function public.list_organization_members(uuid,integer,integer,boolean,uuid) from public,anon;
revoke all on function public.manage_organization_member(uuid,jsonb,boolean,boolean) from public,anon;
grant execute on function public.current_org_id(),public.get_current_organization_context(),
  public.get_current_user_organization_accesses(),public.activate_current_user_organization(uuid),
  public.activate_saas_admin_panel_context(),public.can_manage_organization_members(),
  public.list_organization_members(uuid,integer,integer,boolean,uuid),public.manage_organization_member(uuid,jsonb,boolean,boolean)
  to authenticated,service_role;

create or replace function public.current_user_has_role_permission_entry(
  p_module_key text,
  p_root_action text default null,
  p_field_key text default null,
  p_missing_default boolean default true
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_current_org uuid;
  v_permissions jsonb;
  v_module_permission jsonb;
  v_fields jsonb;
  v_module_key text := nullif(btrim(coalesce(p_module_key, '')), '');
  v_root_action text := nullif(btrim(coalesce(p_root_action, '')), '');
  v_field_key text := nullif(btrim(coalesce(p_field_key, '')), '');
  v_default_text text := case when coalesce(p_missing_default, true) then 'true' else 'false' end;
begin
  if v_module_key is null then
    return false;
  end if;

  v_current_org := public.current_org_id();
  if v_current_org is null or auth.uid() is null then
    return false;
  end if;

  select r.permissions
    into v_permissions
  from public.user_organization_memberships p
  join public.org_roles r
    on r.id = p.role_id
   and r.org_id = p.org_id
  where p.user_id = auth.uid() and p.is_active
    and p.org_id = v_current_org
  limit 1;

  if v_permissions is null then
    return false;
  end if;

  v_module_permission := coalesce(v_permissions -> v_module_key, '{}'::jsonb);
  if jsonb_typeof(v_module_permission) <> 'object' then
    return coalesce(p_missing_default, true);
  end if;

  if v_root_action is not null
     and lower(coalesce(v_module_permission ->> v_root_action, v_default_text)) <> 'true' then
    return false;
  end if;

  if v_field_key is null then
    return true;
  end if;

  v_fields := coalesce(v_module_permission -> 'fields', '{}'::jsonb);
  if jsonb_typeof(v_fields) <> 'object' then
    return coalesce(p_missing_default, true);
  end if;

  return lower(coalesce(v_fields ->> v_field_key, v_default_text)) = 'true';
end;
$$;

create or replace function public.current_user_has_saas_admin_permission(required_field text default null)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  role_permissions jsonb;
  root_permission jsonb;
  root_fields jsonb;
  field_name text := nullif(trim(coalesce(required_field, '')), '');
  root_edit boolean := false;
  has_view boolean := false;
  current_org uuid;
begin
  select coalesce(p.org_id, r.org_id), r.permissions
    into current_org, role_permissions
  from public.user_organization_memberships p
  join public.org_roles r on r.id = p.role_id and r.org_id=p.org_id
  where p.user_id = auth.uid() and p.is_active and p.org_id = public.current_org_id()
  limit 1;
  if role_permissions is null or not public.org_is_saas_admin(current_org) then return false; end if;
  root_permission := role_permissions -> '__saas_admin';
  if root_permission is null or jsonb_typeof(root_permission) <> 'object' then return false; end if;
  root_fields := coalesce(root_permission -> 'fields', '{}'::jsonb);
  root_edit := coalesce((root_permission ->> 'edit')::boolean, false);
  has_view := coalesce((root_permission ->> 'view')::boolean, false)
    or root_edit
    or coalesce((root_fields ->> 'edit_orgs')::boolean, false)
    or coalesce((root_fields ->> 'edit_requests')::boolean, false)
    or coalesce((root_fields ->> 'edit_user_announcements')::boolean, false)
    or coalesce((root_fields ->> 'demo_override')::boolean, false);
  if not has_view then return false; end if;
  if field_name is null or field_name = 'view' then return true; end if;
  return coalesce((root_permission ->> field_name)::boolean, false)
    or coalesce((root_fields ->> field_name)::boolean, false);
end;
$$;

create or replace function public.kalam_current_profile_role_id(p_org_id uuid default null)
returns uuid language sql stable security definer set search_path=public as $$
 select m.role_id from public.user_organization_memberships m
 where m.user_id=auth.uid() and m.org_id=public.current_org_id() and m.is_active
 and (p_org_id is null or m.org_id=p_org_id) limit 1;
$$;
create or replace function public.current_user_advertising_campaign_role_id()
returns uuid language sql stable security definer set search_path=public as $$
 select public.kalam_current_profile_role_id();
$$;

create or replace function public.check_phone_login_candidate(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_phone text;
  profile_count integer := 0;
  active_profile_count integer := 0;
  auth_count integer := 0;
  phone_identity_count integer := 0;
  single_profile record;
begin
  normalized_phone := public.normalize_iran_mobile_e164(p_phone);

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
      exists(select 1 from public.user_organization_memberships m join public.organizations o on o.id=m.org_id and o.is_active where m.user_id=p.id and m.is_active) as is_active
    from public.profiles p
    left join auth.users u on u.id = p.id
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
        p.id, p.org_id, p.role_id, p.role,
        exists(select 1 from public.user_organization_memberships m join public.organizations o on o.id=m.org_id and o.is_active where m.user_id=p.id and m.is_active) as is_active
      from public.profiles p
      left join auth.users u on u.id = p.id
      where
        public.normalize_iran_mobile_e164(coalesce(p.mobile_1, p.mobile)) = normalized_phone
        or (
          public.normalize_iran_mobile_e164(coalesce(p.mobile_1, p.mobile)) is null
          and public.normalize_iran_mobile_e164(u.phone) = normalized_phone
        )
      order by p.id, p.created_at asc nulls last
    )
    select * into single_profile from matched_profiles limit 1;
  end if;

  with matched_profiles as (
    select p.id
    from public.profiles p
    left join auth.users u on u.id = p.id
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
    and exists (select 1 from matched_profiles mp where mp.id = u.id);

  with matched_profiles as (
    select p.id
    from public.profiles p
    left join auth.users u on u.id = p.id
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
    and exists (select 1 from matched_profiles mp where mp.id = u.id)
    and (
      exists (
        select 1 from auth.identities i
        where i.user_id = u.id and i.provider = 'phone'
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
    'org_id', null,
    'role_id', null,
    'role', null
  );

exception when others then
  -- خطای داخلی → JSON ایمن به‌جای 500.
  -- این باعث می‌شود lookupPhoneLoginCandidate در phoneAuth.ts
  -- مقدار null برنگرداند و login flow بلوک نشود.
  -- مقادیر false باعث می‌شوند کاربر به صورت "ناشناخته" دیده شود؛
  -- login واقعی از طریق OTP توسط Supabase Auth کنترل می‌شود.
  return jsonb_build_object(
    'normalized_phone', normalized_phone,
    'exists_in_profiles', false,
    'exists_in_auth', false,
    'has_phone_identity', false,
    'is_active', false,
    'matched_profile_count', 0,
    'active_profile_count', 0,
    'org_id', null,
    'role_id', null,
    'role', null,
    '_lookup_error', true
  );
end;
$$;

-- Column-limited security-definer source for the existing paginated identity search.
-- It reveals only identities in current_org_id(); no cross-tenant profile RLS exception.
create or replace function public.organization_identity_profiles()
returns table(id uuid,org_id uuid,full_name text,email text,mobile_1 text,job_title text,avatar_url text,role_id uuid,is_active boolean)
language sql stable security definer set search_path=public as $$
 select p.id,m.org_id,p.full_name,
 case when public.can_manage_organization_members() or p.id=auth.uid() then p.email end,
 case when public.can_manage_organization_members() or p.id=auth.uid() then p.mobile_1 end,
 p.job_title,p.avatar_url,m.role_id,m.is_active
 from public.user_organization_memberships m join public.profiles p on p.id=m.user_id
 where m.org_id=public.current_org_id();
$$;
revoke all on function public.organization_identity_profiles() from public,anon;
grant execute on function public.organization_identity_profiles() to authenticated,service_role;

create or replace function public.search_org_identity_options(
  p_query text default null,
  p_scopes text[] default array['user', 'role']::text[],
  p_limit_per_scope integer default 50,
  p_offset integer default 0,
  p_exact_tokens text[] default null
)
returns table (
  kind text,
  id uuid,
  token text,
  label text,
  subtitle text,
  avatar_url text,
  icon_key text,
  role_id uuid,
  hierarchy_rank bigint,
  is_active boolean,
  search_text text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with recursive
  context as (
    select public.current_org_id() as org_id,
           greatest(1, least(coalesce(p_limit_per_scope, 50), 100)) as page_size,
           greatest(0, coalesce(p_offset, 0)) as page_offset,
           nullif(translate(lower(btrim(coalesce(p_query, ''))), 'يىك', 'ییک'), '') as search_term
  ),
  scoped_roles as (
    select r.*
    from public.org_roles r
    cross join context c
    where c.org_id is not null
      and r.org_id = c.org_id
  ),
  role_tree as (
    select
      r.id,
      r.parent_id,
      array[r.id]::uuid[] as visited,
      (lpad((coalesce(r.sort_order, 0) + 1000000000)::text, 10, '0') || ':' || lower(coalesce(r.title, '')) || ':' || r.id::text) as sort_path
    from scoped_roles r
    where r.parent_id is null
       or not exists (select 1 from scoped_roles parent where parent.id = r.parent_id)

    union all

    select
      child.id,
      child.parent_id,
      parent.visited || child.id,
      parent.sort_path || '/' || lpad((coalesce(child.sort_order, 0) + 1000000000)::text, 10, '0') || ':' || lower(coalesce(child.title, '')) || ':' || child.id::text
    from scoped_roles child
    join role_tree parent on parent.id = child.parent_id
    where not child.id = any(parent.visited)
  ),
  role_order as (
    select id, row_number() over (order by sort_path, id)::bigint as hierarchy_rank
    from role_tree
  ),
  raw_options as (
    select
      'user'::text as kind,
      p.id,
      'user:' || p.id::text as token,
      coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.email), ''), nullif(btrim(p.mobile_1), ''), 'کاربر بدون نام') as label,
      coalesce(nullif(btrim(p.job_title), ''), nullif(btrim(r.title), '')) as subtitle,
      p.avatar_url,
      null::text as icon_key,
      p.role_id,
      coalesce(ro.hierarchy_rank, 9223372036854775806::bigint) as hierarchy_rank,
      coalesce(p.is_active, true) as is_active,
      translate(lower(coalesce(p.full_name, '') || ' ' || coalesce(p.email, '') || ' ' || coalesce(p.mobile_1, '') || ' ' || coalesce(p.job_title, '') || ' ' || coalesce(r.title, '')), 'يىك', 'ییک') as search_text
    from public.organization_identity_profiles() p
    cross join context c
    left join scoped_roles r on r.id = p.role_id
    left join role_order ro on ro.id = p.role_id
    where c.org_id is not null
      and p.org_id = c.org_id
      and 'user' = any(coalesce(p_scopes, array['user', 'role']::text[]))

    union all

    select
      'role'::text,
      r.id,
      'role:' || r.id::text,
      coalesce(nullif(btrim(r.title), ''), 'نقش بدون عنوان'),
      'جایگاه سازمانی'::text,
      null::text,
      coalesce(nullif(btrim(r.icon_key), ''), 'team'),
      null::uuid,
      coalesce(ro.hierarchy_rank, 9223372036854775806::bigint),
      true,
      translate(lower(coalesce(r.title, '')), 'يىك', 'ییک')
    from scoped_roles r
    left join role_order ro on ro.id = r.id
    where 'role' = any(coalesce(p_scopes, array['user', 'role']::text[]))

    union all

    select
      'chat_group'::text,
      g.id,
      'chat_group:' || g.id::text,
      coalesce(nullif(btrim(g.name), ''), 'گروه داخلی'),
      'گروه داخلی'::text,
      null::text,
      null::text,
      null::uuid,
      9223372036854775806::bigint,
      true,
      translate(lower(coalesce(g.name, '')), 'يىك', 'ییک')
    from public.chat_groups g
    cross join context c
    where c.org_id is not null
      and g.org_id = c.org_id
      and 'chat_group' = any(coalesce(p_scopes, array['user', 'role']::text[]))
  ),
  filtered as (
    select raw.*
    from raw_options raw
    cross join context c
    where
      case
        when coalesce(cardinality(p_exact_tokens), 0) > 0 then raw.token = any(p_exact_tokens)
        else raw.is_active = true
          and (c.search_term is null or raw.search_text like '%' || c.search_term || '%')
      end
  ),
  ranked as (
    select
      filtered.*,
      count(*) over (partition by filtered.kind) as total_count,
      row_number() over (
        partition by filtered.kind
        order by filtered.hierarchy_rank, translate(lower(filtered.label), 'يىك', 'ییک'), filtered.id
      ) as row_index
    from filtered
  )
  select
    ranked.kind,
    ranked.id,
    ranked.token,
    ranked.label,
    ranked.subtitle,
    ranked.avatar_url,
    ranked.icon_key,
    ranked.role_id,
    ranked.hierarchy_rank,
    ranked.is_active,
    ranked.search_text,
    ranked.total_count
  from ranked
  cross join context c
  where coalesce(cardinality(p_exact_tokens), 0) > 0
     or ranked.row_index between c.page_offset + 1 and c.page_offset + c.page_size
  order by
    case ranked.kind when 'user' then 0 when 'role' then 1 else 2 end,
    ranked.hierarchy_rank,
    translate(lower(ranked.label), 'يىك', 'ییک'),
    ranked.id;
$$;

notify pgrst,'reload schema';
commit;
