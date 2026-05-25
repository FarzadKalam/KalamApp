-- =====================================================
-- KalamApp - Phase 203: SaaS admin user audit and cleanup
-- Date: 2026-05-25
-- Type: Additive / idempotent security-aware migration
-- Goal:
--   1) Align SaaS system modules with the shared tags contract.
--   2) Expose a controlled all-users audit source for SaaS admins.
--   3) Provide guided delete/preflight operations for demo administration.
-- =====================================================

begin;

alter table if exists public.saas_onboarding_requests
  add column if not exists tags jsonb not null default '[]'::jsonb;

drop view if exists public.saas_admin_org_candidates_view;
create view public.saas_admin_org_candidates_view
with (security_invoker = true) as
with owner_profiles as (
  select distinct on (p.org_id)
    p.org_id,
    p.full_name,
    p.email
  from public.profiles p
  left join public.org_roles ro on ro.id = p.role_id
  where (ro.permissions->'__saas_admin') is null
  order by p.org_id, p.created_at asc
)
select *
from (
  select
    o.id                                        as id,
    'org'::text                                 as source_kind,
    o.id                                        as source_id,
    o.id                                        as org_id,
    s.request_id                                as request_id,
    o.name                                      as org_name,
    coalesce(nullif(trim(s.owner_name), ''), nullif(trim(op.full_name), ''), nullif(trim(r.full_name), '')) as owner_name,
    coalesce(nullif(trim(s.owner_email), ''), nullif(trim(op.email), ''), nullif(trim(r.email), '')) as owner_email,
    coalesce(nullif(trim(s.primary_contact_mobile), ''), nullif(trim(r.mobile), '')) as primary_contact_mobile,
    s.slug,
    s.status,
    s.plan_code,
    s.is_demo,
    s.is_readonly,
    s.trial_ends_at,
    s.resolved_host,
    s.dns_status,
    s.dns_last_error,
    s.arvan_record_id,
    s.dns_attempt_count,
    s.provisioning_source,
    s.created_at                                as provisioned_at,
    'provisioned'::text                         as provision_state,
    r.industry,
    r.employee_count_band,
    r.discovery_source,
    '[]'::jsonb                                 as tags,
    coalesce(s.created_at, o.created_at)        as created_at,
    coalesce(s.updated_at, o.updated_at)        as updated_at,
    null::uuid                                  as created_by,
    null::uuid                                  as updated_by
  from public.saas_org_settings s
  join public.organizations o on o.id = s.org_id
  left join public.saas_onboarding_requests r on r.id = s.request_id
  left join owner_profiles op on op.org_id = o.id

  union all

  select
    r.id                                        as id,
    'request'::text                             as source_kind,
    r.id                                        as source_id,
    null::uuid                                  as org_id,
    r.id                                        as request_id,
    coalesce(nullif(trim(r.organization_name), ''), nullif(trim(r.business_name), ''), nullif(trim(r.full_name), ''), 'درخواست دمو') as org_name,
    nullif(trim(r.full_name), '')               as owner_name,
    nullif(trim(r.email), '')                   as owner_email,
    nullif(trim(r.mobile), '')                  as primary_contact_mobile,
    nullif(public.normalize_saas_slug(r.requested_slug), '') as slug,
    r.status,
    null::text                                  as plan_code,
    coalesce(r.is_demo_request, true)           as is_demo,
    false                                       as is_readonly,
    null::timestamptz                           as trial_ends_at,
    null::text                                  as resolved_host,
    'pending'::text                             as dns_status,
    r.failure_message                           as dns_last_error,
    null::text                                  as arvan_record_id,
    0::integer                                  as dns_attempt_count,
    'demo_request'::text                        as provisioning_source,
    r.created_at                                as provisioned_at,
    'request_pending'::text                     as provision_state,
    r.industry,
    r.employee_count_band,
    r.discovery_source,
    coalesce(r.tags, '[]'::jsonb)              as tags,
    r.created_at,
    r.updated_at,
    null::uuid                                  as created_by,
    null::uuid                                  as updated_by
  from public.saas_onboarding_requests r
  where r.org_id is null
    and not exists (
      select 1
      from public.saas_org_settings s
      where s.request_id = r.id
    )
) scoped
where public.current_user_has_saas_admin_permission();

