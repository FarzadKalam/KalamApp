-- =====================================================
-- KalamApp - Phase 216: Unified notification unread summary
-- Date: 2026-05-28
-- Type: Runtime / API / idempotent
-- =====================================================

begin;

create index if not exists idx_notification_read_states_unread_summary_lookup
  on public.notification_read_states(org_id, user_id, section, source_type, source_id);

do $$
begin
  if to_regclass('public.tasks') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'tasks' and column_name = 'org_id'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'tasks' and column_name = 'assignee_type'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'tasks' and column_name = 'assignee_id'
     ) then
    execute '
      create index if not exists idx_tasks_unread_user_assignment
        on public.tasks(org_id, assignee_type, assignee_id, created_at desc)
        where coalesce(lower(status), '''') <> ''canceled''
    ';
  end if;

  if to_regclass('public.tasks') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'tasks' and column_name = 'org_id'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'tasks' and column_name = 'assignee_type'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'tasks' and column_name = 'assignee_role_id'
     ) then
    execute '
      create index if not exists idx_tasks_unread_role_assignment
        on public.tasks(org_id, assignee_type, assignee_role_id, created_at desc)
        where coalesce(lower(status), '''') <> ''canceled''
    ';
  end if;
end $$;

create or replace function public.get_notification_unread_summary_v1(
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
  with me as (
    select
      auth.uid() as user_id,
      public.current_org_id() as org_id,
      p.role_id,
      nullif(trim(coalesce(p.voip_extension, '')), '') as voip_extension,
      (
        coalesce(lower(r.permissions #>> '{__voip,view}') <> 'false', true)
        and coalesce(lower(r.permissions #>> '{__voip,fields,all_call_notifications}') <> 'false', true)
      ) as can_view_all_calls,
      lower(trim(coalesce(p_variant, ''))) as requested_variant
    from public.profiles p
    left join public.org_roles r
      on r.id = p.role_id
     and r.org_id = p.org_id
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
          n.org_id,
          n.id,
          n.author_id,
          coalesce(n.mention_user_ids, '{}'::uuid[]),
          coalesce(n.source_type, n.metadata->>'source_type'),
          coalesce(n.metadata, '{}'::jsonb),
          n.reply_to
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
  note_like_total as (
    select count(*)::integer as value
    from me
    join public.notification_inbox_items nii
      on nii.org_id = me.org_id
     and nii.section = 'notes'
     and nii.source_type = 'note_like'
     and (
       nii.is_org_wide = true
       or me.user_id = any(nii.target_user_ids)
       or (me.role_id is not null and me.role_id = any(nii.target_role_ids))
     )
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.section = 'notes'
     and rs.source_type = 'note_like'
     and rs.source_id = nii.source_id
    where rs.read_at is null
      and rs.dismissed_at is null
  ),
  bot_total as (
    select coalesce(sum(unread.unread_count), 0)::integer as value
    from me
    join public.counterparty_bot_groups g
      on g.org_id = me.org_id
     and public.kalam_can_access_bot_group(g.id, g.org_id)
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
  ),
  sms_total as (
    select count(*)::integer as value
    from me
    join public.outbound_messages m
      on m.org_id = me.org_id
     and m.channel_type = 'sms'
     and m.direction = 'inbound'
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.section = 'sms'
     and rs.source_type = 'inbound_sms'
     and rs.source_id = m.id::text
    where rs.read_at is null
      and rs.dismissed_at is null
  ),
  voip_total as (
    select count(*)::integer as value
    from me
    join public.voip_call_logs c
      on c.org_id = me.org_id
     and c.direction = 'incoming'
     and (
       me.can_view_all_calls
       or (me.voip_extension is not null and c.extension = me.voip_extension)
     )
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.section = 'voip_calls'
     and rs.source_type = 'voip_call'
     and rs.source_id = c.id::text
    where rs.read_at is null
      and rs.dismissed_at is null
  ),
  tasks_total as (
    select count(distinct t.id)::integer as value
    from me
    join public.tasks t
      on t.org_id = me.org_id
     and lower(trim(coalesce(t.status, ''))) <> 'canceled'
     and (
       (t.assignee_type = 'user' and t.assignee_id = me.user_id)
       or (t.assignee_type = 'role' and me.role_id is not null and t.assignee_role_id = me.role_id)
       or (t.assignee_type = 'role' and me.role_id is not null and t.assignee_id = me.role_id)
       or (nullif(trim(coalesce(t.assignee_type, '')), '') is null and t.assignee_id = me.user_id)
       or (nullif(trim(coalesce(t.assignee_type, '')), '') is null and me.role_id is not null and t.assignee_id = me.role_id)
     )
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.section = 'tasks'
     and rs.source_type = 'task'
     and rs.source_id = t.id::text
    where rs.read_at is null
      and rs.dismissed_at is null
  ),
  responsibilities_total as (
    select count(*)::integer as value
    from me
    join public.notification_inbox_items nii
      on nii.org_id = me.org_id
     and nii.section = 'responsibilities'
     and (
       nii.is_org_wide = true
       or me.user_id = any(nii.target_user_ids)
       or (me.role_id is not null and me.role_id = any(nii.target_role_ids))
     )
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.section = 'responsibilities'
     and rs.source_type = nii.source_type
     and rs.source_id = nii.source_id
    where rs.read_at is null
      and rs.dismissed_at is null
  ),
  summary as (
    select 'notes'::text as section, (coalesce(internal_total.value, 0) + coalesce(note_like_total.value, 0))::integer as unread_count from internal_total cross join note_like_total
    union all select 'bot_messages', coalesce(value, 0)::integer from bot_total
    union all select 'sms_messages', coalesce(value, 0)::integer from sms_total
    union all select 'voip_calls', coalesce(value, 0)::integer from voip_total
    union all select 'tasks', coalesce(value, 0)::integer from tasks_total
    union all select 'responsibilities', coalesce(value, 0)::integer from responsibilities_total
  )
  select summary.section, summary.unread_count
  from summary
  cross join me
  where me.requested_variant not in ('chat', 'alerts')
     or (me.requested_variant = 'chat' and summary.section in ('notes', 'bot_messages', 'sms_messages', 'voip_calls'))
     or (me.requested_variant = 'alerts' and summary.section in ('tasks', 'responsibilities'))
  order by case summary.section
    when 'notes' then 1
    when 'bot_messages' then 2
    when 'sms_messages' then 3
    when 'voip_calls' then 4
    when 'tasks' then 5
    when 'responsibilities' then 6
    else 99
  end;
$$;

grant execute on function public.get_notification_unread_summary_v1(text) to authenticated;
revoke all on function public.get_notification_unread_summary_v1(text) from public, anon;

create or replace function public.get_communication_badge_summary_v2()
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
  with summary as (
    select section, unread_count
    from public.get_notification_unread_summary_v1('chat')
  )
  select
    coalesce(max(unread_count) filter (where section = 'notes'), 0)::integer as internal_unread,
    coalesce(max(unread_count) filter (where section = 'bot_messages'), 0)::integer as bot_unread,
    coalesce(sum(unread_count), 0)::integer as total_unread
  from summary;
$$;

grant execute on function public.get_communication_badge_summary_v2() to authenticated;
revoke all on function public.get_communication_badge_summary_v2() from public, anon;

notify pgrst, 'reload schema';

commit;

