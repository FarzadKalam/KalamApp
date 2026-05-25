-- =====================================================
-- KalamApp - Phase 197: Cursor-based communication unread runtime
-- Date: 2026-05-25
-- Type: Performance / API / idempotent
-- =====================================================

begin;

create index if not exists idx_notification_inbox_communication_non_system_summary_v2
  on public.notification_inbox_items (org_id, conversation_key, last_event_at desc, source_id)
  where section = 'notes'
    and source_type = 'note'
    and category not in ('system', 'assistant')
    and conversation_key <> 'system';

-- Versioned summary API. Existing per-message read states remain read-only
-- compatibility data, while all new communication reads use one cursor row.
create or replace function public.get_communication_conversations_v2(
  p_channel text default 'internal',
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
    select auth.uid() as user_id, public.current_org_id() as org_id, p.role_id
    from public.profiles p
    where p.id = auth.uid()
      and p.org_id = public.current_org_id()
    limit 1
  ),
  internal_raw as (
    select
      'notes'::text as section,
      coalesce(
        nii.conversation_key,
        nullif(trim(nii.payload->>'conversation_key'), ''),
        public.kalam_note_conversation_key(
          n.org_id, n.id, n.author_id, coalesce(n.mention_user_ids, '{}'::uuid[]),
          coalesce(n.source_type, n.metadata->>'source_type'), coalesce(n.metadata, '{}'::jsonb), n.reply_to
        )
      ) as conversation_key,
      nullif(trim(coalesce(nii.payload->>'chat_group_id', n.metadata->>'chat_group_id')), '') as chat_group_id,
      n.id as message_id,
      n.author_id,
      n.created_at,
      nullif(trim(coalesce(nii.body, '')), '') as preview,
      (
        n.author_id = me.user_id
        or rs.read_at is not null
        or rs.dismissed_at is not null
        or (
          crc.read_through_at is not null
          and (
            n.created_at < crc.read_through_at
            or (
              n.created_at = crc.read_through_at
              and n.id::text <= coalesce(crc.read_through_id, n.id::text)
            )
          )
        )
      ) as is_read
    from me
    join public.notification_inbox_items nii
     on nii.org_id = me.org_id
     and nii.section = 'notes'
     and nii.source_type = 'note'
     and lower(trim(coalesce(nii.category, ''))) not in ('system', 'assistant')
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
    left join public.communication_read_cursors crc
      on crc.org_id = me.org_id
     and crc.user_id = me.user_id
     and crc.channel = 'internal'
     and crc.conversation_key = coalesce(
       nii.conversation_key,
       nullif(trim(nii.payload->>'conversation_key'), ''),
       public.kalam_note_conversation_key(
         n.org_id, n.id, n.author_id, coalesce(n.mention_user_ids, '{}'::uuid[]),
         coalesce(n.source_type, n.metadata->>'source_type'), coalesce(n.metadata, '{}'::jsonb), n.reply_to
       )
     )
    where p_channel = 'internal'
  ),
  internal_base as (
    select
      section,
      conversation_key,
      case when conversation_key like 'group:%' or chat_group_id is not null then 'group' else 'direct' end as kind,
      message_id,
      author_id,
      created_at,
      preview,
      is_read
    from internal_raw
    where nullif(trim(coalesce(conversation_key, '')), '') is not null
      and conversation_key <> 'system'
  ),
  internal_agg as (
    select
      section,
      conversation_key,
      kind,
      count(*)::integer as note_count,
      count(*) filter (where not is_read)::integer as unread_count,
      max(created_at) as latest_message_at
    from internal_base
    group by section, conversation_key, kind
  ),
  internal_latest as (
    select distinct on (conversation_key) conversation_key, preview
    from internal_base
    order by conversation_key, created_at desc, message_id desc
  ),
  internal_enriched as (
    select
      ia.section,
      ia.conversation_key,
      ia.kind,
      case when ia.kind = 'group' then coalesce(cg.name, 'گروه') else coalesce(nullif(trim(other_profile.full_name), ''), 'کاربر') end as title,
      case when ia.kind = 'group' then 'گروه داخلی' else nullif(trim(other_role.title), '') end as subtitle,
      case when ia.kind = 'direct' then other_profile.avatar_url else null end as avatar_url,
      case when ia.kind = 'direct' then other_role.title else null end as role_label,
      ia.note_count,
      ia.unread_count,
      ia.latest_message_at,
      il.preview as last_message_preview,
      case
        when ia.kind = 'direct' then
          case
            when public.kalam_try_uuid(split_part(ia.conversation_key, ':', 2)) = me.user_id
              then public.kalam_try_uuid(split_part(ia.conversation_key, ':', 3))
            else public.kalam_try_uuid(split_part(ia.conversation_key, ':', 2))
          end
        else null
      end as user_id,
      case when ia.kind = 'group' then public.kalam_try_uuid(split_part(ia.conversation_key, ':', 2)) else null end as group_id,
      null::uuid as bot_group_id,
      null::text as channel_type,
      null::text as status,
      null::text as counterparty_label,
      null::text as bot_chat_id
    from internal_agg ia
    join me on true
    left join internal_latest il on il.conversation_key = ia.conversation_key
    left join public.chat_groups cg
      on ia.kind = 'group'
     and cg.id = public.kalam_try_uuid(split_part(ia.conversation_key, ':', 2))
     and cg.org_id = me.org_id
    left join public.profiles other_profile
      on ia.kind = 'direct'
     and other_profile.id = (
       case
         when public.kalam_try_uuid(split_part(ia.conversation_key, ':', 2)) = me.user_id
           then public.kalam_try_uuid(split_part(ia.conversation_key, ':', 3))
         else public.kalam_try_uuid(split_part(ia.conversation_key, ':', 2))
       end
     )
     and other_profile.org_id = me.org_id
    left join public.org_roles other_role
      on other_role.id = other_profile.role_id
     and other_role.org_id = me.org_id
  ),
  bot_raw as (
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
      m.direction,
      coalesce(nullif(trim(m.content_text), ''), nullif(trim(m.file_name), ''), nullif(trim(m.message_type), '')) as preview,
      (
        m.direction <> 'inbound'
        or rs.read_at is not null
        or rs.dismissed_at is not null
        or (
          crc.read_through_at is not null
          and (
            m.created_at < crc.read_through_at
            or (
              m.created_at = crc.read_through_at
              and m.id::text <= coalesce(crc.read_through_id, m.id::text)
            )
          )
        )
      ) as is_read
    from me
    join public.counterparty_bot_groups g
      on g.org_id = me.org_id
     and public.kalam_can_access_bot_group(g.id, g.org_id)
    left join public.counterparty_bot_messages m
      on m.bot_group_id = g.id
     and m.org_id = g.org_id
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.section = 'bot_messages'
     and rs.source_type = 'counterparty_bot_message'
     and rs.source_id = m.id::text
    left join public.communication_read_cursors crc
      on crc.org_id = me.org_id
     and crc.user_id = me.user_id
     and crc.channel = 'bot'
     and crc.conversation_key = 'bot:' || g.id::text
    where p_channel = 'bot'
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
      count(message_id) filter (where message_id is not null and not is_read)::integer as unread_count,
      max(created_at) as latest_message_at
    from bot_raw
    group by section, conversation_key, kind, bot_group_id
  ),
  bot_latest as (
    select distinct on (conversation_key) conversation_key, preview
    from bot_raw
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
    join public.counterparty_bot_groups g on g.id = ba.bot_group_id
    left join bot_latest bl on bl.conversation_key = ba.conversation_key
    left join public.customers c on c.id = g.customer_id
    left join public.suppliers s on s.id = g.supplier_id
  ),
  combined as (
    select * from internal_enriched
    union all
    select * from bot_enriched
  )
  select *
  from combined
  where p_before_cursor is null or combined.latest_message_at < p_before_cursor
  order by combined.latest_message_at desc nulls last, combined.title asc
  limit least(greatest(coalesce(p_limit, 80), 1), 100);
