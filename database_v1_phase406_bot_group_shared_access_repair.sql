-- TazeSystem - Phase 406: واحدسازی دسترسی اشتراکی گروه‌های بات
-- انتخاب کاربران و نقش‌ها در مودال بات، تنها مرجع دسترسی گروه است.

begin;

create or replace function public.kalam_can_access_bot_group(p_group_id uuid, p_org_id uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid := coalesce(p_org_id, public.current_org_id());
  v_role_id uuid;
  v_permissions jsonb := '{}'::jsonb;
  v_bot_group_access text := 'inherited';
  v_group record;
  v_allowed_user_ids text[] := array[]::text[];
  v_allowed_role_ids text[] := array[]::text[];
begin
  if v_user_id is null or v_org_id is null or p_group_id is null then
    return false;
  end if;

  select p.role_id, coalesce(r.permissions, '{}'::jsonb)
  into v_role_id, v_permissions
  from public.profiles p
  left join public.org_roles r
    on r.id = p.role_id
   and r.org_id = p.org_id
  where p.id = v_user_id
    and p.org_id = v_org_id
  limit 1;

  if not found
    or coalesce(v_permissions -> '__communications' ->> 'view', 'true') = 'false' then
    return false;
  end if;

  v_bot_group_access := lower(trim(coalesce(
    v_permissions -> '__communications' -> 'fields' ->> 'bot_group_access',
    'inherited'
  )));

  select g.created_by, coalesce(g.metadata, '{}'::jsonb) as metadata
  into v_group
  from public.counterparty_bot_groups g
  where g.id = p_group_id
    and g.org_id = v_org_id
  limit 1;

  if not found then
    return false;
  end if;

  if v_bot_group_access = 'all'
    or coalesce(v_group.created_by = v_user_id, false) then
    return true;
  end if;

  -- کلیدهای اصلی توسط مودال بات نوشته می‌شوند؛ کلیدهای قدیمی فقط برای
  -- حفظ دسترسی داده‌های قبلی خوانده می‌شوند.
  select coalesce(array_agg(distinct value), array[]::text[])
  into v_allowed_user_ids
  from jsonb_array_elements_text(
    (case when jsonb_typeof(v_group.metadata -> 'allowed_user_ids') = 'array' then v_group.metadata -> 'allowed_user_ids' else '[]'::jsonb end)
    || (case when jsonb_typeof(v_group.metadata -> 'allowed_profile_ids') = 'array' then v_group.metadata -> 'allowed_profile_ids' else '[]'::jsonb end)
    || (case when jsonb_typeof(v_group.metadata -> 'user_ids') = 'array' then v_group.metadata -> 'user_ids' else '[]'::jsonb end)
  ) as access_user(value)
  where nullif(trim(value), '') is not null;

  select coalesce(array_agg(distinct value), array[]::text[])
  into v_allowed_role_ids
  from jsonb_array_elements_text(
    (case when jsonb_typeof(v_group.metadata -> 'allowed_role_ids') = 'array' then v_group.metadata -> 'allowed_role_ids' else '[]'::jsonb end)
    || (case when jsonb_typeof(v_group.metadata -> 'role_ids') = 'array' then v_group.metadata -> 'role_ids' else '[]'::jsonb end)
  ) as access_role(value)
  where nullif(trim(value), '') is not null;

  if v_user_id::text = any(v_allowed_user_ids) then
    return true;
  end if;

  -- انتخاب یک نقش بالادستی در مودال، کاربران نقش‌های فرزند آن را نیز پوشش می‌دهد.
  return exists (
    with recursive role_lineage(id, parent_id, path) as (
      select r.id, r.parent_id, array[r.id]
      from public.org_roles r
      where r.id = v_role_id
        and r.org_id = v_org_id
      union all
      select parent_role.id, parent_role.parent_id, child_role.path || parent_role.id
      from public.org_roles parent_role
      join role_lineage child_role on child_role.parent_id = parent_role.id
      where parent_role.org_id = v_org_id
        and not parent_role.id = any(child_role.path)
    )
    select 1
    from role_lineage
    where id::text = any(v_allowed_role_ids)
  );
end;
$$;

grant execute on function public.kalam_can_access_bot_group(uuid, uuid) to authenticated;
revoke all on function public.kalam_can_access_bot_group(uuid, uuid) from public, anon;

notify pgrst, 'reload schema';

commit;
