-- =====================================================
-- KalamApp - Phase 144 SaaS foundation
-- Date: 2026-05-14
-- Type: Additive / non-breaking migration
-- Goal: shared-db SaaS foundation for plans, org entitlements,
--       self-service demo onboarding, demo quota, and tenant hosts
-- =====================================================

begin;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'integration_settings_connection_type_check'
  ) then
    alter table public.integration_settings
      drop constraint integration_settings_connection_type_check;
  end if;

  alter table public.integration_settings
    add constraint integration_settings_connection_type_check
    check (
      connection_type in (
        'sms',
        'email',
        'site',
        'module_settings',
        'print_templates',
        'telegram_bot',
        'bale_bot',
        'rubika_bot',
        'portal',
        'voip',
        'saas'
      )
    );
end
$$;

create or replace function public.normalize_saas_slug(value text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      regexp_replace(lower(coalesce(value, '')), '[^a-z0-9\-]+', '-', 'g'),
      '(^-+)|(-+$)',
      '',
      'g'
    ),
    ''
  )
$$;

create or replace function public.normalize_demo_mobile(value text)
returns text
language sql
immutable
as $$
  select case
    when regexp_replace(coalesce(value, ''), '\D+', '', 'g') = '' then null
    when left(regexp_replace(coalesce(value, ''), '\D+', '', 'g'), 2) = '98'
      then '+' || regexp_replace(coalesce(value, ''), '\D+', '', 'g')
    when left(regexp_replace(coalesce(value, ''), '\D+', '', 'g'), 1) = '0'
      then '+98' || substr(regexp_replace(coalesce(value, ''), '\D+', '', 'g'), 2)
    when left(regexp_replace(coalesce(value, ''), '\D+', '', 'g'), 1) = '9'
      then '+98' || regexp_replace(coalesce(value, ''), '\D+', '', 'g')
    else '+' || regexp_replace(coalesce(value, ''), '\D+', '', 'g')
  end
$$;

create table if not exists public.saas_plans (
  id uuid primary key default gen_random_uuid()
);

alter table public.saas_plans
  add column if not exists code text,
  add column if not exists title text not null default '',
  add column if not exists description text,
  add column if not exists is_active boolean not null default true,
  add column if not exists is_public boolean not null default false,
  add column if not exists is_demo_default boolean not null default false,
  add column if not exists trial_days integer not null default 15,
  add column if not exists sort_order integer not null default 100,
  add column if not exists enabled_modules jsonb not null default '{}'::jsonb,
  add column if not exists enabled_features jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_saas_plans_code_unique
  on public.saas_plans (lower(code))
  where code is not null;

create index if not exists idx_saas_plans_public_active
  on public.saas_plans (is_public, is_active, sort_order);

create table if not exists public.saas_org_settings (
  id uuid primary key default gen_random_uuid()
);

alter table public.saas_org_settings
  add column if not exists org_id uuid references public.organizations(id) on delete cascade,
  add column if not exists slug text,
  add column if not exists status text not null default 'draft',
  add column if not exists plan_code text,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists is_demo boolean not null default false,
  add column if not exists is_readonly boolean not null default false,
  add column if not exists module_overrides jsonb not null default '{}'::jsonb,
  add column if not exists feature_overrides jsonb not null default '{}'::jsonb,
  add column if not exists requested_subdomain text,
  add column if not exists resolved_host text,
  add column if not exists provisioning_source text not null default 'manual',
  add column if not exists dns_status text not null default 'pending',
  add column if not exists dns_last_error text,
  add column if not exists primary_contact_mobile text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_saas_org_settings_org_unique
  on public.saas_org_settings (org_id);

create unique index if not exists idx_saas_org_settings_slug_unique
  on public.saas_org_settings (lower(slug))
  where slug is not null;

create table if not exists public.saas_onboarding_requests (
  id uuid primary key default gen_random_uuid()
);

alter table public.saas_onboarding_requests
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists full_name text not null default '',
  add column if not exists mobile text not null default '',
  add column if not exists business_name text,
  add column if not exists employee_count_band text,
  add column if not exists discovery_source text,
  add column if not exists requested_slug text,
  add column if not exists status text not null default 'draft',
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists notes text,
  add column if not exists is_demo_request boolean not null default true,
  add column if not exists provision_attempts integer not null default 0,
  add column if not exists approved_demo_count_snapshot integer not null default 0,
  add column if not exists failure_code text,
  add column if not exists failure_message text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_saas_onboarding_requests_mobile
  on public.saas_onboarding_requests (mobile, created_at desc);

