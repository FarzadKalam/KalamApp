-- =====================================================
-- KalamApp - Phase 204: SaaS admin views — process template columns
-- Date: 2026-05-25
-- Type: Schema repair / idempotent
-- Problem:
--   withProcessModuleSupport() in moduleRegistry.ts injects
--   process_template_id + execution_process_draft into EVERY module's
--   field list (including saas_orgs, saas_demo_requests, saas_users).
--   buildModuleListRowSelect() then tries to SELECT those columns from
--   the underlying table/view and gets:
--     "column saas_admin_org_candidates_view.process_template_id does not exist"
-- Fix:
--   1. Add process_template_id + execution_process_draft to saas_onboarding_requests (table).
--   2. Rebuild saas_admin_org_candidates_view with those columns (both UNION branches).
--   3. Rebuild saas_admin_user_audit_rows() + saas_admin_users_view with those columns.
-- =====================================================

begin;

-- ─────────────────────────────────────────────
-- ۱. جدول saas_onboarding_requests
-- ─────────────────────────────────────────────
alter table if exists public.saas_onboarding_requests
  add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists execution_process_draft jsonb not null default '{}'::jsonb;

-- ─────────────────────────────────────────────
-- ۲. بازسازی saas_admin_org_candidates_view
--    (phase 203 آن را بازسازی کرد اما process_template_id ندارد)
-- ─────────────────────────────────────────────
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
    null::uuid                                  as process_template_id,
    '{}'::jsonb                                 as execution_process_draft,
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
    r.process_template_id                       as process_template_id,
    coalesce(r.execution_process_draft, '{}'::jsonb) as execution_process_draft,
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

-- ─────────────────────────────────────────────
-- ۳. بازسازی saas_admin_user_audit_rows() + saas_admin_users_view
--    اضافه کردن process_template_id + execution_process_draft
-- ─────────────────────────────────────────────
drop view if exists public.saas_admin_users_view;
drop function if exists public.saas_admin_user_audit_rows();

create function public.saas_admin_user_audit_rows()
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
  process_template_id uuid,
  execution_process_draft jsonb,
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
    null::uuid    as process_template_id,
    '{}'::jsonb   as execution_process_draft,
    created_at,
    updated_at
  from (
    select a.*, array_to_string(a.issue_list, ' | ') as issues
    from audited a
  ) listed
$$;

revoke all on function public.saas_admin_user_audit_rows() from public;
grant execute on function public.saas_admin_user_audit_rows() to authenticated;

create view public.saas_admin_users_view
with (security_invoker = true) as
select *
from public.saas_admin_user_audit_rows();

grant select on public.saas_admin_users_view to authenticated;

-- ─────────────────────────────────────────────
-- ۵. بررسی نهایی
-- ─────────────────────────────────────────────
do $$
begin
  raise notice 'Phase 204: SaaS admin process_template columns repair complete.';
  raise notice '  - saas_onboarding_requests: process_template_id + execution_process_draft added';
  raise notice '  - saas_admin_org_candidates_view: rebuilt with process_template_id + execution_process_draft';
  raise notice '  - saas_admin_user_audit_rows(): rebuilt with process_template_id + execution_process_draft';
  raise notice '  - saas_admin_users_view: rebuilt';
end
$$;

notify pgrst, 'reload schema';

commit;
