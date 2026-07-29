-- =====================================================
-- TazeSystem - Phase 419: Messaging V2 central recipient scope
-- Date: 2026-07-29
-- Type: Security / consistency / messaging repair
-- =====================================================

begin;

-- The one classification rule used by every V2 internal-message surface.
create or replace function public.kalam_internal_message_is_system_v2(
  p_source_type text,
  p_metadata jsonb,
  p_inbox_category text default null
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(trim(coalesce(p_inbox_category, ''))) in ('system', 'assistant')
    or lower(trim(coalesce(nullif(p_source_type, ''), coalesce(p_metadata, '{}'::jsonb)->>'source_type', ''))) in ('system', 'ai', 'assistant')
    or coalesce(p_metadata, '{}'::jsonb) ?| array[
      'workflow_id', 'automation_rule_id', 'process_automation_rule_id',
      'workflow_action_type', 'scheduled_report_id'
    ];
$$;

-- The single recipient rule for internal and system notes. System/AI messages
-- are never visible through an organization-wide flag or the author shortcut.
create or replace function public.kalam_can_access_internal_message_v2(
  p_inbox_is_org_wide boolean,
  p_target_user_ids uuid[],
  p_target_role_ids uuid[],
  p_author_id uuid,
  p_note_mention_user_ids uuid[],
  p_note_mention_role_ids uuid[],
  p_source_type text,
  p_metadata jsonb,
  p_inbox_category text,
  p_viewer_id uuid,
  p_viewer_role_id uuid
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when p_viewer_id is null then false
    when public.kalam_internal_message_is_system_v2(p_source_type, p_metadata, p_inbox_category) then
      p_viewer_id = any(coalesce(p_target_user_ids, '{}'::uuid[]))
      or p_viewer_id = any(coalesce(p_note_mention_user_ids, '{}'::uuid[]))
      or (p_viewer_role_id is not null and (
        p_viewer_role_id = any(coalesce(p_target_role_ids, '{}'::uuid[]))
        or p_viewer_role_id = any(coalesce(p_note_mention_role_ids, '{}'::uuid[]))
      ))
    else coalesce(p_inbox_is_org_wide, false)
      or p_viewer_id = any(coalesce(p_target_user_ids, '{}'::uuid[]))
      or p_viewer_id = any(coalesce(p_note_mention_user_ids, '{}'::uuid[]))
      or (p_viewer_role_id is not null and (
        p_viewer_role_id = any(coalesce(p_target_role_ids, '{}'::uuid[]))
        or p_viewer_role_id = any(coalesce(p_note_mention_role_ids, '{}'::uuid[]))
      ))
      or p_author_id = p_viewer_id
  end;
$$;

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
  v_source text := lower(trim(coalesce(nullif(p_source_type, ''), nullif(v_metadata->>'source_type', ''), '')));
  v_group_id text := nullif(trim(coalesce(v_metadata->>'chat_group_id', '')), '');
  v_user_mentions uuid[] := coalesce(p_mention_user_ids, '{}'::uuid[]);
  v_role_mentions uuid[] := coalesce(p_mention_role_ids, '{}'::uuid[]);
begin
  if v_group_id is not null then
    return 'group:' || v_group_id;
  end if;

  if public.kalam_internal_message_is_system_v2(v_source, v_metadata, p_inbox_category) then
    return 'system';
  end if;

  if p_author_id is null then
    return null;
  end if;

  if p_viewer_id is not null
    and p_author_id <> p_viewer_id
    and (
      p_viewer_id = any(v_user_mentions)
      or (p_viewer_role_id is not null and p_viewer_role_id = any(v_role_mentions))
    ) then
    return public.kalam_direct_conversation_key(p_viewer_id, p_author_id);
  end if;

  if p_author_id = p_viewer_id and cardinality(v_user_mentions) = 0 then
    return 'mine';
  end if;

  return public.kalam_note_conversation_key(
    p_org_id, p_note_id, p_author_id, v_user_mentions, v_source, v_metadata, p_reply_to
  );
end;
$$;

create or replace function public.get_internal_communication_conversations_v3(
  p_before_cursor timestamptz default null,
  p_limit integer default 80
)
returns table (
  section text, conversation_key text, kind text, title text, subtitle text,
  avatar_url text, role_label text, note_count integer, unread_count integer,
  latest_message_at timestamptz, last_message_preview text, user_id uuid,
  group_id uuid, bot_group_id uuid, channel_type text, status text,
  counterparty_label text, bot_chat_id text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select p.id as user_id, p.org_id, p.role_id
    from public.profiles p
    where p.id = auth.uid() and p.org_id = public.current_org_id()
    limit 1
  ), candidate as materialized (
    select distinct on (n.id)
      n.id as note_id,
      n.author_id,
      n.created_at,
      nullif(trim(coalesce(nii.body, n.content, '')), '') as preview,
      public.kalam_internal_message_conversation_key_v3(
        n.org_id, n.id, n.author_id, coalesce(n.mention_user_ids, '{}'::uuid[]),
        coalesce(n.mention_role_ids, '{}'::uuid[]), n.source_type,
        coalesce(n.metadata, '{}'::jsonb), n.reply_to, me.user_id, me.role_id, nii.category
      ) as conversation_key
    from me
    join public.notification_inbox_items nii
      on nii.org_id = me.org_id and nii.section = 'notes' and nii.source_type = 'note'
    join public.notes n on n.id::text = nii.source_id and n.org_id = nii.org_id
    where public.kalam_can_access_internal_message_v2(
      nii.is_org_wide, nii.target_user_ids, nii.target_role_ids, n.author_id,
      n.mention_user_ids, n.mention_role_ids, n.source_type, n.metadata, nii.category,
      me.user_id, me.role_id
    )
    order by n.id, nii.created_at desc, nii.id desc
  ), visible as materialized (
    select c.*,
      (c.author_id = me.user_id
        or rs.read_at is not null
        or rs.dismissed_at is not null
        or (crc.read_through_at is not null and (
          c.created_at < crc.read_through_at
          or (c.created_at = crc.read_through_at and c.note_id::text <= coalesce(crc.read_through_id, c.note_id::text))
        ))) as is_read
    from candidate c
    join me on true
    left join public.notification_read_states rs
      on rs.org_id = me.org_id and rs.user_id = me.user_id
     and rs.section = 'notes' and rs.source_type = 'note' and rs.source_id = c.note_id::text
    left join public.communication_read_cursors crc
      on crc.org_id = me.org_id and crc.user_id = me.user_id
     and crc.channel = 'internal' and crc.conversation_key = c.conversation_key
    where nullif(trim(coalesce(c.conversation_key, '')), '') is not null
      and (c.conversation_key not like 'direct:%'
        or c.conversation_key like 'direct:' || me.user_id::text || ':%'
        or c.conversation_key like 'direct:%:' || me.user_id::text)
  ), summary as (
    select conversation_key,
      case when conversation_key = 'system' then 'system'
           when conversation_key = 'mine' then 'mine'
           when conversation_key like 'group:%' then 'group' else 'direct' end as kind,
      count(*)::integer as note_count,
      count(*) filter (where not is_read)::integer as unread_count,
      max(created_at) as latest_message_at
    from visible
    group by conversation_key
  ), latest as (
    select distinct on (conversation_key) conversation_key, preview
    from visible
    order by conversation_key, created_at desc, note_id desc
  )
  select 'notes'::text, s.conversation_key, s.kind,
    case when s.kind = 'system' then 'پیام‌های سیستم'
         when s.kind = 'mine' then 'یادداشت‌های من'
         when s.kind = 'group' then 'گروه داخلی' else 'کاربر' end,
    case when s.kind = 'system' then 'اعلان‌ها و پیام‌های سیستمی'
         when s.kind = 'mine' then 'یادداشت‌های شخصی'
         when s.kind = 'group' then 'گروه داخلی' else 'پیام مستقیم داخلی' end,
    null::text, null::text, s.note_count, s.unread_count, s.latest_message_at, l.preview,
    null::uuid, null::uuid, null::uuid, null::text, null::text, null::text, null::text
  from summary s
  left join latest l on l.conversation_key = s.conversation_key
  where p_before_cursor is null or s.latest_message_at < p_before_cursor
  order by s.latest_message_at desc nulls last, 4 asc
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
  where profile.id = v_user_id and profile.org_id = v_org_id
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
      join public.notes note
        on note.id::text = inbox.source_id and note.org_id = inbox.org_id
      where inbox.org_id = v_org_id
        and inbox.section = 'notes'
        and inbox.source_type = 'note'
        and public.kalam_can_access_internal_message_v2(
          inbox.is_org_wide, inbox.target_user_ids, inbox.target_role_ids, note.author_id,
          note.mention_user_ids, note.mention_role_ids, note.source_type, note.metadata, inbox.category,
          v_user_id, v_role_id
        )
    ), visible as materialized (
      select distinct on (note.id)
        note.id, note.module_id, note.record_id, note.content, note.author_id, note.author_name,
        note.mention_user_ids, note.mention_role_ids, note.created_at, note.reply_to, note.source_type,
        note.metadata, note.is_edited, note.edited_at,
        (note.author_id = v_user_id or read_state.read_at is not null or read_state.dismissed_at is not null
          or (cursor_state.read_through_at is not null and (
            note.created_at < cursor_state.read_through_at
            or (note.created_at = cursor_state.read_through_at and note.id::text <= coalesce(cursor_state.read_through_id, note.id::text))
          ))) as is_read
      from eligible_inbox inbox
      join public.notes note on note.id::text = inbox.source_id and note.org_id = inbox.org_id
      left join public.notification_read_states read_state
        on read_state.org_id = v_org_id and read_state.user_id = v_user_id
       and read_state.section = 'notes' and read_state.source_type = 'note' and read_state.source_id = inbox.source_id
      left join public.communication_read_cursors cursor_state
        on cursor_state.org_id = v_org_id and cursor_state.user_id = v_user_id
       and cursor_state.channel = 'internal' and cursor_state.conversation_key = v_key
      where public.kalam_internal_message_conversation_key_v3(
        note.org_id, note.id, note.author_id, coalesce(note.mention_user_ids, '{}'::uuid[]),
        coalesce(note.mention_role_ids, '{}'::uuid[]), note.source_type, coalesce(note.metadata, '{}'::jsonb),
        note.reply_to, v_user_id, v_role_id, inbox.category
      ) = v_key
      order by note.id, inbox.created_at desc, inbox.id desc
    ), unread as (
      select count(*) filter (where not is_read)::integer as unread_count from visible
    ), windowed as (
      select * from visible
      where v_before_ts is null or created_at < v_before_ts
         or (created_at = v_before_ts and id::text < coalesce(v_before_id, ''))
      order by created_at desc, id desc
      limit v_limit + 1
    ), page_desc as (
      select * from windowed order by created_at desc, id desc limit v_limit
    ), page as (
      select * from page_desc order by created_at asc, id asc
    ), earliest as (
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

create or replace function public.get_internal_messaging_unread_total_v2()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select p.id as user_id, p.org_id, p.role_id
    from public.profiles p
    where p.id = auth.uid() and p.org_id = public.current_org_id()
    limit 1
  ), candidate as materialized (
    select distinct on (n.id)
      n.id as note_id, n.author_id, n.created_at,
      public.kalam_internal_message_conversation_key_v3(
        n.org_id, n.id, n.author_id, coalesce(n.mention_user_ids, '{}'::uuid[]),
        coalesce(n.mention_role_ids, '{}'::uuid[]), n.source_type, coalesce(n.metadata, '{}'::jsonb),
        n.reply_to, me.user_id, me.role_id, nii.category
      ) as conversation_key
    from me
    join public.notification_inbox_items nii
      on nii.org_id = me.org_id and nii.section = 'notes' and nii.source_type = 'note'
    join public.notes n on n.id::text = nii.source_id and n.org_id = nii.org_id
    where public.kalam_can_access_internal_message_v2(
      nii.is_org_wide, nii.target_user_ids, nii.target_role_ids, n.author_id,
      n.mention_user_ids, n.mention_role_ids, n.source_type, n.metadata, nii.category,
      me.user_id, me.role_id
    )
    order by n.id, nii.created_at desc, nii.id desc
  ), visible as materialized (
    select c.note_id, c.author_id, c.created_at, c.conversation_key,
      (c.author_id = me.user_id or rs.read_at is not null or rs.dismissed_at is not null
        or (crc.read_through_at is not null and (
          c.created_at < crc.read_through_at
          or (c.created_at = crc.read_through_at and c.note_id::text <= coalesce(crc.read_through_id, c.note_id::text))
        ))) as is_read
    from candidate c
    join me on true
    left join public.notification_read_states rs
      on rs.org_id = me.org_id and rs.user_id = me.user_id
     and rs.section = 'notes' and rs.source_type = 'note' and rs.source_id = c.note_id::text
    left join public.communication_read_cursors crc
      on crc.org_id = me.org_id and crc.user_id = me.user_id
     and crc.channel = 'internal' and crc.conversation_key = c.conversation_key
    where nullif(trim(coalesce(c.conversation_key, '')), '') is not null
  )
  select count(*) filter (where not is_read)::integer from visible;
$$;

-- V5 is the runtime's only overlay endpoint. Re-check notes through the same
-- recipient rule before the feed is merged with bot conversations.
create or replace function public.get_notification_overlay_feed_v5(
  p_before_cursor text default null,
  p_limit integer default 20
)
returns table (
  section text, source_type text, source_id text, title text, body text,
  created_at timestamptz, module_id text, record_id text, conversation_key text,
  payload jsonb, feed_cursor text, has_more boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select auth.uid() as user_id, public.current_org_id() as org_id, p.role_id
    from public.profiles p
    where p.id = auth.uid() and p.org_id = public.current_org_id()
    limit 1
  ), limits as (
    select least(greatest(coalesce(p_limit, 20), 1), 50) as effective_limit,
      least(greatest(least(greatest(coalesce(p_limit, 20), 1), 50) * 8, 80), 300) as candidate_limit
  ), cursor_value as (
    select nullif(split_part(coalesce(p_before_cursor, ''), '|', 1), '')::timestamptz as before_at,
      nullif(split_part(coalesce(p_before_cursor, ''), '|', 2), '') as before_key
  ), central_rows as (
    select f.section, f.source_type, f.source_id, f.title, f.body, f.created_at, f.module_id, f.record_id,
      f.conversation_key, f.payload, coalesce(f.has_more, false) as upstream_has_more
    from me
    cross join limits
    cross join lateral public.get_notification_overlay_feed_v4(p_before_cursor, limits.candidate_limit) f
    left join public.notification_inbox_items inbox
      on f.section = 'notes' and inbox.org_id = me.org_id and inbox.section = 'notes'
     and inbox.source_type = 'note' and inbox.source_id = f.source_id
    left join public.notes note on f.section = 'notes' and note.org_id = me.org_id and note.id::text = f.source_id
    where f.section <> 'notes'
      or public.kalam_can_access_internal_message_v2(
        inbox.is_org_wide, inbox.target_user_ids, inbox.target_role_ids, note.author_id,
        note.mention_user_ids, note.mention_role_ids, note.source_type, note.metadata, inbox.category,
        me.user_id, me.role_id
      )
  ), direct_candidates as (
    select m.id, m.direct_thread_id, m.content_text, m.file_url, m.file_name, m.mime_type, m.message_type,
      m.payload as message_payload, m.created_at, t.channel_type, t.chat_id, t.target_module_id,
      t.target_record_id, t.display_name, t.username, t.phone_number
    from me cross join limits cross join cursor_value cur
    join public.counterparty_bot_direct_threads t
      on t.org_id = me.org_id and public.kalam_can_access_bot_direct_thread(t.id, t.org_id)
    join public.counterparty_bot_direct_messages m
      on m.org_id = me.org_id and m.direct_thread_id = t.id and m.direction = 'inbound'
    left join public.notification_read_states rs
      on rs.org_id = me.org_id and rs.user_id = me.user_id
     and rs.source_type = 'counterparty_bot_direct_message' and rs.source_id = m.id::text
     and rs.section in ('bot_direct_messages', 'bot_messages')
    left join public.communication_read_cursors crc
      on crc.org_id = me.org_id and crc.user_id = me.user_id and crc.channel = 'bot'
     and crc.conversation_key = 'bot:direct:' || coalesce(t.channel_type, '') || ':' || coalesce(t.chat_id, '')
    where rs.read_at is null and rs.dismissed_at is null
      and (rs.snoozed_until is null or rs.snoozed_until <= now())
      and (crc.read_through_at is null or m.created_at > crc.read_through_at
        or (m.created_at = crc.read_through_at and m.id::text > coalesce(crc.read_through_id, '')))
      and (cur.before_at is null or m.created_at < cur.before_at
        or (m.created_at = cur.before_at and concat_ws(':', 'bot_direct_messages', 'counterparty_bot_direct_message', m.id::text) < coalesce(cur.before_key, '')))
    order by m.created_at desc, m.id desc
    limit ((select candidate_limit from limits) + 1)
  ), direct_rows as (
    select 'bot_direct_messages'::text as section, 'counterparty_bot_direct_message'::text as source_type,
      dc.id::text as source_id,
      coalesce(nullif(trim(dc.display_name), ''), nullif(trim(dc.message_payload->>'sender_display_name'), ''),
        case when nullif(trim(coalesce(dc.username, dc.message_payload->>'username')), '') is not null then '@' || trim(coalesce(dc.username, dc.message_payload->>'username')) end,
        nullif(trim(dc.chat_id), ''), 'پیام شخصی بات') as title,
      coalesce(nullif(trim(dc.content_text), ''), nullif(trim(dc.file_name), ''), 'پیام جدید') as body,
      dc.created_at, nullif(trim(dc.target_module_id), '') as module_id,
      nullif(trim(dc.target_record_id::text), '') as record_id,
      'bot:direct:' || coalesce(dc.channel_type, '') || ':' || coalesce(dc.chat_id, '') as conversation_key,
      coalesce(dc.message_payload, '{}'::jsonb) || jsonb_build_object(
        'direct_thread_id', dc.direct_thread_id::text, 'channel_type', nullif(trim(dc.channel_type), ''),
        'chat_id', nullif(trim(dc.chat_id), ''),
        'conversation_title', coalesce(nullif(trim(dc.display_name), ''), nullif(trim(dc.message_payload->>'sender_display_name'), ''), nullif(trim(dc.chat_id), ''), 'پیام شخصی بات'),
        'sender_display_name', coalesce(nullif(trim(dc.display_name), ''), nullif(trim(dc.message_payload->>'sender_display_name'), ''), nullif(trim(dc.chat_id), ''), 'پیام شخصی بات'),
        'username', nullif(trim(coalesce(dc.username, dc.message_payload->>'username')), ''),
        'phone_number', nullif(trim(coalesce(dc.phone_number, dc.message_payload->>'phone_number')), ''),
        'attachment_previews',
          (case when jsonb_typeof(coalesce(dc.message_payload, '{}'::jsonb)->'attachments') = 'array' then coalesce(dc.message_payload, '{}'::jsonb)->'attachments' else '[]'::jsonb end)
          || case when nullif(trim(coalesce(dc.file_url, '')), '') is not null then jsonb_build_array(jsonb_build_object(
            'name', coalesce(nullif(trim(dc.file_name), ''), 'فایل'), 'url', nullif(trim(dc.file_url), ''),
            'mime_type', nullif(trim(dc.mime_type), ''), 'file_type', nullif(trim(dc.message_type), '')
          )) else '[]'::jsonb end
      ) as payload,
      false as upstream_has_more
    from direct_candidates dc
  ), candidate_rows as (
    select * from central_rows union all select * from direct_rows
  ), deduped_rows as (
    select distinct on (section, source_type, source_id) *
    from candidate_rows
    order by section, source_type, source_id, created_at desc nulls last
  ), ranked_rows as (
    select dr.*, concat_ws(':', dr.section, dr.source_type, dr.source_id) as cursor_key,
      row_number() over (order by dr.created_at desc nulls last, concat_ws(':', dr.section, dr.source_type, dr.source_id) desc) as row_number,
      count(*) over () as candidate_count,
      bool_or(dr.upstream_has_more) over () as any_upstream_has_more
    from deduped_rows dr
    where dr.created_at is not null
  )
  select rr.section, rr.source_type, rr.source_id, rr.title, rr.body, rr.created_at, rr.module_id, rr.record_id,
    rr.conversation_key, rr.payload, rr.created_at::text || '|' || rr.cursor_key as feed_cursor,
    (rr.candidate_count > limits.effective_limit or rr.any_upstream_has_more) as has_more
  from ranked_rows rr cross join limits
  where rr.row_number <= limits.effective_limit
  order by rr.created_at desc nulls last, rr.cursor_key desc;
$$;

grant execute on function public.get_internal_communication_conversations_v3(timestamptz, integer) to authenticated;
grant execute on function public.get_internal_communication_timeline_v3(text, integer, text) to authenticated;
grant execute on function public.get_internal_messaging_unread_total_v2() to authenticated;
grant execute on function public.get_notification_overlay_feed_v5(text, integer) to authenticated;
revoke all on function public.kalam_internal_message_is_system_v2(text, jsonb, text) from public, anon, authenticated;
revoke all on function public.kalam_can_access_internal_message_v2(boolean, uuid[], uuid[], uuid, uuid[], uuid[], text, jsonb, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.kalam_internal_message_conversation_key_v3(uuid, uuid, uuid, uuid[], uuid[], text, jsonb, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.get_internal_communication_conversations_v3(timestamptz, integer) from public, anon;
revoke all on function public.get_internal_communication_timeline_v3(text, integer, text) from public, anon;
revoke all on function public.get_internal_messaging_unread_total_v2() from public, anon;
revoke all on function public.get_notification_overlay_feed_v5(text, integer) from public, anon;

notify pgrst, 'reload schema';

commit;
