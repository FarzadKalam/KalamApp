-- =====================================================
-- KalamApp - Phase 156 protect existing profiles from demo org reassignment
-- Date: 2026-05-19
-- Type: Corrective migration
-- Goal:
--   1) Never reassign an existing profile to a demo org during self-service provisioning
--   2) Force ambiguous existing profiles into admin review instead of mutation
-- =====================================================

begin;

drop function if exists public.provision_self_service_demo(text, text, text, text, text, text);
drop function if exists public.provision_self_service_demo(text, text, text, text, text, text, text, text, text);

create function public.provision_self_service_demo(
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

  if normalized_owner_email is null or normalized_owner_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'ایمیل مدیر اصلی معتبر نیست.';
  end if;

  if normalized_palette_key is null then
    normalized_palette_key := 'kalam_sky';
  end if;

  if normalized_palette_key not in (
    'executive_indigo',
    'corporate_blue',
    'deep_ocean',
    'ruby_red',
    'amber_navy',
    'kalam_sky'
  ) then
    raise exception 'پالت رنگی انتخاب‌شده معتبر نیست.';
  end if;

  insert into public.saas_onboarding_requests (
    auth_user_id,
    full_name,
    mobile,
    business_name,
    employee_count_band,
    discovery_source,
    requested_slug,
    owner_email,
    industry,
    brand_palette_key,
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
    normalized_owner_email,
    normalized_industry,
    normalized_palette_key,
    'started',
    true
  )
  returning * into request_row;

  select *
    into current_profile
  from public.profiles
  where id = current_user_id
  limit 1;

  if current_profile.id is not null then
    update public.saas_onboarding_requests
      set status = 'needs_admin_review',
          failure_code = case when current_profile.org_id is not null then 'profile_already_attached' else 'profile_exists_without_org' end,
          failure_message = case
            when current_profile.org_id is not null
              then 'این شماره قبلاً به یک سازمان متصل شده است و ایجاد دمو جدید برای آن نیاز به بررسی مدیر دارد.'
            else 'برای این کاربر پروفایل موجود اما ناقص شناسایی شد. برای جلوگیری از اتصال اشتباه به سازمان دمو، ادامه متوقف شد و نیاز به بررسی مدیر دارد.'
          end,
          updated_at = now()
    where id = request_row.id;

    return jsonb_build_object(
      'success', false,
      'status', 'needs_admin_review',
      'request_id', request_row.id,
      'message', case
        when current_profile.org_id is not null
          then 'برای این شماره قبلاً یک دسترسی سازمانی وجود دارد. درخواست ثبت شد و نیاز به بررسی مدیر دارد.'
        else 'برای این شماره یک پروفایل ناقص شناسایی شد. برای جلوگیری از جابه‌جایی اشتباه بین سازمان‌ها، درخواست ثبت شد و نیاز به بررسی مدیر دارد.'
      end
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
    'ادمین',
    '{}'::jsonb,
    true
  )
  returning id into admin_role_id;

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
    normalized_owner_email,
    regexp_replace(normalized_mobile, '^\+98', '0'),
    true
  );

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
    'active',
    normalized_mobile,
    current_user_id,
    current_user_id
  );

  insert into public.company_settings (
    org_id,
    company_name,
    company_full_name,
    trade_name,
    brand_palette_key,
    ceo_name,
    mobile,
    email,
    updated_by
  )
  values (
    target_org_id,
    coalesce(nullif(trim(coalesce(p_business_name, '')), ''), trim(p_full_name)),
    coalesce(nullif(trim(coalesce(p_business_name, '')), ''), trim(p_full_name)),
    coalesce(nullif(trim(coalesce(p_business_name, '')), ''), trim(p_full_name)),
    normalized_palette_key,
    trim(p_full_name),
    regexp_replace(normalized_mobile, '^\+98', '0'),
    normalized_owner_email,
    current_user_id
  );

  insert into public.integration_settings (
    org_id,
    connection_type,
    provider,
    settings,
    is_active,
    created_by,
    updated_by
  )
  values (
    target_org_id,
    'ui_theme',
    'branding',
    jsonb_build_object(
      'branding',
      jsonb_build_object(
        'brand_name', coalesce(nullif(trim(coalesce(p_business_name, '')), ''), trim(p_full_name)),
        'short_name', coalesce(nullif(trim(coalesce(p_business_name, '')), ''), trim(p_full_name)),
        'app_title', coalesce(nullif(trim(coalesce(p_business_name, '')), ''), trim(p_full_name)),
        'palette_key', normalized_palette_key
      )
    ),
    true,
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
      'Industry: ' || coalesce(normalized_industry, '-'),
      'Employee band: ' || coalesce(nullif(trim(coalesce(p_employee_count_band, '')), ''), '-'),
      'Discovery source: ' || coalesce(nullif(trim(coalesce(p_discovery_source, '')), ''), '-'),
      'Owner email: ' || normalized_owner_email
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

commit;
