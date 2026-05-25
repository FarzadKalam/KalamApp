-- Phase 207: Fix kalam_can_access_bot_group for open groups
--
-- Bug: get_communication_timeline calls kalam_can_access_bot_group which returns
-- false for non-creator users when a group has no allowed_user_ids / allowed_role_ids.
-- But get_bot_conversation_timeline (the legacy RPC) and the frontend both treat
-- empty access lists as "everyone in the org can access".
-- Fix: align kalam_can_access_bot_group with the open-group semantics.

create or replace function public.kalam_can_access_bot_group(p_group_id uuid, p_org_id uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role_id uuid;
  v_group record;
  v_allowed_users uuid[];
  v_allowed_roles uuid[];
begin
  if v_user_id is null or p_group_id is null then
    return false;
  end if;

  select public.kalam_current_profile_role_id(p_org_id) into v_role_id;

  select
    g.created_by,
    coalesce(g.metadata, '{}'::jsonb) as metadata
  into v_group
  from public.counterparty_bot_groups g
  where g.id = p_group_id
    and (p_org_id is null or g.org_id = p_org_id)
  limit 1;

  if not found then
    return false;
  end if;

  v_allowed_users := public.kalam_jsonb_uuid_array(v_group.metadata -> 'allowed_user_ids');
  v_allowed_roles := public.kalam_jsonb_uuid_array(v_group.metadata -> 'allowed_role_ids');

  -- Open group: no access restrictions → everyone in the org can access
  if coalesce(array_length(v_allowed_users, 1), 0) = 0
     and coalesce(array_length(v_allowed_roles, 1), 0) = 0 then
    return true;
  end if;

  return coalesce(v_group.created_by = v_user_id, false)
    or v_user_id = any(v_allowed_users)
    or (v_role_id is not null and v_role_id = any(v_allowed_roles));
end;
$$;
