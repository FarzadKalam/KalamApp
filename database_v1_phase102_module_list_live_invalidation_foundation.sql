-- KalamApp V1 - Phase 102
-- Module list live invalidation foundation. This only prepares topics and helper functions.

begin;

create or replace function public.kalam_realtime_module_list_topic(p_org_id uuid, p_module_id text)
returns text
language sql
stable
as $$
  select case
    when p_org_id is null or nullif(trim(coalesce(p_module_id, '')), '') is null then null
    else 'org:' || p_org_id::text || ':module:' || trim(p_module_id) || ':list'
  end
$$;

create or replace function public.kalam_realtime_allowed_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_role_id uuid;
begin
  if p_topic is null or v_user_id is null then
    return false;
  end if;

  select p.org_id, p.role_id
  into v_org_id, v_role_id
  from public.profiles p
  where p.id = v_user_id
  limit 1;

  if v_org_id is null then
    return false;
  end if;

  if p_topic = public.kalam_realtime_org_topic(v_org_id) then
    return true;
  end if;

  if p_topic = public.kalam_realtime_user_topic(v_org_id, v_user_id) then
    return true;
  end if;

  if v_role_id is not null and p_topic = public.kalam_realtime_role_topic(v_org_id, v_role_id) then
    return true;
  end if;

  return p_topic = public.kalam_realtime_module_list_topic(v_org_id, split_part(split_part(p_topic, ':module:', 2), ':list', 1));
end;
$$;

create or replace function public.kalam_broadcast_module_list_invalidation(
  p_org_id uuid,
  p_module_id text,
  p_record_id text default null,
  p_action text default 'update',
  p_updated_at timestamptz default now(),
  p_scope_hint jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topic text;
  v_payload jsonb;
  v_module_id text := nullif(trim(coalesce(p_module_id, '')), '');
begin
  if p_org_id is null or v_module_id is null then
    return;
  end if;

  v_topic := public.kalam_realtime_module_list_topic(p_org_id, v_module_id);
  if v_topic is null then
    return;
  end if;

  v_payload := jsonb_build_object(
    'module_id', v_module_id,
    'record_id', nullif(trim(coalesce(p_record_id, '')), ''),
    'action', coalesce(nullif(trim(coalesce(p_action, '')), ''), 'update'),
    'updated_at', coalesce(p_updated_at, now()),
    'scope_hint', coalesce(p_scope_hint, '{}'::jsonb)
  );

  perform public.kalam_broadcast_notification(v_topic, 'module_list_invalidation', v_payload);
end;
$$;

grant execute on function public.kalam_realtime_module_list_topic(uuid, text) to authenticated;
grant execute on function public.kalam_realtime_allowed_topic(text) to authenticated;

revoke all on function public.kalam_broadcast_module_list_invalidation(uuid, text, text, text, timestamptz, jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
