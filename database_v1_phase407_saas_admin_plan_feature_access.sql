-- هم‌راستاسازی دسترسی ویژگی‌های پلن برای سازمان دارای نقش SaaS Admin
-- نقش SaaS Admin باید در تمام مسیرهای سروری نیز مانند پنل داخلی، به همهٔ قابلیت‌ها دسترسی داشته باشد.

begin;

create or replace function public.org_has_plan_feature(
  p_org_id uuid,
  p_feature_key text,
  p_default_enabled boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan_features jsonb := '{}'::jsonb;
  v_feature_overrides jsonb := '{}'::jsonb;
  v_raw_value text;
  v_key text := nullif(btrim(coalesce(p_feature_key, '')), '');
begin
  if p_org_id is null or v_key is null then
    return false;
  end if;

  -- این شرط با رفتار پنل داخلی هم‌راستا است؛ دسترسی باید به نقش سازمانی
  -- وابسته باشد و از هویت درخواست عمومی یا دادهٔ tenant دیگری استفاده نکند.
  if exists (
    select 1
    from public.org_roles role
    where role.org_id = p_org_id
      and (
        coalesce((role.permissions -> '__saas_admin' ->> 'view')::boolean, false)
        or coalesce((role.permissions -> '__saas_admin' ->> 'edit')::boolean, false)
      )
  ) then
    return true;
  end if;

  select
    coalesce(plan.enabled_features, '{}'::jsonb),
    coalesce(settings.feature_overrides, '{}'::jsonb)
  into v_plan_features, v_feature_overrides
  from public.saas_org_settings settings
  left join public.saas_plans plan on lower(plan.code) = lower(coalesce(settings.plan_code, ''))
  where settings.org_id = p_org_id
  limit 1;

  v_raw_value := coalesce(v_feature_overrides ->> v_key, v_plan_features ->> v_key);
  if v_raw_value is null then
    return coalesce(p_default_enabled, false);
  end if;

  return lower(v_raw_value) in ('true', '1', 'yes', 'on');
end;
$$;

revoke all on function public.org_has_plan_feature(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.org_has_plan_feature(uuid, text, boolean) to service_role;

commit;
