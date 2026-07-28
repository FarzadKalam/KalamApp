-- =====================================================
-- TazeSystem - Phase 415: Atomic internal messaging V2 dispatch
-- Date: 2026-07-28
-- Type: Reliability / security / idempotent
-- =====================================================

begin;

-- The V2 composer writes the message and its central inbox row in the same
-- transaction. This does not depend on an after-insert trigger being present
-- or healthy, so a successful send can never disappear from V2 conversations.
create or replace function public.send_internal_message_v2(
  p_content text,
  p_mention_user_ids uuid[] default '{}'::uuid[],
  p_mention_role_ids uuid[] default '{}'::uuid[],
  p_reply_to uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_module_id text default null,
  p_record_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid := public.current_org_id();
  v_role_id uuid := null;
  v_author_name text := null;
  v_metadata jsonb := case when jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) = 'object' then coalesce(p_metadata, '{}'::jsonb) else '{}'::jsonb end;
  v_group_id uuid := public.kalam_try_uuid(v_metadata->>'chat_group_id');
  v_group_users uuid[] := '{}'::uuid[];
  v_group_roles uuid[] := '{}'::uuid[];
  v_target_users uuid[] := '{}'::uuid[];
  v_target_roles uuid[] := '{}'::uuid[];
  v_conversation_key text := null;
  v_is_saved boolean := false;
  v_note public.notes%rowtype;
begin
  if v_user_id is null or v_org_id is null then
    raise exception 'UNAUTHORIZED';
  end if;
  if nullif(trim(coalesce(p_content, '')), '') is null then
    raise exception 'MESSAGE_CONTENT_REQUIRED';
  end if;

  select profile.role_id, nullif(trim(profile.full_name), '')
    into v_role_id, v_author_name
  from public.profiles profile
  where profile.id = v_user_id
    and profile.org_id = v_org_id
  limit 1;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  v_is_saved := lower(trim(coalesce(v_metadata->>'saved_message', 'false'))) in ('true', '1', 'yes');
  v_metadata := v_metadata || jsonb_build_object('source_type', 'internal_message');

  if v_group_id is not null then
    select coalesce(group_row.user_ids, '{}'::uuid[]), coalesce(group_row.role_ids, '{}'::uuid[])
      into v_group_users, v_group_roles
    from public.chat_groups group_row
    where group_row.id = v_group_id
      and group_row.org_id = v_org_id
      and (
        v_user_id = any(coalesce(group_row.user_ids, '{}'::uuid[]))
        or (v_role_id is not null and v_role_id = any(coalesce(group_row.role_ids, '{}'::uuid[])))
      )
    limit 1;
    if not found then
      raise exception 'CHAT_GROUP_ACCESS_DENIED';
    end if;
  end if;

  v_target_users := public.kalam_distinct_uuid_array(
    coalesce(p_mention_user_ids, '{}'::uuid[])
    || coalesce(v_group_users, '{}'::uuid[])
    || array[v_user_id]
  );
  v_target_roles := public.kalam_distinct_uuid_array(
    coalesce(p_mention_role_ids, '{}'::uuid[]) || coalesce(v_group_roles, '{}'::uuid[])
  );

  if v_is_saved then
    v_target_users := array[v_user_id];
    v_target_roles := '{}'::uuid[];
  elsif cardinality(v_target_users) <= 1 and cardinality(v_target_roles) = 0 then
    raise exception 'INTERNAL_MESSAGE_RECIPIENT_REQUIRED';
  end if;

  if exists (
    select 1
    from unnest(v_target_users) target_user_id
    where target_user_id <> v_user_id
      and not exists (
        select 1 from public.profiles recipient
        where recipient.id = target_user_id
          and recipient.org_id = v_org_id
      )
  ) then
    raise exception 'INTERNAL_MESSAGE_RECIPIENT_INVALID';
  end if;
  if exists (
    select 1
    from unnest(v_target_roles) target_role_id
    where not exists (
      select 1 from public.org_roles recipient_role
      where recipient_role.id = target_role_id
        and recipient_role.org_id = v_org_id
    )
  ) then
    raise exception 'INTERNAL_MESSAGE_ROLE_INVALID';
  end if;

  v_conversation_key := case
    when v_is_saved then 'mine'
    when v_group_id is not null then 'group:' || v_group_id::text
    when nullif(trim(v_metadata->>'conversation_key'), '') is not null then trim(v_metadata->>'conversation_key')
    when cardinality(coalesce(p_mention_user_ids, '{}'::uuid[])) = 1
      then public.kalam_direct_conversation_key(v_user_id, p_mention_user_ids[1])
    else 'mine'
  end;
  v_metadata := v_metadata || jsonb_build_object('conversation_key', v_conversation_key);

  insert into public.notes (
    org_id, module_id, record_id, content, reply_to,
    mention_user_ids, mention_role_ids, author_id, author_name, metadata
  ) values (
    v_org_id,
    nullif(trim(coalesce(p_module_id, '')), ''),
    nullif(trim(coalesce(p_record_id, '')), ''),
    p_content,
    p_reply_to,
    case when v_is_saved then '{}'::uuid[] else public.kalam_distinct_uuid_array(coalesce(p_mention_user_ids, '{}'::uuid[]) || coalesce(v_group_users, '{}'::uuid[])) end,
    case when v_is_saved then '{}'::uuid[] else public.kalam_distinct_uuid_array(coalesce(p_mention_role_ids, '{}'::uuid[]) || coalesce(v_group_roles, '{}'::uuid[])) end,
    v_user_id,
    v_author_name,
    v_metadata
  ) returning * into v_note;

  perform public.kalam_upsert_notification_item(
    v_org_id,
    'note',
    v_note.id::text,
    'notes',
    case when v_group_id is not null then 'group' else 'internal' end,
    'insert',
    'پیام داخلی',
    nullif(left(v_note.content, 240), ''),
    nullif(trim(coalesce(v_note.module_id, '')), ''),
    nullif(trim(coalesce(v_note.record_id, '')), ''),
    v_target_users,
    v_target_roles,
    false,
    jsonb_build_object(
      'note_source', 'internal_message',
      'chat_group_id', v_group_id,
      'reply_to', v_note.reply_to,
      'conversation_key', v_conversation_key
    ),
    coalesce(v_note.updated_at, v_note.created_at, now())
  );

  return to_jsonb(v_note);
end;
$$;

grant execute on function public.send_internal_message_v2(text, uuid[], uuid[], uuid, jsonb, text, text) to authenticated;
revoke all on function public.send_internal_message_v2(text, uuid[], uuid[], uuid, jsonb, text, text) from public, anon;

notify pgrst, 'reload schema';

commit;