grant select on public.saas_admin_org_candidates_view to authenticated;

create or replace function public.saas_admin_user_audit_rows()
returns table (
  id uuid,
  profile_exists boolean,
  auth_exists boolean,
  full_name text,
  email text,
  mobile text,
  org_id uuid,
  org_name text,
  org_slug text,
  role_id uuid,
  role_title text,
  software_role text,
  is_active boolean,
  is_demo boolean,
  phone_confirmed boolean,
  audit_status text,
  issues text,
  tags jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with audited as (
    select
      coalesce(u.id, p.id) as id,
      p.id is not null as profile_exists,
      u.id is not null as auth_exists,
      nullif(trim(coalesce(p.full_name, u.raw_user_meta_data->>'full_name', '')), '') as full_name,
      nullif(trim(coalesce(p.email, u.email, '')), '') as email,
      nullif(trim(coalesce(p.mobile_1, p.mobile, u.phone, '')), '') as mobile,
      p.org_id,
      o.name as org_name,
      o.slug as org_slug,
      p.role_id,
      r.title as role_title,
      p.role as software_role,
      coalesce(p.is_active, false) as is_active,
      coalesce(s.is_demo, false) as is_demo,
      u.phone_confirmed_at is not null as phone_confirmed,
      array_remove(array[
        case when u.id is not null and p.id is null then 'حساب ورود بدون پروفایل' end,
        case when p.id is not null and u.id is null then 'پروفایل بدون حساب ورود' end,
        case when p.id is not null and nullif(trim(coalesce(p.full_name, '')), '') is null then 'نام ثبت نشده' end,
        case when p.id is not null and p.org_id is null then 'سازمان ندارد' end,
        case when p.id is not null and p.role_id is null then 'نقش سازمانی ندارد' end,
        case when p.role_id is not null and r.org_id is distinct from p.org_id then 'نقش متعلق به سازمان دیگری است' end,
        case when p.id is not null and coalesce(p.is_active, false) = false then 'کاربر غیرفعال' end,
        case when nullif(trim(coalesce(p.email, '')), '') is not null
               and nullif(trim(coalesce(u.email, '')), '') is not null
               and lower(trim(p.email)) <> lower(trim(u.email)) then 'ایمیل پروفایل با حساب ورود متفاوت است' end,
        case when nullif(trim(coalesce(p.mobile_1, p.mobile, '')), '') is not null
               and nullif(trim(coalesce(u.phone, '')), '') is not null
               and public.normalize_demo_mobile(coalesce(p.mobile_1, p.mobile))
                   <> public.normalize_demo_mobile(u.phone) then 'موبایل پروفایل با حساب ورود متفاوت است' end,
        case when u.phone is not null and u.phone_confirmed_at is null then 'ورود پیامکی تایید نشده' end
      ], null) as issue_list,
      coalesce(p.tags, '[]'::jsonb) as tags,
      coalesce(p.created_at, u.created_at) as created_at,
      p.updated_at as updated_at
    from auth.users u
    full join public.profiles p on p.id = u.id
    left join public.organizations o on o.id = p.org_id
    left join public.org_roles r on r.id = p.role_id
    left join public.saas_org_settings s on s.org_id = p.org_id
    where public.current_user_has_saas_admin_permission()
  )
  select
    id,
    profile_exists,
    auth_exists,
    full_name,
    email,
    mobile,
    org_id,
    org_name,
    org_slug,
    role_id,
    role_title,
    software_role,
    is_active,
    is_demo,
    phone_confirmed,
    case
      when not auth_exists or not profile_exists
        or issues like '%متفاوت است%'
        or issues like '%سازمان دیگری%'
      then 'critical'
      when issues like '%سازمان ندارد%'
        or issues like '%نقش سازمانی ندارد%'
        or issues like '%نام ثبت نشده%'
        or issues like '%غیرفعال%'
      then 'repair_required'
      when issues like '%ورود پیامکی تایید نشده%'
      then 'warning'
      else 'healthy'
    end as audit_status,
    coalesce(array_to_string(issue_list, ' | '), 'صحیح') as issues,
    tags,
    created_at,
    updated_at
  from (
    select a.*, array_to_string(a.issue_list, ' | ') as issues
    from audited a
  ) listed
$$;

revoke all on function public.saas_admin_user_audit_rows() from public;
grant execute on function public.saas_admin_user_audit_rows() to authenticated;

drop view if exists public.saas_admin_users_view;
create view public.saas_admin_users_view
with (security_invoker = true) as
select *
from public.saas_admin_user_audit_rows();

grant select on public.saas_admin_users_view to authenticated;

create or replace function public.admin_saas_user_directory_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.current_user_has_saas_admin_permission() then
    raise exception 'permission denied';
  end if;
  return jsonb_build_object(
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'value', o.id,
        'label', o.name,
        'slug', o.slug,
        'is_demo', coalesce(s.is_demo, false)
      ) order by o.name)
      from public.organizations o
      left join public.saas_org_settings s on s.org_id = o.id
      where coalesce(o.is_active, true)
    ), '[]'::jsonb),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'value', r.id,
        'label', r.title,
        'org_id', r.org_id
      ) order by r.title)
      from public.org_roles r
    ), '[]'::jsonb)
  );
