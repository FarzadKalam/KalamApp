-- =====================================================
-- TazeSystem - Phase 412: Central notification overlay feed
-- Date: 2026-07-28
-- Type: Performance / messaging consolidation / idempotent
-- =====================================================

begin;

create index if not exists idx_counterparty_bot_direct_messages_org_inbound_time_v5
  on public.counterparty_bot_direct_messages(org_id, created_at desc, id desc)
  where direction = 'inbound';

-- V5 is the one server-side feed consumed by the notification runtime. It
-- includes direct bot conversations, which were previously loaded by several
-- client-side queries in parallel with the central feed.
create or replace function public.get_notification_overlay_feed_v5(
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
    select auth.uid() as user_id, public.current_org_id() as org_id
    from public.profiles p
    where p.id = auth.uid()
      and p.org_id = public.current_org_id()
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
  central_rows as (
    select
      f.section,
      f.source_type,
      f.source_id,
      f.title,
      f.body,
      f.created_at,
      f.module_id,
      f.record_id,
      f.conversation_key,
      f.payload,
      coalesce(f.has_more, false) as upstream_has_more
    from limits
    cross join lateral public.get_notification_overlay_feed_v4(
      p_before_cursor,
      limits.candidate_limit
    ) f
  ),
  direct_candidates as (
    select
      m.id,
      m.direct_thread_id,
      m.content_text,
      m.file_url,
      m.file_name,
      m.mime_type,
      m.message_type,
      m.payload as message_payload,
      m.created_at,
      t.channel_type,
      t.chat_id,
      t.target_module_id,
      t.target_record_id,
      t.display_name,
      t.username,
      t.phone_number
    from me
    cross join limits
    cross join cursor_value cur
    join public.counterparty_bot_direct_threads t
      on t.org_id = me.org_id
     and public.kalam_can_access_bot_direct_thread(t.id, t.org_id)
    join public.counterparty_bot_direct_messages m
      on m.org_id = me.org_id
     and m.direct_thread_id = t.id
     and m.direction = 'inbound'
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.source_type = 'counterparty_bot_direct_message'
     and rs.source_id = m.id::text
     and rs.section in ('bot_direct_messages', 'bot_messages')
    left join public.communication_read_cursors crc
      on crc.org_id = me.org_id
     and crc.user_id = me.user_id
     and crc.channel = 'bot'
     and crc.conversation_key = 'bot:direct:' || coalesce(t.channel_type, '') || ':' || coalesce(t.chat_id, '')
    where rs.read_at is null
      and rs.dismissed_at is null
      and (rs.snoozed_until is null or rs.snoozed_until <= now())
      and (
        crc.read_through_at is null
        or m.created_at > crc.read_through_at
        or (m.created_at = crc.read_through_at and m.id::text > coalesce(crc.read_through_id, ''))
      )
      and (
        cur.before_at is null
        or m.created_at < cur.before_at
        or (
          m.created_at = cur.before_at
          and concat_ws(':', 'bot_direct_messages', 'counterparty_bot_direct_message', m.id::text) < coalesce(cur.before_key, '')
        )
      )
    order by m.created_at desc, m.id desc
    limit ((select candidate_limit from limits) + 1)
  ),
  direct_rows as (
    select
      'bot_direct_messages'::text as section,
      'counterparty_bot_direct_message'::text as source_type,
      dc.id::text as source_id,
      coalesce(
        nullif(trim(dc.display_name), ''),
        nullif(trim(dc.message_payload->>'sender_display_name'), ''),
        case when nullif(trim(coalesce(dc.username, dc.message_payload->>'username')), '') is not null
          then '@' || trim(coalesce(dc.username, dc.message_payload->>'username')) end,
        nullif(trim(dc.chat_id), ''),
        'پیام شخصی بات'
      ) as title,
      coalesce(nullif(trim(dc.content_text), ''), nullif(trim(dc.file_name), ''), 'پیام جدید') as body,
      dc.created_at,
      nullif(trim(dc.target_module_id), '') as module_id,
      nullif(trim(dc.target_record_id::text), '') as record_id,
      'bot:direct:' || coalesce(dc.channel_type, '') || ':' || coalesce(dc.chat_id, '') as conversation_key,
      coalesce(dc.message_payload, '{}'::jsonb) || jsonb_build_object(
        'direct_thread_id', dc.direct_thread_id::text,
        'channel_type', nullif(trim(dc.channel_type), ''),
        'chat_id', nullif(trim(dc.chat_id), ''),
        'conversation_title', coalesce(nullif(trim(dc.display_name), ''), nullif(trim(dc.message_payload->>'sender_display_name'), ''), nullif(trim(dc.chat_id), ''), 'پیام شخصی بات'),
        'sender_display_name', coalesce(nullif(trim(dc.display_name), ''), nullif(trim(dc.message_payload->>'sender_display_name'), ''), nullif(trim(dc.chat_id), ''), 'پیام شخصی بات'),
        'username', nullif(trim(coalesce(dc.username, dc.message_payload->>'username')), ''),
        'phone_number', nullif(trim(coalesce(dc.phone_number, dc.message_payload->>'phone_number')), ''),
        'attachment_previews',
          (case when jsonb_typeof(coalesce(dc.message_payload, '{}'::jsonb)->'attachments') = 'array'
            then coalesce(dc.message_payload, '{}'::jsonb)->'attachments' else '[]'::jsonb end)
          || case when nullif(trim(coalesce(dc.file_url, '')), '') is not null then jsonb_build_array(jsonb_build_object(
            'name', coalesce(nullif(trim(dc.file_name), ''), 'فایل'),
            'url', nullif(trim(dc.file_url), ''),
            'mime_type', nullif(trim(dc.mime_type), ''),
            'file_type', nullif(trim(dc.message_type), '')
          )) else '[]'::jsonb end
      ) as payload,
      false as upstream_has_more
    from direct_candidates dc
  ),
  candidate_rows as (
    select * from central_rows
    union all
    select * from direct_rows
  ),
  deduped_rows as (
    select distinct on (section, source_type, source_id) *
    from candidate_rows
    order by section, source_type, source_id, created_at desc nulls last
  ),
  ranked_rows as (
    select
      dr.*,
      concat_ws(':', dr.section, dr.source_type, dr.source_id) as cursor_key,
      row_number() over (order by dr.created_at desc nulls last, concat_ws(':', dr.section, dr.source_type, dr.source_id) desc) as row_number,
      count(*) over () as candidate_count,
      bool_or(dr.upstream_has_more) over () as any_upstream_has_more
    from deduped_rows dr
    where dr.created_at is not null
  )
  select
    rr.section,
    rr.source_type,
    rr.source_id,
    rr.title,
    rr.body,
    rr.created_at,
    rr.module_id,
    rr.record_id,
    rr.conversation_key,
    rr.payload,
    rr.created_at::text || '|' || rr.cursor_key as feed_cursor,
    (rr.candidate_count > limits.effective_limit or rr.any_upstream_has_more) as has_more
  from ranked_rows rr
  cross join limits
  where rr.row_number <= limits.effective_limit
  order by rr.created_at desc nulls last, rr.cursor_key desc;
$$;

grant execute on function public.get_notification_overlay_feed_v5(text, integer) to authenticated;
revoke all on function public.get_notification_overlay_feed_v5(text, integer) from public, anon;

notify pgrst, 'reload schema';

commit;
