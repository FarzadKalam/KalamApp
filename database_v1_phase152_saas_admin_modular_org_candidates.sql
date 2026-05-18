-- =====================================================
-- KalamApp - Phase 152 SaaS admin modular org candidates
-- Date: 2026-05-18
-- Type: Additive / non-breaking migration
-- Goal:
--   1) candidate view for SaaS org admin list (org + pending demo request)
--   2) manual create/edit for SaaS orgs through RPC
--   3) explicit convert request -> org flow
-- =====================================================

begin;

alter table public.saas_org_settings
  add column if not exists request_id uuid references public.saas_onboarding_requests(id) on delete set null,
  add column if not exists requested_subdomain text,
  add column if not exists owner_name text,
  add column if not exists owner_email text;

create or replace view public.saas_admin_org_candidates_view as
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
  );

alter view public.saas_admin_org_candidates_view owner to authenticated;
grant select on public.saas_admin_org_candidates_view to authenticated;

create or replace function public.admin_upsert_saas_org_candidate(
  p_source_kind text default 'org',
  p_source_id uuid default null,
  p_request_id uuid default null,
  p_org_name text default null,
  p_slug text default null,
  p_status text default 'trial',
  p_plan_code text default null,
  p_is_demo boolean default true,
  p_is_readonly boolean default false,
  p_trial_ends_at timestamptz default null,
  p_primary_contact_mobile text default null,
  p_owner_name text default null,
  p_owner_email text default null,
  p_provisioning_source text default null,
  p_request_status text default null,
  p_industry text default null,
  p_employee_count_band text default null,
  p_discovery_source text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_source_kind text := case when lower(trim(coalesce(p_source_kind, 'org'))) = 'request' then 'request' else 'org' end;
  target_request_id uuid := coalesce(p_request_id, case when lower(trim(coalesce(p_source_kind, 'org'))) = 'request' then p_source_id else null end);
  target_org_id uuid := case when lower(trim(coalesce(p_source_kind, 'org'))) = 'org' then p_source_id else null end;
  request_row public.saas_onboarding_requests%rowtype;
  org_settings_row public.saas_org_settings%rowtype;
  normalized_org_name text := nullif(trim(coalesce(p_org_name, '')), '');
  normalized_slug text := nullif(public.normalize_saas_slug(p_slug), '');
  base_slug text;
  final_slug text;
  slug_counter integer := 0;
  normalized_status text := lower(trim(coalesce(p_status, 'trial')));
begin
  if not public.current_user_has_saas_admin_permission() then
    raise exception 'permission denied';
  end if;

  if normalized_source_kind = 'request' then
    if target_request_id is null then
      return jsonb_build_object('success', false, 'message', 'شناسه درخواست برای ویرایش در دسترس نیست.');
    end if;

    update public.saas_onboarding_requests
    set
      full_name = coalesce(nullif(trim(coalesce(p_owner_name, '')), ''), full_name),
      email = coalesce(nullif(trim(coalesce(p_owner_email, '')), ''), email),
      mobile = coalesce(nullif(trim(coalesce(p_primary_contact_mobile, '')), ''), mobile),
      organization_name = coalesce(normalized_org_name, organization_name),
      business_name = coalesce(normalized_org_name, business_name),
      requested_slug = coalesce(normalized_slug, requested_slug),
      status = coalesce(nullif(trim(coalesce(p_request_status, '')), ''), status),
      is_demo_request = coalesce(p_is_demo, is_demo_request),
      industry = coalesce(nullif(trim(coalesce(p_industry, '')), ''), industry),
      employee_count_band = coalesce(nullif(trim(coalesce(p_employee_count_band, '')), ''), employee_count_band),
      discovery_source = coalesce(nullif(trim(coalesce(p_discovery_source, '')), ''), discovery_source),
      updated_at = now()
    where id = target_request_id
    returning * into request_row;

    if request_row.id is null then
      return jsonb_build_object('success', false, 'message', 'درخواست دمو یافت نشد.');
    end if;

    return jsonb_build_object(
      'success', true,
      'source_id', request_row.id,
      'request_id', request_row.id
    );
  end if;

  if normalized_org_name is null then
    return jsonb_build_object('success', false, 'message', 'نام سازمان الزامی است.');
  end if;

  if target_org_id is not null then
    select * into org_settings_row
    from public.saas_org_settings
    where org_id = target_org_id;
  end if;

  base_slug := coalesce(
    normalized_slug,
    nullif(public.normalize_saas_slug(normalized_org_name), ''),
    'org' || to_char(now(), 'YYMMDDHH24MISS')
  );
  final_slug := base_slug;

  loop
    exit when not exists (
      select 1
      from public.saas_org_settings s
      where lower(coalesce(s.slug, '')) = lower(final_slug)
        and (target_org_id is null or s.org_id <> target_org_id)
    ) and not exists (
      select 1
      from public.organizations o
      where lower(coalesce(o.slug, '')) = lower(final_slug)
        and (target_org_id is null or o.id <> target_org_id)
    );
    slug_counter := slug_counter + 1;
    final_slug := base_slug || '-' || slug_counter::text;
    if slug_counter > 200 then
      return jsonb_build_object('success', false, 'message', 'Slug یکتا پیدا نشد.');
    end if;
  end loop;

  if target_org_id is null then
    insert into public.organizations (
      name,
      slug,
      is_active,
      created_at,
      updated_at
    )
    values (
      normalized_org_name,
      final_slug,
      normalized_status <> 'suspended',
      now(),
      now()
    )
    returning id into target_org_id;

    insert into public.saas_org_settings (
      org_id,
      slug,
      status,
      plan_code,
      trial_ends_at,
      is_demo,
      is_readonly,
      resolved_host,
      dns_status,
      provisioning_source,
      provisioned_at,
      primary_contact_mobile,
      request_id,
      owner_name,
      owner_email,
      created_at,
      updated_at
    )
    values (
      target_org_id,
      final_slug,
      normalized_status,
      nullif(trim(coalesce(p_plan_code, '')), ''),
      p_trial_ends_at,
      coalesce(p_is_demo, true),
      coalesce(p_is_readonly, false),
      null,
      'pending',
      coalesce(nullif(trim(coalesce(p_provisioning_source, '')), ''), 'manual_admin'),
      now(),
      nullif(trim(coalesce(p_primary_contact_mobile, '')), ''),
      target_request_id,
      nullif(trim(coalesce(p_owner_name, '')), ''),
      nullif(trim(coalesce(p_owner_email, '')), ''),
      now(),
      now()
    );
  else
    update public.organizations
    set
      name = normalized_org_name,
      slug = final_slug,
      is_active = normalized_status <> 'suspended',
      updated_at = now()
    where id = target_org_id;

    update public.saas_org_settings
    set
      slug = final_slug,
      status = normalized_status,
      plan_code = nullif(trim(coalesce(p_plan_code, '')), ''),
      trial_ends_at = coalesce(p_trial_ends_at, trial_ends_at),
      is_demo = coalesce(p_is_demo, is_demo),
      is_readonly = coalesce(p_is_readonly, is_readonly),
      primary_contact_mobile = coalesce(nullif(trim(coalesce(p_primary_contact_mobile, '')), ''), primary_contact_mobile),
      provisioning_source = coalesce(nullif(trim(coalesce(p_provisioning_source, '')), ''), provisioning_source),
      request_id = coalesce(target_request_id, request_id),
      owner_name = coalesce(nullif(trim(coalesce(p_owner_name, '')), ''), owner_name),
      owner_email = coalesce(nullif(trim(coalesce(p_owner_email, '')), ''), owner_email),
      updated_at = now()
    where org_id = target_org_id;
  end if;

  if target_request_id is not null then
    update public.saas_onboarding_requests
    set
      org_id = coalesce(org_id, target_org_id),
      organization_name = coalesce(normalized_org_name, organization_name),
      business_name = coalesce(normalized_org_name, business_name),
      requested_slug = coalesce(final_slug, requested_slug),
      full_name = coalesce(nullif(trim(coalesce(p_owner_name, '')), ''), full_name),
      email = coalesce(nullif(trim(coalesce(p_owner_email, '')), ''), email),
      mobile = coalesce(nullif(trim(coalesce(p_primary_contact_mobile, '')), ''), mobile),
      is_demo_request = coalesce(p_is_demo, is_demo_request),
      industry = coalesce(nullif(trim(coalesce(p_industry, '')), ''), industry),
      employee_count_band = coalesce(nullif(trim(coalesce(p_employee_count_band, '')), ''), employee_count_band),
      discovery_source = coalesce(nullif(trim(coalesce(p_discovery_source, '')), ''), discovery_source),
      updated_at = now()
    where id = target_request_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'source_id', target_org_id,
    'org_id', target_org_id
  );