create index if not exists idx_saas_onboarding_requests_status
  on public.saas_onboarding_requests (status, created_at desc);

create table if not exists public.saas_demo_issuance (
  id uuid primary key default gen_random_uuid()
);

alter table public.saas_demo_issuance
  add column if not exists mobile text not null default '',
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists org_id uuid references public.organizations(id) on delete cascade,
  add column if not exists request_id uuid references public.saas_onboarding_requests(id) on delete set null,
  add column if not exists issued_at timestamptz not null default now(),
  add column if not exists issued_by uuid references auth.users(id) on delete set null,
  add column if not exists issuance_mode text not null default 'self_service',
  add column if not exists override_reason text;

create index if not exists idx_saas_demo_issuance_mobile
  on public.saas_demo_issuance (mobile, issued_at desc);

create table if not exists public.saas_demo_mobile_overrides (
  id uuid primary key default gen_random_uuid()
);

alter table public.saas_demo_mobile_overrides
  add column if not exists mobile text not null default '',
  add column if not exists max_demo_count integer not null default 2,
  add column if not exists is_active boolean not null default true,
  add column if not exists notes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_saas_demo_mobile_overrides_mobile_unique
  on public.saas_demo_mobile_overrides (mobile);

create or replace function public.current_user_has_saas_admin_permission(required_field text default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  role_permissions jsonb;
  root_permission jsonb;
  field_name text := nullif(trim(coalesce(required_field, '')), '');
begin
  select r.permissions
    into role_permissions
  from public.profiles p
  join public.org_roles r
    on r.id = p.role_id
  where p.id = auth.uid()
  limit 1;

  if role_permissions is null then
    return false;
  end if;

  root_permission := coalesce(role_permissions -> '__saas_admin', '{}'::jsonb);
  if coalesce((root_permission ->> 'view')::boolean, true) is false then
    return false;
  end if;

  if field_name is null then
    return true;
  end if;

  return coalesce((root_permission -> 'fields' ->> field_name)::boolean, false);
end
$$;

create or replace function public.get_saas_global_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  settings_value jsonb := '{}'::jsonb;
begin
  select coalesce(settings, '{}'::jsonb)
    into settings_value
  from public.integration_settings
  where org_id is null
    and connection_type = 'saas'
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  if settings_value is null then
    settings_value := '{}'::jsonb;
  end if;

  if not (settings_value ? 'demo_policy') then
    settings_value := jsonb_set(
      settings_value,
      '{demo_policy}',
      jsonb_build_object('default_max_demo_count', 2),
      true
    );
  end if;

  return settings_value;
end
$$;

create or replace function public.get_effective_demo_limit(p_mobile text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_mobile text := public.normalize_demo_mobile(p_mobile);
  override_limit integer;
  global_limit integer;
  global_settings jsonb;
begin
  select max_demo_count
    into override_limit
  from public.saas_demo_mobile_overrides
  where mobile = normalized_mobile
    and is_active = true
  limit 1;

  if override_limit is not null then
    return greatest(override_limit, 0);
  end if;

  global_settings := public.get_saas_global_settings();
  global_limit := nullif(global_settings #>> '{demo_policy,default_max_demo_count}', '')::integer;

  return greatest(coalesce(global_limit, 2), 0);
end
$$;

create or replace function public.check_saas_slug_availability(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_slug text := public.normalize_saas_slug(p_slug);
  exists_conflict boolean;
begin
  if normalized_slug is null or length(normalized_slug) < 3 then
    return jsonb_build_object(
      'available', false,
      'normalized_slug', normalized_slug,
      'reason', 'invalid_slug'
    );
  end if;

  select exists (
    select 1
    from public.saas_org_settings
    where lower(slug) = lower(normalized_slug)
  )
  into exists_conflict;

  return jsonb_build_object(
    'available', not exists_conflict,
    'normalized_slug', normalized_slug,
    'reason', case when exists_conflict then 'slug_taken' else null end
  );
end
$$;

create or replace function public.resolve_saas_org_context(
  p_org_id uuid,
  p_org_slug text default null,
  p_hostname text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target record;
  plan_settings record;
  effective_modules jsonb := '{}'::jsonb;
  effective_features jsonb := '{}'::jsonb;
begin
  select s.*, o.name as org_name, o.is_active as org_is_active
    into target
  from public.saas_org_settings s
  join public.organizations o on o.id = s.org_id
  where (p_org_id is not null and s.org_id = p_org_id)
     or (p_org_slug is not null and lower(s.slug) = lower(p_org_slug))
     or (
       p_hostname is not null
       and lower(s.resolved_host) = lower(p_hostname)
     )
  order by s.updated_at desc nulls last
  limit 1;

  if target.org_id is null then
    return null;
  end if;

  select *
    into plan_settings
  from public.saas_plans
  where lower(code) = lower(coalesce(target.plan_code, ''))
  limit 1;

  effective_modules := coalesce(plan_settings.enabled_modules, '{}'::jsonb) || coalesce(target.module_overrides, '{}'::jsonb);
  effective_features := coalesce(plan_settings.enabled_features, '{}'::jsonb) || coalesce(target.feature_overrides, '{}'::jsonb);

  return jsonb_build_object(
    'org_id', target.org_id,
    'org_name', target.org_name,
    'slug', target.slug,
    'status', target.status,
    'plan_code', target.plan_code,
    'trial_ends_at', target.trial_ends_at,
    'is_demo', target.is_demo,
    'is_readonly', target.is_readonly or (target.trial_ends_at is not null and target.trial_ends_at < now()),
    'resolved_host', target.resolved_host,
    'dns_status', target.dns_status,
    'effective_modules', effective_modules,
    'effective_features', effective_features
  );
end
$$;

create or replace function public.get_current_saas_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_org uuid := public.current_org_id();
begin
  if auth.uid() is null or current_org is null then
    return null;
  end if;

  return public.resolve_saas_org_context(current_org, null, null);
end
$$;

create or replace function public.get_public_tenant_host_context(p_hostname text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  hostname text := lower(trim(coalesce(p_hostname, '')));
begin
  if hostname = '' then
    return jsonb_build_object('found', false, 'reason', 'empty_hostname');
  end if;

  return coalesce(
    (
      select jsonb_build_object('found', true, 'context', public.resolve_saas_org_context(null, null, hostname))
    ),
    jsonb_build_object('found', false, 'reason', 'tenant_not_found')
  );
end
$$;

create or replace function public.get_public_demo_wizard_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  global_settings jsonb := public.get_saas_global_settings();
  demo_plan record;
begin
  select *
    into demo_plan
  from public.saas_plans
  where is_active = true
    and (is_demo_default = true or lower(code) = 'public_demo_full')
  order by is_demo_default desc, sort_order asc, created_at asc
  limit 1;

  return jsonb_build_object(
    'default_demo_limit', public.get_effective_demo_limit(null),
    'public_demo_plan', case
      when demo_plan.id is null then null
      else jsonb_build_object(
        'code', demo_plan.code,
        'title', demo_plan.title,
        'description', demo_plan.description,
        'trial_days', demo_plan.trial_days
      )
    end,
    'global_settings', global_settings
  );
end
$$;

create or replace function public.provision_self_service_demo(
  p_full_name text,
  p_mobile text,
  p_business_name text,
  p_employee_count_band text,
  p_discovery_source text,
  p_requested_slug text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_mobile text := public.normalize_demo_mobile(p_mobile);
  normalized_slug text := public.normalize_saas_slug(p_requested_slug);
  current_user_id uuid := auth.uid();
  request_row public.saas_onboarding_requests%rowtype;
  current_profile public.profiles%rowtype;
  target_plan public.saas_plans%rowtype;
  admin_role_id uuid;
  target_org_id uuid;
  existing_issuance_count integer := 0;
  effective_demo_limit integer := 0;
  target_trial_days integer := 15;
  target_redirect_host text;
begin
  if current_user_id is null then
    raise exception 'برای ساخت نسخه دمو باید ابتدا وارد شوید.';
  end if;

  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'نام کامل الزامی است.';
  end if;

  if normalized_mobile is null then
    raise exception 'شماره موبایل معتبر نیست.';
  end if;

  if normalized_slug is null or length(normalized_slug) < 3 then
    raise exception 'ساب‌دامین معتبر نیست.';
  end if;

  insert into public.saas_onboarding_requests (
    auth_user_id,
    full_name,
    mobile,
    business_name,
    employee_count_band,
    discovery_source,
    requested_slug,
    status,
    is_demo_request
  )
  values (
    current_user_id,
    trim(p_full_name),
    normalized_mobile,
    nullif(trim(coalesce(p_business_name, '')), ''),
    nullif(trim(coalesce(p_employee_count_band, '')), ''),
    nullif(trim(coalesce(p_discovery_source, '')), ''),
    normalized_slug,
    'started',
    true
  )
  returning * into request_row;

  select *
    into current_profile
  from public.profiles
  where id = current_user_id
  limit 1;

  if current_profile.id is not null and current_profile.org_id is not null then
    update public.saas_onboarding_requests
      set status = 'needs_admin_review',
          failure_code = 'profile_already_attached',
          failure_message = 'این شماره قبلاً به یک سازمان متصل شده است و ایجاد دمو جدید برای آن نیاز به بررسی مدیر دارد.',
          updated_at = now()
    where id = request_row.id;

    return jsonb_build_object(
      'success', false,
      'status', 'needs_admin_review',
      'request_id', request_row.id,
      'message', 'برای این شماره قبلاً یک دسترسی سازمانی وجود دارد. درخواست ثبت شد و نیاز به بررسی مدیر دارد.'
    );
  end if;

  if (public.check_saas_slug_availability(normalized_slug) ->> 'available')::boolean is false then
    update public.saas_onboarding_requests
      set status = 'failed',
          failure_code = 'slug_taken',
          failure_message = 'این ساب‌دامین قبلاً ثبت شده است.',
          updated_at = now()
    where id = request_row.id;

    raise exception 'این ساب‌دامین قبلاً ثبت شده است.';
  end if;

  select count(*)
    into existing_issuance_count
  from public.saas_demo_issuance
  where mobile = normalized_mobile;

  effective_demo_limit := public.get_effective_demo_limit(normalized_mobile);

  if existing_issuance_count >= effective_demo_limit then
    update public.saas_onboarding_requests
      set status = 'failed',
          approved_demo_count_snapshot = existing_issuance_count,
          failure_code = 'demo_limit_reached',
          failure_message = 'سقف تعداد نسخه دمو برای این شماره تماس پر شده است.',
          updated_at = now()
    where id = request_row.id;

    raise exception 'برای این شماره تماس بیش از حد مجاز نسخه دمو صادر شده است.';
  end if;

  select *
    into target_plan
  from public.saas_plans
  where is_active = true
    and (is_demo_default = true or lower(code) = 'public_demo_full')
  order by is_demo_default desc, sort_order asc, created_at asc
  limit 1;

  if target_plan.id is null then
    update public.saas_onboarding_requests
      set status = 'failed',
          failure_code = 'demo_plan_missing',
          failure_message = 'پلن عمومی دمو هنوز تعریف نشده است.',
          updated_at = now()
    where id = request_row.id;

    raise exception 'پلن عمومی دمو تعریف نشده است.';
  end if;

  target_trial_days := greatest(coalesce(target_plan.trial_days, 15), 1);

  insert into public.organizations (name, slug, is_active)
  values (
    coalesce(nullif(trim(coalesce(p_business_name, '')), ''), trim(p_full_name)),
    normalized_slug,
    true
  )
  returning id into target_org_id;

  insert into public.org_roles (org_id, title, permissions, is_system)
  values (
    target_org_id,
    'admin',
    '{}'::jsonb,
    true
  )
  returning id into admin_role_id;

  if current_profile.id is null then
    insert into public.profiles (
      id,
      org_id,
      role_id,
      role,
      full_name,
      email,
      mobile_1,
      is_active
    )
    values (
      current_user_id,
      target_org_id,
      admin_role_id,
      'admin',
      trim(p_full_name),
      null,
      regexp_replace(normalized_mobile, '^\+98', '0'),
      true
    );
  else
    update public.profiles
      set org_id = target_org_id,
          role_id = admin_role_id,
          role = 'admin',
          full_name = coalesce(nullif(trim(full_name), ''), trim(p_full_name)),
          mobile_1 = coalesce(nullif(trim(mobile_1), ''), regexp_replace(normalized_mobile, '^\+98', '0')),
          is_active = true
    where id = current_user_id;
  end if;

  target_redirect_host := normalized_slug || '.tazesystem.ir';

  insert into public.saas_org_settings (
    org_id,
    slug,
    status,
    plan_code,
    trial_ends_at,
    is_demo,
    is_readonly,
    requested_subdomain,
    resolved_host,
    provisioning_source,
    dns_status,
    primary_contact_mobile,
    created_by,
    updated_by
  )
  values (
    target_org_id,
    normalized_slug,
    'demo',
    target_plan.code,
    now() + make_interval(days => target_trial_days),
    true,
    false,
    normalized_slug,
    target_redirect_host,
    'self_service',
    'pending',
    normalized_mobile,
    current_user_id,
    current_user_id
  );

  insert into public.saas_demo_issuance (
    mobile,
    auth_user_id,
    org_id,
    request_id,
    issued_by,
    issuance_mode
  )
  values (
    normalized_mobile,
    current_user_id,
    target_org_id,
    request_row.id,
    current_user_id,
    'self_service'
  );

  insert into public.marketing_leads (
    org_id,
    name,
    business_name,
    first_name,
    mobile,
    source,
    status,
    lead_type,
    description
  )
  values (
    target_org_id,
    'درخواست دمو تازه سیستم - ' || coalesce(nullif(trim(coalesce(p_business_name, '')), ''), trim(p_full_name)),
    nullif(trim(coalesce(p_business_name, '')), ''),
    trim(p_full_name),
    normalized_mobile,
    'saas_wizard',
    'new',
    'new_lead',
    concat_ws(
      E'\n',
      'Employee band: ' || coalesce(nullif(trim(coalesce(p_employee_count_band, '')), ''), '-'),
      'Discovery source: ' || coalesce(nullif(trim(coalesce(p_discovery_source, '')), ''), '-')
    )
  );

  update public.saas_onboarding_requests
    set org_id = target_org_id,
        status = 'provisioned',
        approved_demo_count_snapshot = existing_issuance_count + 1,
        updated_at = now()
  where id = request_row.id;

  return jsonb_build_object(
    'success', true,
    'status', 'provisioned',
    'request_id', request_row.id,
    'org_id', target_org_id,
    'slug', normalized_slug,
    'redirect_host', target_redirect_host,
    'plan_code', target_plan.code,
    'trial_days', target_trial_days
  );
exception
  when others then
    update public.saas_onboarding_requests
      set status = case when status = 'draft' then 'failed' else status end,
          provision_attempts = provision_attempts + 1,
          failure_code = coalesce(failure_code, 'provision_error'),
          failure_message = coalesce(failure_message, SQLERRM),
          updated_at = now()
    where id = request_row.id;
    raise;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'saas_plans',
    'saas_org_settings',
    'saas_onboarding_requests',
    'saas_demo_issuance',
    'saas_demo_mobile_overrides'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end
$$;

drop policy if exists p_saas_plans_select on public.saas_plans;
create policy p_saas_plans_select
on public.saas_plans
for select
to authenticated
using (public.current_user_has_saas_admin_permission());

drop policy if exists p_saas_plans_modify on public.saas_plans;
create policy p_saas_plans_modify
on public.saas_plans
for all
to authenticated
using (public.current_user_has_saas_admin_permission('edit'))
with check (public.current_user_has_saas_admin_permission('edit'));

drop policy if exists p_saas_org_settings_select on public.saas_org_settings;
create policy p_saas_org_settings_select
on public.saas_org_settings
for select
to authenticated
using (
  public.current_user_has_saas_admin_permission()
  or org_id = public.current_org_id()
);

drop policy if exists p_saas_org_settings_modify on public.saas_org_settings;
create policy p_saas_org_settings_modify
on public.saas_org_settings
for all
to authenticated
using (public.current_user_has_saas_admin_permission('edit'))
with check (public.current_user_has_saas_admin_permission('edit'));

drop policy if exists p_saas_onboarding_requests_select on public.saas_onboarding_requests;
create policy p_saas_onboarding_requests_select
on public.saas_onboarding_requests
for select
to authenticated
using (
  public.current_user_has_saas_admin_permission()
  or auth_user_id = auth.uid()
);

drop policy if exists p_saas_onboarding_requests_insert on public.saas_onboarding_requests;
create policy p_saas_onboarding_requests_insert
on public.saas_onboarding_requests
for insert
to authenticated
with check (
  public.current_user_has_saas_admin_permission('edit')
  or auth_user_id = auth.uid()
);

drop policy if exists p_saas_onboarding_requests_update on public.saas_onboarding_requests;
create policy p_saas_onboarding_requests_update
on public.saas_onboarding_requests
for update
to authenticated
using (
  public.current_user_has_saas_admin_permission('edit')
  or auth_user_id = auth.uid()
)
with check (
  public.current_user_has_saas_admin_permission('edit')
  or auth_user_id = auth.uid()
);

drop policy if exists p_saas_demo_issuance_select on public.saas_demo_issuance;
create policy p_saas_demo_issuance_select
on public.saas_demo_issuance
for select
to authenticated
using (public.current_user_has_saas_admin_permission());

drop policy if exists p_saas_demo_issuance_modify on public.saas_demo_issuance;
create policy p_saas_demo_issuance_modify
on public.saas_demo_issuance
for all
to authenticated
using (public.current_user_has_saas_admin_permission('edit'))
with check (public.current_user_has_saas_admin_permission('edit'));

drop policy if exists p_saas_demo_mobile_overrides_select on public.saas_demo_mobile_overrides;
create policy p_saas_demo_mobile_overrides_select
on public.saas_demo_mobile_overrides
for select
to authenticated
using (public.current_user_has_saas_admin_permission());

drop policy if exists p_saas_demo_mobile_overrides_modify on public.saas_demo_mobile_overrides;
create policy p_saas_demo_mobile_overrides_modify
on public.saas_demo_mobile_overrides
for all
to authenticated
using (public.current_user_has_saas_admin_permission('demo_override'))
with check (public.current_user_has_saas_admin_permission('demo_override'));

insert into public.saas_plans (
  code,
  title,
  description,
  is_active,
  is_public,
  is_demo_default,
  trial_days,
  sort_order,
  enabled_modules,
  enabled_features
)
select
  'public_demo_full',
  'دموی کامل',
  'پلن عمومی کامل برای نسخه‌های دمو و معرفی اولیه محصول.',
  true,
  true,
  true,
  15,
  10,
  jsonb_build_object(
    'products', true,
    'product_bundles', true,
    'warehouses', true,
    'shelves', true,
    'stock_transfers', true,
    'customers', true,
    'suppliers', true,
    'marketing_leads', true,
    'projects', true,
    'tasks', true,
    'invoices', true,
    'purchase_invoices', true,
    'chart_of_accounts', true,
    'journal_entries', true,
    'cash_bank_operations', true,
    'employees', true,
    'attendance_logs', true,
    'leave_requests', true,
    'overtime_requests', true,
    'mission_requests', true,
    'web_forms', true,
    'reports', true,
    'process_templates', true,
    'process_runs', true,
    'counterparty_bot_groups', true,
    'surveys', true
  ),
  jsonb_build_object(
    'ai', true,
    'accounting', true,
    'web_forms', true,
    'workflows', true,
    'portal', true,
    'bots', true,
    'files_gallery', true,
    'reports', true
  )
where not exists (
  select 1 from public.saas_plans where lower(code) = 'public_demo_full'
);

insert into public.integration_settings (
  org_id,
  connection_type,
  provider,
  settings,
  is_active
)
select
  null,
  'saas',
  'core',
  jsonb_build_object(
    'public_demo_plan_code', 'public_demo_full',
    'demo_policy', jsonb_build_object(
      'default_max_demo_count', 2
    )
  ),
  true
where not exists (
  select 1
  from public.integration_settings
  where org_id is null
    and connection_type = 'saas'
);

update public.org_roles
set permissions = jsonb_set(
  coalesce(permissions, '{}'::jsonb),
  '{__saas_admin}',
  jsonb_build_object(
    'view', true,
    'edit', true,
    'delete', true,
    'fields', jsonb_build_object('demo_override', true)
  ),
  true
)
where lower(coalesce(title, '')) in ('super_admin', 'admin')
  and org_id is not null;

notify pgrst, 'reload schema';

commit;