$$;

-- Replace the phase195 write API with a server-validated cursor boundary.
-- A client cannot acknowledge a future timestamp or a message outside its
-- accessible conversation.
create or replace function public.mark_communication_read(
  p_channel text,
  p_conversation_key text,
  p_read_through_at timestamptz,
  p_read_through_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid := public.current_org_id();
  v_role_id uuid := null;
  v_channel text := trim(coalesce(p_channel, ''));
  v_key text := nullif(trim(coalesce(p_conversation_key, '')), '');
  v_message_id uuid := public.kalam_try_uuid(p_read_through_id);
  v_bot_group_id uuid := null;
  v_read_at timestamptz := null;
  v_read_id text := null;
begin
  if v_user_id is null or v_org_id is null or v_key is null or v_message_id is null or p_read_through_at is null then
    return false;
  end if;

  select p.role_id into v_role_id
  from public.profiles p
  where p.id = v_user_id
    and p.org_id = v_org_id
  limit 1;

  if v_channel = 'internal' then
    select n.created_at, n.id::text
    into v_read_at, v_read_id
    from public.notification_inbox_items nii
    join public.notes n
      on n.id::text = nii.source_id
     and n.org_id = nii.org_id
    where nii.org_id = v_org_id
      and nii.section = 'notes'
      and nii.source_type = 'note'
      and lower(trim(coalesce(nii.category, ''))) not in ('system', 'assistant')
      and n.id = v_message_id
      and n.created_at = p_read_through_at
      and (
        nii.is_org_wide = true
        or v_user_id = any(nii.target_user_ids)
        or (v_role_id is not null and v_role_id = any(nii.target_role_ids))
      )
      and v_key <> 'system'
      and coalesce(
        nii.conversation_key,
        nullif(trim(nii.payload->>'conversation_key'), ''),
        public.kalam_note_conversation_key(
          n.org_id, n.id, n.author_id, coalesce(n.mention_user_ids, '{}'::uuid[]),
          coalesce(n.source_type, n.metadata->>'source_type'), coalesce(n.metadata, '{}'::jsonb), n.reply_to
        )
      ) = v_key
    limit 1;
  elsif v_channel = 'bot' then
    v_bot_group_id := public.kalam_try_uuid(replace(v_key, 'bot:', ''));
    if v_bot_group_id is null or not public.kalam_can_access_bot_group(v_bot_group_id, v_org_id) then
      return false;
    end if;
    select m.created_at, m.id::text
    into v_read_at, v_read_id
    from public.counterparty_bot_messages m
    where m.org_id = v_org_id
      and m.bot_group_id = v_bot_group_id
      and m.id = v_message_id
      and m.created_at = p_read_through_at
    limit 1;
  else
    return false;
  end if;

  if v_read_at is null or v_read_id is null then
    return false;
  end if;

  insert into public.communication_read_cursors (
    org_id,
    user_id,
    channel,
    conversation_key,
    read_through_at,
    read_through_id,
    updated_at
  )
  values (v_org_id, v_user_id, v_channel, v_key, v_read_at, v_read_id, now())
  on conflict (org_id, user_id, channel, conversation_key) do update
  set read_through_at = greatest(public.communication_read_cursors.read_through_at, excluded.read_through_at),
      read_through_id = case
        when excluded.read_through_at > public.communication_read_cursors.read_through_at
          then excluded.read_through_id
        when excluded.read_through_at = public.communication_read_cursors.read_through_at
          and coalesce(excluded.read_through_id, '') > coalesce(public.communication_read_cursors.read_through_id, '')
          then excluded.read_through_id
        else public.communication_read_cursors.read_through_id
      end,
      updated_at = now();

  return true;
end;
$$;

create or replace function public.get_communication_timeline(
  p_channel text,
  p_conversation_key text,
  p_before_cursor text default null,
  p_limit integer default 20
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
  v_bot_group_id uuid := null;
begin
  if v_user_id is null or v_org_id is null or v_key is null then
    return jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0, 'first_unread_id', null, 'has_more_before', false, 'next_before_cursor', null, 'read_model', 'cursor');
  end if;

  select p.role_id into v_role_id
  from public.profiles p
  where p.id = v_user_id
    and p.org_id = v_org_id
  limit 1;

  if nullif(trim(coalesce(p_before_cursor, '')), '') is not null then
    v_before_ts := nullif(split_part(p_before_cursor, '|', 1), '')::timestamptz;
    v_before_id := nullif(split_part(p_before_cursor, '|', 2), '');
  end if;

  if p_channel = 'internal' and v_key <> 'system' then
    return (
      with cursor_state as (
        select read_through_at, read_through_id
        from public.communication_read_cursors
        where org_id = v_org_id
          and user_id = v_user_id
          and channel = 'internal'
          and conversation_key = v_key
      ),
      scoped as (
        select
          n.id, n.module_id, n.record_id, n.content,
          n.author_id, n.author_name, n.mention_user_ids, n.mention_role_ids,
          n.created_at, n.reply_to, n.source_type, n.metadata, n.is_edited, n.edited_at,
          (
            n.author_id = v_user_id
            or rs.read_at is not null
            or rs.dismissed_at is not null
            or (
              crc.read_through_at is not null
              and (
                n.created_at < crc.read_through_at
                or (n.created_at = crc.read_through_at and n.id::text <= coalesce(crc.read_through_id, n.id::text))
              )
            )
          ) as is_read
        from public.notification_inbox_items nii
        join public.notes n on n.id::text = nii.source_id and n.org_id = nii.org_id
        left join public.notification_read_states rs
          on rs.org_id = v_org_id and rs.user_id = v_user_id
         and rs.section = 'notes' and rs.source_type = 'note' and rs.source_id = nii.source_id
        left join cursor_state crc on true
        where nii.org_id = v_org_id
          and nii.section = 'notes'
          and nii.source_type = 'note'
          and lower(trim(coalesce(nii.category, ''))) not in ('system', 'assistant')
          and (
            nii.is_org_wide = true
            or v_user_id = any(nii.target_user_ids)
            or (v_role_id is not null and v_role_id = any(nii.target_role_ids))
          )
          and coalesce(
            nii.conversation_key,
            nullif(trim(nii.payload->>'conversation_key'), ''),
            public.kalam_note_conversation_key(
              n.org_id, n.id, n.author_id, coalesce(n.mention_user_ids, '{}'::uuid[]),
              coalesce(n.source_type, n.metadata->>'source_type'), coalesce(n.metadata, '{}'::jsonb), n.reply_to
            )
          ) = v_key
      ),
      page_desc as (
        select *
        from scoped
        where v_before_ts is null
           or created_at < v_before_ts
           or (created_at = v_before_ts and id::text < coalesce(v_before_id, ''))
        order by created_at desc, id desc
        limit v_limit
      ),
      page as (select * from page_desc order by created_at asc, id asc),
      earliest as (select created_at, id::text as id_text from page order by created_at asc, id asc limit 1)
      select jsonb_build_object(
        'items', coalesce((select jsonb_agg(to_jsonb(page) - 'is_read' order by page.created_at asc, page.id asc) from page), '[]'::jsonb),
        'unread_count', (select count(*)::integer from scoped where not is_read),
        'first_unread_id', (select id::text from page where not is_read order by created_at asc, id asc limit 1),
        'has_more_before', exists(
          select 1 from scoped, earliest
          where scoped.created_at < earliest.created_at
             or (scoped.created_at = earliest.created_at and scoped.id::text < earliest.id_text)
        ),
        'next_before_cursor', (select public.kalam_cursor_value(created_at, id_text) from earliest),
        'read_model', 'cursor'
      )
    );
  end if;

  if p_channel = 'bot' then
    v_bot_group_id := public.kalam_try_uuid(replace(v_key, 'bot:', ''));
    if v_bot_group_id is null or not public.kalam_can_access_bot_group(v_bot_group_id, v_org_id) then
      return jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0, 'first_unread_id', null, 'has_more_before', false, 'next_before_cursor', null, 'read_model', 'cursor');
    end if;

    return (
      with cursor_state as (
        select read_through_at, read_through_id
        from public.communication_read_cursors
        where org_id = v_org_id
          and user_id = v_user_id
          and channel = 'bot'
          and conversation_key = v_key
      ),
      scoped as (
        select
          m.id, m.bot_group_id, m.direction, m.message_type, m.chat_id,
          m.provider_message_id, m.content_text, m.file_url, m.file_name, m.mime_type,
          m.payload, m.created_by, m.created_at,
          (
            m.direction <> 'inbound'
            or rs.read_at is not null
            or rs.dismissed_at is not null
            or (
              crc.read_through_at is not null
              and (
                m.created_at < crc.read_through_at
                or (m.created_at = crc.read_through_at and m.id::text <= coalesce(crc.read_through_id, m.id::text))
              )
            )
          ) as is_read
        from public.counterparty_bot_messages m
        left join public.notification_read_states rs
          on rs.org_id = v_org_id and rs.user_id = v_user_id
         and rs.section = 'bot_messages' and rs.source_type = 'counterparty_bot_message' and rs.source_id = m.id::text
        left join cursor_state crc on true
        where m.org_id = v_org_id
          and m.bot_group_id = v_bot_group_id
      ),
      page_desc as (
        select *
        from scoped
        where v_before_ts is null
           or created_at < v_before_ts
           or (created_at = v_before_ts and id::text < coalesce(v_before_id, ''))
        order by created_at desc, id desc
        limit v_limit
      ),
      page as (select * from page_desc order by created_at asc, id asc),
      earliest as (select created_at, id::text as id_text from page order by created_at asc, id asc limit 1)
      select jsonb_build_object(
        'items', coalesce((select jsonb_agg(to_jsonb(page) - 'is_read' order by page.created_at asc, page.id asc) from page), '[]'::jsonb),
        'unread_count', (select count(*)::integer from scoped where not is_read),
        'first_unread_id', (select id::text from page where not is_read order by created_at asc, id asc limit 1),
        'has_more_before', exists(
          select 1 from scoped, earliest
          where scoped.created_at < earliest.created_at
             or (scoped.created_at = earliest.created_at and scoped.id::text < earliest.id_text)
        ),
        'next_before_cursor', (select public.kalam_cursor_value(created_at, id_text) from earliest),
        'read_model', 'cursor'
      )
    );
  end if;

  return jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0, 'first_unread_id', null, 'has_more_before', false, 'next_before_cursor', null, 'read_model', 'cursor');
end;
$$;

grant execute on function public.get_communication_conversations_v2(text, timestamptz, integer) to authenticated;
grant execute on function public.mark_communication_read(text, text, timestamptz, text) to authenticated;
grant execute on function public.get_communication_timeline(text, text, text, integer) to authenticated;
revoke all on function public.get_communication_conversations_v2(text, timestamptz, integer) from public, anon;
revoke all on function public.mark_communication_read(text, text, timestamptz, text) from public, anon;
revoke all on function public.get_communication_timeline(text, text, text, integer) from public, anon;

notify pgrst, 'reload schema';

commit;