end;
$$;

revoke all on function public.admin_upsert_saas_org_candidate(text, uuid, uuid, text, text, text, text, boolean, boolean, timestamptz, text, text, text, text, text, text, text, text) from public;
grant execute on function public.admin_upsert_saas_org_candidate(text, uuid, uuid, text, text, text, text, boolean, boolean, timestamptz, text, text, text, text, text, text, text, text) to authenticated;

create or replace function public.admin_convert_demo_request_to_org(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.saas_onboarding_requests%rowtype;
  existing_settings public.saas_org_settings%rowtype;
  target_org_id uuid;
  base_name text;
  base_slug text;
  final_slug text;
  slug_counter integer := 0;
  target_plan_code text := null;
  target_trial_days integer := 30;
begin
  if not public.current_user_has_saas_admin_permission() then
    raise exception 'permission denied';
  end if;

  select * into request_row
  from public.saas_onboarding_requests
  where id = p_request_id;

  if request_row.id is null then
    return jsonb_build_object('success', false, 'message', 'درخواست دمو یافت نشد.');
  end if;

  select * into existing_settings
  from public.saas_org_settings
  where request_id = request_row.id
  limit 1;

  if existing_settings.org_id is not null then
    return jsonb_build_object(
      'success', true,
      'message', 'این درخواست قبلاً به سازمان متصل شده است.',
      'source_id', existing_settings.org_id,
      'org_id', existing_settings.org_id
    );
  end if;

  if request_row.org_id is not null then
    select * into existing_settings
    from public.saas_org_settings
    where org_id = request_row.org_id
    limit 1;
    if existing_settings.org_id is not null then
      return jsonb_build_object(
        'success', true,
        'message', 'این درخواست قبلاً به سازمان متصل شده است.',
        'source_id', existing_settings.org_id,
        'org_id', existing_settings.org_id
      );
    end if;
  end if;

  select code, greatest(coalesce(trial_days, 30), 1)
  into target_plan_code, target_trial_days
  from public.saas_plans
  where is_active = true
    and (is_demo_default = true or lower(code) = 'public_demo_full')
  order by is_demo_default desc
  limit 1;

  base_name := coalesce(
    nullif(trim(coalesce(request_row.organization_name, '')), ''),
    nullif(trim(coalesce(request_row.business_name, '')), ''),
    nullif(trim(coalesce(request_row.full_name, '')), ''),
    'سازمان دمو'
  );
  base_slug := coalesce(
    nullif(public.normalize_saas_slug(request_row.requested_slug), ''),
    nullif(public.normalize_saas_slug(base_name), ''),
    'org' || to_char(now(), 'YYMMDDHH24MISS')
  );
  final_slug := base_slug;

  loop
    exit when not exists (
      select 1 from public.saas_org_settings where lower(coalesce(slug, '')) = lower(final_slug)
    ) and not exists (
      select 1 from public.organizations where lower(coalesce(slug, '')) = lower(final_slug)
    );
    slug_counter := slug_counter + 1;
    final_slug := base_slug || '-' || slug_counter::text;
    if slug_counter > 200 then
      return jsonb_build_object('success', false, 'message', 'Slug یکتا برای سازمان پیدا نشد.');
    end if;
  end loop;

  insert into public.organizations (
    name,
    slug,
    is_active,
    created_at,
    updated_at
  )
  values (
    base_name,
    final_slug,
    true,
    now(),
    now()
  )
  returning id into target_org_id;

  insert into public.saas_org_settings (
    org_id,
    slug,
    status,
    plan_code,
    trial_ends_at,
    is_demo,
    is_readonly,
    resolved_host,
    dns_status,
    provisioning_source,
    provisioned_at,
    primary_contact_mobile,
    request_id,
    owner_name,
    owner_email,
    created_at,
    updated_at
  )
  values (
    target_org_id,
    final_slug,
    'trial',
    target_plan_code,
    now() + make_interval(days => target_trial_days),
    coalesce(request_row.is_demo_request, true),
    false,
    final_slug || '.tazesystem.ir',
    'pending',
    'manual_from_request',
    now(),
    nullif(trim(coalesce(request_row.mobile, '')), ''),
    request_row.id,
    nullif(trim(coalesce(request_row.full_name, '')), ''),
    nullif(trim(coalesce(request_row.email, '')), ''),
    now(),
    now()
  );

  update public.saas_onboarding_requests
  set
    org_id = target_org_id,
    status = 'provisioned',
    requested_slug = coalesce(requested_slug, final_slug),
    updated_at = now()
  where id = request_row.id;

  return jsonb_build_object(
    'success', true,
    'message', 'سازمان از روی درخواست دمو ایجاد شد.',
    'source_id', target_org_id,
    'org_id', target_org_id
  );
end;
$$;

revoke all on function public.admin_convert_demo_request_to_org(uuid) from public;
grant execute on function public.admin_convert_demo_request_to_org(uuid) to authenticated;

commit;
