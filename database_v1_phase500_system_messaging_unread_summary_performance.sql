-- =====================================================
-- TazeSystem - Phase 500: System messaging unread-summary performance
-- Keeps the existing recipient and cursor rules while avoiding one inbox lookup per note.
-- =====================================================

begin;

create or replace function public.get_system_messaging_unread_total_v1()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select profile.id as user_id, profile.org_id, profile.role_id
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.org_id = public.current_org_id()
    limit 1
  ), system_candidates as (
    select
      note.id,
      note.author_id,
      note.created_at,
      me.user_id,
      me.org_id
    from me
    join public.notification_inbox_items inbox
      on inbox.org_id = me.org_id
     and inbox.section = 'notes'
     and inbox.source_type = 'note'
    join public.notes note
      on note.org_id = inbox.org_id
     and note.id = case
       when inbox.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         then inbox.source_id::uuid
       else null
     end
    where (
      lower(trim(coalesce(inbox.category, ''))) in ('system', 'assistant')
      or lower(trim(coalesce(
        nullif(note.source_type, ''),
        coalesce(note.metadata, '{}'::jsonb)->>'source_type',
        ''
      ))) in ('system', 'ai', 'assistant')
      or coalesce(note.metadata, '{}'::jsonb) ?| array[
        'workflow_id',
        'automation_rule_id',
        'process_automation_rule_id',
        'workflow_action_type',
        'scheduled_report_id'
      ]
    )
      and (
        me.user_id = any(coalesce(inbox.target_user_ids, '{}'::uuid[]))
        or me.user_id = any(coalesce(note.mention_user_ids, '{}'::uuid[]))
        or (
          me.role_id is not null
          and (
            me.role_id = any(coalesce(inbox.target_role_ids, '{}'::uuid[]))
            or me.role_id = any(coalesce(note.mention_role_ids, '{}'::uuid[]))
          )
        )
      )

    union all

    -- Legacy rows without an inbox item remain visible only to their explicit recipients.
    select
      note.id,
      note.author_id,
      note.created_at,
      me.user_id,
      me.org_id
    from me
    join public.notes note
      on note.org_id = me.org_id
    where (
      lower(trim(coalesce(
        nullif(note.source_type, ''),
        coalesce(note.metadata, '{}'::jsonb)->>'source_type',
        ''
      ))) in ('system', 'ai', 'assistant')
      or coalesce(note.metadata, '{}'::jsonb) ?| array[
        'workflow_id',
        'automation_rule_id',
        'process_automation_rule_id',
        'workflow_action_type',
        'scheduled_report_id'
      ]
    )
      and not exists (
        select 1
        from public.notification_inbox_items inbox
        where inbox.org_id = me.org_id
          and inbox.section = 'notes'
          and inbox.source_type = 'note'
          and inbox.source_id = note.id::text
      )
      and (
        me.user_id = any(coalesce(note.mention_user_ids, '{}'::uuid[]))
        or (
          me.role_id is not null
          and me.role_id = any(coalesce(note.mention_role_ids, '{}'::uuid[]))
        )
      )
  )
  select count(*) filter (
    where candidate.author_id is distinct from candidate.user_id
      and read_state.read_at is null
      and read_state.dismissed_at is null
      and (
        cursor_state.read_through_at is null
        or candidate.created_at > cursor_state.read_through_at
        or (
          candidate.created_at = cursor_state.read_through_at
          and candidate.id::text > coalesce(cursor_state.read_through_id, '')
        )
      )
  )::integer
  from system_candidates candidate
  left join public.notification_read_states read_state
    on read_state.org_id = candidate.org_id
   and read_state.user_id = candidate.user_id
   and read_state.section = 'notes'
   and read_state.source_type = 'note'
   and read_state.source_id = candidate.id::text
  left join public.communication_read_cursors cursor_state
    on cursor_state.org_id = candidate.org_id
   and cursor_state.user_id = candidate.user_id
   and cursor_state.channel = 'internal'
   and cursor_state.conversation_key = 'system';
$$;

grant execute on function public.get_system_messaging_unread_total_v1() to authenticated;
revoke all on function public.get_system_messaging_unread_total_v1() from public, anon;

notify pgrst, 'reload schema';

commit;
