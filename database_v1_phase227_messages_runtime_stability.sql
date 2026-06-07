-- =====================================================
-- KalamApp - Phase 227: Messages runtime stability
-- Date: 2026-06-06
-- Type: Notifications / performance / idempotent
-- =====================================================

begin;

alter table if exists public.notification_read_states
  add column if not exists snoozed_until timestamptz;

create index if not exists idx_notification_read_states_user_snoozed
  on public.notification_read_states(org_id, user_id, snoozed_until)
  where snoozed_until is not null;

create or replace function public.snooze_notification_overlay_v1(
  p_section text,
  p_source_type text,
  p_source_id text,
  p_snoozed_until timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid := public.current_org_id();
  v_role_id uuid := null;
  v_section text := lower(trim(coalesce(p_section, '')));
  v_source_type text := trim(coalesce(p_source_type, ''));
  v_source_id text := trim(coalesce(p_source_id, ''));
  v_allowed boolean := false;
begin
  if v_user_id is null
     or v_org_id is null
     or v_source_type = ''
     or v_source_id = ''
     or p_snoozed_until is null
     or p_snoozed_until <= now() then
    return false;
  end if;

  select p.role_id
  into v_role_id
  from public.profiles p
  where p.id = v_user_id
    and p.org_id = v_org_id
  limit 1;

  if v_section in ('notes', 'responsibilities') then
    select exists (
      select 1
      from public.notification_inbox_items nii
      where nii.org_id = v_org_id
        and nii.section = v_section
        and nii.source_type = v_source_type
        and nii.source_id = v_source_id
        and (
          nii.is_org_wide = true
          or v_user_id = any(nii.target_user_ids)
          or (v_role_id is not null and v_role_id = any(nii.target_role_ids))
        )
    ) into v_allowed;
  elsif v_section = 'tasks' then
    select exists (
      select 1
      from public.tasks t
      where t.org_id = v_org_id
        and t.id::text = v_source_id
        and (
          (t.assignee_type = 'user' and t.assignee_id = v_user_id)
          or (t.assignee_type = 'role' and v_role_id is not null and (t.assignee_role_id = v_role_id or t.assignee_id = v_role_id))
          or (nullif(trim(coalesce(t.assignee_type, '')), '') is null and (t.assignee_id = v_user_id or t.assignee_id = v_role_id))
        )
    ) into v_allowed;
  elsif v_section = 'bot_messages' then
    select exists (
      select 1
      from public.counterparty_bot_messages m
      where m.org_id = v_org_id
        and m.id::text = v_source_id
        and public.kalam_can_access_bot_group(m.bot_group_id, m.org_id)
    ) into v_allowed;
  elsif v_section = 'sms' then
    select exists (
      select 1
      from public.outbound_messages m
      where m.org_id = v_org_id
        and m.id::text = v_source_id
        and m.channel_type = 'sms'
        and m.direction = 'inbound'
    ) into v_allowed;
  elsif v_section = 'voip_calls' then
    select exists (
      select 1
      from public.voip_call_logs c
      where c.org_id = v_org_id
        and c.id::text = v_source_id
        and c.direction = 'incoming'
    ) into v_allowed;
  end if;

  if not v_allowed then
    return false;
  end if;

  insert into public.notification_read_states (
    org_id,
    user_id,
    section,
    source_type,
    source_id,
    snoozed_until,
    updated_at
  )
  values (
    v_org_id,
    v_user_id,
    v_section,
    v_source_type,
    v_source_id,
    p_snoozed_until,
    now()
  )
  on conflict (org_id, user_id, source_type, source_id) do update
  set section = excluded.section,
      snoozed_until = excluded.snoozed_until,
      updated_at = now();

  return true;
end;
$$;

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
      coalesce(nii.payload, '{}'::jsonb)
        || jsonb_build_object(
          'category',
          nii.category,
          'conversation_key',
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
          )
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
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.source_type = nii.source_type
     and rs.source_id = nii.source_id
    left join public.communication_read_cursors crc
      on crc.org_id = me.org_id
     and crc.user_id = me.user_id
     and crc.channel = 'internal'
     and crc.conversation_key = coalesce(
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
     )
    where n.author_id is distinct from me.user_id
      and rs.read_at is null
      and rs.dismissed_at is null
      and (rs.snoozed_until is null or rs.snoozed_until <= now())
      and (
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
        ) = 'system'
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
      coalesce(m.payload, '{}'::jsonb) || jsonb_build_object('bot_group_id', g.id::text)
    from me
    join public.counterparty_bot_groups g
      on g.org_id = me.org_id
     and public.kalam_can_access_bot_group(g.id, g.org_id)
    join public.counterparty_bot_messages m
      on m.org_id = g.org_id
     and m.bot_group_id = g.id
     and m.direction = 'inbound'
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

grant execute on function public.snooze_notification_overlay_v1(text, text, text, timestamptz) to authenticated;
grant execute on function public.get_notification_overlay_feed_v1(text, integer) to authenticated;
revoke all on function public.snooze_notification_overlay_v1(text, text, text, timestamptz) from public, anon;
revoke all on function public.get_notification_overlay_feed_v1(text, integer) from public, anon;

notify pgrst, 'reload schema';

commit;
