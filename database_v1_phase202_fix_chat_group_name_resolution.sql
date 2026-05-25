-- =====================================================
-- KalamApp - Phase 202: Fix chat group name resolution in v2 summary
-- Date: 2026-05-25
-- Type: Bug fix / idempotent
-- =====================================================
-- Phase 197 added `cg.org_id = me.org_id` to the chat_groups join in
-- get_communication_conversations_v2. For groups whose org_id is null
-- (legacy data) or where there is any org_id mismatch, the join returns
-- no row, causing cg.name = null and the title to fall back to 'گروه'.
-- Phase 196 (get_communication_conversations) did NOT have this extra
-- filter and worked correctly. This migration removes it so v2 behaves
-- consistently. The conversation is already scoped to the org through the
-- notification_inbox_items join (nii.org_id = me.org_id), so there is no
-- security regression.
-- =====================================================

begin;

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
      il.preview as last_message_prefix,
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
    -- No cg.org_id filter here: the conversation is already org-scoped through
    -- notification_inbox_items. Adding org_id to the join breaks groups where
    -- org_id is null (legacy) or where there is a minor schema inconsistency.
    left join public.chat_groups cg
      on ia.kind = 'group'
     and cg.id = public.kalam_try_uuid(split_part(ia.conversation_key, ':', 2))
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
      coalesce(nullif(trim(ba.title), ''), coalesce(nullif(trim(c.full_name), ''), nullif(trim(s.full_name), ''), 'مخاطب')) as title,
      coalesce(nullif(trim(c.full_name), ''), nullif(trim(s.full_name), ''), null) as subtitle,
      null::text as avatar_url,
      null::text as role_label,
      ba.note_count,
      ba.unread_count,
      ba.latest_message_at,
      bl.preview as last_message_prefix,
      null::uuid as user_id,
      null::uuid as group_id,
      ba.bot_group_id,
      ba.channel_type,
      ba.status,
      coalesce(nullif(trim(c.full_name), ''), nullif(trim(s.full_name), ''), null) as counterparty_label,
      ba.bot_chat_id
    from bot_agg ba
    left join bot_latest bl on bl.conversation_key = ba.conversation_key
    left join public.counterparty_bot_groups g on g.id = ba.bot_group_id
    left join public.customers c on c.id = g.customer_id and c.org_id = (select org_id from me)
    left join public.suppliers s on s.id = g.supplier_id and s.org_id = (select org_id from me)
  )
  select
    e.section,
    e.conversation_key,
    e.kind,
    e.title,
    e.subtitle,
    e.avatar_url,
    e.role_label,
    e.note_count,
    e.unread_count,
    e.latest_message_at,
    e.last_message_prefix as last_message_preview,
    e.user_id,
    e.group_id,
    e.bot_group_id,
    e.channel_type,
    e.status,
    e.counterparty_label,
    e.bot_chat_id
  from (
    select * from internal_enriched
    union all
    select * from bot_enriched
  ) e
  where p_before_cursor is null or e.latest_message_at < p_before_cursor
  order by e.latest_message_at desc nulls last, e.title asc
  limit least(greatest(coalesce(p_limit, 80), 1), 100);
$$;

grant execute on function public.get_communication_conversations_v2(text, timestamptz, integer) to authenticated;
revoke all on function public.get_communication_conversations_v2(text, timestamptz, integer) from public, anon;

notify pgrst, 'reload schema';

commit;
