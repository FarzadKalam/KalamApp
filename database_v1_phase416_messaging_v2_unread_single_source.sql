-- =====================================================
-- TazeSystem - Phase 416: Messaging V2 unread single source
-- Date: 2026-07-28
-- Type: Reliability / performance / idempotent
-- =====================================================

begin;

-- This is the exact recipient and cursor model used by the V2 internal
-- conversation runtime, without its display pagination. It deliberately
-- excludes likes and inaccessible system rows from the messaging badge.
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
    where p.id = auth.uid()
      and p.org_id = public.current_org_id()
    limit 1
  ), candidate as materialized (
    select distinct on (n.id)
      n.id as note_id,
      n.author_id,
      n.created_at,
      case
        when lower(trim(coalesce(nii.category, ''))) in ('system', 'assistant')
          or lower(trim(coalesce(n.source_type, n.metadata->>'source_type', ''))) in ('system', 'ai', 'assistant')
          or coalesce(n.metadata, '{}'::jsonb) ?| array['workflow_id', 'automation_rule_id', 'process_automation_rule_id', 'workflow_action_type', 'scheduled_report_id'] then 'system'
        when nullif(trim(coalesce(n.metadata->>'chat_group_id', '')), '') is not null then 'group:' || trim(n.metadata->>'chat_group_id')
        when n.author_id = me.user_id and cardinality(coalesce(n.mention_user_ids, '{}'::uuid[])) = 0 then 'mine'
        when n.author_id is not null and n.author_id <> me.user_id
          and (me.user_id = any(coalesce(n.mention_user_ids, '{}'::uuid[]))
            or (me.role_id is not null and me.role_id = any(coalesce(n.mention_role_ids, '{}'::uuid[]))))
          then public.kalam_direct_conversation_key(me.user_id, n.author_id)
        else coalesce(
          nullif(trim(nii.conversation_key), ''),
          nullif(trim(nii.payload->>'conversation_key'), ''),
          case when n.author_id = me.user_id then 'mine' else null end
        )
      end as conversation_key
    from me
    join public.notification_inbox_items nii
      on nii.org_id = me.org_id
     and nii.section = 'notes'
     and nii.source_type = 'note'
    join public.notes n
      on n.id::text = nii.source_id
     and n.org_id = nii.org_id
    where case
      when lower(trim(coalesce(nii.category, ''))) in ('system', 'assistant')
        or lower(trim(coalesce(n.source_type, n.metadata->>'source_type', ''))) in ('system', 'ai', 'assistant')
        or coalesce(n.metadata, '{}'::jsonb) ?| array['workflow_id', 'automation_rule_id', 'process_automation_rule_id', 'workflow_action_type', 'scheduled_report_id']
        then me.user_id = any(coalesce(nii.target_user_ids, '{}'::uuid[]))
          or (me.role_id is not null and me.role_id = any(coalesce(nii.target_role_ids, '{}'::uuid[])))
      else nii.is_org_wide = true
        or me.user_id = any(coalesce(nii.target_user_ids, '{}'::uuid[]))
        or (me.role_id is not null and me.role_id = any(coalesce(nii.target_role_ids, '{}'::uuid[])))
        or n.author_id = me.user_id
    end
    order by n.id, nii.created_at desc, nii.id desc
  ), visible as materialized (
    select c.note_id, c.author_id, c.created_at, c.conversation_key,
      (
        c.author_id = me.user_id
        or rs.read_at is not null
        or rs.dismissed_at is not null
        or (
          crc.read_through_at is not null
          and (
            c.created_at < crc.read_through_at
            or (c.created_at = crc.read_through_at and c.note_id::text <= coalesce(crc.read_through_id, c.note_id::text))
          )
        )
      ) as is_read
    from candidate c
    join me on true
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.section = 'notes'
     and rs.source_type = 'note'
     and rs.source_id = c.note_id::text
    left join public.communication_read_cursors crc
      on crc.org_id = me.org_id
     and crc.user_id = me.user_id
     and crc.channel = 'internal'
     and crc.conversation_key = c.conversation_key
    where nullif(trim(coalesce(c.conversation_key, '')), '') is not null
  )
  select count(*) filter (where not is_read)::integer
  from visible;
$$;

create or replace function public.get_notification_unread_summary_v2(
  p_variant text default null
)
returns table (
  section text,
  unread_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with requested_variant as (
    select lower(trim(coalesce(p_variant, ''))) as value
  ), base_summary as (
    select * from public.get_notification_unread_summary_v1(p_variant)
  ), internal_total as (
    select coalesce(public.get_internal_messaging_unread_total_v2(), 0)::integer as value
  ), bot_group_total as (
    select coalesce(max(unread_count) filter (where section = 'bot_messages'), 0)::integer as value
    from base_summary
  ), bot_direct_total as (
    select count(*)::integer as value
    from public.profiles me
    join public.counterparty_bot_direct_threads t
      on t.org_id = me.org_id
     and public.kalam_can_access_bot_direct_thread(t.id, t.org_id)
    join public.counterparty_bot_direct_messages m
      on m.org_id = me.org_id
     and m.direct_thread_id = t.id
     and m.direction = 'inbound'
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.id
     and rs.source_type = 'counterparty_bot_direct_message'
     and rs.source_id = m.id::text
     and rs.section in ('bot_direct_messages', 'bot_messages')
    left join public.communication_read_cursors crc
      on crc.org_id = me.org_id
     and crc.user_id = me.id
     and crc.channel = 'bot'
     and crc.conversation_key = 'bot:direct:' || coalesce(t.channel_type, '') || ':' || coalesce(t.chat_id, '')
    where me.id = auth.uid()
      and me.org_id = public.current_org_id()
      and rs.read_at is null
      and rs.dismissed_at is null
      and (
        crc.read_through_at is null
        or m.created_at > crc.read_through_at
        or (m.created_at = crc.read_through_at and m.id::text > coalesce(crc.read_through_id, ''))
      )
  ), patched_summary as (
    select section, unread_count
    from base_summary
    where section not in ('notes', 'bot_messages')
    union all
    select 'notes'::text, value from internal_total
    union all
    select 'bot_group_messages'::text, value from bot_group_total
    union all
    select 'bot_direct_messages'::text, value from bot_direct_total
    union all
    select 'bot_messages'::text, (bot_group_total.value + bot_direct_total.value)::integer
    from bot_group_total cross join bot_direct_total
  )
  select patched_summary.section, patched_summary.unread_count
  from patched_summary
  cross join requested_variant
  where requested_variant.value not in ('chat', 'alerts')
     or (requested_variant.value = 'chat' and patched_summary.section in ('notes', 'bot_messages', 'bot_group_messages', 'bot_direct_messages', 'sms_messages', 'voip_calls'))
     or (requested_variant.value = 'alerts' and patched_summary.section in ('tasks', 'responsibilities'))
  order by case patched_summary.section
    when 'notes' then 1
    when 'bot_messages' then 2
    when 'bot_group_messages' then 3
    when 'bot_direct_messages' then 4
    when 'sms_messages' then 5
    when 'voip_calls' then 6
    when 'tasks' then 7
    when 'responsibilities' then 8
    else 99
  end;
$$;

grant execute on function public.get_internal_messaging_unread_total_v2() to authenticated;
grant execute on function public.get_notification_unread_summary_v2(text) to authenticated;
revoke all on function public.get_internal_messaging_unread_total_v2() from public, anon;
revoke all on function public.get_notification_unread_summary_v2(text) from public, anon;

notify pgrst, 'reload schema';

commit;
