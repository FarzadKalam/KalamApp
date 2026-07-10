-- =====================================================
-- TazeSystem - Phase 323: Messaging V2 bot timeline access alignment
-- Date: 2026-07-10
-- Type: Bug fix / performance / idempotent
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
  v_group record;
  v_allowed_users uuid[];
  v_allowed_roles uuid[];
begin
  if v_user_id is null or v_org_id is null or p_group_id is null then
    return false;
  end if;

  select public.kalam_current_profile_role_id(v_org_id) into v_role_id;

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

  if coalesce(array_length(v_allowed_users, 1), 0) = 0
     and coalesce(array_length(v_allowed_roles, 1), 0) = 0 then
    return true;
  end if;

  return coalesce(v_group.created_by = v_user_id, false)
    or v_user_id = any(v_allowed_users)
    or (v_role_id is not null and v_role_id = any(v_allowed_roles));
end;
$$;

grant execute on function public.kalam_can_access_bot_group(uuid, uuid) to authenticated;
revoke all on function public.kalam_can_access_bot_group(uuid, uuid) from public, anon;

notify pgrst, 'reload schema';

commit;
