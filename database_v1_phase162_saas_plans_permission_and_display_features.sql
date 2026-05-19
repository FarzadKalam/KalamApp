-- =====================================================
-- KalamApp - Phase 162: Fix SaaS Admin Permission Check & Display Features Format
-- Date: 2026-05-20
-- Type: Bug fix + additive
-- Goal:
--   1. اصلاح تابع current_user_has_saas_admin_permission:
--      بررسی فیلد edit/demo_override از سطح اول permission نه از fields.*
--   2. تبدیل display_features از string[] به {text, featured}[]
--      تا مدیر بتواند ویژگی‌های ستاره‌دار (نمایش صفحه اول) را مشخص کند
-- =====================================================

begin;

-- ------------------------------------
-- 1. اصلاح تابع current_user_has_saas_admin_permission
-- ------------------------------------
-- باگ: تابع به‌اشتباه root_permission -> 'fields' ->> field_name را بررسی می‌کرد
-- در حالی که permission به‌صورت { "__saas_admin": { "edit": true } } ذخیره می‌شود
-- اصلاح: بررسی root_permission ->> field_name (سطح اول)

create or replace function public.current_user_has_saas_admin_permission(required_field text default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  role_permissions jsonb;
  root_permission  jsonb;
  field_name       text := nullif(trim(coalesce(required_field, '')), '');
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

  -- بررسی view (پیش‌فرض true اگر تنظیم نشده)
  if coalesce((root_permission ->> 'view')::boolean, true) is false then
    return false;
  end if;

  -- اگر field مشخصی نخواسته‌ایم فقط view کافی است
  if field_name is null then
    return true;
  end if;

  -- بررسی فیلد مورد نظر (edit, demo_override, ...) از سطح اول
  return coalesce((root_permission ->> field_name)::boolean, false);
end
$$;

-- ------------------------------------
-- 2. تبدیل display_features از string[] به {text, featured}[]
-- ------------------------------------
-- ردیف‌هایی که display_features آن‌ها آرایه‌ای از رشته ساده است را migrate می‌کنیم
-- اولین ۶ مورد به‌عنوان featured علامت‌گذاری می‌شوند

update public.saas_plans
set display_features = (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'text',     elem,
        'featured', (rn <= 6)
      )
      order by rn
    ),
    '[]'::jsonb
  )
  from (
    select
      elem::text as elem,
      row_number() over () as rn
    from jsonb_array_elements_text(display_features) as elem
  ) sub
)
where jsonb_array_length(display_features) > 0
  and jsonb_typeof(display_features -> 0) = 'string';

-- ------------------------------------
-- 3. به‌روزرسانی get_public_plans: اطلاعات featured را برمی‌گرداند
-- ------------------------------------
create or replace function public.get_public_plans()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',                 id,
        'code',               code,
        'title',              title,
        'short_description',  short_description,
        'price_monthly',      price_monthly,
        'price_yearly',       price_yearly,
        'included_users',     included_users,
        'extra_user_price',   extra_user_price,
        'max_users',          max_users,
        'storage_gb',         storage_gb,
        'highlight_tag',      highlight_tag,
        'display_features',   display_features,
        'custom_price_label', custom_price_label,
        'trial_days',         trial_days
      )
      order by sort_order asc
    ),
    '[]'::jsonb
  )
  from public.saas_plans
  where is_active = true
    and is_public = true
$$;

commit;
