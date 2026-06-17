-- =====================================================
-- TazeSystem - Phase 265: Messages conversation stability
-- Date: 2026-06-17
-- Type: Bug fix / idempotent
-- =====================================================

begin;

create index if not exists idx_notes_saved_messages_summary_v2
  on public.notes(org_id, author_id, created_at desc, id desc)
  where lower(trim(coalesce(metadata->>'saved_message', 'false'))) in ('true', '1', 'yes');

-- Repair inbox rows that were previously categorized as system/assistant even
-- though the canonical conversation key is a direct or group conversation.
with repaired as (
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
    ) as conversation_key
  from public.notification_inbox_items nii
  join public.notes n
    on n.id::text = nii.source_id
   and n.org_id = nii.org_id
  where nii.section = 'notes'
    and nii.source_type = 'note'
)
update public.notification_inbox_items nii
set conversation_key = repaired.conversation_key,
    category = case
      when repaired.conversation_key = 'system' then nii.category
      when lower(trim(coalesce(nii.category, ''))) in ('system', 'assistant') then 'message'
      else nii.category
    end,
    payload = coalesce(nii.payload, '{}'::jsonb) || jsonb_build_object('conversation_key', repaired.conversation_key)
from repaired
where nii.id = repaired.id
  and repaired.conversation_key is not null
  and (
    coalesce(nii.conversation_key, '') is distinct from repaired.conversation_key
    or (
      repaired.conversation_key <> 'system'
      and lower(trim(coalesce(nii.category, ''))) in ('system', 'assistant')
    )
  );

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
        nullif(trim(nii.conversation_key), ''),
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
       nullif(trim(nii.conversation_key), ''),
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
  mine_agg as (
    select
      count(*)::integer as note_count,
      max(n.created_at) as latest_message_at
    from me
    join public.notes n
      on n.org_id = me.org_id
     and n.author_id = me.user_id
     and nullif(trim(coalesce(n.metadata->>'chat_group_id', '')), '') is null
     and lower(trim(coalesce(n.metadata->>'saved_message', 'false'))) in ('true', '1', 'yes')
     and lower(trim(coalesce(n.source_type, n.metadata->>'source_type', ''))) not in ('system', 'ai')
     and not (coalesce(n.metadata, '{}'::jsonb) ?| array['workflow_id', 'automation_rule_id', 'process_automation_rule_id'])
    where p_channel = 'internal'
  ),
  mine_latest as (
    select nullif(trim(n.content), '') as preview
    from me
    join public.notes n
      on n.org_id = me.org_id
     and n.author_id = me.user_id
     and nullif(trim(coalesce(n.metadata->>'chat_group_id', '')), '') is null
     and lower(trim(coalesce(n.metadata->>'saved_message', 'false'))) in ('true', '1', 'yes')
     and lower(trim(coalesce(n.source_type, n.metadata->>'source_type', ''))) not in ('system', 'ai')
     and not (coalesce(n.metadata, '{}'::jsonb) ?| array['workflow_id', 'automation_rule_id', 'process_automation_rule_id'])
    where p_channel = 'internal'
    order by n.created_at desc, n.id desc
    limit 1
  ),
  mine_enriched as (
    select
      'notes'::text as section,
      'mine'::text as conversation_key,
      'mine'::text as kind,
      'یادداشت‌های من'::text as title,
      null::text as subtitle,
      null::text as avatar_url,
      null::text as role_label,
      mine_agg.note_count,
      0::integer as unread_count,
      mine_agg.latest_message_at,
      mine_latest.preview as last_message_prefix,
      me.user_id,
      null::uuid as group_id,
      null::uuid as bot_group_id,
      null::text as channel_type,
      null::text as status,
      null::text as counterparty_label,
      null::text as bot_chat_id
    from me
    cross join mine_agg
    left join mine_latest on true
    where p_channel = 'internal'
      and mine_agg.note_count > 0
  ),
  bot_enriched as (
    select
      'bot_messages'::text as section,
      'bot:' || g.id::text as conversation_key,
      'bot'::text as kind,
      coalesce(nullif(trim(g.group_title), ''), coalesce(nullif(trim(c.full_name), ''), nullif(trim(s.full_name), ''), 'مخاطب')) as title,
      coalesce(nullif(trim(c.full_name), ''), nullif(trim(s.full_name), ''), null) as subtitle,
      null::text as avatar_url,
      null::text as role_label,
      coalesce(summary.message_count, 0)::integer as note_count,
      coalesce(unread.unread_count, 0)::integer as unread_count,
      summary.latest_message_at,
      summary.latest_message_preview as last_message_prefix,
      null::uuid as user_id,
      null::uuid as group_id,
      g.id as bot_group_id,
      g.channel_type,
      g.status,
      coalesce(nullif(trim(c.full_name), ''), nullif(trim(s.full_name), ''), null) as counterparty_label,
      g.bot_chat_id
    from me
    join public.counterparty_bot_groups g
      on g.org_id = me.org_id
     and public.kalam_can_access_bot_group(g.id, g.org_id)
    left join public.communication_bot_thread_summaries summary
      on summary.org_id = g.org_id
     and summary.bot_group_id = g.id
    left join public.communication_read_cursors crc
      on crc.org_id = me.org_id
     and crc.user_id = me.user_id
     and crc.channel = 'bot'
     and crc.conversation_key = 'bot:' || g.id::text
    left join lateral (
      select count(*)::integer as unread_count
      from public.counterparty_bot_messages m
      left join public.notification_read_states rs
        on rs.org_id = me.org_id
       and rs.user_id = me.user_id
       and rs.section = 'bot_messages'
       and rs.source_type = 'counterparty_bot_message'
       and rs.source_id = m.id::text
      where m.org_id = g.org_id
        and m.bot_group_id = g.id
        and m.direction = 'inbound'
        and rs.read_at is null
        and rs.dismissed_at is null
        and (
          crc.read_through_at is null
          or m.created_at > crc.read_through_at
          or (
            m.created_at = crc.read_through_at
            and m.id::text > coalesce(crc.read_through_id, '')
          )
        )
    ) unread on true
    left join public.customers c on c.id = g.customer_id and c.org_id = me.org_id
    left join public.suppliers s on s.id = g.supplier_id and s.org_id = me.org_id
    where p_channel = 'bot'
      and (
        p_before_cursor is null
        or summary.latest_message_at < p_before_cursor
      )
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
    select * from mine_enriched
    union all
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
