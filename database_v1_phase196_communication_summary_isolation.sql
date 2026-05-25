-- =====================================================
-- KalamApp - Phase 196: Isolated communication summaries
-- Date: 2026-05-25
-- Type: Performance / API / idempotent
-- =====================================================

begin;

create index if not exists idx_notification_inbox_internal_communication_summary
  on public.notification_inbox_items (org_id, conversation_key, last_event_at desc, source_id)
  where section = 'notes'
    and source_type = 'note'
    and category <> 'system';

-- Internal communications deliberately exclude system/workflow notifications.
-- The latter remain in storage for a dedicated notification-feed rollout and
-- must not be aggregated on the normal conversation-list hot path.
create or replace function public.get_communication_conversations(
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
    select
      auth.uid() as user_id,
      public.current_org_id() as org_id,
      p.role_id
    from public.profiles p
    where p.id = auth.uid()
      and p.org_id = public.current_org_id()
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
      nullif(trim(coalesce(nii.payload->>'chat_group_id', n.metadata->>'chat_group_id')), '') as chat_group_id,
      n.id as note_id,
      n.author_id,
      n.created_at,
      nullif(trim(coalesce(nii.body, '')), '') as preview,
      rs.read_at is not null or rs.dismissed_at is not null or n.author_id = me.user_id as is_read
    from me
    join public.notification_inbox_items nii
      on nii.org_id = me.org_id
     and nii.section = 'notes'
     and nii.source_type = 'note'
     and lower(trim(coalesce(nii.category, ''))) <> 'system'
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
    where p_channel = 'internal'
  ),
  note_base as (
    select
      section,
      conversation_key,
      case
        when conversation_key like 'group:%' or chat_group_id is not null then 'group'
        else 'direct'
      end as kind,
      note_id,
      author_id,
      created_at,
      preview,
      is_read
    from note_raw
    where nullif(trim(coalesce(conversation_key, '')), '') is not null
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
    group by section, conversation_key, kind
  ),
  note_latest as (
    select distinct on (conversation_key)
      conversation_key,
      preview
    from note_base
    order by conversation_key, created_at desc, note_id desc
  ),
  enriched as (
    select
      na.section,
      na.conversation_key,
      na.kind,
      case
        when na.kind = 'group' then coalesce(cg.name, 'گروه')
        else coalesce(nullif(trim(other_profile.full_name), ''), 'کاربر')
      end as title,
      case
        when na.kind = 'group' then 'گروه داخلی'
        else nullif(trim(other_role.title), '')
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
      end as group_id
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
     and other_profile.org_id = me.org_id
    left join public.org_roles other_role
      on other_role.id = other_profile.role_id
     and other_role.org_id = me.org_id
  )
  select
    enriched.section,
    enriched.conversation_key,
    enriched.kind,
    enriched.title,
    enriched.subtitle,
    enriched.avatar_url,
    enriched.role_label,
    enriched.note_count,
    enriched.unread_count,
    enriched.latest_message_at,
    enriched.last_message_preview,
    enriched.user_id,
    enriched.group_id,
    null::uuid as bot_group_id,
    null::text as channel_type,
    null::text as status,
    null::text as counterparty_label,
    null::text as bot_chat_id
  from enriched
  where p_before_cursor is null or enriched.latest_message_at < p_before_cursor
  order by enriched.latest_message_at desc nulls last, enriched.title asc
  limit least(greatest(coalesce(p_limit, 80), 1), 100);
$$;

grant execute on function public.get_communication_conversations(text, timestamptz, integer) to authenticated;
revoke all on function public.get_communication_conversations(text, timestamptz, integer) from public, anon;

notify pgrst, 'reload schema';

commit;
