-- TazeSystem - Phase 399: canonical internal messaging timeline repair
-- Direct timelines are read from their canonical notes, while system and group
-- messages retain their recipient-scoped inbox path.

begin;

create or replace function public.get_internal_conversation_timeline_v2(
  p_conversation_key text,
  p_limit integer default 20,
  p_before_cursor text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid := public.current_org_id();
  v_role_id uuid := null;
  v_key text := nullif(trim(coalesce(p_conversation_key, '')), '');
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_before_ts timestamptz := null;
  v_before_id text := null;
  v_direct_left uuid := null;
  v_direct_right uuid := null;
begin
  if v_user_id is null or v_org_id is null or v_key is null then
    return jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0, 'first_unread_id', null, 'has_more_before', false, 'next_before_cursor', null, 'read_model', 'cursor');
  end if;

  select profile.role_id
    into v_role_id
  from public.profiles profile
  where profile.id = v_user_id
    and profile.org_id = v_org_id
  limit 1;

  if v_key like 'direct:%' then
    v_direct_left := public.kalam_try_uuid(split_part(v_key, ':', 2));
    v_direct_right := public.kalam_try_uuid(split_part(v_key, ':', 3));
    if v_direct_left is null
       or v_direct_right is null
       or (v_user_id <> v_direct_left and v_user_id <> v_direct_right) then
      return jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0, 'first_unread_id', null, 'has_more_before', false, 'next_before_cursor', null, 'read_model', 'cursor');
    end if;
  elsif v_key <> 'mine' and v_key <> 'system' and v_key not like 'group:%' then
    return jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0, 'first_unread_id', null, 'has_more_before', false, 'next_before_cursor', null, 'read_model', 'cursor');
  end if;

  if nullif(trim(coalesce(p_before_cursor, '')), '') is not null then
    v_before_ts := nullif(split_part(p_before_cursor, '|', 1), '')::timestamptz;
    v_before_id := nullif(split_part(p_before_cursor, '|', 2), '');
  end if;

  return (
    with source_notes as materialized (
      select n.id, n.module_id, n.record_id, n.content, n.author_id, n.author_name,
        n.mention_user_ids, n.mention_role_ids, n.created_at, n.reply_to, n.source_type,
        n.metadata, n.is_edited, n.edited_at
      from public.notes n
      where v_key like 'direct:%'
        and n.org_id = v_org_id
        and n.author_id in (v_direct_left, v_direct_right)
        and nullif(trim(coalesce(n.metadata->>'chat_group_id', '')), '') is null
        and lower(trim(coalesce(n.source_type, n.metadata->>'source_type', ''))) not in ('system', 'ai')
        and not (coalesce(n.metadata, '{}'::jsonb) ?| array['workflow_id', 'automation_rule_id', 'process_automation_rule_id'])
        and (
          public.kalam_note_conversation_key(
            n.org_id, n.id, n.author_id, coalesce(n.mention_user_ids, '{}'::uuid[]),
            coalesce(n.source_type, n.metadata->>'source_type'), coalesce(n.metadata, '{}'::jsonb), n.reply_to
          ) = v_key
          or (
            n.author_id = case when v_user_id = v_direct_left then v_direct_right else v_direct_left end
            and (
              v_user_id = any(coalesce(n.mention_user_ids, '{}'::uuid[]))
              or (
                v_role_id is not null
                and v_role_id = any(coalesce(n.mention_role_ids, '{}'::uuid[]))
              )
            )
          )
        )
        and public.kalam_can_access_note(
          n.id, n.author_id, n.org_id, n.mention_user_ids, n.mention_role_ids, n.reply_to, coalesce(n.metadata, '{}'::jsonb)
        )

      union all

      select n.id, n.module_id, n.record_id, n.content, n.author_id, n.author_name,
        n.mention_user_ids, n.mention_role_ids, n.created_at, n.reply_to, n.source_type,
        n.metadata, n.is_edited, n.edited_at
      from public.notes n
      where v_key = 'mine'
        and n.org_id = v_org_id
        and n.author_id = v_user_id
        and nullif(trim(coalesce(n.metadata->>'chat_group_id', '')), '') is null
        and lower(trim(coalesce(n.source_type, n.metadata->>'source_type', ''))) not in ('system', 'ai')
        and not (coalesce(n.metadata, '{}'::jsonb) ?| array['workflow_id', 'automation_rule_id', 'process_automation_rule_id'])
        and (
          lower(trim(coalesce(n.metadata->>'saved_message', 'false'))) in ('true', '1', 'yes')
          or cardinality(coalesce(n.mention_user_ids, '{}'::uuid[])) = 0
        )

      union all

      (
      select distinct on (n.id)
        n.id, n.module_id, n.record_id, n.content, n.author_id, n.author_name,
        n.mention_user_ids, n.mention_role_ids, n.created_at, n.reply_to, n.source_type,
        n.metadata, n.is_edited, n.edited_at
      from public.notification_inbox_items inbox
      join public.notes n
        on n.id::text = inbox.source_id
       and n.org_id = inbox.org_id
      where v_key = 'system'
        and inbox.org_id = v_org_id
        and inbox.section = 'notes'
        and inbox.source_type = 'note'
        and lower(trim(coalesce(inbox.category, ''))) in ('system', 'assistant')
        and coalesce(
          inbox.conversation_key,
          nullif(trim(inbox.payload->>'conversation_key'), ''),
          public.kalam_note_conversation_key(
            n.org_id, n.id, n.author_id, coalesce(n.mention_user_ids, '{}'::uuid[]),
            coalesce(n.source_type, n.metadata->>'source_type'), coalesce(n.metadata, '{}'::jsonb), n.reply_to
          )
        ) = v_key
        and (
          inbox.is_org_wide = true
          or v_user_id = any(inbox.target_user_ids)
          or (v_role_id is not null and v_role_id = any(inbox.target_role_ids))
        )
      order by n.id, n.created_at desc
      )

      union all

      (
      select distinct on (n.id)
        n.id, n.module_id, n.record_id, n.content, n.author_id, n.author_name,
        n.mention_user_ids, n.mention_role_ids, n.created_at, n.reply_to, n.source_type,
        n.metadata, n.is_edited, n.edited_at
      from public.notification_inbox_items inbox
      join public.notes n
        on n.id::text = inbox.source_id
       and n.org_id = inbox.org_id
      where v_key like 'group:%'
        and inbox.org_id = v_org_id
        and inbox.section = 'notes'
        and inbox.source_type = 'note'
        and coalesce(
          inbox.conversation_key,
          nullif(trim(inbox.payload->>'conversation_key'), ''),
          public.kalam_note_conversation_key(
            n.org_id, n.id, n.author_id, coalesce(n.mention_user_ids, '{}'::uuid[]),
            coalesce(n.source_type, n.metadata->>'source_type'), coalesce(n.metadata, '{}'::jsonb), n.reply_to
          )
        ) = v_key
        and (
          inbox.is_org_wide = true
          or v_user_id = any(inbox.target_user_ids)
          or (v_role_id is not null and v_role_id = any(inbox.target_role_ids))
        )
      order by n.id, n.created_at desc
      )
    ),
    visible as materialized (
      select source_notes.*,
        (
          source_notes.author_id = v_user_id
          or read_state.read_at is not null
          or read_state.dismissed_at is not null
          or (
            cursor_state.read_through_at is not null
            and (
              source_notes.created_at < cursor_state.read_through_at
              or (
                source_notes.created_at = cursor_state.read_through_at
                and source_notes.id::text <= coalesce(cursor_state.read_through_id, source_notes.id::text)
              )
            )
          )
        ) as is_read
      from source_notes
      left join public.notification_read_states read_state
        on read_state.org_id = v_org_id
       and read_state.user_id = v_user_id
       and read_state.section = 'notes'
       and read_state.source_type = 'note'
       and read_state.source_id = source_notes.id::text
      left join public.communication_read_cursors cursor_state
        on cursor_state.org_id = v_org_id
       and cursor_state.user_id = v_user_id
       and cursor_state.channel = 'internal'
       and cursor_state.conversation_key = v_key
    ),
    unread as (
      select count(*) filter (where not is_read)::integer as unread_count
      from visible
    ),
    windowed as (
      select *
      from visible
      where v_before_ts is null
         or created_at < v_before_ts
         or (created_at = v_before_ts and id::text < coalesce(v_before_id, ''))
      order by created_at desc, id desc
      limit v_limit + 1
    ),
    page_desc as (
      select * from windowed order by created_at desc, id desc limit v_limit
    ),
    page as (
      select * from page_desc order by created_at asc, id asc
    ),
    earliest as (
      select created_at, id::text as id_text from page order by created_at asc, id asc limit 1
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(to_jsonb(page) order by page.created_at asc, page.id asc) from page), '[]'::jsonb),
      'unread_count', coalesce((select unread_count from unread), 0),
      'first_unread_id', (select id::text from page where not is_read order by created_at asc, id asc limit 1),
      'has_more_before', (select count(*) > v_limit from windowed),
      'next_before_cursor', (select public.kalam_cursor_value(created_at, id_text) from earliest),
      'read_model', 'cursor'
    )
  );
end;
$$;

grant execute on function public.get_internal_conversation_timeline_v2(text, integer, text) to authenticated;
revoke all on function public.get_internal_conversation_timeline_v2(text, integer, text) from public, anon;

notify pgrst, 'reload schema';

commit;
