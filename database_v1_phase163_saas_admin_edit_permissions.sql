-- =====================================================
-- KalamApp - Phase 163: SaaS Admin Granular Edit Permissions
-- Date: 2026-05-20
-- Type: Additive — توابع جدید + به‌روزرسانی RLS
-- Goal:
--   مدیر سیستم بتواند از طریق تنظیمات نقش‌ها (RolesTab)
--   تعیین کند چه کاربری به ویرایش سازمان‌ها و درخواست‌های دمو دسترسی دارد.
--   دو permission field جدید:
--     edit_orgs     → ویرایش مستقیم تنظیمات سازمان
--     edit_requests → ویرایش مستقیم درخواست‌های دمو/ثبت‌نام
-- =====================================================

begin;

-- ─────────────────────────────────────────────────────
-- 1. به‌روزرسانی admin_saas_extend_org_trial
--    اضافه کردن چک permission به عنوان جایگزین role
-- ─────────────────────────────────────────────────────
create or replace function public.admin_saas_extend_org_trial(
  p_org_id uuid,
  p_days   integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id    uuid := auth.uid();
  caller_role  text;
  new_trial_at timestamptz;
begin
  select role into caller_role
  from public.profiles
  where id = caller_id
  limit 1;

  -- مجاز: super_admin، admin، یا دارنده permission edit_orgs
  if caller_role not in ('super_admin', 'admin')
     and not public.current_user_has_saas_admin_permission('edit_orgs') then
    return jsonb_build_object('success', false, 'message', 'دسترسی کافی ندارید.');
  end if;

  update public.saas_org_settings
  set trial_ends_at = greatest(coalesce(trial_ends_at, now()), now()) + make_interval(days => p_days),
      is_readonly   = false,
      status        = case when status = 'suspended' then 'trial' else status end,
      updated_at    = now()
  where org_id = p_org_id
  returning trial_ends_at into new_trial_at;

  if not found then
    return jsonb_build_object('success', false, 'message', 'سازمان پیدا نشد.');
  end if;

  update public.saas_renewal_requests
  set status      = 'extended',
      resolved_at = now(),
      resolved_by = caller_id,
      updated_at  = now()
  where org_id = p_org_id
    and status   = 'pending';

  return jsonb_build_object(
    'success',           true,
    'new_trial_ends_at', new_trial_at,
    'message',           'Trial تمدید شد.'
  );
end;
$$;

revoke all on function public.admin_saas_extend_org_trial(uuid, integer) from public;
grant execute on function public.admin_saas_extend_org_trial(uuid, integer) to authenticated;

-- ─────────────────────────────────────────────────────
-- 2. به‌روزرسانی admin_saas_set_org_status
-- ─────────────────────────────────────────────────────
create or replace function public.admin_saas_set_org_status(
  p_org_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id   uuid := auth.uid();
  caller_role text;
begin
  if p_status not in ('active', 'trial', 'demo', 'suspended', 'cancelled') then
    return jsonb_build_object('success', false, 'message', 'وضعیت نامعتبر است.');
  end if;

  select role into caller_role
  from public.profiles
  where id = caller_id
  limit 1;

  if caller_role not in ('super_admin', 'admin')
     and not public.current_user_has_saas_admin_permission('edit_orgs') then
    return jsonb_build_object('success', false, 'message', 'دسترسی کافی ندارید.');
  end if;

  update public.saas_org_settings
  set status      = p_status,
      is_readonly = (p_status = 'suspended') or (is_readonly and p_status not in ('active', 'trial')),
      updated_at  = now()
  where org_id = p_org_id;

  if not found then
    return jsonb_build_object('success', false, 'message', 'سازمان پیدا نشد.');
  end if;

  return jsonb_build_object('success', true, 'message', 'وضعیت سازمان به‌روز شد.');
end;
$$;

revoke all on function public.admin_saas_set_org_status(uuid, text) from public;
grant execute on function public.admin_saas_set_org_status(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────
-- 3. تابع جدید: admin_saas_edit_org
--    ویرایش مستقیم فیلدهای saas_org_settings
-- ─────────────────────────────────────────────────────
create or replace function public.admin_saas_edit_org(
  p_org_id uuid,
  p_patch  jsonb   -- هر فیلدی که می‌خواهیم تغییر دهیم
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id   uuid := auth.uid();
  caller_role text;
begin
  select role into caller_role
  from public.profiles
  where id = caller_id
  limit 1;

  if caller_role not in ('super_admin', 'admin')
     and not public.current_user_has_saas_admin_permission('edit_orgs') then
    return jsonb_build_object('success', false, 'message', 'دسترسی کافی ندارید.');
  end if;

  -- فیلدهایی که ادمین می‌تواند مستقیماً ویرایش کند
  update public.saas_org_settings
  set
    plan_code              = case when p_patch ? 'plan_code'
                                  then nullif(trim(p_patch->>'plan_code'), '')
                                  else plan_code end,
    is_demo                = case when p_patch ? 'is_demo'
                                  then (p_patch->>'is_demo')::boolean
                                  else is_demo end,
    is_readonly            = case when p_patch ? 'is_readonly'
                                  then (p_patch->>'is_readonly')::boolean
                                  else is_readonly end,
    primary_contact_mobile = case when p_patch ? 'primary_contact_mobile'
                                  then nullif(trim(p_patch->>'primary_contact_mobile'), '')
                                  else primary_contact_mobile end,
    resolved_host          = case when p_patch ? 'resolved_host'
                                  then nullif(trim(p_patch->>'resolved_host'), '')
                                  else resolved_host end,
    trial_ends_at          = case when p_patch ? 'trial_ends_at'
                                  then (p_patch->>'trial_ends_at')::timestamptz
                                  else trial_ends_at end,
    updated_at             = now()
  where org_id = p_org_id;

  if not found then
    return jsonb_build_object('success', false, 'message', 'سازمان پیدا نشد.');
  end if;

  return jsonb_build_object('success', true, 'message', 'سازمان به‌روز شد.');
end;
$$;

revoke all on function public.admin_saas_edit_org(uuid, jsonb) from public;
grant execute on function public.admin_saas_edit_org(uuid, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────
-- 4. تابع جدید: admin_saas_edit_request
--    ویرایش مستقیم فیلدهای saas_onboarding_requests
-- ─────────────────────────────────────────────────────
create or replace function public.admin_saas_edit_request(
  p_request_id uuid,
  p_patch      jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id   uuid := auth.uid();
  caller_role text;
begin
  select role into caller_role
  from public.profiles
  where id = caller_id
  limit 1;

  if caller_role not in ('super_admin', 'admin')
     and not public.current_user_has_saas_admin_permission('edit_requests') then
    return jsonb_build_object('success', false, 'message', 'دسترسی کافی ندارید.');
  end if;

  update public.saas_onboarding_requests
  set
    status            = case when p_patch ? 'status'
                             then (p_patch->>'status')::text
                             else status end,
    full_name         = case when p_patch ? 'full_name'
                             then nullif(trim(p_patch->>'full_name'), '')
                             else full_name end,
    organization_name = case when p_patch ? 'organization_name'
                             then nullif(trim(p_patch->>'organization_name'), '')
                             else organization_name end,
    mobile            = case when p_patch ? 'mobile'
                             then nullif(trim(p_patch->>'mobile'), '')
                             else mobile end,
    email             = case when p_patch ? 'email'
                             then nullif(trim(p_patch->>'email'), '')
                             else email end,
    requested_slug    = case when p_patch ? 'requested_slug'
                             then nullif(lower(trim(p_patch->>'requested_slug')), '')
                             else requested_slug end,
    is_demo_request   = case when p_patch ? 'is_demo_request'
                             then (p_patch->>'is_demo_request')::boolean
                             else is_demo_request end,
    -- پاک کردن خطا با ارسال رشته خالی
    failure_code      = case when p_patch ? 'failure_code'
                             then nullif(trim(p_patch->>'failure_code'), '')
                             else failure_code end,
    failure_message   = case when p_patch ? 'failure_message'
                             then nullif(trim(p_patch->>'failure_message'), '')
                             else failure_message end,
    updated_at        = now()
  where id = p_request_id;

  if not found then
    return jsonb_build_object('success', false, 'message', 'درخواست پیدا نشد.');
  end if;

  return jsonb_build_object('success', true, 'message', 'درخواست به‌روز شد.');
end;
$$;

revoke all on function public.admin_saas_edit_request(uuid, jsonb) from public;
grant execute on function public.admin_saas_edit_request(uuid, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────
-- 5. به‌روزرسانی RLS: ویرایش درخواست‌ها
--    permission edit_requests هم مجاز باشد
-- ─────────────────────────────────────────────────────
drop policy if exists p_saas_onboarding_requests_update on public.saas_onboarding_requests;
create policy p_saas_onboarding_requests_update
on public.saas_onboarding_requests
for update
to authenticated
using (
  public.current_user_has_saas_admin_permission('edit')
  or public.current_user_has_saas_admin_permission('edit_requests')
  or auth_user_id = auth.uid()
)
with check (
  public.current_user_has_saas_admin_permission('edit')
  or public.current_user_has_saas_admin_permission('edit_requests')
  or auth_user_id = auth.uid()
);

-- ─────────────────────────────────────────────────────
-- 6. به‌روزرسانی RLS: ویرایش org settings
--    permission edit_orgs هم مجاز باشد
-- ─────────────────────────────────────────────────────
drop policy if exists p_saas_org_settings_modify on public.saas_org_settings;
create policy p_saas_org_settings_modify
on public.saas_org_settings
for all
to authenticated
using (
  public.current_user_has_saas_admin_permission('edit')
  or public.current_user_has_saas_admin_permission('edit_orgs')
)
with check (
  public.current_user_has_saas_admin_permission('edit')
  or public.current_user_has_saas_admin_permission('edit_orgs')
);

commit;
