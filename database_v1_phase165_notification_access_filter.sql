-- KalamApp V1 - Phase 165
-- Fix: system messages and internal notes must only be shown to intended recipients.
--
-- Root cause: get_notification_conversations and get_internal_conversation_timeline are
-- SECURITY DEFINER functions that bypass RLS. They fetched ALL notification_inbox_items
-- for the org without checking target_user_ids / target_role_ids / is_org_wide columns,
-- so every org member could see every other member's private messages.
--
-- Fix: apply the same access filter that the RLS policy already uses:
--   nii.is_org_wide = true
--   OR current_user  = any(nii.target_user_ids)
--   OR current_role  = any(nii.target_role_ids)

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. get_notification_conversations
--    Source: phase 164 (updated from phase 160).
--    Change: add access filter on nii inside note_raw CTE.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_notification_conversations(p_section text default 'notes')
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
    select
      auth.uid() as user_id,
      public.current_org_id() as org_id,
      p.role_id
    from public.profiles p
    where p.id = auth.uid()
    limit 1
  ),
  note_raw as (
    select
      'notes'::text as section,
      coalesce(
        nii.conversation_key,
        nullif(trim(nii.payload->>'conversation_key'), ''),
        public.kalam_note_conversation_key(
          n.org_id,
          n.id,
          n.author_id,
          coalesce(n.mention_user_ids, '{}'::uuid[]),
          coalesce(n.source_type, n.metadata->>'source_type'),
          coalesce(n.metadata, '{}'::jsonb),
          n.reply_to
        )
      ) as conversation_key,
      lower(trim(coalesce(nii.category, ''))) as inbox_category,
      nullif(trim(coalesce(nii.payload->>'chat_group_id', n.metadata->>'chat_group_id')), '') as chat_group_id,
      n.id as note_id,
      n.author_id,
      n.created_at,
      coalesce(nullif(trim(n.author_name), ''), nullif(trim(p2.full_name), ''), n.author_id::text) as author_name,
      nullif(trim(coalesce(nii.body, '')), '') as preview,
      rs.read_at is not null or rs.dismissed_at is not null or n.author_id = me.user_id as is_read
    from me
    join public.notification_inbox_items nii
      on nii.org_id = me.org_id
     and nii.section = 'notes'
     and nii.source_type = 'note'
     -- ACCESS FILTER: only rows this user/role should see
     and (
       nii.is_org_wide = true
       or me.user_id = any(nii.target_user_ids)
       or (me.role_id is not null and me.role_id = any(nii.target_role_ids))
     )
    join public.notes n
      on n.id::text = nii.source_id
     and n.org_id = nii.org_id
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.section = 'notes'
     and rs.source_type = 'note'
     and rs.source_id = nii.source_id
    left join public.profiles p2
      on p2.id = n.author_id
    where p_section = 'notes'
  ),
  note_base as (
    select
      section,
      conversation_key,
      case
        when conversation_key like 'group:%' or chat_group_id is not null then 'group'
        when conversation_key = 'system' or inbox_category in ('system', 'assistant') then 'system'
        else 'direct'
      end as kind,
      note_id,
      author_id,
      created_at,
      author_name,
      preview,
      is_read
    from note_raw
  ),
  note_agg as (
    select
      section,
      conversation_key,
      kind,
      count(*)::integer as note_count,
      count(*) filter (where not is_read)::integer as unread_count,
      max(created_at) as latest_message_at
    from note_base
    where nullif(trim(coalesce(conversation_key, '')), '') is not null
    group by section, conversation_key, kind
  ),
  note_latest as (
    select distinct on (conversation_key)
      conversation_key,
      preview
    from note_base
    where nullif(trim(coalesce(conversation_key, '')), '') is not null
    order by conversation_key, created_at desc, note_id desc
  ),
  note_enriched as (
    select
      na.section,
      na.conversation_key,
      na.kind,
      case
        when na.kind = 'system' then 'پیام‌های سیستم'
        when na.kind = 'group' then coalesce(cg.name, 'گروه')
        else coalesce(other_profile.full_name, other_profile.id::text, split_part(na.conversation_key, ':', 3))
      end as title,
      case
        when na.kind = 'group' then 'گروه داخلی'
        when na.kind = 'direct' then coalesce(other_role.title, null)
        else null
      end as subtitle,
      case when na.kind = 'direct' then other_profile.avatar_url else null end as avatar_url,
      case when na.kind = 'direct' then other_role.title else null end as role_label,
      na.note_count,
      na.unread_count,
      na.latest_message_at,
      nl.preview as last_message_preview,
      case
        when na.kind = 'direct' then
          case
            when public.kalam_try_uuid(split_part(na.conversation_key, ':', 2)) = me.user_id
              then public.kalam_try_uuid(split_part(na.conversation_key, ':', 3))
            else public.kalam_try_uuid(split_part(na.conversation_key, ':', 2))
          end
        else null
      end as user_id,
      case when na.kind = 'group'
        then public.kalam_try_uuid(split_part(na.conversation_key, ':', 2))
        else null
      end as group_id,
      null::uuid as bot_group_id,
      null::text as channel_type,
      null::text as status,
      null::text as counterparty_label,
      null::text as bot_chat_id
    from note_agg na
    join me on true
    left join note_latest nl
      on nl.conversation_key = na.conversation_key
    left join public.chat_groups cg
      on na.kind = 'group'
     and cg.id = public.kalam_try_uuid(split_part(na.conversation_key, ':', 2))
    left join public.profiles other_profile
      on na.kind = 'direct'
     and other_profile.id = (
       case
         when public.kalam_try_uuid(split_part(na.conversation_key, ':', 2)) = me.user_id
           then public.kalam_try_uuid(split_part(na.conversation_key, ':', 3))
         else public.kalam_try_uuid(split_part(na.conversation_key, ':', 2))
       end
     )
    left join public.org_roles other_role
      on other_role.id = other_profile.role_id
  ),
  bot_base as (
    select
      'bot_messages'::text as section,
      'bot:' || g.id::text as conversation_key,
      'bot'::text as kind,
      g.id as bot_group_id,
      g.group_title,
      g.channel_type,
      g.status,
      g.bot_chat_id,
      g.customer_id,
      g.supplier_id,
      m.id as message_id,
      m.created_at,
      coalesce(nullif(trim(m.content_text), ''), nullif(trim(m.file_name), ''), nullif(trim(m.message_type), '')) as preview,
      m.direction,
      rs.read_at is not null or rs.dismissed_at is not null or m.direction <> 'inbound' as is_read
    from me
    join public.counterparty_bot_groups g
      on g.org_id = me.org_id
    left join public.counterparty_bot_messages m
      on m.bot_group_id = g.id
     and m.org_id = g.org_id
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.section = 'bot_messages'
     and rs.source_type = 'counterparty_bot_message'
     and rs.source_id = m.id::text
    where p_section = 'bot_messages'
      and (
        (
          coalesce(jsonb_array_length(g.metadata->'allowed_user_ids'), 0) = 0
          and coalesce(jsonb_array_length(g.metadata->'allowed_role_ids'), 0) = 0
        )
        or me.user_id = any(public.kalam_jsonb_uuid_array(g.metadata->'allowed_user_ids'))
        or (me.role_id is not null and me.role_id = any(public.kalam_jsonb_uuid_array(g.metadata->'allowed_role_ids')))
      )
  ),
  bot_agg as (
    select
      section,
      conversation_key,
      kind,
      bot_group_id,
      min(group_title) as title,
      min(channel_type) as channel_type,
      min(status) as status,
      min(bot_chat_id) as bot_chat_id,
      count(message_id)::integer as note_count,
      count(message_id) filter (where direction = 'inbound' and not is_read)::integer as unread_count,
      max(created_at) as latest_message_at
    from bot_base
    group by section, conversation_key, kind, bot_group_id
  ),
  bot_latest as (
    select distinct on (conversation_key)
      conversation_key,
      preview
    from bot_base
    where message_id is not null
    order by conversation_key, created_at desc, message_id desc
  ),
  bot_enriched as (
    select
      ba.section,
      ba.conversation_key,
      ba.kind,
      coalesce(nullif(trim(ba.title), ''), 'گروه بات') as title,
      case
        when g.customer_id is not null then coalesce(c.full_name, c.business_name, c.legal_name, c.system_code)
        when g.supplier_id is not null then coalesce(s.business_name, s.full_name, s.system_code)
        else null
      end as subtitle,
      null::text as avatar_url,
      null::text as role_label,
      ba.note_count,
      ba.unread_count,
      ba.latest_message_at,
      bl.preview as last_message_preview,
      null::uuid as user_id,
      null::uuid as group_id,
      ba.bot_group_id,
      ba.channel_type,
      ba.status,
      case
        when g.customer_id is not null then coalesce(c.full_name, c.business_name, c.legal_name, c.system_code)
        when g.supplier_id is not null then coalesce(s.business_name, s.full_name, s.system_code)
        else null
      end as counterparty_label,
      ba.bot_chat_id
    from bot_agg ba
    join public.counterparty_bot_groups g
      on g.id = ba.bot_group_id
    left join bot_latest bl
      on bl.conversation_key = ba.conversation_key
    left join public.customers c
      on c.id = g.customer_id
    left join public.suppliers s
      on s.id = g.supplier_id
  )
  select * from note_enriched
  union all
  select * from bot_enriched
  order by latest_message_at desc nulls last, title asc;
