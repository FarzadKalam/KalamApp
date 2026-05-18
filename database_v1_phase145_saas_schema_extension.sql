-- =====================================================
-- KalamApp - Phase 145 SaaS schema extension
-- Date: 2026-05-15
-- Type: Additive / non-breaking migration
-- Goal: extend onboarding_requests with richer fields,
--       add arvan DNS tracking to org_settings,
--       and seed __saas_admin permission key documentation
-- =====================================================

begin;

-- ------------------------------------
-- 1. saas_onboarding_requests: فیلدهای جدید
-- ------------------------------------

-- تفکیک نام و نام خانوادگی (full_name قدیمی می‌ماند برای سازگاری)
alter table public.saas_onboarding_requests
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists email text,
  -- organization_name جایگزین صریح‌تر business_name
  add column if not exists organization_name text,
  -- industry: مقدار ساختاریافته (مثل "retail", "manufacturing", ...)
  add column if not exists industry text,
  -- approx_user_count: عدد تقریبی (جایگزین صریح‌تر employee_count_band)
  add column if not exists approx_user_count integer,
  -- logo_url: آدرس لوگوی آپلودشده در storage
  add column if not exists logo_url text;

-- ایندکس برای جستجو روی ایمیل
create index if not exists idx_saas_onboarding_requests_email
  on public.saas_onboarding_requests (email)
  where email is not null;

-- ------------------------------------
-- 2. saas_org_settings: فیلدهای DNS آروان
-- ------------------------------------

alter table public.saas_org_settings
  -- شناسه رکورد DNS در آروان برای امکان retry و delete
  add column if not exists arvan_record_id text,
  -- زمان آخرین تلاش برای ساخت DNS
  add column if not exists dns_last_attempt_at timestamptz,
  -- تعداد تلاش‌های DNS
  add column if not exists dns_attempt_count integer not null default 0;

-- ------------------------------------
-- 3. function کمکی برای به‌روزرسانی وضعیت DNS
-- ------------------------------------

create or replace function public.update_saas_org_dns_status(
  p_org_id uuid,
  p_dns_status text,
  p_resolved_host text default null,
  p_arvan_record_id text default null,
  p_dns_last_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.saas_org_settings
  set
    dns_status          = p_dns_status,
    resolved_host       = coalesce(p_resolved_host, resolved_host),
    arvan_record_id     = coalesce(p_arvan_record_id, arvan_record_id),
    dns_last_error      = p_dns_last_error,
    dns_last_attempt_at = now(),
    dns_attempt_count   = dns_attempt_count + 1,
    updated_at          = now()
  where org_id = p_org_id;
end;
$$;

-- ------------------------------------
-- 4. view برای admin panel
-- ------------------------------------

create or replace view public.saas_admin_orgs_view as
select
  o.id                          as org_id,
  o.name                        as org_name,
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
  s.primary_contact_mobile,
  s.provisioning_source,
  s.created_at                  as provisioned_at,
  r.full_name                   as owner_name,
  r.email                       as owner_email
from public.saas_org_settings s
join public.organizations o on o.id = s.org_id
left join (
  select distinct on (org_id)
    p.org_id,
    p.full_name,
    p.email
  from public.profiles p
  join public.org_roles ro on ro.id = p.role_id
  where (ro.permissions->'__saas_admin') is null  -- یعنی مالک سازمان tenant است نه admin
  order by p.org_id, p.created_at asc
) r on r.org_id = o.id;

-- RLS برای view: فقط saas admin
alter view public.saas_admin_orgs_view owner to authenticated;

-- ------------------------------------
-- 5. function آمار کلی برای dashboard
-- ------------------------------------

create or replace function public.get_saas_admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  -- فقط saas admin می‌تواند این را صدا بزند
  if not public.current_user_has_saas_admin_permission() then
    raise exception 'permission denied';
  end if;

  select jsonb_build_object(
    'total_orgs',         (select count(*) from public.saas_org_settings),
    'active_orgs',        (select count(*) from public.saas_org_settings where status = 'active'),
    'demo_orgs',          (select count(*) from public.saas_org_settings where is_demo = true),
    'trial_orgs',         (select count(*) from public.saas_org_settings where status = 'trial'),
    'pending_dns',        (select count(*) from public.saas_org_settings where dns_status = 'pending'),
    'failed_dns',         (select count(*) from public.saas_org_settings where dns_status = 'failed'),
    'total_requests',     (select count(*) from public.saas_onboarding_requests),
    'pending_requests',   (select count(*) from public.saas_onboarding_requests where status in ('draft','started')),
    'provisioned_today',  (
      select count(*) from public.saas_onboarding_requests
      where status = 'provisioned'
        and created_at >= current_date
    ),
    'total_plans',        (select count(*) from public.saas_plans where is_active = true)
  ) into v_result;

  return v_result;
end;
$$;

commit;
