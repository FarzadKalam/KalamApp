-- =====================================================
-- TazeSystem - Phase 372: Bot group access modes
-- Date: 2026-07-23
-- Type: Security and access control / idempotent
-- =====================================================

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
  v_allowed_users uuid[];
  v_allowed_roles uuid[];
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

  if not found then
    return false;
  end if;

  if coalesce(v_permissions -> '__communications' ->> 'view', 'true') = 'false' then
    return false;
  end if;

  v_bot_group_access := lower(trim(coalesce(
    v_permissions -> '__communications' -> 'fields' ->> 'bot_group_access',
    'inherited'
  )));

  select
    g.created_by,
    coalesce(g.metadata, '{}'::jsonb) as metadata
  into v_group
  from public.counterparty_bot_groups g
  where g.id = p_group_id
    and g.org_id = v_org_id
  limit 1;

  if not found then
    return false;
  end if;

  if v_bot_group_access = 'all' then
    return true;
  end if;

  v_allowed_users := array(
    select distinct parsed_id
    from (
      select public.kalam_try_uuid(item) as parsed_id
      from (
        select jsonb_array_elements_text(coalesce(v_group.metadata -> 'allowed_user_ids', '[]'::jsonb)) as item
        union all
        select jsonb_array_elements_text(coalesce(v_group.metadata -> 'allowed_profile_ids', '[]'::jsonb)) as item
        union all
        select jsonb_array_elements_text(coalesce(v_group.metadata -> 'user_ids', '[]'::jsonb)) as item
      ) source
    ) parsed
    where parsed_id is not null
  );

  v_allowed_roles := array(
    select distinct parsed_id
    from (
      select public.kalam_try_uuid(item) as parsed_id
      from (
        select jsonb_array_elements_text(coalesce(v_group.metadata -> 'allowed_role_ids', '[]'::jsonb)) as item
        union all
        select jsonb_array_elements_text(coalesce(v_group.metadata -> 'role_ids', '[]'::jsonb)) as item
      ) source
    ) parsed
    where parsed_id is not null
  );

  return coalesce(v_group.created_by = v_user_id, false)
    or coalesce(v_user_id = any(v_allowed_users), false)
    or coalesce(v_role_id is not null and v_role_id = any(v_allowed_roles), false);
end;
$$;

grant execute on function public.kalam_can_access_bot_group(uuid, uuid) to authenticated;
revoke all on function public.kalam_can_access_bot_group(uuid, uuid) from public, anon;

notify pgrst, 'reload schema';

commit;
