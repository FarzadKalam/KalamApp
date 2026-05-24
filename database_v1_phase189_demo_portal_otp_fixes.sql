-- =====================================================
-- KalamApp - Phase 189: Demo Portal OTP & Access Field Fixes
-- Date: 2026-05-24
-- Type: Corrective / idempotent migration
-- Goal:
--   1) Re-apply check_phone_login_candidate with defensive exception handling
--      so server errors return graceful JSON instead of 500.
--      NOTE: anon access is KEPT — login page needs it before OTP is sent.
--   2) Update provision_self_service_demo to set explicit default admin
--      permissions so the demo org admin can access all modules on first login.
--   3) Reload PostgREST schema cache.
--   4) Backfill orphaned demo users that phase 174 may have missed.
-- =====================================================

begin;

-- ── 1. Re-apply check_phone_login_candidate (defensive version) ───────────────
-- هر exception داخلی → JSON با مقادیر پیش‌فرض ایمن (به‌جای 500).
-- دسترسی anon حفظ می‌شود چون صفحه Login قبل از OTP این RPC را صدا می‌زند.

create or replace function public.check_phone_login_candidate(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
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
      coalesce(p.is_active, true) as is_active
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
        coalesce(p.is_active, true) as is_active
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
    'org_id', case when profile_count = 1 then single_profile.org_id else null end,
    'role_id', case when profile_count = 1 then single_profile.role_id else null end,
    'role', case when profile_count = 1 then single_profile.role else null end
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

-- grants: anon دسترسی دارد (صفحه Login قبل از OTP این RPC را صدا می‌زند)
revoke all on function public.check_phone_login_candidate(text) from public;
grant execute on function public.check_phone_login_candidate(text) to anon, authenticated;

-- ── 2. Update provision_self_service_demo — تکمیل فیلدهای دسترسی ─────────────
-- تغییر کلیدی: org_roles با permissions پیش‌فرض کامل ساخته می‌شود.
-- empty permissions ({}) در این سیستم به معنای دسترسی کامل است (undefined !== false = true)
-- اما برای صراحت و جلوگیری از هرگونه ابهام، admin_permissions را explicit می‌گذاریم.
-- این باعث می‌شود login، dashboard و همه ماژول‌ها بدون مشکل کار کنند.

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
  -- permissions پیش‌فرض ادمین: دسترسی کامل به همه بخش‌ها
  default_admin_permissions jsonb;
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
    'executive_indigo', 'corporate_blue', 'deep_ocean',
    'ruby_red', 'amber_navy', 'kalam_sky'
  ) then
    raise exception 'پالت رنگی انتخاب‌شده معتبر نیست.';
  end if;

  -- ساخت permissions پیش‌فرض برای ادمین اول سازمان
  -- شامل دسترسی کامل به تنظیمات، داشبورد، گزارشات، فایل‌ها، حسابداری
  default_admin_permissions := jsonb_build_object(
    '__settings_tabs', jsonb_build_object('view', true, 'edit', true,
      'fields', jsonb_build_object(
        'company', true, 'users', true, 'roles', true,
        'module_settings', true, 'formulas', true, 'connections', true,
        'customer_leveling', true, 'print_templates', true,
        'ai_knowledge', true, 'workflows', true
      )
    ),
    '__dashboard_widgets', jsonb_build_object('view', true, 'edit', true,
      'fields', jsonb_build_object(
        'quick_add', true, 'activity_calendar', true,
        'reports_slider', true, 'our_processes', true,
        'summary_cards', true, 'recent_lists', true
      )
    ),
    '__workflows', jsonb_build_object('view', true, 'edit', true, 'delete', true,
      'fields', jsonb_build_object('settings_tab', true, 'module_list_button', true)
    ),
    '__goals', jsonb_build_object('view', true, 'edit', true, 'delete', true,
      'fields', jsonb_build_object(
        'module_list_button', true, 'module_list_cards', true, 'dashboard_widget', true
      )
    ),
    '__files_access', jsonb_build_object('view', true, 'edit', true, 'delete', true,
      'fields', jsonb_build_object(
        'gallery_page', true, 'explorer_page', true, 'recycle_bin_page', true,
        'record_files_manager', true, 'manage_manual_folders', true, 'share_public_links', true
      )
    ),
    '__accounting', jsonb_build_object('view', true, 'edit', true, 'delete', true,
      'fields', jsonb_build_object(
        'dashboard_page', true, 'cash_bank_page', true, 'overview_cards', true,
        'operation_links', true, 'reports_hub', true, 'settings_links', true,
        'journal_entry_lines_view', true, 'journal_entry_lines_edit', true,
        'journal_entry_lines_delete', true
      )
    ),
    '__reports', jsonb_build_object('view', true, 'edit', true, 'delete', true,
      'fields', jsonb_build_object('hub_page', true, 'builder_page', true)
    ),
    '__stories', jsonb_build_object('view', true, 'edit', true, 'delete', true,
      'fields', jsonb_build_object(
        'publish', true, 'edit_own', true, 'delete_own', true,
        'edit_others', true, 'delete_others', true, 'pin', true, 'view_reactions', true
      )
    )
  );

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

  if current_profile.id is not null then
    update public.saas_onboarding_requests
      set status = 'needs_admin_review',
          failure_code = case
            when current_profile.org_id is not null then 'profile_already_attached'
            else 'profile_exists_without_org'
          end,
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
      set status = 'failed', failure_code = 'slug_taken',
          failure_message = 'این ساب‌دامین قبلاً ثبت شده است.', updated_at = now()
    where id = request_row.id;
    raise exception 'این ساب‌دامین قبلاً ثبت شده است.';
  end if;

  select count(*) into existing_issuance_count
  from public.saas_demo_issuance where mobile = normalized_mobile;

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

  select * into target_plan
  from public.saas_plans
  where is_active = true
    and (is_demo_default = true or lower(code) = 'public_demo_full')
  order by is_demo_default desc, sort_order asc, created_at asc
  limit 1;

  if target_plan.id is null then
    update public.saas_onboarding_requests
      set status = 'failed', failure_code = 'demo_plan_missing',
          failure_message = 'پلن عمومی دمو هنوز تعریف نشده است.', updated_at = now()
    where id = request_row.id;
    raise exception 'پلن عمومی دمو تعریف نشده است.';
  end if;

  target_trial_days := greatest(coalesce(target_plan.trial_days, 15), 1);

  -- ساخت سازمان
  insert into public.organizations (name, slug, is_active)
  values (
    coalesce(nullif(trim(coalesce(p_business_name, '')), ''), trim(p_full_name)),
    normalized_slug, true
  )
  returning id into target_org_id;

  -- ساخت نقش ادمین با permissions کامل
  insert into public.org_roles (org_id, title, permissions, is_system)
  values (target_org_id, 'ادمین', default_admin_permissions, true)
  returning id into admin_role_id;

  -- ساخت پروفایل با تمام فیلدهای دسترسی
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
  );

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

  insert into public.company_settings (
    org_id, company_name, company_full_name, trade_name,
    brand_palette_key, ceo_name, mobile, email, updated_by
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
    org_id, connection_type, provider, settings, is_active, created_by, updated_by
  )
  values (
    target_org_id, 'ui_theme', 'branding',
    jsonb_build_object(
      'branding', jsonb_build_object(
        'brand_name', coalesce(nullif(trim(coalesce(p_business_name, '')), ''), trim(p_full_name)),
        'short_name', coalesce(nullif(trim(coalesce(p_business_name, '')), ''), trim(p_full_name)),
        'app_title', coalesce(nullif(trim(coalesce(p_business_name, '')), ''), trim(p_full_name)),
        'palette_key', normalized_palette_key
      )
    ),
    true, current_user_id, current_user_id
  );

  insert into public.saas_demo_issuance (
    mobile, auth_user_id, org_id, request_id, issued_by, issuance_mode
  )
  values (
    normalized_mobile, current_user_id, target_org_id,
    request_row.id, current_user_id, 'self_service'
  );

  insert into public.marketing_leads (
    org_id, name, business_name, first_name, mobile,
    source, status, lead_type, description
  )
  values (
    target_org_id,
    'درخواست دمو تازه سیستم - ' || coalesce(nullif(trim(coalesce(p_business_name, '')), ''), trim(p_full_name)),
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

exception when others then
  update public.saas_onboarding_requests
    set status = case
          when coalesce(status, '') in ('', 'draft', 'started') then 'failed'
          else status
        end,
        provision_attempts = provision_attempts + 1,
        failure_code = coalesce(failure_code, 'provision_error'),
        failure_message = coalesce(failure_message, SQLERRM),
        updated_at = now()
  where id = request_row.id;
  raise;
end
$$;

revoke all on function public.provision_self_service_demo(text, text, text, text, text, text, text, text, text) from public;
revoke all on function public.provision_self_service_demo(text, text, text, text, text, text, text, text, text) from anon;
grant execute on function public.provision_self_service_demo(text, text, text, text, text, text, text, text, text) to authenticated;

-- ── 3. Backfill: تکمیل permissions ادمین‌های دمو که با {} ساخته شده‌اند ─────────
-- سازمان‌هایی که از طریق ویزارد دمو ساخته شده‌اند و admin role آن‌ها
-- هنوز permissions خالی ({}) دارد را به‌روزرسانی می‌کنیم.
update public.org_roles r
set permissions = jsonb_build_object(
  '__settings_tabs', jsonb_build_object('view', true, 'edit', true,
    'fields', jsonb_build_object(
      'company', true, 'users', true, 'roles', true,
      'module_settings', true, 'formulas', true, 'connections', true,
      'customer_leveling', true, 'print_templates', true,
      'ai_knowledge', true, 'workflows', true
    )
  ),
  '__dashboard_widgets', jsonb_build_object('view', true, 'edit', true,
    'fields', jsonb_build_object(
      'quick_add', true, 'activity_calendar', true,
      'reports_slider', true, 'our_processes', true,
      'summary_cards', true, 'recent_lists', true
    )
  ),
  '__workflows', jsonb_build_object('view', true, 'edit', true, 'delete', true,
    'fields', jsonb_build_object('settings_tab', true, 'module_list_button', true)
  ),
  '__goals', jsonb_build_object('view', true, 'edit', true, 'delete', true,
    'fields', jsonb_build_object(
      'module_list_button', true, 'module_list_cards', true, 'dashboard_widget', true
    )
  ),
  '__files_access', jsonb_build_object('view', true, 'edit', true, 'delete', true,
    'fields', jsonb_build_object(
      'gallery_page', true, 'explorer_page', true, 'recycle_bin_page', true,
      'record_files_manager', true, 'manage_manual_folders', true, 'share_public_links', true
    )
  ),
  '__accounting', jsonb_build_object('view', true, 'edit', true, 'delete', true,
    'fields', jsonb_build_object(
      'dashboard_page', true, 'cash_bank_page', true, 'overview_cards', true,
      'operation_links', true, 'reports_hub', true, 'settings_links', true,
      'journal_entry_lines_view', true, 'journal_entry_lines_edit', true,
      'journal_entry_lines_delete', true
    )
  ),
  '__reports', jsonb_build_object('view', true, 'edit', true, 'delete', true,
    'fields', jsonb_build_object('hub_page', true, 'builder_page', true)
  ),
  '__stories', jsonb_build_object('view', true, 'edit', true, 'delete', true,
    'fields', jsonb_build_object(
      'publish', true, 'edit_own', true, 'delete_own', true,
      'edit_others', true, 'delete_others', true, 'pin', true, 'view_reactions', true
    )
  )
),
updated_at = now()
where r.is_system = true
  and r.title = 'ادمین'
  and (r.permissions is null or r.permissions = '{}'::jsonb)
  and exists (
    select 1 from public.saas_org_settings s
    where s.org_id = r.org_id and s.is_demo = true
  );

-- ── 4. Backfill: کاربران دمو با org_id خالی (تکمیل phase 174) ────────────────
update public.profiles p
set org_id = d.org_id, updated_at = now()
from public.saas_demo_issuance d
where d.auth_user_id = p.id
  and p.org_id is null
  and d.org_id is not null;

update public.profiles p
set org_id = r.org_id, updated_at = now()
from public.org_roles r
where p.role_id = r.id
  and p.org_id is null
  and r.org_id is not null;

-- ── 5. اطلاع‌رسانی به PostgREST ──────────────────────────────────────────────
notify pgrst, 'reload schema';

commit;
