-- TazeSystem - Phase 400: role mentions in internal messaging V2
-- A role mention is displayed to each eligible member as a normal direct
-- conversation with the author; the same row is never duplicated per role.

begin;

create index if not exists idx_notes_org_author_role_mention_created
  on public.notes (org_id, author_id, created_at desc, id desc)
  where cardinality(mention_role_ids) > 0;

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
    select auth.uid() as user_id, public.current_org_id() as org_id, profile.role_id
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.org_id = public.current_org_id()
    limit 1
  ),
  raw as (
    select
      n.id as note_id,
      n.author_id,
      n.created_at,
      nullif(trim(coalesce(inbox.body, '')), '') as preview,
      case
        when lower(trim(coalesce(inbox.category, ''))) in ('system', 'assistant')
          or lower(trim(coalesce(n.source_type, n.metadata->>'source_type', ''))) in ('system', 'ai')
          or coalesce(n.metadata, '{}'::jsonb) ?| array['workflow_id', 'automation_rule_id', 'process_automation_rule_id']
          then 'system'
        when nullif(trim(coalesce(n.metadata->>'chat_group_id', '')), '') is not null
          then 'group:' || trim(n.metadata->>'chat_group_id')
        when n.author_id = me.user_id
          and cardinality(coalesce(n.mention_user_ids, '{}'::uuid[])) = 0
          then 'mine'
        when n.author_id is not null
          and n.author_id <> me.user_id
          and (
            me.user_id = any(coalesce(n.mention_user_ids, '{}'::uuid[]))
            or (
              me.role_id is not null
              and me.role_id = any(coalesce(n.mention_role_ids, '{}'::uuid[]))
            )
          )
          then public.kalam_direct_conversation_key(me.user_id, n.author_id)
        else coalesce(
          inbox.conversation_key,
          nullif(trim(inbox.payload->>'conversation_key'), ''),
          public.kalam_note_conversation_key(
            n.org_id, n.id, n.author_id, coalesce(n.mention_user_ids, '{}'::uuid[]),
            coalesce(n.source_type, n.metadata->>'source_type'), coalesce(n.metadata, '{}'::jsonb), n.reply_to
          )
        )
      end as resolved_conversation_key,
      (
        n.author_id = me.user_id
        or read_state.read_at is not null
        or read_state.dismissed_at is not null
        or (
          cursor_state.read_through_at is not null
          and (
            n.created_at < cursor_state.read_through_at
            or (
              n.created_at = cursor_state.read_through_at
              and n.id::text <= coalesce(cursor_state.read_through_id, n.id::text)
            )
          )
        )
      ) as is_read
    from me
    join public.notification_inbox_items inbox
      on inbox.org_id = me.org_id
     and inbox.section = 'notes'
     and inbox.source_type = 'note'
     and (
       inbox.is_org_wide = true
       or me.user_id = any(inbox.target_user_ids)
       or (me.role_id is not null and me.role_id = any(inbox.target_role_ids))
     )
    join public.notes n
      on n.id::text = inbox.source_id
     and n.org_id = inbox.org_id
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
     and cursor_state.conversation_key = case
       when n.author_id is not null
         and n.author_id <> me.user_id
         and (
           me.user_id = any(coalesce(n.mention_user_ids, '{}'::uuid[]))
           or (
             me.role_id is not null
             and me.role_id = any(coalesce(n.mention_role_ids, '{}'::uuid[]))
           )
         )
         then public.kalam_direct_conversation_key(me.user_id, n.author_id)
       else coalesce(
         inbox.conversation_key,
         nullif(trim(inbox.payload->>'conversation_key'), ''),
         public.kalam_note_conversation_key(
           n.org_id, n.id, n.author_id, coalesce(n.mention_user_ids, '{}'::uuid[]),
           coalesce(n.source_type, n.metadata->>'source_type'), coalesce(n.metadata, '{}'::jsonb), n.reply_to
         )
       )
     end
  ),
  base as (
    select
      note_id,
      author_id,
      created_at,
      preview,
      is_read,
      resolved_conversation_key as conversation_key,
      case
        when resolved_conversation_key = 'system' then 'system'
        when resolved_conversation_key like 'group:%' then 'group'
        else 'direct'
      end as kind
    from raw
    where nullif(trim(coalesce(resolved_conversation_key, '')), '') is not null
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
      case
        when summary.kind = 'system' then 'پیام‌های سیستم'
        when summary.kind = 'group' then coalesce(nullif(trim(chat_group.name), ''), 'گروه داخلی')
        else coalesce(nullif(trim(other_profile.full_name), ''), 'کاربر')
      end as title,
      case
        when summary.kind = 'system' then 'اعلان‌ها و پیام‌های سیستمی'
        when summary.kind = 'group' then 'گروه داخلی'
        else nullif(trim(other_role.title), '')
      end as subtitle,
      case when summary.kind = 'direct' then other_profile.avatar_url else null end as avatar_url,
      case when summary.kind = 'direct' then other_role.title else null end as role_label,
      summary.note_count,
      summary.unread_count,
      summary.latest_message_at,
      latest.preview as last_message_preview,
      case
        when summary.kind = 'direct' then
          case
            when public.kalam_try_uuid(split_part(summary.conversation_key, ':', 2)) = me.user_id
              then public.kalam_try_uuid(split_part(summary.conversation_key, ':', 3))
            else public.kalam_try_uuid(split_part(summary.conversation_key, ':', 2))
          end
        else null
      end as user_id,
      case when summary.kind = 'group' then public.kalam_try_uuid(split_part(summary.conversation_key, ':', 2)) else null end as group_id
    from summary
    join me on true
    left join latest on latest.conversation_key = summary.conversation_key
    left join public.chat_groups chat_group
      on summary.kind = 'group'
     and chat_group.id = public.kalam_try_uuid(split_part(summary.conversation_key, ':', 2))
     and chat_group.org_id = me.org_id
    left join public.profiles other_profile
      on summary.kind = 'direct'
     and other_profile.id = case
       when public.kalam_try_uuid(split_part(summary.conversation_key, ':', 2)) = me.user_id
         then public.kalam_try_uuid(split_part(summary.conversation_key, ':', 3))
       else public.kalam_try_uuid(split_part(summary.conversation_key, ':', 2))
     end
     and other_profile.org_id = me.org_id
    left join public.org_roles other_role
      on other_role.id = other_profile.role_id
     and other_role.org_id = me.org_id
  )
  select
    section,
    conversation_key,
    kind,
    title,
    subtitle,
    avatar_url,
    role_label,
    note_count,
    unread_count,
    latest_message_at,
    last_message_preview,
    user_id,
    group_id,
    null::uuid as bot_group_id,
    null::text as channel_type,
    null::text as status,
    null::text as counterparty_label,
    null::text as bot_chat_id
  from enriched
  where p_before_cursor is null or latest_message_at < p_before_cursor
  order by latest_message_at desc nulls last, title asc
  limit least(greatest(coalesce(p_limit, 80), 1), 100);
$$;

grant execute on function public.get_internal_communication_conversations_v3(timestamptz, integer) to authenticated;
revoke all on function public.get_internal_communication_conversations_v3(timestamptz, integer) from public, anon;

notify pgrst, 'reload schema';

commit;
