-- KalamApp V1 - Phase 164
-- Fix notification conversation summaries so system notes are classified by the
-- computed conversation key, not only by notification_inbox_items.category.

begin;

create or replace function public.kalam_note_conversation_key(
  p_org_id uuid,
  p_note_id uuid,
  p_author_id uuid,
  p_mention_user_ids uuid[],
  p_source_type text,
  p_metadata jsonb,
  p_reply_to uuid
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_note_source text := lower(trim(coalesce(p_source_type, p_metadata->>'source_type', '')));
  v_group_id uuid := public.kalam_try_uuid(p_metadata->>'chat_group_id');
  v_peer_id uuid := null;
  v_reply_author_id uuid := null;
  v_reply_mention_user_ids uuid[] := '{}'::uuid[];
  v_item uuid;
begin
  -- Group-targeted automated notes must stay in the group conversation.
  if v_group_id is not null then
    return 'group:' || v_group_id::text;
  end if;

  -- System and AI notes without a group are automated/system messages.
  if v_note_source in ('system', 'ai')
    or (p_metadata ? 'workflow_id')
    or (p_metadata ? 'automation_rule_id')
    or (p_metadata ? 'process_automation_rule_id') then
    return 'system';
  end if;

  foreach v_item in array coalesce(p_mention_user_ids, '{}'::uuid[]) loop
    if v_item is not null and v_item <> p_author_id then
      v_peer_id := v_item;
      exit;
    end if;
  end loop;

  if v_peer_id is null and p_reply_to is not null then
    select n.author_id, coalesce(n.mention_user_ids, '{}'::uuid[])
    into v_reply_author_id, v_reply_mention_user_ids
    from public.notes n
    where n.id = p_reply_to
      and (p_org_id is null or n.org_id = p_org_id)
    limit 1;

    if v_reply_author_id is not null and v_reply_author_id <> p_author_id then
      v_peer_id := v_reply_author_id;
    end if;

    if v_peer_id is null then
      foreach v_item in array coalesce(v_reply_mention_user_ids, '{}'::uuid[]) loop
        if v_item is not null and v_item <> p_author_id then
          v_peer_id := v_item;
          exit;
        end if;
      end loop;
    end if;
  end if;

  if p_author_id is null or v_peer_id is null then
    return null;
  end if;

  return public.kalam_direct_conversation_key(p_author_id, v_peer_id);
end;
$$;

grant execute on function public.kalam_note_conversation_key(uuid, uuid, uuid, uuid[], text, jsonb, uuid) to authenticated;
revoke all on function public.kalam_note_conversation_key(uuid, uuid, uuid, uuid[], text, jsonb, uuid) from public, anon;

with computed as (
  select
    nii.id,
    public.kalam_note_conversation_key(
      n.org_id,
      n.id,
      n.author_id,
      coalesce(n.mention_user_ids, '{}'::uuid[]),
      coalesce(n.source_type, n.metadata->>'source_type'),
      coalesce(n.metadata, '{}'::jsonb),
      n.reply_to
    ) as conversation_key,
    lower(trim(coalesce(n.source_type, n.metadata->>'source_type', ''))) as note_source
  from public.notification_inbox_items nii
  join public.notes n
    on n.id::text = nii.source_id
   and n.org_id = nii.org_id
  where nii.section = 'notes'
    and nii.source_type = 'note'
)
update public.notification_inbox_items nii
set
  conversation_key = computed.conversation_key,
  category = case
    when computed.conversation_key like 'group:%' then 'group'
    when computed.conversation_key = 'system' and computed.note_source = 'ai' then 'assistant'
    when computed.conversation_key = 'system' then 'system'
    else nii.category
  end,
  payload = coalesce(nii.payload, '{}'::jsonb) || jsonb_build_object('conversation_key', computed.conversation_key)
from computed
where nii.id = computed.id
  and computed.conversation_key is not null
  and (
    coalesce(nii.conversation_key, '') <> computed.conversation_key
    or coalesce(nii.payload->>'conversation_key', '') <> computed.conversation_key
    or (
      computed.conversation_key like 'group:%'
      and coalesce(nii.category, '') <> 'group'
    )
    or (
      computed.conversation_key = 'system'
      and computed.note_source = 'ai'
      and coalesce(nii.category, '') <> 'assistant'
    )
    or (
      computed.conversation_key = 'system'
      and computed.note_source <> 'ai'
      and coalesce(nii.category, '') <> 'system'
    )
  );

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

commit;