end
$$;

revoke all on function public.admin_saas_user_directory_options() from public;
grant execute on function public.admin_saas_user_directory_options() to authenticated;

create or replace function public.admin_saas_user_delete_preflight(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_profile public.profiles%rowtype;
  target_role public.org_roles%rowtype;
  target_org_name text;
  target_is_demo boolean := false;
  remaining_admins integer := 0;
begin
  if not public.current_user_has_saas_admin_permission() then
    raise exception 'permission denied';
  end if;
  if p_user_id = auth.uid() then
    return jsonb_build_object('allowed', false, 'message', 'نمی‌توانید حساب کاربری خودتان را حذف کنید.');
  end if;

  select * into target_profile from public.profiles where id = p_user_id;
  if target_profile.id is not null then
    select * into target_role from public.org_roles where id = target_profile.role_id;
    select o.name, coalesce(s.is_demo, false)
      into target_org_name, target_is_demo
    from public.organizations o
    left join public.saas_org_settings s on s.org_id = o.id
    where o.id = target_profile.org_id;
  end if;

  if coalesce((target_role.permissions -> '__saas_admin' ->> 'view')::boolean, false)
     or coalesce((target_role.permissions -> '__saas_admin' ->> 'edit')::boolean, false) then
    select count(*) into remaining_admins
    from public.profiles p
    join public.org_roles r on r.id = p.role_id
    where p.id <> p_user_id
      and coalesce(p.is_active, true)
      and (
        coalesce((r.permissions -> '__saas_admin' ->> 'view')::boolean, false)
        or coalesce((r.permissions -> '__saas_admin' ->> 'edit')::boolean, false)
      );
    if remaining_admins = 0 then
      return jsonb_build_object('allowed', false, 'message', 'آخرین مدیر تازه سیستم قابل حذف نیست.');
    end if;
  end if;

  return jsonb_build_object(
    'allowed', true,
    'profile_exists', target_profile.id is not null,
    'name', coalesce(target_profile.full_name, 'حساب بدون پروفایل'),
    'organization_name', target_org_name,
    'is_demo', target_is_demo
  );
end
$$;

revoke all on function public.admin_saas_user_delete_preflight(uuid) from public;
grant execute on function public.admin_saas_user_delete_preflight(uuid) to authenticated;

create or replace function public.admin_saas_delete_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.saas_onboarding_requests%rowtype;
begin
  if not public.current_user_has_saas_admin_permission() then
    raise exception 'permission denied';
  end if;
  select * into target from public.saas_onboarding_requests where id = p_request_id;
  if target.id is null then
    return jsonb_build_object('success', false, 'message', 'درخواست پیدا نشد.');
  end if;
  if target.org_id is not null or target.status not in ('draft', 'failed', 'cancelled', 'needs_admin_review') then
    return jsonb_build_object('success', false, 'message', 'این درخواست به سازمان متصل است یا در وضعیت قابل حذف نیست.');
  end if;
  delete from public.saas_onboarding_requests where id = p_request_id;
  return jsonb_build_object('success', true, 'message', 'درخواست دمو حذف شد.');
end
$$;

revoke all on function public.admin_saas_delete_request(uuid) from public;
grant execute on function public.admin_saas_delete_request(uuid) to authenticated;

create or replace function public.admin_saas_demo_delete_preflight(p_org_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  org_name text;
  demo boolean;
  users_count integer;
  seeded_count integer;
begin
  if not public.current_user_has_saas_admin_permission() then
    raise exception 'permission denied';
  end if;
  select o.name, s.is_demo into org_name, demo
  from public.organizations o join public.saas_org_settings s on s.org_id = o.id
  where o.id = p_org_id;
  if org_name is null or demo is not true then
    return jsonb_build_object('allowed', false, 'message', 'حذف دائمی فقط برای نسخه دمو مجاز است.');
  end if;
  select count(*) into users_count from public.profiles where org_id = p_org_id;
  select count(*) into seeded_count from public.demo_seed_records where org_id = p_org_id;
  return jsonb_build_object(
    'allowed', true,
    'organization_name', org_name,
    'users_count', users_count,
    'seeded_records_count', seeded_count,
    'user_ids', coalesce((select jsonb_agg(p.id) from public.profiles p where p.org_id = p_org_id), '[]'::jsonb)
  );
end
$$;

revoke all on function public.admin_saas_demo_delete_preflight(uuid) from public;
grant execute on function public.admin_saas_demo_delete_preflight(uuid) to authenticated;

create or replace function public.admin_saas_delete_demo_org(p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_name text;
  target_demo boolean;
  target_table record;
begin
  if not public.current_user_has_saas_admin_permission() then
    raise exception 'permission denied';
  end if;
  select o.name, s.is_demo into target_name, target_demo
  from public.organizations o join public.saas_org_settings s on s.org_id = o.id
  where o.id = p_org_id
  for update;
  if target_name is null or target_demo is not true then
    return jsonb_build_object('success', false, 'message', 'حذف دائمی فقط برای نسخه دمو مجاز است.');
  end if;

  for target_table in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'org_id'
      and t.table_type = 'BASE TABLE'
      and c.table_name <> 'organizations'
    order by case
      when c.table_name = 'profiles' then 90
      when c.table_name = 'org_roles' then 100
      when c.table_name = 'saas_org_settings' then 110
      else 10
    end
  loop
    execute format('delete from public.%I where org_id = $1', target_table.table_name) using p_org_id;
  end loop;

  delete from public.organizations where id = p_org_id;
  return jsonb_build_object('success', true, 'message', 'نسخه دمو و داده‌های وابسته حذف شد.');
exception
  when foreign_key_violation then
    raise exception 'حذف نسخه دمو به دلیل وابستگی داده‌ای متوقف شد. پیش از حذف، وابستگی‌های باقی‌مانده بررسی شود.';
end
$$;

revoke all on function public.admin_saas_delete_demo_org(uuid) from public;
grant execute on function public.admin_saas_delete_demo_org(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
