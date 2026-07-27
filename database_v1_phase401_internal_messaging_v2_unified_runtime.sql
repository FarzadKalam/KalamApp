-- TazeSystem - Phase 401: unified internal messaging V2 runtime
-- The sidebar and timeline use the exact same recipient-aware conversation key.
-- This removes the historical mismatch between inbox keys, note keys and role mentions.

begin;

create index if not exists idx_notification_inbox_internal_source_v3
  on public.notification_inbox_items (org_id, source_id, created_at desc, id desc)
  where section = 'notes'
    and source_type = 'note';

create index if not exists idx_notification_inbox_internal_target_users_v3
  on public.notification_inbox_items using gin (target_user_ids)
  where section = 'notes'
    and source_type = 'note';

create index if not exists idx_notification_inbox_internal_target_roles_v3
  on public.notification_inbox_items using gin (target_role_ids)
  where section = 'notes'
    and source_type = 'note';

create or replace function public.kalam_internal_message_conversation_key_v3(
  p_org_id uuid,
  p_note_id uuid,
  p_author_id uuid,
  p_mention_user_ids uuid[],
  p_mention_role_ids uuid[],
  p_source_type text,
  p_metadata jsonb,
  p_reply_to uuid,
  p_viewer_id uuid,
  p_viewer_role_id uuid,
  p_inbox_category text default null
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_source text := lower(trim(coalesce(p_source_type, p_metadata->>'source_type', '')));
  v_group_id text := nullif(trim(coalesce(p_metadata->>'chat_group_id', '')), '');
  v_user_mentions uuid[] := coalesce(p_mention_user_ids, '{}'::uuid[]);
  v_role_mentions uuid[] := coalesce(p_mention_role_ids, '{}'::uuid[]);
begin
  if v_group_id is not null then
    return 'group:' || v_group_id;
  end if;

  if lower(trim(coalesce(p_inbox_category, ''))) in ('system', 'assistant')
    or v_source in ('system', 'ai')
    or v_metadata ?| array['workflow_id', 'automation_rule_id', 'process_automation_rule_id'] then
    return 'system';
  end if;

  if p_author_id is null then
    return null;
  end if;

  -- A recipient always sees a direct thread with the sender. This applies to
  -- both explicit user mentions and role mentions, including mixed mentions.
  if p_viewer_id is not null
    and p_author_id <> p_viewer_id
    and (
      p_viewer_id = any(v_user_mentions)
      or (p_viewer_role_id is not null and p_viewer_role_id = any(v_role_mentions))
    ) then
    return public.kalam_direct_conversation_key(p_viewer_id, p_author_id);
  end if;

  -- Messages without a counterparty remain in the sender's saved-message view.
  -- A role broadcast has multiple recipients and is intentionally represented
  -- once here for its sender, never duplicated once per role member.
  if p_author_id = p_viewer_id
    and cardinality(v_user_mentions) = 0 then
    return 'mine';
  end if;

  return public.kalam_note_conversation_key(
    p_org_id,
    p_note_id,
    p_author_id,
    v_user_mentions,
    p_source_type,
    v_metadata,
    p_reply_to
  );
end;
$$;

create or replace function public.kalam_internal_message_peer_id_v3(
  p_conversation_key text,
  p_viewer_id uuid
)
returns uuid
language plpgsql
immutable
as $$
declare
  v_left_text text := nullif(split_part(coalesce(p_conversation_key, ''), ':', 2), '');
  v_right_text text := nullif(split_part(coalesce(p_conversation_key, ''), ':', 3), '');
  v_left uuid;
  v_right uuid;
begin
  if coalesce(p_conversation_key, '') not like 'direct:%' then
    return null;
  end if;
  if v_left_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or v_right_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;
  v_left := v_left_text::uuid;
  v_right := v_right_text::uuid;
  return case when v_left = p_viewer_id then v_right else v_left end;
end;
$$;

create or replace function public.get_internal_communication_conversations_v3(
  p_before_cursor timestamptz default null,
  p_limit integer default 80
)
returns table (
  section text,
  conversation_key text,
  kind text,
  title text,
  subtitle text,
  avatar_url text,
  role_label text,
  note_count integer,
  unread_count integer,
  latest_message_at timestamptz,
  last_message_preview text,
  user_id uuid,
  group_id uuid,
  bot_group_id uuid,
  channel_type text,
  status text,
  counterparty_label text,
  bot_chat_id text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select profile.id as user_id, profile.org_id, profile.role_id
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.org_id = public.current_org_id()
    limit 1
  ),
  eligible_inbox as materialized (
    select inbox.*
    from public.notification_inbox_items inbox
    join me on me.org_id = inbox.org_id
    left join public.notes own_note
      on own_note.id::text = inbox.source_id
     and own_note.org_id = inbox.org_id
    where inbox.section = 'notes'
      and inbox.source_type = 'note'
      and (
        inbox.is_org_wide = true
        or inbox.target_user_ids @> array[me.user_id]
        or (me.role_id is not null and inbox.target_role_ids @> array[me.role_id])
        or own_note.author_id = me.user_id
      )
  ),
  raw as materialized (
    select distinct on (note.id)
      note.id as note_id,
      me.user_id as viewer_id,
      note.author_id,
      note.created_at,
      nullif(trim(coalesce(inbox.body, note.content, '')), '') as preview,
      public.kalam_internal_message_conversation_key_v3(
        note.org_id, note.id, note.author_id,
        coalesce(note.mention_user_ids, '{}'::uuid[]),
        coalesce(note.mention_role_ids, '{}'::uuid[]),
        note.source_type, coalesce(note.metadata, '{}'::jsonb), note.reply_to,
        me.user_id, me.role_id, inbox.category
      ) as conversation_key,
      (
        note.author_id = me.user_id
        or read_state.read_at is not null
        or read_state.dismissed_at is not null
        or (
          cursor_state.read_through_at is not null
          and (
            note.created_at < cursor_state.read_through_at
            or (
              note.created_at = cursor_state.read_through_at
              and note.id::text <= coalesce(cursor_state.read_through_id, note.id::text)
            )
          )
        )
      ) as is_read
    from me
    join eligible_inbox inbox on inbox.org_id = me.org_id
    join public.notes note
      on note.id::text = inbox.source_id
     and note.org_id = inbox.org_id
    left join public.notification_read_states read_state
      on read_state.org_id = me.org_id
     and read_state.user_id = me.user_id
     and read_state.section = 'notes'
     and read_state.source_type = 'note'
     and read_state.source_id = inbox.source_id
    left join public.communication_read_cursors cursor_state
      on cursor_state.org_id = me.org_id
     and cursor_state.user_id = me.user_id
     and cursor_state.channel = 'internal'
     and cursor_state.conversation_key = public.kalam_internal_message_conversation_key_v3(
       note.org_id, note.id, note.author_id,
       coalesce(note.mention_user_ids, '{}'::uuid[]),
       coalesce(note.mention_role_ids, '{}'::uuid[]),
       note.source_type, coalesce(note.metadata, '{}'::jsonb), note.reply_to,
       me.user_id, me.role_id, inbox.category
     )
    order by note.id, inbox.created_at desc, inbox.id desc
  ),
  base as (
    select
      raw.*,
      case
        when conversation_key = 'system' then 'system'
        when conversation_key = 'mine' then 'mine'
        when conversation_key like 'group:%' then 'group'
        else 'direct'
      end as kind
    from raw
    where nullif(trim(coalesce(conversation_key, '')), '') is not null
      and (
        conversation_key not like 'direct:%'
        or conversation_key like 'direct:' || viewer_id::text || ':%'
        or conversation_key like 'direct:%:' || viewer_id::text
      )
  ),
  summary as (
    select
      conversation_key,
      kind,
      count(*)::integer as note_count,
      count(*) filter (where not is_read)::integer as unread_count,
      max(created_at) as latest_message_at
    from base
    group by conversation_key, kind
  ),
  latest as (
    select distinct on (conversation_key)
      conversation_key,
      preview
    from base
    order by conversation_key, created_at desc, note_id desc
  ),
  enriched as (
    select
      'notes'::text as section,
      summary.conversation_key,
      summary.kind,
      public.kalam_internal_message_peer_id_v3(summary.conversation_key, me.user_id) as peer_id,
      case when summary.kind = 'group' then public.kalam_try_uuid(split_part(summary.conversation_key, ':', 2)) else null end as resolved_group_id,
      summary.note_count,
      summary.unread_count,
      summary.latest_message_at,
      latest.preview
    from summary
    join me on true
    left join latest on latest.conversation_key = summary.conversation_key
  )
  select
    enriched.section,
    enriched.conversation_key,
    enriched.kind,
    case
      when enriched.kind = 'system' then 'پیام‌های سیستم'
      when enriched.kind = 'mine' then 'یادداشت‌های من'
      when enriched.kind = 'group' then coalesce(nullif(trim(chat_group.name), ''), 'گروه داخلی')
      else coalesce(nullif(trim(peer.full_name), ''), 'کاربر')
    end as title,
    case
      when enriched.kind = 'system' then 'اعلان‌ها و پیام‌های سیستمی'
      when enriched.kind = 'mine' then 'یادداشت‌های شخصی'
      when enriched.kind = 'group' then 'گروه داخلی'
      else nullif(trim(peer_role.title), '')
    end as subtitle,
    case when enriched.kind = 'direct' then peer.avatar_url else null end as avatar_url,
    case when enriched.kind = 'direct' then peer_role.title else null end as role_label,
    enriched.note_count,
    enriched.unread_count,
    enriched.latest_message_at,
    enriched.preview as last_message_preview,
    case when enriched.kind = 'direct' then enriched.peer_id else null end as user_id,
    enriched.resolved_group_id as group_id,
    null::uuid as bot_group_id,
    null::text as channel_type,
    null::text as status,
    null::text as counterparty_label,
    null::text as bot_chat_id
  from enriched
  join me on true
  left join public.profiles peer
    on peer.id = enriched.peer_id
   and peer.org_id = me.org_id
  left join public.org_roles peer_role
    on peer_role.id = peer.role_id
   and peer_role.org_id = me.org_id
  left join public.chat_groups chat_group
    on chat_group.id = enriched.resolved_group_id
   and chat_group.org_id = me.org_id
  where p_before_cursor is null or enriched.latest_message_at < p_before_cursor
  order by enriched.latest_message_at desc nulls last, title asc
  limit least(greatest(coalesce(p_limit, 80), 1), 100);
$$;

create or replace function public.get_internal_communication_timeline_v3(
  p_conversation_key text,
  p_limit integer default 40,
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
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 50);
  v_before_ts timestamptz := null;
  v_before_id text := null;
begin
  if v_user_id is null or v_org_id is null or v_key is null then
    return jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0, 'first_unread_id', null, 'has_more_before', false, 'next_before_cursor', null, 'read_model', 'cursor');
  end if;

  select profile.role_id into v_role_id
  from public.profiles profile
  where profile.id = v_user_id
    and profile.org_id = v_org_id
  limit 1;

  if nullif(trim(coalesce(p_before_cursor, '')), '') is not null then
    v_before_ts := nullif(split_part(p_before_cursor, '|', 1), '')::timestamptz;
    v_before_id := nullif(split_part(p_before_cursor, '|', 2), '');
  end if;

  if v_key like 'direct:%'
    and v_key not like 'direct:' || v_user_id::text || ':%'
    and v_key not like 'direct:%:' || v_user_id::text then
    return jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0, 'first_unread_id', null, 'has_more_before', false, 'next_before_cursor', null, 'read_model', 'cursor');
  end if;

  return (
    with eligible_inbox as materialized (
      select inbox.*
      from public.notification_inbox_items inbox
      left join public.notes own_note
        on own_note.id::text = inbox.source_id
       and own_note.org_id = inbox.org_id
      where inbox.org_id = v_org_id
        and inbox.section = 'notes'
        and inbox.source_type = 'note'
        and (
          inbox.is_org_wide = true
          or inbox.target_user_ids @> array[v_user_id]
          or (v_role_id is not null and inbox.target_role_ids @> array[v_role_id])
          or own_note.author_id = v_user_id
        )
    ),
    visible as materialized (
      select distinct on (note.id)
        note.id,
        note.module_id,
        note.record_id,
        note.content,
        note.author_id,
        note.author_name,
        note.mention_user_ids,
        note.mention_role_ids,
        note.created_at,
        note.reply_to,
        note.source_type,
        note.metadata,
        note.is_edited,
        note.edited_at,
        (
          note.author_id = v_user_id
          or read_state.read_at is not null
          or read_state.dismissed_at is not null
          or (
            cursor_state.read_through_at is not null
            and (
              note.created_at < cursor_state.read_through_at
              or (
                note.created_at = cursor_state.read_through_at
                and note.id::text <= coalesce(cursor_state.read_through_id, note.id::text)
              )
            )
          )
        ) as is_read
      from eligible_inbox inbox
      join public.notes note
        on note.id::text = inbox.source_id
       and note.org_id = inbox.org_id
      left join public.notification_read_states read_state
        on read_state.org_id = v_org_id
       and read_state.user_id = v_user_id
       and read_state.section = 'notes'
       and read_state.source_type = 'note'
       and read_state.source_id = inbox.source_id
      left join public.communication_read_cursors cursor_state
        on cursor_state.org_id = v_org_id
       and cursor_state.user_id = v_user_id
       and cursor_state.channel = 'internal'
       and cursor_state.conversation_key = v_key
      where public.kalam_internal_message_conversation_key_v3(
        note.org_id, note.id, note.author_id,
        coalesce(note.mention_user_ids, '{}'::uuid[]),
        coalesce(note.mention_role_ids, '{}'::uuid[]),
        note.source_type, coalesce(note.metadata, '{}'::jsonb), note.reply_to,
        v_user_id, v_role_id, inbox.category
      ) = v_key
      order by note.id, inbox.created_at desc, inbox.id desc
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

grant execute on function public.get_internal_communication_conversations_v3(timestamptz, integer) to authenticated;
grant execute on function public.get_internal_communication_timeline_v3(text, integer, text) to authenticated;
revoke all on function public.kalam_internal_message_conversation_key_v3(uuid, uuid, uuid, uuid[], uuid[], text, jsonb, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.kalam_internal_message_peer_id_v3(text, uuid) from public, anon, authenticated;
revoke all on function public.get_internal_communication_conversations_v3(timestamptz, integer) from public, anon;
revoke all on function public.get_internal_communication_timeline_v3(text, integer, text) from public, anon;

notify pgrst, 'reload schema';

commit;
