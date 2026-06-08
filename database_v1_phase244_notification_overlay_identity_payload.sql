-- =====================================================
-- KalamApp - Phase 244: Notification overlay identity payload
-- Date: 2026-06-08
-- Type: Notifications / additive runtime metadata
-- =====================================================

begin;

create or replace function public.get_notification_overlay_feed_v1(
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
      p.role_id,
      nullif(trim(coalesce(p.voip_extension, '')), '') as voip_extension,
      (
        coalesce(lower(r.permissions #>> '{__voip,view}') <> 'false', true)
        and coalesce(lower(r.permissions #>> '{__voip,fields,all_call_notifications}') <> 'false', true)
      ) as can_view_all_calls
    from public.profiles p
    left join public.org_roles r
      on r.id = p.role_id
     and r.org_id = p.org_id
    where p.id = auth.uid()
      and p.org_id = public.current_org_id()
    limit 1
  ),
  cursor_value as (
    select
      nullif(split_part(coalesce(p_before_cursor, ''), '|', 1), '')::timestamptz as before_at,
      nullif(split_part(coalesce(p_before_cursor, ''), '|', 2), '') as before_key
  ),
  note_rows as (
    select
      'notes'::text as section,
      nii.source_type,
      nii.source_id,
      coalesce(nullif(trim(nii.title), ''), case when nii.category in ('system', 'assistant') then 'پیام سیستم' else 'پیام داخلی' end) as title,
      coalesce(nullif(trim(nii.body), ''), nullif(trim(n.content), ''), 'پیام جدید') as body,
      coalesce(nii.last_event_at, nii.created_at, n.created_at) as created_at,
      nullif(trim(coalesce(nii.module_id, n.module_id)), '') as module_id,
      nullif(trim(coalesce(nii.record_id, n.record_id)), '') as record_id,
      conv.conversation_key,
      coalesce(nii.payload, '{}'::jsonb)
        || jsonb_build_object(
          'category', nii.category,
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
          'group_title', nullif(trim(coalesce(chat_group.name, '')), '')
        ) as payload
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
      on n.org_id = nii.org_id
     and n.id::text = nii.source_id
    left join public.profiles author_profile
      on author_profile.org_id = me.org_id
     and author_profile.id = n.author_id
    left join lateral (
      select coalesce(
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
     and rs.source_type = nii.source_type
     and rs.source_id = nii.source_id
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
  responsibility_rows as (
    select
      'responsibilities'::text,
      nii.source_type,
      nii.source_id,
      coalesce(nullif(trim(nii.title), ''), 'مسئولیت جدید'),
      coalesce(nullif(trim(nii.body), ''), 'یک رکورد نیاز به رسیدگی دارد.'),
      coalesce(nii.last_event_at, nii.created_at),
      nullif(trim(nii.module_id), ''),
      nullif(trim(nii.record_id), ''),
      null::text,
      coalesce(nii.payload, '{}'::jsonb)
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
       or me.user_id = any(nii.target_user_ids)
       or (me.role_id is not null and me.role_id = any(nii.target_role_ids))
     )
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.source_type = nii.source_type
     and rs.source_id = nii.source_id
    where rs.read_at is null
      and rs.dismissed_at is null
      and (rs.snoozed_until is null or rs.snoozed_until <= now())
  ),
  task_rows as (
    select
      'tasks'::text,
      'task'::text,
      t.id::text,
      coalesce(nullif(trim(t.name), ''), 'فعالیت جدید'),
      'یک فعالیت به شما ارجاع شده است.'::text,
      t.created_at,
      'tasks'::text,
      t.id::text,
      null::text,
      jsonb_build_object('status', t.status, 'priority', t.priority)
    from me
    join public.tasks t
      on t.org_id = me.org_id
     and lower(trim(coalesce(t.status, ''))) <> 'canceled'
     and not exists (
       select 1
       from public.recycle_bin_records r
       where r.org_id = me.org_id
         and lower(trim(coalesce(r.source_table, ''))) = 'tasks'
         and trim(coalesce(r.source_record_id, '')) = t.id::text
     )
     and (
       (t.assignee_type = 'user' and t.assignee_id = me.user_id)
       or (t.assignee_type = 'role' and me.role_id is not null and (t.assignee_role_id = me.role_id or t.assignee_id = me.role_id))
       or (nullif(trim(coalesce(t.assignee_type, '')), '') is null and (t.assignee_id = me.user_id or t.assignee_id = me.role_id))
     )
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.source_type = 'task'
     and rs.source_id = t.id::text
    where rs.read_at is null
      and rs.dismissed_at is null
      and (rs.snoozed_until is null or rs.snoozed_until <= now())
  ),
  bot_rows as (
    select
      'bot_messages'::text,
      'counterparty_bot_message'::text,
      m.id::text,
      coalesce(nullif(trim(g.group_title), ''), 'پیام جدید بات'),
      coalesce(nullif(trim(m.content_text), ''), nullif(trim(m.file_name), ''), 'پیام جدید'),
      m.created_at,
      null::text,
      null::text,
      'bot:' || g.id::text,
      coalesce(m.payload, '{}'::jsonb)
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
          'sender_avatar_url', nullif(trim(coalesce(m.payload->>'sender_avatar_url', '')), '')
        )
    from me
    join public.counterparty_bot_groups g
      on g.org_id = me.org_id
     and public.kalam_can_access_bot_group(g.id, g.org_id)
    join public.counterparty_bot_messages m
      on m.org_id = g.org_id
     and m.bot_group_id = g.id
     and m.direction = 'inbound'
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
     and crc.conversation_key = 'bot:' || g.id::text
    where rs.read_at is null
      and rs.dismissed_at is null
      and (rs.snoozed_until is null or rs.snoozed_until <= now())
      and (
        crc.read_through_at is null
        or m.created_at > crc.read_through_at
        or (m.created_at = crc.read_through_at and m.id::text > coalesce(crc.read_through_id, ''))
      )
  ),
  sms_rows as (
    select
      'sms_messages'::text,
      'inbound_sms'::text,
      m.id::text,
      coalesce(nullif(trim(m.sender), ''), 'پیامک ورودی'),
      coalesce(nullif(trim(m.message_text), ''), 'پیامک جدید'),
      coalesce(m.received_at, m.sent_at, m.created_at),
      nullif(trim(m.module_id), ''),
      nullif(trim(m.record_id), ''),
      null::text,
      jsonb_build_object('sender', m.sender)
    from me
    join public.outbound_messages m
      on m.org_id = me.org_id
     and m.channel_type = 'sms'
     and m.direction = 'inbound'
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.source_type = 'inbound_sms'
     and rs.source_id = m.id::text
    where rs.read_at is null
      and rs.dismissed_at is null
      and (rs.snoozed_until is null or rs.snoozed_until <= now())
  ),
  voip_rows as (
    select
      'voip_calls'::text,
      'voip_call'::text,
      c.id::text,
      coalesce(nullif(trim(c.title), ''), nullif(trim(c.source_number), ''), 'تماس ورودی'),
      'تماس ورودی پاسخ‌داده‌نشده یا بررسی‌نشده'::text,
      coalesce(c.started_at, c.created_at),
      nullif(trim(c.module_id), ''),
      nullif(trim(c.record_id), ''),
      null::text,
      jsonb_build_object('source_number', c.source_number, 'extension', c.extension)
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
     and rs.source_type = 'voip_call'
     and rs.source_id = c.id::text
    where rs.read_at is null
      and rs.dismissed_at is null
      and (rs.snoozed_until is null or rs.snoozed_until <= now())
  ),
  all_rows as (
    select * from note_rows
    union all select * from responsibility_rows
    union all select * from task_rows
    union all select * from bot_rows
    union all select * from sms_rows
    union all select * from voip_rows
  ),
  scoped as (
    select all_rows.*
    from all_rows
    cross join cursor_value c
    where c.before_at is null
       or all_rows.created_at < c.before_at
       or (
         all_rows.created_at = c.before_at
         and concat_ws(':', all_rows.section, all_rows.source_type, all_rows.source_id) < coalesce(c.before_key, '')
       )
  ),
  page as (
    select *
    from scoped
    order by created_at desc, section desc, source_type desc, source_id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50) + 1
  ),
  visible_page as (
    select *
    from page
    order by created_at desc, section desc, source_type desc, source_id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ),
  page_meta as (
    select count(*) > least(greatest(coalesce(p_limit, 20), 1), 50) as has_more
    from page
  )
  select
    visible_page.section,
    visible_page.source_type,
    visible_page.source_id,
    visible_page.title,
    visible_page.body,
    visible_page.created_at,
    visible_page.module_id,
    visible_page.record_id,
    visible_page.conversation_key,
    visible_page.payload,
    visible_page.created_at::text || '|' || concat_ws(':', visible_page.section, visible_page.source_type, visible_page.source_id) as feed_cursor,
    page_meta.has_more
  from visible_page
  cross join page_meta
  order by visible_page.created_at desc, visible_page.section desc, visible_page.source_type desc, visible_page.source_id desc;
$$;

grant execute on function public.get_notification_overlay_feed_v1(text, integer) to authenticated;
revoke all on function public.get_notification_overlay_feed_v1(text, integer) from public, anon;

notify pgrst, 'reload schema';

commit;
