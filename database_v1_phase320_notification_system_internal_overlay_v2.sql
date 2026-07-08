-- =====================================================
-- TazeSystem - Phase 320: Notification system/internal feed alignment
-- Date: 2026-07-08
-- Type: Bug fix / idempotent
-- =====================================================

begin;

create index if not exists idx_notes_org_created_notification_runtime_v2
  on public.notes(org_id, created_at desc, id desc);

create index if not exists idx_notes_org_author_created_notification_runtime_v2
  on public.notes(org_id, author_id, created_at desc, id desc);

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
    select distinct on (n.id)
      'notes'::text as section,
      conv.conversation_key,
      nullif(trim(coalesce(nii.payload->>'chat_group_id', n.metadata->>'chat_group_id')), '') as chat_group_id,
      n.id as message_id,
      n.author_id,
      n.created_at,
      nullif(trim(coalesce(nii.body, n.content, '')), '') as preview,
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
    join public.notes n
      on n.org_id = me.org_id
    left join public.notification_inbox_items nii
      on nii.org_id = me.org_id
     and nii.section = 'notes'
     and nii.source_type = 'note'
     and nii.source_id = n.id::text
    left join public.chat_groups cg
      on cg.org_id = me.org_id
     and cg.id = public.kalam_try_uuid(n.metadata->>'chat_group_id')
    left join lateral (
      select coalesce(
        nullif(trim(nii.conversation_key), ''),
        nullif(trim(nii.payload->>'conversation_key'), ''),
        public.kalam_note_conversation_key(
          n.org_id, n.id, n.author_id, coalesce(n.mention_user_ids, '{}'::uuid[]),
          coalesce(n.source_type, n.metadata->>'source_type'), coalesce(n.metadata, '{}'::jsonb), n.reply_to
        )
      ) as conversation_key
    ) conv on true
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.section = 'notes'
     and rs.source_type = 'note'
     and rs.source_id = n.id::text
    left join public.communication_read_cursors crc
      on crc.org_id = me.org_id
     and crc.user_id = me.user_id
     and crc.channel = 'internal'
     and crc.conversation_key = conv.conversation_key
    where p_channel = 'internal'
      and nullif(trim(coalesce(conv.conversation_key, '')), '') is not null
      and (
        (
          nii.id is not null
          and (
            nii.is_org_wide = true
            or me.user_id = any(coalesce(nii.target_user_ids, '{}'::uuid[]))
            or (me.role_id is not null and me.role_id = any(coalesce(nii.target_role_ids, '{}'::uuid[])))
          )
        )
        or n.author_id = me.user_id
        or me.user_id = any(coalesce(n.mention_user_ids, '{}'::uuid[]))
        or (me.role_id is not null and me.role_id = any(coalesce(n.mention_role_ids, '{}'::uuid[])))
        or (
          cg.id is not null
          and (
            me.user_id = any(coalesce(cg.user_ids, '{}'::uuid[]))
            or (me.role_id is not null and me.role_id = any(coalesce(cg.role_ids, '{}'::uuid[])))
          )
        )
        or conv.conversation_key = 'system'
      )
    order by n.id, coalesce(nii.last_event_at, nii.created_at, n.created_at) desc
  ),
  internal_base as (
    select
      section,
      conversation_key,
      case
        when conversation_key = 'system' then 'system'
        when conversation_key like 'group:%' or chat_group_id is not null then 'group'
        else 'direct'
      end as kind,
      message_id,
      author_id,
      created_at,
      preview,
      is_read
    from internal_raw
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
      case
        when ia.kind = 'system' then 'پیام‌های سیستم'
        when ia.kind = 'group' then coalesce(cg.name, 'گروه')
        else coalesce(nullif(trim(other_profile.full_name), ''), 'کاربر')
      end as title,
      case
        when ia.kind = 'system' then 'اعلان‌ها و پیام‌های سیستمی'
        when ia.kind = 'group' then 'گروه داخلی'
        else nullif(trim(other_role.title), '')
      end as subtitle,
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
     and cg.org_id = me.org_id
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
      lower(trim(coalesce(p_variant, ''))) as requested_variant
    from public.profiles p
    where p.id = auth.uid()
      and p.org_id = public.current_org_id()
    limit 1
  ),
  internal_scoped as (
    select distinct on (n.id)
      me.user_id,
      me.org_id,
      n.id as message_id,
      n.author_id,
      n.created_at,
      conv.conversation_key,
      rs.read_at,
      rs.dismissed_at
    from me
    join public.notes n
      on n.org_id = me.org_id
    left join public.notification_inbox_items nii
      on nii.org_id = me.org_id
     and nii.section = 'notes'
     and nii.source_type = 'note'
     and nii.source_id = n.id::text
    left join public.chat_groups cg
      on cg.org_id = me.org_id
     and cg.id = public.kalam_try_uuid(n.metadata->>'chat_group_id')
    left join lateral (
      select coalesce(
        nullif(trim(nii.conversation_key), ''),
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
      ) as conversation_key
    ) conv on true
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.section = 'notes'
     and rs.source_type = 'note'
     and rs.source_id = n.id::text
    where nullif(trim(coalesce(conv.conversation_key, '')), '') is not null
      and (
        (
          nii.id is not null
          and (
            nii.is_org_wide = true
            or me.user_id = any(coalesce(nii.target_user_ids, '{}'::uuid[]))
            or (me.role_id is not null and me.role_id = any(coalesce(nii.target_role_ids, '{}'::uuid[])))
          )
        )
        or n.author_id = me.user_id
        or me.user_id = any(coalesce(n.mention_user_ids, '{}'::uuid[]))
        or (me.role_id is not null and me.role_id = any(coalesce(n.mention_role_ids, '{}'::uuid[])))
        or (
          cg.id is not null
          and (
            me.user_id = any(coalesce(cg.user_ids, '{}'::uuid[]))
            or (me.role_id is not null and me.role_id = any(coalesce(cg.role_ids, '{}'::uuid[])))
          )
        )
        or conv.conversation_key = 'system'
      )
    order by n.id, coalesce(nii.last_event_at, nii.created_at, n.created_at) desc
  ),
  internal_total as (
    select count(*)::integer as value
    from internal_scoped scoped
    left join public.communication_read_cursors crc
      on crc.org_id = scoped.org_id
     and crc.user_id = scoped.user_id
     and crc.channel = 'internal'
     and crc.conversation_key = scoped.conversation_key
    where scoped.author_id is distinct from scoped.user_id
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
       or me.user_id = any(coalesce(nii.target_user_ids, '{}'::uuid[]))
       or (me.role_id is not null and me.role_id = any(coalesce(nii.target_role_ids, '{}'::uuid[])))
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
     and public.kalam_can_view_communication_record(
       'sms',
       m.org_id,
       m.assignee_type,
       m.assignee_id,
       m.assignee_role_id,
       m.module_id,
       public.kalam_try_uuid(m.record_id),
       m.related_module_id,
       public.kalam_try_uuid(m.related_record_id),
       m.customer_id
     )
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.section in ('sms', 'sms_messages')
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
     and public.kalam_can_view_communication_record(
       'voip',
       c.org_id,
       c.assignee_type,
       c.assignee_id,
       c.assignee_role_id,
       c.module_id,
       public.kalam_try_uuid(c.record_id),
       c.related_module_id,
       public.kalam_try_uuid(c.related_record_id),
       null::uuid
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
     and not exists (
       select 1
       from public.recycle_bin_records r
       where r.org_id = me.org_id
         and lower(trim(coalesce(r.source_table, ''))) = 'tasks'
         and trim(coalesce(r.source_record_id::text, '')) = t.id::text
     )
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
     and public.kalam_notification_source_exists(
       me.org_id,
       nii.source_type,
       coalesce(nullif(trim(nii.source_id), ''), nullif(trim(nii.record_id), '')),
       nii.record_id
     )
     and (
       nii.is_org_wide = true
       or me.user_id = any(coalesce(nii.target_user_ids, '{}'::uuid[]))
       or (me.role_id is not null and me.role_id = any(coalesce(nii.target_role_ids, '{}'::uuid[])))
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

create or replace function public.get_accessible_sms_delivery_reports(
  p_limit integer default 80
)
returns table (
  id uuid,
  title text,
  module_id text,
  record_id text,
  related_module_id text,
  related_record_id uuid,
  customer_id uuid,
  assignee_id uuid,
  assignee_type text,
  assignee_role_id uuid,
  direction text,
  provider text,
  provider_message_id text,
  sender text,
  recipient text,
  phone_number text,
  phone_number_id uuid,
  phone_match_status text,
  message_text text,
  status text,
  error_message text,
  metadata jsonb,
  sent_at timestamptz,
  received_at timestamptz,
  message_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with limits as (
    select least(greatest(coalesce(p_limit, 80), 1), 200) as effective_limit
  ),
  candidate_messages as (
    select
      m.id,
      coalesce(nullif(m.title, ''), nullif(m.sender, ''), nullif(m.recipient, ''), 'پیامک') as title,
      m.module_id,
      m.record_id,
      m.related_module_id,
      public.kalam_try_uuid(m.related_record_id) as related_record_id,
      m.customer_id,
      m.assignee_id,
      m.assignee_type,
      m.assignee_role_id,
      coalesce(nullif(m.direction, ''), 'outbound') as direction,
      m.provider,
      m.provider_message_id,
      m.sender,
      m.recipient,
      case when coalesce(nullif(m.direction, ''), 'outbound') = 'inbound' then m.sender else m.recipient end as phone_number,
      m.phone_number_id,
      m.phone_match_status,
      m.message_text,
      m.status,
      m.error_message,
      m.metadata,
      m.sent_at,
      m.received_at,
      coalesce(m.received_at, m.sent_at, m.created_at) as message_at,
      m.created_at,
      m.updated_at
    from public.outbound_messages m
    cross join limits
    where public.current_org_id() is not null
      and m.org_id = public.current_org_id()
      and m.channel_type = 'sms'
    order by coalesce(m.received_at, m.sent_at, m.created_at) desc nulls last, m.created_at desc, m.id desc
    limit least(greatest((select effective_limit from limits) * 20, 400), 2000)
  )
  select
    m.id,
    m.title,
    m.module_id,
    m.record_id,
    m.related_module_id,
    m.related_record_id,
    m.customer_id,
    m.assignee_id,
    m.assignee_type,
    m.assignee_role_id,
    m.direction,
    m.provider,
    m.provider_message_id,
    m.sender,
    m.recipient,
    m.phone_number,
    m.phone_number_id,
    m.phone_match_status,
    m.message_text,
    m.status,
    m.error_message,
    m.metadata,
    m.sent_at,
    m.received_at,
    m.message_at,
    m.created_at,
    m.updated_at
  from candidate_messages m
  where public.kalam_can_view_communication_record_v2(
    'sms',
    public.current_org_id(),
    m.assignee_type,
    m.assignee_id,
    m.assignee_role_id,
    m.module_id,
    public.kalam_try_uuid(m.record_id),
    m.related_module_id,
    m.related_record_id,
    m.customer_id,
    m.sender,
    m.recipient,
    m.phone_number,
    null,
    null,
    null
  )
  order by m.message_at desc nulls last, m.created_at desc, m.id desc
  limit (select effective_limit from limits);
$$;

grant execute on function public.get_accessible_sms_delivery_reports(integer) to authenticated;
revoke all on function public.get_accessible_sms_delivery_reports(integer) from public, anon;

create or replace function public.get_notification_overlay_feed_v4(
  p_before_cursor text default null,
  p_limit integer default 20
)
returns table (
  section text,
  source_type text,
  source_id text,
  title text,
  body text,
  created_at timestamptz,
  module_id text,
  record_id text,
  conversation_key text,
  payload jsonb,
  feed_cursor text,
  has_more boolean
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
  limits as (
    select
      least(greatest(coalesce(p_limit, 20), 1), 50) as effective_limit,
      least(greatest(least(greatest(coalesce(p_limit, 20), 1), 50) * 8, 80), 300) as candidate_limit
  ),
  cursor_value as (
    select
      nullif(split_part(coalesce(p_before_cursor, ''), '|', 1), '')::timestamptz as before_at,
      nullif(split_part(coalesce(p_before_cursor, ''), '|', 2), '') as before_key
  ),
  v3_rows as (
    select *
    from public.get_notification_overlay_feed_v3(
      p_before_cursor,
      (select candidate_limit from limits)
    )
  ),
  note_candidates as (
    select distinct on (n.id)
      n.id,
      n.module_id,
      n.record_id,
      n.content,
      n.author_id,
      n.author_name,
      n.mention_user_ids,
      n.mention_role_ids,
      n.source_type,
      n.metadata,
      n.reply_to,
      n.created_at,
      n.updated_at,
      nii.title as inbox_title,
      nii.body as inbox_body,
      nii.category as inbox_category,
      nii.payload as inbox_payload,
      nii.conversation_key as inbox_conversation_key,
      coalesce(nii.last_event_at, n.created_at) as event_at,
      conv.conversation_key
    from me
    cross join limits
    cross join cursor_value c
    join public.notes n
      on n.org_id = me.org_id
    left join public.notification_inbox_items nii
      on nii.org_id = me.org_id
     and nii.section = 'notes'
     and nii.source_type = 'note'
     and nii.source_id = n.id::text
    left join public.chat_groups cg
      on cg.org_id = me.org_id
     and cg.id = public.kalam_try_uuid(n.metadata->>'chat_group_id')
    left join lateral (
      select coalesce(
        nullif(trim(nii.conversation_key), ''),
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
      ) as conversation_key
    ) conv on true
    where nullif(trim(coalesce(conv.conversation_key, '')), '') is not null
      and (
        c.before_at is null
        or coalesce(nii.last_event_at, n.created_at) < c.before_at
        or (
          coalesce(nii.last_event_at, n.created_at) = c.before_at
          and concat_ws(':', 'notes', 'note', n.id::text) < coalesce(c.before_key, '')
        )
      )
      and (
        (
          nii.id is not null
          and (
            nii.is_org_wide = true
            or me.user_id = any(coalesce(nii.target_user_ids, '{}'::uuid[]))
            or (me.role_id is not null and me.role_id = any(coalesce(nii.target_role_ids, '{}'::uuid[])))
          )
        )
        or me.user_id = any(coalesce(n.mention_user_ids, '{}'::uuid[]))
        or (me.role_id is not null and me.role_id = any(coalesce(n.mention_role_ids, '{}'::uuid[])))
        or (
          cg.id is not null
          and (
            me.user_id = any(coalesce(cg.user_ids, '{}'::uuid[]))
            or (me.role_id is not null and me.role_id = any(coalesce(cg.role_ids, '{}'::uuid[])))
          )
        )
        or conv.conversation_key = 'system'
      )
    order by n.id, coalesce(nii.last_event_at, n.created_at) desc
    limit (select candidate_limit from limits)
  ),
  extra_note_rows as (
    select
      'notes'::text as section,
      'note'::text as source_type,
      nc.id::text as source_id,
      coalesce(
        nullif(trim(nc.inbox_title), ''),
        case
          when nc.conversation_key = 'system' then 'پیام سیستم'
          else 'پیام داخلی'
        end
      ) as title,
      coalesce(nullif(trim(nc.inbox_body), ''), nullif(trim(nc.content), ''), 'پیام جدید') as body,
      nc.event_at as created_at,
      nullif(trim(nc.module_id), '') as module_id,
      nullif(trim(nc.record_id), '') as record_id,
      nc.conversation_key,
      coalesce(nc.inbox_payload, '{}'::jsonb)
        || jsonb_build_object(
          'category',
            case
              when nc.conversation_key = 'system' and lower(trim(coalesce(nc.source_type, nc.metadata->>'source_type', ''))) = 'ai' then 'assistant'
              when nc.conversation_key = 'system' then 'system'
              when nc.conversation_key like 'group:%' then 'group'
              else 'internal'
            end,
          'conversation_key', nc.conversation_key,
          'author_name', nullif(trim(coalesce(nc.author_name, '')), ''),
          'conversation_title',
            case
              when nc.conversation_key = 'system' then 'پیام‌های سیستم'
              when nc.conversation_key like 'group:%' then 'گروه'
              else coalesce(nullif(trim(nc.author_name), ''), 'پیام داخلی')
            end,
          'attachment_previews', public.kalam_extract_note_attachment_previews(nc.content)
        ) as payload
    from me
    join note_candidates nc on true
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.section = 'notes'
     and rs.source_type = 'note'
     and rs.source_id = nc.id::text
    left join public.communication_read_cursors crc
      on crc.org_id = me.org_id
     and crc.user_id = me.user_id
     and crc.channel = 'internal'
     and crc.conversation_key = nc.conversation_key
    where rs.read_at is null
      and rs.dismissed_at is null
      and (rs.snoozed_until is null or rs.snoozed_until <= now())
      and (
        nc.conversation_key = 'system'
        or nc.author_id is distinct from me.user_id
      )
      and (
        crc.read_through_at is null
        or nc.created_at > crc.read_through_at
        or (
          nc.created_at = crc.read_through_at
          and nc.id::text > coalesce(crc.read_through_id, '')
        )
      )
  ),
  all_rows as (
    select
      section, source_type, source_id, title, body, created_at, module_id, record_id, conversation_key, payload
    from v3_rows
    union all
    select
      section, source_type, source_id, title, body, created_at, module_id, record_id, conversation_key, payload
    from extra_note_rows
  ),
  deduped as (
    select distinct on (section, source_type, source_id)
      all_rows.*
    from all_rows
    order by section, source_type, source_id, created_at desc nulls last
  ),
  ranked_rows as (
    select
      deduped.*,
      concat_ws(':', deduped.section, deduped.source_type, deduped.source_id) as cursor_key,
      row_number() over (
        order by deduped.created_at desc nulls last, concat_ws(':', deduped.section, deduped.source_type, deduped.source_id) desc
      ) as rn,
      count(*) over () as total_count
    from deduped
    where deduped.created_at is not null
  )
  select
    ranked_rows.section,
    ranked_rows.source_type,
    ranked_rows.source_id,
    ranked_rows.title,
    ranked_rows.body,
    ranked_rows.created_at,
    ranked_rows.module_id,
    ranked_rows.record_id,
    ranked_rows.conversation_key,
    ranked_rows.payload,
    ranked_rows.created_at::text || '|' || ranked_rows.cursor_key as feed_cursor,
    ranked_rows.total_count > limits.effective_limit as has_more
  from ranked_rows
  cross join limits
  where ranked_rows.rn <= limits.effective_limit
  order by ranked_rows.created_at desc nulls last, ranked_rows.cursor_key desc;
$$;

grant execute on function public.get_notification_overlay_feed_v4(text, integer) to authenticated;
revoke all on function public.get_notification_overlay_feed_v4(text, integer) from public, anon;

notify pgrst, 'reload schema';

commit;