$$;

grant execute on function public.get_notification_conversations(text) to authenticated;
revoke all on function public.get_notification_conversations(text) from public, anon;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. get_internal_conversation_timeline
--    Source: phase 160.
--    Changes:
--      a) Declare v_role_id and fetch it at the start.
--      b) Add access filter on nii in every query block (7 places).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_internal_conversation_timeline(
  p_conversation_key text,
  p_limit integer default 10,
  p_before_cursor text default null,
  p_include_unread_window boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id  uuid := public.current_org_id();
  v_role_id uuid := null;
  v_limit   integer := greatest(coalesce(p_limit, 10), 1);
  v_unread_count     integer := 0;
  v_first_unread_id  text    := null;
  v_has_more_before  boolean := false;
  v_next_before_cursor text  := null;
  v_before_ts timestamptz := null;
  v_before_id text        := null;
  v_items     jsonb       := '[]'::jsonb;
begin
  if v_user_id is null or v_org_id is null
     or nullif(trim(coalesce(p_conversation_key, '')), '') is null then
    return jsonb_build_object(
      'items', '[]'::jsonb,
      'unread_count', 0,
      'first_unread_id', null,
      'has_more_before', false,
      'next_before_cursor', null
    );
  end if;

  -- Fetch caller's role for role-based access check
  select p.role_id into v_role_id
  from public.profiles p
  where p.id = v_user_id
  limit 1;

  if nullif(trim(coalesce(p_before_cursor, '')), '') is not null then
    v_before_ts := nullif(split_part(p_before_cursor, '|', 1), '')::timestamptz;
    v_before_id := nullif(split_part(p_before_cursor, '|', 2), '');
  end if;

  -- ── Unread count (always computed, access-filtered) ──────────────────────
  with base as (
    select
      n.id,
      n.module_id,
      n.record_id,
      n.content,
      n.author_id,
      n.author_name,
      n.mention_user_ids,
      n.mention_role_ids,
      n.created_at,
      n.reply_to,
      n.source_type,
      n.metadata,
      n.is_edited,
      n.edited_at,
      coalesce(
        nii.conversation_key,
        nullif(trim(nii.payload->>'conversation_key'), ''),
        public.kalam_note_conversation_key(
          n.org_id, n.id, n.author_id,
          coalesce(n.mention_user_ids, '{}'::uuid[]),
          coalesce(n.source_type, n.metadata->>'source_type'),
          coalesce(n.metadata, '{}'::jsonb),
          n.reply_to
        )
      ) as conversation_key,
      rs.read_at is not null or rs.dismissed_at is not null or n.author_id = v_user_id as is_read
    from public.notification_inbox_items nii
    join public.notes n
      on n.id::text = nii.source_id
     and n.org_id = nii.org_id
    left join public.notification_read_states rs
      on rs.org_id = v_org_id
     and rs.user_id = v_user_id
     and rs.section = 'notes'
     and rs.source_type = 'note'
     and rs.source_id = nii.source_id
    where nii.org_id = v_org_id
      and nii.section = 'notes'
      and nii.source_type = 'note'
      -- ACCESS FILTER
      and (
        nii.is_org_wide = true
        or v_user_id = any(nii.target_user_ids)
        or (v_role_id is not null and v_role_id = any(nii.target_role_ids))
      )
      and coalesce(
        nii.conversation_key,
        nullif(trim(nii.payload->>'conversation_key'), ''),
        public.kalam_note_conversation_key(
          n.org_id, n.id, n.author_id,
          coalesce(n.mention_user_ids, '{}'::uuid[]),
          coalesce(n.source_type, n.metadata->>'source_type'),
          coalesce(n.metadata, '{}'::jsonb),
          n.reply_to
        )
      ) = p_conversation_key
  )
  select
    count(*) filter (where not is_read)::integer,
    min(id::text) filter (where not is_read)
  into v_unread_count, v_first_unread_id
  from base;

  -- ── Paginated fetch (p_before_cursor path) ───────────────────────────────
  if v_before_ts is not null then
    with base as (
      select
        n.id, n.module_id, n.record_id, n.content,
        n.author_id, n.author_name,
        n.mention_user_ids, n.mention_role_ids,
        n.created_at, n.reply_to,
        n.source_type, n.metadata,
        n.is_edited, n.edited_at
      from public.notification_inbox_items nii
      join public.notes n
        on n.id::text = nii.source_id
       and n.org_id = nii.org_id
      where nii.org_id = v_org_id
        and nii.section = 'notes'
        and nii.source_type = 'note'
        -- ACCESS FILTER
        and (
          nii.is_org_wide = true
          or v_user_id = any(nii.target_user_ids)
          or (v_role_id is not null and v_role_id = any(nii.target_role_ids))
        )
        and coalesce(
          nii.conversation_key,
          nullif(trim(nii.payload->>'conversation_key'), ''),
          public.kalam_note_conversation_key(
            n.org_id, n.id, n.author_id,
            coalesce(n.mention_user_ids, '{}'::uuid[]),
            coalesce(n.source_type, n.metadata->>'source_type'),
            coalesce(n.metadata, '{}'::jsonb),
            n.reply_to
          )
        ) = p_conversation_key
        and (
          n.created_at < v_before_ts
          or (n.created_at = v_before_ts and n.id::text < coalesce(v_before_id, ''))
        )
      order by n.created_at desc, n.id desc
      limit v_limit
    ),
    ordered as (
      select * from base order by created_at asc, id asc
    ),
    earliest as (
      select created_at, id::text as id_text
      from ordered
      order by created_at asc, id asc
      limit 1
    )
    select
      coalesce(jsonb_agg(to_jsonb(ordered.*) order by ordered.created_at asc, ordered.id asc), '[]'::jsonb),
      exists(
        select 1
        from public.notification_inbox_items nii
        join public.notes n
          on n.id::text = nii.source_id
         and n.org_id = nii.org_id
        join earliest e on true
        where nii.org_id = v_org_id
          and nii.section = 'notes'
          and nii.source_type = 'note'
          -- ACCESS FILTER
          and (
            nii.is_org_wide = true
            or v_user_id = any(nii.target_user_ids)
            or (v_role_id is not null and v_role_id = any(nii.target_role_ids))
          )
          and coalesce(
            nii.conversation_key,
            nullif(trim(nii.payload->>'conversation_key'), ''),
            public.kalam_note_conversation_key(
              n.org_id, n.id, n.author_id,
              coalesce(n.mention_user_ids, '{}'::uuid[]),
              coalesce(n.source_type, n.metadata->>'source_type'),
              coalesce(n.metadata, '{}'::jsonb),
              n.reply_to
            )
          ) = p_conversation_key
          and (
            n.created_at < e.created_at
            or (n.created_at = e.created_at and n.id::text < e.id_text)
          )
      ),
      (select public.kalam_cursor_value(created_at, id_text) from earliest)
    into v_items, v_has_more_before, v_next_before_cursor
    from ordered;

    return jsonb_build_object(
      'items', coalesce(v_items, '[]'::jsonb),
      'unread_count', coalesce(v_unread_count, 0),
      'first_unread_id', v_first_unread_id,
      'has_more_before', coalesce(v_has_more_before, false),
      'next_before_cursor', v_next_before_cursor
    );
  end if;

  -- ── Unread-window path (many unreads → show from first unread) ────────────
  if p_include_unread_window and coalesce(v_unread_count, 0) > 10 then
    with unread_rows as (
      select
        n.id, n.module_id, n.record_id, n.content,
        n.author_id, n.author_name,
        n.mention_user_ids, n.mention_role_ids,
        n.created_at, n.reply_to,
        n.source_type, n.metadata,
        n.is_edited, n.edited_at
      from public.notification_inbox_items nii
      join public.notes n
        on n.id::text = nii.source_id
       and n.org_id = nii.org_id
      left join public.notification_read_states rs
        on rs.org_id = v_org_id
       and rs.user_id = v_user_id
       and rs.section = 'notes'
       and rs.source_type = 'note'
       and rs.source_id = nii.source_id
      where nii.org_id = v_org_id
        and nii.section = 'notes'
        and nii.source_type = 'note'
        -- ACCESS FILTER
        and (
          nii.is_org_wide = true
          or v_user_id = any(nii.target_user_ids)
          or (v_role_id is not null and v_role_id = any(nii.target_role_ids))
        )
        and coalesce(
          nii.conversation_key,
          nullif(trim(nii.payload->>'conversation_key'), ''),
          public.kalam_note_conversation_key(
            n.org_id, n.id, n.author_id,
            coalesce(n.mention_user_ids, '{}'::uuid[]),
            coalesce(n.source_type, n.metadata->>'source_type'),
            coalesce(n.metadata, '{}'::jsonb),
            n.reply_to
          )
        ) = p_conversation_key
        and rs.read_at is null
        and rs.dismissed_at is null
        and n.author_id <> v_user_id
      order by n.created_at asc, n.id asc
    ),
    earliest as (
      select created_at, id::text as id_text
      from unread_rows
      order by created_at asc, id asc
      limit 1
    )
    select
      coalesce(jsonb_agg(to_jsonb(unread_rows.*) order by unread_rows.created_at asc, unread_rows.id asc), '[]'::jsonb),
      exists(
        select 1
        from public.notification_inbox_items nii
        join public.notes n
          on n.id::text = nii.source_id
         and n.org_id = nii.org_id
        join earliest e on true
        where nii.org_id = v_org_id
          and nii.section = 'notes'
          and nii.source_type = 'note'
          -- ACCESS FILTER
          and (
            nii.is_org_wide = true
            or v_user_id = any(nii.target_user_ids)
            or (v_role_id is not null and v_role_id = any(nii.target_role_ids))
          )
          and coalesce(
            nii.conversation_key,
            nullif(trim(nii.payload->>'conversation_key'), ''),
            public.kalam_note_conversation_key(
              n.org_id, n.id, n.author_id,
              coalesce(n.mention_user_ids, '{}'::uuid[]),
              coalesce(n.source_type, n.metadata->>'source_type'),
              coalesce(n.metadata, '{}'::jsonb),
              n.reply_to
            )
          ) = p_conversation_key
          and (
            n.created_at < e.created_at
            or (n.created_at = e.created_at and n.id::text < e.id_text)
          )
      ),
      (select public.kalam_cursor_value(created_at, id_text) from earliest)
    into v_items, v_has_more_before, v_next_before_cursor
    from unread_rows;

  -- ── Default path: show latest N messages ─────────────────────────────────
  else
    with latest_rows as (
      select
        n.id, n.module_id, n.record_id, n.content,
        n.author_id, n.author_name,
        n.mention_user_ids, n.mention_role_ids,
        n.created_at, n.reply_to,
        n.source_type, n.metadata,
        n.is_edited, n.edited_at
      from public.notification_inbox_items nii
      join public.notes n
        on n.id::text = nii.source_id
       and n.org_id = nii.org_id
      where nii.org_id = v_org_id
        and nii.section = 'notes'
        and nii.source_type = 'note'
        -- ACCESS FILTER
        and (
          nii.is_org_wide = true
          or v_user_id = any(nii.target_user_ids)
          or (v_role_id is not null and v_role_id = any(nii.target_role_ids))
        )
        and coalesce(
          nii.conversation_key,
          nullif(trim(nii.payload->>'conversation_key'), ''),
          public.kalam_note_conversation_key(
            n.org_id, n.id, n.author_id,
            coalesce(n.mention_user_ids, '{}'::uuid[]),
            coalesce(n.source_type, n.metadata->>'source_type'),
            coalesce(n.metadata, '{}'::jsonb),
            n.reply_to
          )
        ) = p_conversation_key
      order by n.created_at desc, n.id desc
      limit greatest(v_limit, 10)
    ),
    ordered as (
      select * from latest_rows order by created_at asc, id asc
    ),
    earliest as (
      select created_at, id::text as id_text
      from ordered
      order by created_at asc, id asc
      limit 1
    )
    select
      coalesce(jsonb_agg(to_jsonb(ordered.*) order by ordered.created_at asc, ordered.id asc), '[]'::jsonb),
      exists(
        select 1
        from public.notification_inbox_items nii
        join public.notes n
          on n.id::text = nii.source_id
         and n.org_id = nii.org_id
        join earliest e on true
        where nii.org_id = v_org_id
          and nii.section = 'notes'
          and nii.source_type = 'note'
          -- ACCESS FILTER
          and (
            nii.is_org_wide = true
            or v_user_id = any(nii.target_user_ids)
            or (v_role_id is not null and v_role_id = any(nii.target_role_ids))
          )
          and coalesce(
            nii.conversation_key,
            nullif(trim(nii.payload->>'conversation_key'), ''),
            public.kalam_note_conversation_key(
              n.org_id, n.id, n.author_id,
              coalesce(n.mention_user_ids, '{}'::uuid[]),
              coalesce(n.source_type, n.metadata->>'source_type'),
              coalesce(n.metadata, '{}'::jsonb),
              n.reply_to
            )
          ) = p_conversation_key
          and (
            n.created_at < e.created_at
            or (n.created_at = e.created_at and n.id::text < e.id_text)
          )
      ),
      (select public.kalam_cursor_value(created_at, id_text) from earliest)
    into v_items, v_has_more_before, v_next_before_cursor
    from ordered;
  end if;

  return jsonb_build_object(
    'items', coalesce(v_items, '[]'::jsonb),
    'unread_count', coalesce(v_unread_count, 0),
    'first_unread_id', v_first_unread_id,
    'has_more_before', coalesce(v_has_more_before, false),
    'next_before_cursor', v_next_before_cursor
  );
end;
$$;

grant execute on function public.get_internal_conversation_timeline(text, integer, text, boolean) to authenticated;
revoke all on function public.get_internal_conversation_timeline(text, integer, text, boolean) from public, anon;

notify pgrst, 'reload schema';

commit;
