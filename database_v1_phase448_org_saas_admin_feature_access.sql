-- یکسان‌سازی بررسی ویژگی‌های پلن برای همهٔ اعضای یک سازمان داخلی.
-- SaaS Admin بودن ویژگی سازمان است؛ نقش هر کاربر همچنان مجوز استفادهٔ او را تعیین می‌کند.

begin;

create or replace function public.org_is_saas_admin(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_org_id is not null
    and exists (
      select 1
      from public.org_roles role_row
      where role_row.org_id = p_org_id
        and (
          lower(coalesce(role_row.permissions -> '__saas_admin' ->> 'view', 'false')) = 'true'
          or lower(coalesce(role_row.permissions -> '__saas_admin' ->> 'edit', 'false')) = 'true'
        )
    );
$$;

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

  if public.org_is_saas_admin(p_org_id) then
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

create or replace function public.current_org_has_plan_feature(
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
  v_org_id uuid := public.current_org_id();
begin
  if auth.uid() is null or v_org_id is null then
    return false;
  end if;

  return public.org_has_plan_feature(v_org_id, p_feature_key, p_default_enabled);
end;
$$;

revoke all on function public.org_is_saas_admin(uuid) from public, anon, authenticated;
grant execute on function public.org_is_saas_admin(uuid) to service_role;

revoke all on function public.org_has_plan_feature(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.org_has_plan_feature(uuid, text, boolean) to service_role;

revoke all on function public.current_org_has_plan_feature(text, boolean) from public;
grant execute on function public.current_org_has_plan_feature(text, boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
