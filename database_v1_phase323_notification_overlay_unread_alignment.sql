-- =====================================================
-- TazeSystem - Phase 323: Notification overlay unread alignment
-- Date: 2026-07-13
-- Type: Bug fix / idempotent
-- =====================================================

begin;

-- Keep the single overlay feed (v4) aligned with the central unread rules.
create or replace function public.get_notification_overlay_feed_v4(
  p_before_cursor text default null,
  p_limit integer default 20
)
returns table (
  section text, source_type text, source_id text, title text, body text,
  created_at timestamptz, module_id text, record_id text, conversation_key text,
  payload jsonb, feed_cursor text, has_more boolean
)
language sql stable security definer set search_path = public
as $$
  with me as (
    select auth.uid() as user_id, public.current_org_id() as org_id, p.role_id
    from public.profiles p
    where p.id = auth.uid() and p.org_id = public.current_org_id()
    limit 1
  ),
  limits as (
    select least(greatest(coalesce(p_limit, 20), 1), 50) as effective_limit,
      least(greatest(least(greatest(coalesce(p_limit, 20), 1), 50) * 8, 80), 300) as candidate_limit
  ),
  cursor_value as (
    select nullif(split_part(coalesce(p_before_cursor, ''), '|', 1), '')::timestamptz as before_at,
      nullif(split_part(coalesce(p_before_cursor, ''), '|', 2), '') as before_key
  ),
  v3_rows as (
    select section, source_type, source_id, title, body, created_at, module_id, record_id, conversation_key, payload
    from public.get_notification_overlay_feed_v3(p_before_cursor, (select candidate_limit from limits))
  ),
  note_candidates as (
    select distinct on (n.id)
      n.id, n.module_id, n.record_id, n.content, n.author_id, n.author_name, n.mention_user_ids, n.mention_role_ids,
      n.source_type, n.metadata, n.reply_to, n.created_at, nii.title as inbox_title, nii.body as inbox_body,
      nii.payload as inbox_payload, coalesce(nii.last_event_at, n.created_at) as event_at,
      conv.conversation_key as resolved_conversation_key
    from me cross join limits cross join cursor_value cur
    join public.notes n on n.org_id = me.org_id
    left join public.notification_inbox_items nii on nii.org_id = me.org_id and nii.section = 'notes'
      and nii.source_type = 'note' and nii.source_id = n.id::text
    left join public.chat_groups cg on cg.org_id = me.org_id and cg.id = public.kalam_try_uuid(n.metadata->>'chat_group_id')
    left join lateral (
      select coalesce(nullif(trim(nii.conversation_key), ''), nullif(trim(nii.payload->>'conversation_key'), ''),
        public.kalam_note_conversation_key(n.org_id, n.id, n.author_id, coalesce(n.mention_user_ids, '{}'::uuid[]),
          coalesce(n.source_type, n.metadata->>'source_type'), coalesce(n.metadata, '{}'::jsonb), n.reply_to)) as conversation_key
    ) conv on true
    where (cur.before_at is null or coalesce(nii.last_event_at, n.created_at) < cur.before_at
      or (coalesce(nii.last_event_at, n.created_at) = cur.before_at
        and concat_ws(':', 'notes', 'note', n.id::text) < coalesce(cur.before_key, '')))
      and ( (nii.id is not null and (nii.is_org_wide = true or me.user_id = any(coalesce(nii.target_user_ids, '{}'::uuid[]))
          or (me.role_id is not null and me.role_id = any(coalesce(nii.target_role_ids, '{}'::uuid[])))))
        or me.user_id = any(coalesce(n.mention_user_ids, '{}'::uuid[]))
        or (me.role_id is not null and me.role_id = any(coalesce(n.mention_role_ids, '{}'::uuid[])))
        or (cg.id is not null and (me.user_id = any(coalesce(cg.user_ids, '{}'::uuid[]))
          or (me.role_id is not null and me.role_id = any(coalesce(cg.role_ids, '{}'::uuid[])))))
        or conv.conversation_key = 'system')
    order by n.id, coalesce(nii.last_event_at, n.created_at) desc
    limit (select candidate_limit from limits)
  ),
  extra_note_rows as (
    select 'notes'::text as section, 'note'::text as source_type, nc.id::text as source_id,
      coalesce(nullif(trim(nc.inbox_title), ''), case when nc.resolved_conversation_key = 'system' then 'پیام سیستم' else 'پیام داخلی' end) as title,
      coalesce(nullif(trim(nc.inbox_body), ''), nullif(trim(nc.content), ''), 'پیام جدید') as body,
      nc.event_at as created_at, nullif(trim(nc.module_id), '') as module_id, nullif(trim(nc.record_id), '') as record_id,
      nc.resolved_conversation_key as conversation_key,
      coalesce(nc.inbox_payload, '{}'::jsonb) || jsonb_build_object(
        'category', case when nc.resolved_conversation_key = 'system' and lower(trim(coalesce(nc.source_type, nc.metadata->>'source_type', ''))) = 'ai' then 'assistant'
          when nc.resolved_conversation_key = 'system' then 'system' when nc.resolved_conversation_key like 'group:%' then 'group' else 'internal' end,
        'conversation_key', nc.resolved_conversation_key, 'author_name', nullif(trim(coalesce(nc.author_name, '')), ''),
        'attachment_previews', public.kalam_extract_note_attachment_previews(nc.content)) as payload
    from me join note_candidates nc on true
    left join public.notification_read_states rs on rs.org_id = me.org_id and rs.user_id = me.user_id
      and rs.section = 'notes' and rs.source_type = 'note' and rs.source_id = nc.id::text
    left join public.communication_read_cursors crc on crc.org_id = me.org_id and crc.user_id = me.user_id
      and crc.channel = 'internal' and crc.conversation_key = nc.resolved_conversation_key
    where rs.read_at is null and rs.dismissed_at is null and (rs.snoozed_until is null or rs.snoozed_until <= now())
      and (nc.resolved_conversation_key = 'system' or nc.author_id is distinct from me.user_id)
      and (crc.read_through_at is null or nc.created_at > crc.read_through_at
        or (nc.created_at = crc.read_through_at and nc.id::text > coalesce(crc.read_through_id, '')))
  ),
  bot_candidates as (
    select m.id, m.bot_group_id, m.content_text, m.file_url, m.file_name, m.mime_type, m.message_type,
      m.payload as message_payload, m.created_at, g.group_title, g.metadata as group_metadata,
      c.business_name as customer_business_name, c.full_name as customer_full_name, c.image_url as customer_image_url,
      s.business_name as supplier_business_name, s.full_name as supplier_full_name, s.image_url as supplier_image_url
    from me cross join limits cross join cursor_value cur
    join public.counterparty_bot_messages m on m.org_id = me.org_id and m.direction = 'inbound'
    join public.counterparty_bot_groups g on g.org_id = me.org_id and g.id = m.bot_group_id
      and public.kalam_can_access_bot_group(g.id, g.org_id)
    left join public.customers c on c.org_id = me.org_id and c.id = g.customer_id
    left join public.suppliers s on s.org_id = me.org_id and s.id = g.supplier_id
    left join public.notification_read_states rs on rs.org_id = me.org_id and rs.user_id = me.user_id
      and rs.section = 'bot_messages' and rs.source_type = 'counterparty_bot_message' and rs.source_id = m.id::text
    left join public.communication_read_cursors crc on crc.org_id = me.org_id and crc.user_id = me.user_id
      and crc.channel = 'bot' and crc.conversation_key = 'bot:' || g.id::text
    where rs.read_at is null and rs.dismissed_at is null and (rs.snoozed_until is null or rs.snoozed_until <= now())
      and (crc.read_through_at is null or m.created_at > crc.read_through_at
        or (m.created_at = crc.read_through_at and m.id::text > coalesce(crc.read_through_id, '')))
      and (cur.before_at is null or m.created_at < cur.before_at
        or (m.created_at = cur.before_at and concat_ws(':', 'bot_messages', 'counterparty_bot_message', m.id::text) < coalesce(cur.before_key, '')))
    order by m.created_at desc, m.id desc
    limit (select candidate_limit from limits)
  ),
  extra_bot_rows as (
    select 'bot_messages'::text as section, 'counterparty_bot_message'::text as source_type, bc.id::text as source_id,
      coalesce(nullif(trim(bc.group_title), ''), 'پیام جدید بات') as title,
      coalesce(nullif(trim(bc.content_text), ''), nullif(trim(bc.file_name), ''), 'پیام جدید') as body, bc.created_at,
      null::text as module_id, null::text as record_id, 'bot:' || bc.bot_group_id::text as conversation_key,
      coalesce(bc.message_payload, '{}'::jsonb) || jsonb_build_object(
        'bot_group_id', bc.bot_group_id::text,
        'group_title', coalesce(nullif(trim(bc.group_title), ''), nullif(trim(bc.customer_business_name), ''), nullif(trim(bc.customer_full_name), ''), nullif(trim(bc.supplier_business_name), ''), nullif(trim(bc.supplier_full_name), ''), 'گروه بات'),
        'conversation_title', coalesce(nullif(trim(bc.group_title), ''), 'گروه بات'),
        'group_avatar_url', coalesce(nullif(trim(bc.customer_image_url), ''), nullif(trim(bc.supplier_image_url), ''), nullif(trim(bc.group_metadata->>'avatar_url'), '')),
        'counterparty_image_url', coalesce(nullif(trim(bc.customer_image_url), ''), nullif(trim(bc.supplier_image_url), '')),
        'sender_display_name', coalesce(nullif(trim(bc.message_payload->>'sender_display_name'), ''), nullif(trim(bc.message_payload->>'sender_name'), ''), nullif(trim(bc.message_payload->>'username'), ''), nullif(trim(bc.message_payload->>'sender_id'), ''), nullif(trim(bc.message_payload->>'user_id'), '')),
        'sender_avatar_url', nullif(trim(coalesce(bc.message_payload->>'sender_avatar_url', '')), ''),
        'attachment_previews', (case when jsonb_typeof(coalesce(bc.message_payload, '{}'::jsonb) -> 'attachments') = 'array' then coalesce(bc.message_payload, '{}'::jsonb) -> 'attachments' else '[]'::jsonb end)
          || case when nullif(trim(coalesce(bc.file_url, '')), '') is not null then jsonb_build_array(jsonb_build_object('name', coalesce(nullif(trim(bc.file_name), ''), 'فایل'), 'url', nullif(trim(bc.file_url), ''), 'mime_type', nullif(trim(coalesce(bc.mime_type, '')), ''), 'file_type', nullif(trim(coalesce(bc.message_type, '')), ''))) else '[]'::jsonb end) as payload
    from bot_candidates bc
  ),
  all_rows as (
    select * from v3_rows union all select * from extra_note_rows union all select * from extra_bot_rows
  ),
  deduped as (
    select distinct on (section, source_type, source_id) * from all_rows
    order by section, source_type, source_id, created_at desc nulls last
  ),
  ranked_rows as (
    select d.*, concat_ws(':', d.section, d.source_type, d.source_id) as cursor_key,
      row_number() over (order by d.created_at desc nulls last, concat_ws(':', d.section, d.source_type, d.source_id) desc) as rn,
      count(*) over () as total_count
    from deduped d where d.created_at is not null
  )
  select r.section, r.source_type, r.source_id, r.title, r.body, r.created_at, r.module_id, r.record_id,
    r.conversation_key, r.payload, r.created_at::text || '|' || r.cursor_key as feed_cursor,
    r.total_count > limits.effective_limit as has_more
  from ranked_rows r cross join limits
  where r.rn <= limits.effective_limit
  order by r.created_at desc nulls last, r.cursor_key desc;
$$;

grant execute on function public.get_notification_overlay_feed_v4(text, integer) to authenticated;
revoke all on function public.get_notification_overlay_feed_v4(text, integer) from public, anon;

notify pgrst, 'reload schema';

commit;
