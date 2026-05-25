-- =====================================================
-- KalamApp - Phase 199: Lightweight communication launcher badge
-- Date: 2026-05-25
-- Type: Performance / API / idempotent
-- =====================================================

begin;

create index if not exists idx_notification_inbox_communication_badge_scope
  on public.notification_inbox_items (org_id, conversation_key, source_id)
  where section = 'notes'
    and source_type = 'note'
    and category not in ('system', 'assistant')
    and conversation_key <> 'system';

-- Header uses this compact aggregate while the communication panel is closed.
-- It deliberately covers the two realtime conversation channels shown in the
-- closed launcher today: internal messages and bot messages.
create or replace function public.get_communication_badge_summary()
returns table (
  internal_unread integer,
  bot_unread integer,
  total_unread integer
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
  internal_scoped as (
    select
      me.user_id,
      me.org_id,
      n.id as message_id,
      n.author_id,
      n.created_at,
      coalesce(
        nii.conversation_key,
        nullif(trim(nii.payload->>'conversation_key'), ''),
        public.kalam_note_conversation_key(
          n.org_id, n.id, n.author_id, coalesce(n.mention_user_ids, '{}'::uuid[]),
          coalesce(n.source_type, n.metadata->>'source_type'), coalesce(n.metadata, '{}'::jsonb), n.reply_to
        )
      ) as conversation_key,
      rs.read_at,
      rs.dismissed_at
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
  ),
  internal_total as (
    select count(*)::integer as value
    from internal_scoped scoped
    left join public.communication_read_cursors crc
      on crc.org_id = scoped.org_id
     and crc.user_id = scoped.user_id
     and crc.channel = 'internal'
     and crc.conversation_key = scoped.conversation_key
    where scoped.conversation_key is not null
      and scoped.conversation_key <> 'system'
      and scoped.author_id is distinct from scoped.user_id
      and scoped.read_at is null
      and scoped.dismissed_at is null
      and not (
        crc.read_through_at is not null
        and (
          scoped.created_at < crc.read_through_at
          or (
            scoped.created_at = crc.read_through_at
            and scoped.message_id::text <= coalesce(crc.read_through_id, scoped.message_id::text)
          )
        )
      )
  ),
  bot_total as (
    select count(*)::integer as value
    from me
    join public.counterparty_bot_groups g
      on g.org_id = me.org_id
     and public.kalam_can_access_bot_group(g.id, g.org_id)
    join public.counterparty_bot_messages m
      on m.bot_group_id = g.id
     and m.org_id = g.org_id
     and m.direction = 'inbound'
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
    where rs.read_at is null
      and rs.dismissed_at is null
      and not (
        crc.read_through_at is not null
        and (
          m.created_at < crc.read_through_at
          or (
            m.created_at = crc.read_through_at
            and m.id::text <= coalesce(crc.read_through_id, m.id::text)
          )
        )
      )
  )
  select
    coalesce(internal_total.value, 0)::integer,
    coalesce(bot_total.value, 0)::integer,
    (coalesce(internal_total.value, 0) + coalesce(bot_total.value, 0))::integer
  from internal_total
  cross join bot_total;
$$;

grant execute on function public.get_communication_badge_summary() to authenticated;
revoke all on function public.get_communication_badge_summary() from public, anon;

notify pgrst, 'reload schema';

commit;
