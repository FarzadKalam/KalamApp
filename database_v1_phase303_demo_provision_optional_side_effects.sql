-- =====================================================
-- KalamApp - Phase 303 Demo Provision Optional Side Effects
-- Date: 2026-06-30
-- Type: Corrective / idempotent migration
-- Goal:
--   Prevent non-critical tenant bootstrap rows from rolling back the demo
--   organization after OTP verification.
-- =====================================================

begin;

create or replace function public.provision_self_service_demo(
  p_full_name text,
  p_mobile text,
  p_business_name text,
  p_employee_count_band text,
  p_discovery_source text,
  p_requested_slug text,
  p_owner_email text default null,
  p_industry text default null,
  p_brand_palette_key text default 'kalam_sky'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_mobile text := public.normalize_demo_mobile(p_mobile);
  normalized_slug text := public.normalize_saas_slug(p_requested_slug);
  normalized_owner_email text := lower(nullif(trim(coalesce(p_owner_email, '')), ''));
  normalized_industry text := nullif(trim(coalesce(p_industry, '')), '');
  normalized_palette_key text := lower(nullif(trim(coalesce(p_brand_palette_key, '')), ''));
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
  display_business_name text;
  optional_warnings jsonb := '[]'::jsonb;
begin
  if current_user_id is null then
    raise exception 'demo_auth_required';
  end if;

  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'demo_full_name_required';
  end if;

  if normalized_mobile is null then
    raise exception 'demo_mobile_invalid';
  end if;

  if normalized_slug is null or length(normalized_slug) < 3 then
    raise exception 'demo_slug_invalid';
  end if;

  if normalized_owner_email is null or normalized_owner_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'demo_owner_email_invalid';
  end if;

  if normalized_palette_key is null then
    normalized_palette_key := 'kalam_sky';
  end if;

  if normalized_palette_key not in (
    'executive_indigo', 'corporate_blue', 'deep_ocean',
    'ruby_red', 'amber_navy', 'kalam_sky'
  ) then
    normalized_palette_key := 'kalam_sky';
  end if;

  display_business_name := coalesce(nullif(trim(coalesce(p_business_name, '')), ''), trim(p_full_name));

  insert into public.saas_onboarding_requests (
    auth_user_id, full_name, mobile, business_name,
    employee_count_band, discovery_source, requested_slug,
    owner_email, industry, brand_palette_key, status, is_demo_request
  )
  values (
    current_user_id,
    trim(p_full_name),
    normalized_mobile,
    nullif(trim(coalesce(p_business_name, '')), ''),
    nullif(trim(coalesce(p_employee_count_band, '')), ''),
    nullif(trim(coalesce(p_discovery_source, '')), ''),
    normalized_slug,
    normalized_owner_email,
    normalized_industry,
    normalized_palette_key,
    'started',
    true
  )
  returning * into request_row;

  select * into current_profile
  from public.profiles
  where id = current_user_id
  limit 1;

  if current_profile.id is not null
     and (current_profile.org_id is not null or current_profile.role_id is not null) then
    update public.saas_onboarding_requests
      set status = 'needs_admin_review',
          failure_code = case
            when current_profile.org_id is not null then 'profile_already_attached'
            else 'profile_role_without_org'
          end,
          failure_message = case
            when current_profile.org_id is not null
              then 'This account is already attached to an organization.'
            else 'This account has an incomplete organization role.'
          end,
          updated_at = now()
    where id = request_row.id;

    return jsonb_build_object(
      'success', false,
      'status', 'needs_admin_review',
      'request_id', request_row.id,
      'message', 'needs_admin_review'
    );
  end if;

  if (public.check_saas_slug_availability(normalized_slug) ->> 'available')::boolean is false then
    update public.saas_onboarding_requests
      set status = 'failed',
          failure_code = 'slug_taken',
          failure_message = 'slug_taken',
          updated_at = now()
    where id = request_row.id;
    raise exception 'slug_taken';
  end if;

  select count(*) into existing_issuance_count
  from public.saas_demo_issuance
  where mobile = normalized_mobile;

  effective_demo_limit := public.get_effective_demo_limit(normalized_mobile);

  if existing_issuance_count >= effective_demo_limit then
    update public.saas_onboarding_requests
      set status = 'failed',
          approved_demo_count_snapshot = existing_issuance_count,
          failure_code = 'demo_limit_reached',
          failure_message = 'demo_limit_reached',
          updated_at = now()
    where id = request_row.id;
    raise exception 'demo_limit_reached';
  end if;

  select * into target_plan
  from public.saas_plans
  where is_active = true
    and (is_demo_default = true or lower(code) = 'public_demo_full')
  order by is_demo_default desc, sort_order asc, created_at asc
  limit 1;

  if target_plan.id is null then
    update public.saas_onboarding_requests
      set status = 'failed',
          failure_code = 'demo_plan_missing',
          failure_message = 'demo_plan_missing',
          updated_at = now()
    where id = request_row.id;
    raise exception 'demo_plan_missing';
  end if;

  target_trial_days := greatest(coalesce(target_plan.trial_days, 15), 1);

  insert into public.organizations (name, slug, is_active)
  values (display_business_name, normalized_slug, true)
  returning id into target_org_id;

  insert into public.org_roles (org_id, title, permissions, is_system)
  values (target_org_id, 'ادمین', '{}'::jsonb, true)
  returning id into admin_role_id;

  insert into public.profiles (
    id, org_id, role_id, role,
    full_name, email, mobile_1, is_active
  )
  values (
    current_user_id,
    target_org_id,
    admin_role_id,
    'admin',
    trim(p_full_name),
    normalized_owner_email,
    regexp_replace(normalized_mobile, '^\+98', '0'),
    true
  )
  on conflict (id) do update
    set org_id = excluded.org_id,
        role_id = excluded.role_id,
        role = excluded.role,
        full_name = excluded.full_name,
        email = excluded.email,
        mobile_1 = excluded.mobile_1,
        is_active = true,
        updated_at = now()
    where public.profiles.org_id is null
      and public.profiles.role_id is null;

  if not exists (
    select 1
    from public.profiles p
    where p.id = current_user_id
      and p.org_id = target_org_id
      and p.role_id = admin_role_id
  ) then
    raise exception 'demo_profile_attach_failed';
  end if;

  target_redirect_host := normalized_slug || '.tazesystem.ir';

  insert into public.saas_org_settings (
    org_id, slug, status, plan_code, trial_ends_at,
    is_demo, is_readonly, requested_subdomain, resolved_host,
    provisioning_source, dns_status, primary_contact_mobile,
    created_by, updated_by
  )
  values (
    target_org_id, normalized_slug, 'demo', target_plan.code,
    now() + make_interval(days => target_trial_days),
    true, false, normalized_slug, target_redirect_host,
    'self_service', 'active', normalized_mobile,
    current_user_id, current_user_id
  );

  insert into public.saas_demo_issuance (
    mobile, auth_user_id, org_id, request_id, issued_by, issuance_mode
  )
  values (
    normalized_mobile, current_user_id, target_org_id,
    request_row.id, current_user_id, 'self_service'
  );

  begin
    insert into public.company_settings (
      org_id, company_name, company_full_name, trade_name,
      brand_palette_key, ceo_name, mobile, email, updated_by
    )
    values (
      target_org_id,
      display_business_name,
      display_business_name,
      display_business_name,
      normalized_palette_key,
      trim(p_full_name),
      regexp_replace(normalized_mobile, '^\+98', '0'),
      normalized_owner_email,
      current_user_id
    );
  exception when others then
    optional_warnings := optional_warnings || jsonb_build_array(jsonb_build_object(
      'step', 'company_settings',
      'message', SQLERRM
    ));
  end;

  begin
    insert into public.integration_settings (
      org_id, connection_type, provider, settings, is_active, created_by, updated_by
    )
    values (
      target_org_id, 'ui_theme', 'branding',
      jsonb_build_object(
        'branding', jsonb_build_object(
          'brand_name', display_business_name,
          'short_name', display_business_name,
          'app_title', display_business_name,
          'palette_key', normalized_palette_key
        )
      ),
      true, current_user_id, current_user_id
    );
  exception when others then
    optional_warnings := optional_warnings || jsonb_build_array(jsonb_build_object(
      'step', 'integration_settings',
      'message', SQLERRM
    ));
  end;

  begin
    insert into public.marketing_leads (
      org_id, name, business_name, first_name, mobile,
      source, status, lead_type, description
    )
    values (
      target_org_id,
      'درخواست دمو تازه سیستم - ' || display_business_name,
      nullif(trim(coalesce(p_business_name, '')), ''),
      trim(p_full_name),
      normalized_mobile,
      'saas_wizard', 'new', 'new_lead',
      concat_ws(E'\n',
        'Industry: ' || coalesce(normalized_industry, '-'),
        'Employee band: ' || coalesce(nullif(trim(coalesce(p_employee_count_band, '')), ''), '-'),
        'Discovery source: ' || coalesce(nullif(trim(coalesce(p_discovery_source, '')), ''), '-'),
        'Owner email: ' || normalized_owner_email
      )
    );
  exception when others then
    optional_warnings := optional_warnings || jsonb_build_array(jsonb_build_object(
      'step', 'marketing_leads',
      'message', SQLERRM
    ));
  end;

  update public.saas_onboarding_requests
    set org_id = target_org_id,
        status = 'provisioned',
        approved_demo_count_snapshot = existing_issuance_count + 1,
        notes = case
          when jsonb_array_length(optional_warnings) = 0 then notes
          else concat_ws(E'\n', nullif(notes, ''), 'optional_warnings=' || optional_warnings::text)
        end,
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
    'trial_days', target_trial_days,
    'optional_warnings', optional_warnings
  );

exception when others then
  if request_row.id is not null then
    update public.saas_onboarding_requests
      set status = case
            when coalesce(status, '') in ('', 'draft', 'started') then 'failed'
            else status
          end,
          provision_attempts = provision_attempts + 1,
          failure_code = coalesce(failure_code, 'provision_error'),
          failure_message = SQLERRM,
          updated_at = now()
    where id = request_row.id;
  end if;
  raise;
end
$$;

revoke all on function public.provision_self_service_demo(text, text, text, text, text, text, text, text, text) from public;
revoke all on function public.provision_self_service_demo(text, text, text, text, text, text, text, text, text) from anon;
grant execute on function public.provision_self_service_demo(text, text, text, text, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
