-- KalamApp V1 - Phase 161
-- Fix: unsafe direct ::uuid casts on split_part() results in get_notification_conversations.
-- When conversation_key = 'system' (no ':' separator), split_part returns '' and ''::uuid
-- throws PostgreSQL error 22P02 (invalid input syntax for type uuid).
-- Fix: replace all split_part(...)::uuid casts with kalam_try_uuid(split_part(...)).

begin;

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
  note_base as (
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
      case
        when nii.category = 'system' then 'system'
        when nullif(trim(coalesce(nii.payload->>'chat_group_id', n.metadata->>'chat_group_id')), '') is not null then 'group'
        else 'direct'
      end as kind,
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
      -- FIX: use kalam_try_uuid() instead of direct ::uuid cast to avoid 22P02
      -- when conversation_key has no ':' separator (e.g. 'system') split_part returns ''
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
       -- FIX: same safe cast here — direct join condition is not guaranteed to short-circuit
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

commit;
