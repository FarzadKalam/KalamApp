-- =====================================================
-- TazeSystem - Phase 314: Fast notification overlay feed v3
-- Date: 2026-07-06
-- Type: Performance / bug fix / idempotent
-- =====================================================

begin;

create index if not exists idx_counterparty_bot_messages_overlay_group_time
  on public.counterparty_bot_messages(org_id, bot_group_id, created_at desc, id desc)
  where direction = 'inbound';

create index if not exists idx_tasks_overlay_assignee_user_time
  on public.tasks(org_id, assignee_id, created_at desc, id desc);

create index if not exists idx_tasks_overlay_assignee_role_time
  on public.tasks(org_id, assignee_role_id, created_at desc, id desc);

create or replace function public.get_notification_overlay_feed_v3(
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
  inbox_candidates as (
    select
      nii.section,
      nii.source_type,
      nii.source_id,
      nii.title,
      nii.body,
      nii.module_id,
      nii.record_id,
      nii.category,
      nii.action,
      nii.payload,
      nii.conversation_key,
      coalesce(nii.last_event_at, nii.created_at) as event_at
    from me
    cross join limits
    cross join cursor_value c
    join public.notification_inbox_items nii
      on nii.org_id = me.org_id
     and nii.section in ('notes', 'bot_messages', 'responsibilities')
     and (
       nii.is_org_wide = true
       or me.user_id = any(nii.target_user_ids)
       or (me.role_id is not null and me.role_id = any(nii.target_role_ids))
     )
    where c.before_at is null
       or coalesce(nii.last_event_at, nii.created_at) < c.before_at
       or (
         coalesce(nii.last_event_at, nii.created_at) = c.before_at
         and concat_ws(':', nii.section, nii.source_type, nii.source_id) < coalesce(c.before_key, '')
       )
    order by coalesce(nii.last_event_at, nii.created_at) desc, nii.section desc, nii.source_type desc, nii.source_id desc
    limit (select candidate_limit from limits)
  ),
  note_rows as (
    select
      'notes'::text as section,
      ic.source_type,
      ic.source_id,
      coalesce(nullif(trim(ic.title), ''), case when ic.category in ('system', 'assistant') then 'پیام سیستم' else 'پیام داخلی' end) as title,
      coalesce(nullif(trim(ic.body), ''), nullif(trim(n.content), ''), 'پیام جدید') as body,
      coalesce(ic.event_at, n.created_at) as created_at,
      nullif(trim(coalesce(ic.module_id, n.module_id)), '') as module_id,
      nullif(trim(coalesce(ic.record_id, n.record_id)), '') as record_id,
      conv.conversation_key,
      coalesce(ic.payload, '{}'::jsonb)
        || jsonb_build_object(
          'category', ic.category,
          'conversation_key', conv.conversation_key,
          'author_name', coalesce(nullif(trim(n.author_name), ''), nullif(trim(author_profile.full_name), '')),
          'author_avatar_url', nullif(trim(coalesce(author_profile.avatar_url, '')), ''),
          'conversation_title',
            case
              when conv.conversation_key = 'system' then 'پیام‌های سیستم'
              when conv.conversation_key like 'group:%' then coalesce(nullif(trim(chat_group.name), ''), 'گروه')
              else coalesce(nullif(trim(n.author_name), ''), nullif(trim(author_profile.full_name), ''), 'کاربر سیستم')
            end,
          'conversation_avatar_url',
            case
              when conv.conversation_key like 'direct:%' then nullif(trim(coalesce(author_profile.avatar_url, '')), '')
              else null
            end,
          'group_title', nullif(trim(coalesce(chat_group.name, '')), ''),
          'attachment_previews', public.kalam_extract_note_attachment_previews(n.content)
        ) as payload
    from me
    join inbox_candidates ic
      on ic.section = 'notes'
     and ic.source_type = 'note'
    join public.notes n
      on n.org_id = me.org_id
     and n.id = public.kalam_try_uuid(ic.source_id)
    left join public.profiles author_profile
      on author_profile.org_id = me.org_id
     and author_profile.id = n.author_id
    left join lateral (
      select coalesce(
        ic.conversation_key,
        nullif(trim(ic.payload->>'conversation_key'), ''),
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
    left join public.chat_groups chat_group
      on chat_group.org_id = me.org_id
     and chat_group.id = case
       when conv.conversation_key ~ '^group:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         then substring(conv.conversation_key from 7)::uuid
       else null::uuid
     end
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.source_type = ic.source_type
     and rs.source_id = ic.source_id
    left join public.communication_read_cursors crc
      on crc.org_id = me.org_id
     and crc.user_id = me.user_id
     and crc.channel = 'internal'
     and crc.conversation_key = conv.conversation_key
    where n.author_id is distinct from me.user_id
      and rs.read_at is null
      and rs.dismissed_at is null
      and (rs.snoozed_until is null or rs.snoozed_until <= now())
      and (
        conv.conversation_key = 'system'
        or crc.read_through_at is null
        or n.created_at > crc.read_through_at
        or (
          n.created_at = crc.read_through_at
          and n.id::text > coalesce(crc.read_through_id, '')
        )
      )
  ),
  bot_rows as (
    select
      'bot_messages'::text as section,
      'counterparty_bot_message'::text as source_type,
      m.id::text as source_id,
      coalesce(nullif(trim(g.group_title), ''), 'پیام جدید بات') as title,
      coalesce(nullif(trim(m.content_text), ''), nullif(trim(m.file_name), ''), 'پیام جدید') as body,
      m.created_at,
      null::text as module_id,
      null::text as record_id,
      coalesce(ic.conversation_key, nullif(trim(ic.payload->>'conversation_key'), ''), 'bot:' || g.id::text) as conversation_key,
      coalesce(m.payload, '{}'::jsonb)
        || coalesce(ic.payload, '{}'::jsonb)
        || jsonb_build_object(
          'bot_group_id', g.id::text,
          'group_title', coalesce(nullif(trim(g.group_title), ''), nullif(trim(c.business_name), ''), nullif(trim(c.full_name), ''), nullif(trim(s.business_name), ''), nullif(trim(s.full_name), ''), 'گروه بات'),
          'conversation_title', coalesce(nullif(trim(g.group_title), ''), 'گروه بات'),
          'group_avatar_url', coalesce(nullif(trim(c.image_url), ''), nullif(trim(s.image_url), ''), nullif(trim(g.metadata->>'avatar_url'), '')),
          'counterparty_image_url', coalesce(nullif(trim(c.image_url), ''), nullif(trim(s.image_url), '')),
          'sender_display_name', coalesce(
            nullif(trim(m.payload->>'sender_display_name'), ''),
            nullif(trim(m.payload->>'sender_name'), ''),
            nullif(trim(m.payload->>'username'), ''),
            nullif(trim(m.payload->>'sender_id'), ''),
            nullif(trim(m.payload->>'user_id'), '')
          ),
          'sender_avatar_url', nullif(trim(coalesce(m.payload->>'sender_avatar_url', '')), ''),
          'attachment_previews',
            (
              case
                when jsonb_typeof(coalesce(m.payload, '{}'::jsonb) -> 'attachments') = 'array'
                  then coalesce(m.payload, '{}'::jsonb) -> 'attachments'
                else '[]'::jsonb
              end
            )
            || case
              when nullif(trim(coalesce(m.file_url, '')), '') is not null then
                jsonb_build_array(jsonb_build_object(
                  'name', coalesce(nullif(trim(m.file_name), ''), 'فایل'),
                  'url', nullif(trim(m.file_url), ''),
                  'mime_type', nullif(trim(coalesce(m.mime_type, '')), ''),
                  'file_type', nullif(trim(coalesce(m.message_type, '')), '')
                ))
              else '[]'::jsonb
            end
        ) as payload
    from me
    join inbox_candidates ic
      on ic.section = 'bot_messages'
     and ic.source_type = 'counterparty_bot_message'
    join public.counterparty_bot_messages m
      on m.org_id = me.org_id
     and m.id = public.kalam_try_uuid(ic.source_id)
     and m.direction = 'inbound'
    join public.counterparty_bot_groups g
      on g.org_id = me.org_id
     and g.id = m.bot_group_id
     and public.kalam_can_access_bot_group(g.id, g.org_id)
    left join public.customers c
      on c.org_id = me.org_id
     and c.id = g.customer_id
    left join public.suppliers s
      on s.org_id = me.org_id
     and s.id = g.supplier_id
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.source_type = 'counterparty_bot_message'
     and rs.source_id = m.id::text
    left join public.communication_read_cursors crc
      on crc.org_id = me.org_id
     and crc.user_id = me.user_id
     and crc.channel = 'bot'
     and crc.conversation_key = coalesce(ic.conversation_key, nullif(trim(ic.payload->>'conversation_key'), ''), 'bot:' || g.id::text)
    where rs.read_at is null
      and rs.dismissed_at is null
      and (rs.snoozed_until is null or rs.snoozed_until <= now())
      and (
        crc.read_through_at is null
        or m.created_at > crc.read_through_at
        or (
          m.created_at = crc.read_through_at
          and m.id::text > coalesce(crc.read_through_id, '')
        )
      )
  ),
  responsibility_rows as (
    select
      'responsibilities'::text as section,
      ic.source_type,
      ic.source_id,
      coalesce(nullif(trim(ic.title), ''), 'مسئولیت جدید') as title,
      coalesce(nullif(trim(ic.body), ''), 'یک رکورد نیاز به رسیدگی دارد.') as body,
      ic.event_at as created_at,
      nullif(trim(ic.module_id), '') as module_id,
      nullif(trim(ic.record_id), '') as record_id,
      null::text as conversation_key,
      coalesce(ic.payload, '{}'::jsonb)
        || jsonb_build_object(
          'action', nullif(trim(coalesce(ic.action, ic.payload->>'action', '')), ''),
          'module_id', nullif(trim(coalesce(ic.module_id, ic.payload->>'module_id', '')), '')
        ) as payload
    from me
    join inbox_candidates ic
      on ic.section = 'responsibilities'
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.source_type = ic.source_type
     and rs.source_id = ic.source_id
    where public.kalam_notification_source_exists(
        me.org_id,
        ic.source_type,
        coalesce(nullif(trim(ic.source_id), ''), nullif(trim(ic.record_id), '')),
        ic.record_id
      )
      and rs.read_at is null
      and rs.dismissed_at is null
      and (rs.snoozed_until is null or rs.snoozed_until <= now())
  ),
  task_candidates as (
    select
      t.id,
      t.name,
      t.status,
      t.priority,
      t.created_at
    from me
    cross join limits
    cross join cursor_value c
    join public.tasks t
      on t.org_id = me.org_id
     and lower(trim(coalesce(t.status, ''))) <> 'canceled'
     and (
       (t.assignee_type = 'user' and t.assignee_id = me.user_id)
       or (t.assignee_type = 'role' and me.role_id is not null and (t.assignee_role_id = me.role_id or t.assignee_id = me.role_id))
       or (nullif(trim(coalesce(t.assignee_type, '')), '') is null and (t.assignee_id = me.user_id or t.assignee_id = me.role_id))
     )
    where c.before_at is null
       or t.created_at < c.before_at
       or (
         t.created_at = c.before_at
         and concat_ws(':', 'tasks', 'task', t.id::text) < coalesce(c.before_key, '')
       )
    order by t.created_at desc, t.id desc
    limit (select candidate_limit from limits)
  ),
  task_rows as (
    select
      'tasks'::text as section,
      'task'::text as source_type,
      tc.id::text as source_id,
      coalesce(nullif(trim(tc.name), ''), 'فعالیت جدید') as title,
      'یک فعالیت به شما ارجاع شده است.'::text as body,
      tc.created_at,
      'tasks'::text as module_id,
      tc.id::text as record_id,
      null::text as conversation_key,
      jsonb_build_object('status', tc.status, 'priority', tc.priority) as payload
    from me
    join task_candidates tc on true
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.source_type = 'task'
     and rs.source_id = tc.id::text
    where rs.read_at is null
      and rs.dismissed_at is null
      and (rs.snoozed_until is null or rs.snoozed_until <= now())
      and not exists (
        select 1
        from public.recycle_bin_records r
        where r.org_id = me.org_id
          and lower(trim(coalesce(r.source_table, ''))) = 'tasks'
          and trim(coalesce(r.source_record_id::text, '')) = tc.id::text
      )
  ),
  sms_candidates as (
    select
      m.id,
      m.sender,
      m.message_text,
      m.module_id,
      m.record_id,
      m.related_module_id,
      m.related_record_id,
      m.customer_id,
      m.assignee_type,
      m.assignee_id,
      m.assignee_role_id,
      coalesce(m.received_at, m.sent_at, m.created_at) as message_at
    from me
    cross join limits
    cross join cursor_value c
    join public.outbound_messages m
      on m.org_id = me.org_id
     and m.channel_type = 'sms'
     and m.direction = 'inbound'
    where c.before_at is null
       or coalesce(m.received_at, m.sent_at, m.created_at) < c.before_at
       or (
         coalesce(m.received_at, m.sent_at, m.created_at) = c.before_at
         and concat_ws(':', 'sms_messages', 'inbound_sms', m.id::text) < coalesce(c.before_key, '')
       )
    order by coalesce(m.received_at, m.sent_at, m.created_at) desc, m.id desc
    limit (select candidate_limit from limits)
  ),
  sms_rows as (
    select
      'sms_messages'::text as section,
      'inbound_sms'::text as source_type,
      sc.id::text as source_id,
      coalesce(nullif(trim(sc.sender), ''), 'پیامک ورودی') as title,
      coalesce(nullif(trim(sc.message_text), ''), 'پیامک جدید') as body,
      sc.message_at as created_at,
      nullif(trim(sc.module_id), '') as module_id,
      nullif(trim(sc.record_id), '') as record_id,
      null::text as conversation_key,
      jsonb_build_object(
        'sender', sc.sender,
        'related_module_id', sc.related_module_id,
        'related_record_id', sc.related_record_id,
        'customer_id', sc.customer_id
      ) as payload
    from me
    join sms_candidates sc on true
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.source_type = 'inbound_sms'
     and rs.source_id = sc.id::text
    where public.kalam_can_view_communication_record_v2(
        'sms',
        me.org_id,
        sc.assignee_type,
        sc.assignee_id,
        sc.assignee_role_id,
        sc.module_id,
        public.kalam_try_uuid(sc.record_id),
        sc.related_module_id,
        public.kalam_try_uuid(sc.related_record_id),
        sc.customer_id,
        null::text,
        null::text,
        null::text,
        null::text,
        null::text,
        null::text
      )
      and rs.read_at is null
      and rs.dismissed_at is null
      and (rs.snoozed_until is null or rs.snoozed_until <= now())
  ),
  voip_candidates as (
    select
      c.id,
      c.title,
      c.source_number,
      c.extension,
      c.module_id,
      c.record_id,
      c.related_module_id,
      c.related_record_id,
      c.assignee_type,
      c.assignee_id,
      c.assignee_role_id,
      coalesce(c.started_at, c.created_at) as call_at
    from me
    cross join limits
    cross join cursor_value cur
    join public.voip_call_logs c
      on c.org_id = me.org_id
     and c.direction = 'incoming'
    where cur.before_at is null
       or coalesce(c.started_at, c.created_at) < cur.before_at
       or (
         coalesce(c.started_at, c.created_at) = cur.before_at
         and concat_ws(':', 'voip_calls', 'voip_call', c.id::text) < coalesce(cur.before_key, '')
       )
    order by coalesce(c.started_at, c.created_at) desc, c.id desc
    limit (select candidate_limit from limits)
  ),
  voip_rows as (
    select
      'voip_calls'::text as section,
      'voip_call'::text as source_type,
      vc.id::text as source_id,
      coalesce(nullif(trim(vc.title), ''), nullif(trim(vc.source_number), ''), 'تماس ورودی') as title,
      'تماس ورودی پاسخ‌داده‌نشده یا بررسی‌نشده'::text as body,
      vc.call_at as created_at,
      nullif(trim(vc.module_id), '') as module_id,
      nullif(trim(vc.record_id), '') as record_id,
      null::text as conversation_key,
      jsonb_build_object(
        'source_number', vc.source_number,
        'extension', vc.extension,
        'related_module_id', vc.related_module_id,
        'related_record_id', vc.related_record_id
      ) as payload
    from me
    join voip_candidates vc on true
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.source_type = 'voip_call'
     and rs.source_id = vc.id::text
    where public.kalam_can_view_communication_record_v2(
        'voip',
        me.org_id,
        vc.assignee_type,
        vc.assignee_id,
        vc.assignee_role_id,
        vc.module_id,
        public.kalam_try_uuid(vc.record_id),
        vc.related_module_id,
        public.kalam_try_uuid(vc.related_record_id),
        null::uuid,
        null::text,
        null::text,
        null::text,
        null::text,
        null::text,
        null::text
      )
      and rs.read_at is null
      and rs.dismissed_at is null
      and (rs.snoozed_until is null or rs.snoozed_until <= now())
  ),
  all_rows as (
    select * from note_rows
    union all select * from bot_rows
    union all select * from responsibility_rows
    union all select * from task_rows
    union all select * from sms_rows
    union all select * from voip_rows
  ),
  ranked_rows as (
    select
      all_rows.*,
      concat_ws(':', all_rows.section, all_rows.source_type, all_rows.source_id) as cursor_key,
      row_number() over (
        order by all_rows.created_at desc nulls last, concat_ws(':', all_rows.section, all_rows.source_type, all_rows.source_id) desc
      ) as rn,
      count(*) over () as total_count
    from all_rows
    where all_rows.created_at is not null
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

grant execute on function public.get_notification_overlay_feed_v3(text, integer) to authenticated;
revoke all on function public.get_notification_overlay_feed_v3(text, integer) from public, anon;

notify pgrst, 'reload schema';

commit;
