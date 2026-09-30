-- =====================================================
-- TazeSystem - Phase 534: Internal messaging V2 direct conversations
--
-- A single note remains the authoritative record-level activity.  This
-- migration projects that note into every relevant direct conversation at
-- read time, including role mentions, without duplicating the note itself.
-- System-message access stays recipient-only and fail-closed.
-- =====================================================

begin;

create index if not exists idx_profiles_org_role_internal_message_peers
  on public.profiles (org_id, role_id, id)
  where role_id is not null;

-- Resolve explicit users and current members of mentioned roles in one place.
-- The function is intentionally not callable by clients; the timeline RPCs
-- invoke it only after the tenant and recipient checks have succeeded.
create or replace function public.kalam_internal_message_direct_peers_v4(
  p_org_id uuid,
  p_author_id uuid,
  p_mention_user_ids uuid[] default '{}'::uuid[],
  p_mention_role_ids uuid[] default '{}'::uuid[]
)
returns table (peer_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct candidate.peer_id
  from (
    select mentioned_user_id as peer_id
    from unnest(coalesce(p_mention_user_ids, '{}'::uuid[])) as mentioned_user_id
    where mentioned_user_id is not null
      and mentioned_user_id is distinct from p_author_id

    union

    select profile.id as peer_id
    from public.profiles profile
    where profile.org_id = p_org_id
      and profile.role_id = any(coalesce(p_mention_role_ids, '{}'::uuid[]))
      and profile.id is distinct from p_author_id
  ) candidate
  where candidate.peer_id is not null;
$$;

-- Returns one row for each direct conversation in which a note belongs for
-- the current viewer. A role mention therefore appears as a direct message to
-- every current member of that role, while the sender sees the same immutable
-- note in each corresponding conversation.
create or replace function public.kalam_internal_message_conversation_rows_v4(
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
returns table (conversation_key text, peer_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_group_id uuid := public.kalam_try_uuid(v_metadata->>'chat_group_id');
  v_fallback_key text;
begin
  if p_viewer_id is null or p_author_id is null then
    return;
  end if;

  if v_group_id is not null then
    return query select 'group:' || v_group_id::text, null::uuid;
    return;
  end if;

  if public.kalam_internal_message_is_system_v2(
    p_source_type,
    v_metadata,
    p_inbox_category
  ) then
    return query select 'system'::text, null::uuid;
    return;
  end if;

  if p_author_id = p_viewer_id then
    if exists (
      select 1
      from public.kalam_internal_message_direct_peers_v4(
        p_org_id,
        p_author_id,
        p_mention_user_ids,
        p_mention_role_ids
      )
    ) then
      return query
      select public.kalam_direct_conversation_key(p_author_id, peer.peer_id), peer.peer_id
      from public.kalam_internal_message_direct_peers_v4(
        p_org_id,
        p_author_id,
        p_mention_user_ids,
        p_mention_role_ids
      ) peer;
      return;
    end if;

    return query select 'mine'::text, null::uuid;
    return;
  end if;

  if p_viewer_id = any(coalesce(p_mention_user_ids, '{}'::uuid[]))
    or (
      p_viewer_role_id is not null
      and p_viewer_role_id = any(coalesce(p_mention_role_ids, '{}'::uuid[]))
    ) then
    return query select public.kalam_direct_conversation_key(p_viewer_id, p_author_id), p_author_id;
    return;
  end if;

  v_fallback_key := public.kalam_internal_message_conversation_key_v3(
    p_org_id,
    p_note_id,
    p_author_id,
    coalesce(p_mention_user_ids, '{}'::uuid[]),
    coalesce(p_mention_role_ids, '{}'::uuid[]),
    p_source_type,
    v_metadata,
    p_reply_to,
    p_viewer_id,
    p_viewer_role_id,
    p_inbox_category
  );
  if nullif(trim(coalesce(v_fallback_key, '')), '') is not null then
    return query select v_fallback_key, null::uuid;
  end if;
end;
$$;

create or replace function public.kalam_internal_message_matches_conversation_v4(
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
  p_inbox_category text,
  p_conversation_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.kalam_internal_message_conversation_rows_v4(
      p_org_id,
      p_note_id,
      p_author_id,
      p_mention_user_ids,
      p_mention_role_ids,
      p_source_type,
      p_metadata,
      p_reply_to,
      p_viewer_id,
      p_viewer_role_id,
      p_inbox_category
    ) resolved
    where resolved.conversation_key = nullif(trim(coalesce(p_conversation_key, '')), '')
  );
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
    select profile.id as user_id, profile.org_id, profile.role_id
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.org_id = public.current_org_id()
    limit 1
  ), candidate as materialized (
    select distinct on (note.id, resolved.conversation_key)
      note.id as note_id,
      note.author_id,
      note.created_at,
      nullif(trim(coalesce(inbox.body, note.content, '')), '') as preview,
      resolved.conversation_key,
      resolved.peer_id
    from me
    join public.notification_inbox_items inbox
      on inbox.org_id = me.org_id
     and inbox.section = 'notes'
     and inbox.source_type = 'note'
    join public.notes note
      on note.id::text = inbox.source_id
     and note.org_id = inbox.org_id
    cross join lateral public.kalam_internal_message_conversation_rows_v4(
      note.org_id,
      note.id,
      note.author_id,
      coalesce(note.mention_user_ids, '{}'::uuid[]),
      coalesce(note.mention_role_ids, '{}'::uuid[]),
      note.source_type,
      coalesce(note.metadata, '{}'::jsonb),
      note.reply_to,
      me.user_id,
      me.role_id,
      inbox.category
    ) resolved
    where public.kalam_can_access_internal_message_v2(
      inbox.is_org_wide,
      inbox.target_user_ids,
      inbox.target_role_ids,
      note.author_id,
      note.mention_user_ids,
      note.mention_role_ids,
      note.source_type,
      note.metadata,
      inbox.category,
      me.user_id,
      me.role_id
    )
    order by note.id, resolved.conversation_key, inbox.created_at desc, inbox.id desc
  ), visible as materialized (
    select candidate.*,
      (
        candidate.author_id = me.user_id
        or read_state.read_at is not null
        or read_state.dismissed_at is not null
        or (
          cursor_state.read_through_at is not null
          and (
            candidate.created_at < cursor_state.read_through_at
            or (
              candidate.created_at = cursor_state.read_through_at
              and candidate.note_id::text <= coalesce(cursor_state.read_through_id, candidate.note_id::text)
            )
          )
        )
      ) as is_read
    from candidate
    join me on true
    left join public.notification_read_states read_state
      on read_state.org_id = me.org_id
     and read_state.user_id = me.user_id
     and read_state.section = 'notes'
     and read_state.source_type = 'note'
     and read_state.source_id = candidate.note_id::text
    left join public.communication_read_cursors cursor_state
      on cursor_state.org_id = me.org_id
     and cursor_state.user_id = me.user_id
     and cursor_state.channel = 'internal'
     and cursor_state.conversation_key = candidate.conversation_key
    where nullif(trim(coalesce(candidate.conversation_key, '')), '') is not null
      and (
        candidate.conversation_key not like 'direct:%'
        or candidate.conversation_key like 'direct:' || me.user_id::text || ':%'
        or candidate.conversation_key like 'direct:%:' || me.user_id::text
      )
  ), summary as (
    select
      conversation_key,
      count(*)::integer as note_count,
      count(*) filter (where not is_read)::integer as unread_count,
      max(created_at) as latest_message_at
    from visible
    group by conversation_key
  ), latest as (
    select distinct on (conversation_key) conversation_key, preview
    from visible
    order by conversation_key, created_at desc, note_id desc
  ), enriched as (
    select
      summary.conversation_key,
      case
        when summary.conversation_key = 'system' then 'system'
        when summary.conversation_key = 'mine' then 'mine'
        when summary.conversation_key like 'group:%' then 'group'
        else 'direct'
      end as kind,
      summary.note_count,
      summary.unread_count,
      summary.latest_message_at,
      latest.preview,
      case
        when summary.conversation_key like 'direct:%' then
          case
            when public.kalam_try_uuid(split_part(summary.conversation_key, ':', 2)) = me.user_id
              then public.kalam_try_uuid(split_part(summary.conversation_key, ':', 3))
            else public.kalam_try_uuid(split_part(summary.conversation_key, ':', 2))
          end
        else null::uuid
      end as resolved_user_id,
      case
        when summary.conversation_key like 'group:%'
          then public.kalam_try_uuid(split_part(summary.conversation_key, ':', 2))
        else null::uuid
      end as resolved_group_id
    from summary
    join me on true
    left join latest on latest.conversation_key = summary.conversation_key
  )
  select
    'notes'::text,
    enriched.conversation_key,
    enriched.kind,
    case
      when enriched.kind = 'system' then 'پیام‌های سیستم'
      when enriched.kind = 'mine' then 'یادداشت‌های من'
      when enriched.kind = 'group' then coalesce(nullif(trim(chat_group.name), ''), 'گروه داخلی')
      else coalesce(nullif(trim(other_profile.full_name), ''), 'کاربر')
    end,
    case
      when enriched.kind = 'system' then 'اعلان‌ها و پیام‌های سیستمی'
      when enriched.kind = 'mine' then 'یادداشت‌های شخصی'
      when enriched.kind = 'group' then 'گروه داخلی'
      else nullif(trim(other_role.title), '')
    end,
    case when enriched.kind = 'direct' then other_profile.avatar_url else null end,
    case when enriched.kind = 'direct' then other_role.title else null end,
    enriched.note_count,
    enriched.unread_count,
    enriched.latest_message_at,
    enriched.preview,
    case when enriched.kind = 'direct' then enriched.resolved_user_id else null::uuid end,
    case when enriched.kind = 'group' then enriched.resolved_group_id else null::uuid end,
    null::uuid,
    null::text,
    null::text,
    null::text,
    null::text
  from enriched
  join me on true
  left join public.chat_groups chat_group
    on enriched.kind = 'group'
   and chat_group.id = enriched.resolved_group_id
   and chat_group.org_id = me.org_id
  left join public.profiles other_profile
    on enriched.kind = 'direct'
   and other_profile.id = enriched.resolved_user_id
   and other_profile.org_id = me.org_id
  left join public.org_roles other_role
    on other_role.id = other_profile.role_id
   and other_role.org_id = me.org_id
  where p_before_cursor is null or enriched.latest_message_at < p_before_cursor
  order by enriched.latest_message_at desc nulls last, 4 asc
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

  if not found then
    return jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0, 'first_unread_id', null, 'has_more_before', false, 'next_before_cursor', null, 'read_model', 'cursor');
  end if;

  if v_key like 'direct:%'
    and v_key not like 'direct:' || v_user_id::text || ':%'
    and v_key not like 'direct:%:' || v_user_id::text then
    return jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0, 'first_unread_id', null, 'has_more_before', false, 'next_before_cursor', null, 'read_model', 'cursor');
  end if;

  if nullif(trim(coalesce(p_before_cursor, '')), '') is not null then
    v_before_ts := nullif(split_part(p_before_cursor, '|', 1), '')::timestamptz;
    v_before_id := nullif(split_part(p_before_cursor, '|', 2), '');
  end if;

  return (
    with eligible_inbox as materialized (
      select inbox.*
      from public.notification_inbox_items inbox
      join public.notes note
        on note.id::text = inbox.source_id
       and note.org_id = inbox.org_id
      where inbox.org_id = v_org_id
        and inbox.section = 'notes'
        and inbox.source_type = 'note'
        and public.kalam_can_access_internal_message_v2(
          inbox.is_org_wide,
          inbox.target_user_ids,
          inbox.target_role_ids,
          note.author_id,
          note.mention_user_ids,
          note.mention_role_ids,
          note.source_type,
          note.metadata,
          inbox.category,
          v_user_id,
          v_role_id
        )
    ), visible as materialized (
      select distinct on (note.id)
        note.id, note.module_id, note.record_id, note.content, note.author_id, note.author_name,
        note.mention_user_ids, note.mention_role_ids, note.created_at, note.reply_to, note.source_type,
        note.metadata, note.is_edited, note.edited_at,
        (
          note.author_id = v_user_id
          or read_state.read_at is not null
          or read_state.dismissed_at is not null
          or (
            cursor_state.read_through_at is not null and (
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
      where public.kalam_internal_message_matches_conversation_v4(
        note.org_id,
        note.id,
        note.author_id,
        coalesce(note.mention_user_ids, '{}'::uuid[]),
        coalesce(note.mention_role_ids, '{}'::uuid[]),
        note.source_type,
        coalesce(note.metadata, '{}'::jsonb),
        note.reply_to,
        v_user_id,
        v_role_id,
        inbox.category,
        v_key
      )
      order by note.id, inbox.created_at desc, inbox.id desc
    ), unread as (
      select count(*) filter (where not is_read)::integer as unread_count
      from visible
    ), windowed as (
      select *
      from visible
      where v_before_ts is null
         or created_at < v_before_ts
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
      'items', coalesce((
        select jsonb_agg(
          to_jsonb(page) || jsonb_build_object(
            'metadata',
            coalesce(page.metadata, '{}'::jsonb) || jsonb_build_object(
              'read_receipts',
              public.kalam_message_read_receipts_v1(
                v_org_id,
                'internal',
                v_key,
                page.author_id,
                page.created_at,
                page.id
              )
            )
          )
          order by page.created_at asc, page.id asc
        )
        from page
      ), '[]'::jsonb),
      'unread_count', coalesce((select unread_count from unread), 0),
      'first_unread_id', (select id::text from page where not is_read order by created_at asc, id asc limit 1),
      'has_more_before', (select count(*) > v_limit from windowed),
      'next_before_cursor', (select public.kalam_cursor_value(created_at, id_text) from earliest),
      'read_model', 'cursor'
    )
  );
end;
$$;

-- Re-assert the strict recipient contract for the system-message timeline.
-- In particular, an old inbox row marked organization-wide must never widen
-- access: only an explicit user or role recipient is accepted by the shared
-- predicate used here and in the unread summary.
create or replace function public.get_system_communication_timeline_v1(
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
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 50);
  v_before_ts timestamptz := null;
  v_before_id text := null;
begin
  if v_user_id is null or v_org_id is null then
    return jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0, 'first_unread_id', null, 'has_more_before', false, 'next_before_cursor', null, 'read_model', 'cursor');
  end if;

  select profile.role_id into v_role_id
  from public.profiles profile
  where profile.id = v_user_id and profile.org_id = v_org_id
  limit 1;
  if not found then
    return jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0, 'first_unread_id', null, 'has_more_before', false, 'next_before_cursor', null, 'read_model', 'cursor');
  end if;

  if nullif(trim(coalesce(p_before_cursor, '')), '') is not null then
    v_before_ts := nullif(split_part(p_before_cursor, '|', 1), '')::timestamptz;
    v_before_id := nullif(split_part(p_before_cursor, '|', 2), '');
  end if;

  return (
    with visible as materialized (
      select
        note.id, note.module_id, note.record_id, note.content, note.author_id, note.author_name,
        note.mention_user_ids, note.mention_role_ids, note.created_at, note.reply_to, note.source_type,
        note.metadata, note.is_edited, note.edited_at,
        (
          note.author_id = v_user_id
          or read_state.read_at is not null
          or read_state.dismissed_at is not null
          or (
            cursor_state.read_through_at is not null and (
              note.created_at < cursor_state.read_through_at
              or (note.created_at = cursor_state.read_through_at and note.id::text <= coalesce(cursor_state.read_through_id, note.id::text))
            )
          )
        ) as is_read
      from public.notes note
      left join lateral (
        select inbox.category, inbox.target_user_ids, inbox.target_role_ids
        from public.notification_inbox_items inbox
        where inbox.org_id = v_org_id
          and inbox.section = 'notes'
          and inbox.source_type = 'note'
          and inbox.source_id = note.id::text
        order by inbox.last_event_at desc, inbox.created_at desc, inbox.id desc
        limit 1
      ) inbox on true
      left join public.notification_read_states read_state
        on read_state.org_id = v_org_id
       and read_state.user_id = v_user_id
       and read_state.section = 'notes'
       and read_state.source_type = 'note'
       and read_state.source_id = note.id::text
      left join public.communication_read_cursors cursor_state
        on cursor_state.org_id = v_org_id
       and cursor_state.user_id = v_user_id
       and cursor_state.channel = 'internal'
       and cursor_state.conversation_key = 'system'
      where note.org_id = v_org_id
        and public.kalam_internal_message_is_system_v2(note.source_type, note.metadata, inbox.category)
        and public.kalam_can_access_internal_message_v2(
          false,
          coalesce(inbox.target_user_ids, '{}'::uuid[]),
          coalesce(inbox.target_role_ids, '{}'::uuid[]),
          note.author_id,
          note.mention_user_ids,
          note.mention_role_ids,
          note.source_type,
          note.metadata,
          coalesce(inbox.category, 'system'),
          v_user_id,
          v_role_id
        )
    ), unread as (
      select count(*) filter (where not is_read)::integer as unread_count from visible
    ), windowed as (
      select * from visible
      where v_before_ts is null
         or created_at < v_before_ts
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
      'items', coalesce((
        select jsonb_agg(
          to_jsonb(page) || jsonb_build_object(
            'metadata',
            coalesce(page.metadata, '{}'::jsonb) || jsonb_build_object(
              'read_receipts',
              public.kalam_message_read_receipts_v1(
                v_org_id,
                'internal',
                'system',
                page.author_id,
                page.created_at,
                page.id
              )
            )
          )
          order by page.created_at asc, page.id asc
        )
        from page
      ), '[]'::jsonb),
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
grant execute on function public.get_system_communication_timeline_v1(integer, text) to authenticated;
revoke all on function public.kalam_internal_message_direct_peers_v4(uuid, uuid, uuid[], uuid[]) from public, anon, authenticated;
revoke all on function public.kalam_internal_message_conversation_rows_v4(uuid, uuid, uuid, uuid[], uuid[], text, jsonb, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.kalam_internal_message_matches_conversation_v4(uuid, uuid, uuid, uuid[], uuid[], text, jsonb, uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.get_internal_communication_conversations_v3(timestamptz, integer) from public, anon;
revoke all on function public.get_internal_communication_timeline_v3(text, integer, text) from public, anon;
revoke all on function public.get_system_communication_timeline_v1(integer, text) from public, anon;

notify pgrst, 'reload schema';

commit;
