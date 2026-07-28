-- =====================================================
-- TazeSystem - Phase 414: System message recipient scope
-- Date: 2026-07-28
-- Type: Security / messaging repair / idempotent
-- =====================================================

begin;

-- System and AI messages are recipient-only: a user must be mentioned
-- directly or through their current role. They never become organization-wide
-- merely because an older sender omitted recipients.
create or replace function public.kalam_notes_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_metadata jsonb := coalesce(v_row->'metadata', '{}'::jsonb);
  v_org_id uuid := public.kalam_try_uuid(v_row->>'org_id');
  v_note_id text := nullif(v_row->>'id', '');
  v_author_id uuid := public.kalam_try_uuid(v_row->>'author_id');
  v_channel_type text := lower(trim(coalesce(v_row->>'channel_type', '')));
  v_group_id uuid;
  v_group_users uuid[] := '{}'::uuid[];
  v_group_roles uuid[] := '{}'::uuid[];
  v_target_users uuid[] := '{}'::uuid[];
  v_target_roles uuid[] := '{}'::uuid[];
  v_note_source text;
  v_category text;
  v_conversation_key text;
  v_is_system boolean := false;
  v_is_org_wide boolean := false;
begin
  if v_org_id is null or v_note_id is null or v_channel_type = 'sms' then
    return new;
  end if;

  v_note_source := lower(trim(coalesce(
    nullif(v_row->>'source_type', ''),
    nullif(v_metadata->>'source_type', ''),
    'user'
  )));
  v_is_system := v_note_source in ('system', 'ai', 'assistant')
    or v_metadata ?| array[
      'workflow_id', 'automation_rule_id', 'process_automation_rule_id',
      'workflow_action_type', 'scheduled_report_id'
    ];
  v_group_id := public.kalam_try_uuid(v_metadata->>'chat_group_id');
  v_category := case
    when v_group_id is not null then 'group'
    when v_note_source in ('ai', 'assistant') then 'assistant'
    when v_is_system then 'system'
    else 'internal'
  end;

  if v_group_id is not null then
    select coalesce(group_row.user_ids, '{}'::uuid[]), coalesce(group_row.role_ids, '{}'::uuid[])
    into v_group_users, v_group_roles
    from public.chat_groups group_row
    where group_row.id = v_group_id
      and group_row.org_id = v_org_id
    limit 1;
  end if;

  v_target_users := public.kalam_distinct_uuid_array(
    public.kalam_jsonb_uuid_array(v_row->'mention_user_ids')
    || coalesce(v_group_users, '{}'::uuid[])
    || case
      when not v_is_system and v_author_id is not null then array[v_author_id]
      else '{}'::uuid[]
    end
  );
  v_target_roles := public.kalam_distinct_uuid_array(
    public.kalam_jsonb_uuid_array(v_row->'mention_role_ids') || coalesce(v_group_roles, '{}'::uuid[])
  );
  v_is_org_wide := not v_is_system and (
    lower(trim(coalesce(v_metadata->>'is_org_wide', 'false'))) in ('true', '1', 'yes')
    or lower(trim(coalesce(v_metadata->>'org_wide', 'false'))) in ('true', '1', 'yes')
  );

  v_conversation_key := case
    when v_group_id is not null then 'group:' || v_group_id::text
    when v_is_system then 'system'
    when lower(trim(coalesce(v_metadata->>'saved_message', 'false'))) in ('true', '1', 'yes') then 'mine'
    when nullif(trim(v_metadata->>'conversation_key'), '') is not null then trim(v_metadata->>'conversation_key')
    when v_author_id is not null and cardinality(public.kalam_jsonb_uuid_array(v_row->'mention_user_ids')) = 1
      then public.kalam_direct_conversation_key(v_author_id, (public.kalam_jsonb_uuid_array(v_row->'mention_user_ids'))[1])
    when v_author_id is not null then 'mine'
    else null
  end;

  perform public.kalam_upsert_notification_item(
    v_org_id, 'note', v_note_id, 'notes', v_category, lower(tg_op),
    case when v_category = 'assistant' then 'پیام هوش مصنوعی' when v_category = 'system' then 'پیام سیستم' else 'پیام داخلی' end,
    nullif(left(coalesce(v_row->>'content', ''), 240), ''),
    nullif(v_row->>'module_id', ''), nullif(v_row->>'record_id', ''),
    v_target_users, v_target_roles, v_is_org_wide,
    jsonb_build_object(
      'note_source', v_note_source,
      'chat_group_id', v_group_id,
      'reply_to', nullif(v_row->>'reply_to', ''),
      'conversation_key', v_conversation_key
    ),
    coalesce(nullif(v_row->>'updated_at', '')::timestamptz, nullif(v_row->>'created_at', '')::timestamptz, now())
  );
  return new;
end;
$$;

-- Repair the rows produced by the previous trigger without touching notes.
update public.notification_inbox_items inbox
set target_user_ids = coalesce(note.mention_user_ids, '{}'::uuid[]),
    target_role_ids = coalesce(note.mention_role_ids, '{}'::uuid[]),
    is_org_wide = false,
    category = case when lower(trim(coalesce(note.source_type, note.metadata->>'source_type', ''))) in ('ai', 'assistant') then 'assistant' else 'system' end,
    conversation_key = 'system',
    payload = coalesce(inbox.payload, '{}'::jsonb) || jsonb_build_object('conversation_key', 'system'),
    updated_at = now()
from public.notes note
where note.org_id = inbox.org_id
  and note.id::text = inbox.source_id
  and inbox.section = 'notes'
  and inbox.source_type = 'note'
  and public.kalam_try_uuid(note.metadata->>'chat_group_id') is null
  and (
    lower(trim(coalesce(note.source_type, note.metadata->>'source_type', ''))) in ('system', 'ai', 'assistant')
    or coalesce(note.metadata, '{}'::jsonb) ?| array[
      'workflow_id', 'automation_rule_id', 'process_automation_rule_id',
      'workflow_action_type', 'scheduled_report_id'
    ]
  );

-- The central overlay must apply the same recipient rule before paginating.
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
    from public.profiles p where p.id = auth.uid() and p.org_id = public.current_org_id() limit 1
  ), limits as (
    select least(greatest(coalesce(p_limit, 20), 1), 50) as effective_limit,
      least(greatest(least(greatest(coalesce(p_limit, 20), 1), 50) * 8, 80), 300) as candidate_limit
  ), cursor_value as (
    select nullif(split_part(coalesce(p_before_cursor, ''), '|', 1), '')::timestamptz as before_at,
      nullif(split_part(coalesce(p_before_cursor, ''), '|', 2), '') as before_key
  ), v3_rows as (
    select f.section, f.source_type, f.source_id, f.title, f.body, f.created_at, f.module_id, f.record_id, f.conversation_key, f.payload
    from me
    cross join lateral public.get_notification_overlay_feed_v3(p_before_cursor, (select candidate_limit from limits)) f
    where not (
      f.section = 'notes'
      and (
        coalesce(f.conversation_key, '') = 'system'
        or lower(trim(coalesce(f.payload->>'category', ''))) in ('system', 'assistant')
      )
    )
    or exists (
      select 1
      from public.notification_inbox_items inbox
      where inbox.org_id = me.org_id
        and inbox.section = 'notes'
        and inbox.source_type = 'note'
        and inbox.source_id = f.source_id
        and (
          me.user_id = any(coalesce(inbox.target_user_ids, '{}'::uuid[]))
          or (me.role_id is not null and me.role_id = any(coalesce(inbox.target_role_ids, '{}'::uuid[])))
        )
    )
  ), note_candidates as (
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
      and ((nii.id is not null and (nii.is_org_wide = true or me.user_id = any(coalesce(nii.target_user_ids, '{}'::uuid[]))
          or (me.role_id is not null and me.role_id = any(coalesce(nii.target_role_ids, '{}'::uuid[])))))
        or me.user_id = any(coalesce(n.mention_user_ids, '{}'::uuid[]))
        or (me.role_id is not null and me.role_id = any(coalesce(n.mention_role_ids, '{}'::uuid[])))
        or (cg.id is not null and (me.user_id = any(coalesce(cg.user_ids, '{}'::uuid[]))
          or (me.role_id is not null and me.role_id = any(coalesce(cg.role_ids, '{}'::uuid[]))))))
    order by n.id, coalesce(nii.last_event_at, n.created_at) desc
    limit (select candidate_limit from limits)
  ), extra_note_rows as (
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
  ), bot_candidates as (
    select m.id, m.bot_group_id, m.content_text, m.file_url, m.file_name, m.mime_type, m.message_type,
      m.payload as message_payload, m.created_at, g.group_title, g.metadata as group_metadata,
      c.business_name as customer_business_name, c.full_name as customer_full_name, c.image_url as customer_image_url,
      s.business_name as supplier_business_name, s.full_name as supplier_full_name, s.image_url as supplier_image_url
    from me cross join limits cross join cursor_value cur
    join public.counterparty_bot_messages m on m.org_id = me.org_id and m.direction = 'inbound'
    join public.counterparty_bot_groups g on g.org_id = me.org_id and g.id = m.bot_group_id and public.kalam_can_access_bot_group(g.id, g.org_id)
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
    order by m.created_at desc, m.id desc limit (select candidate_limit from limits)
  ), extra_bot_rows as (
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
        'attachment_previews', (case when jsonb_typeof(coalesce(bc.message_payload, '{}'::jsonb)->'attachments') = 'array' then coalesce(bc.message_payload, '{}'::jsonb)->'attachments' else '[]'::jsonb end)
          || case when nullif(trim(coalesce(bc.file_url, '')), '') is not null then jsonb_build_array(jsonb_build_object('name', coalesce(nullif(trim(bc.file_name), ''), 'فایل'), 'url', nullif(trim(bc.file_url), ''), 'mime_type', nullif(trim(coalesce(bc.mime_type, '')), ''), 'file_type', nullif(trim(coalesce(bc.message_type, '')), ''))) else '[]'::jsonb end) as payload
    from bot_candidates bc
  ), all_rows as (
    select * from v3_rows union all select * from extra_note_rows union all select * from extra_bot_rows
  ), deduped as (
    select distinct on (section, source_type, source_id) * from all_rows
    order by section, source_type, source_id, created_at desc nulls last
  ), ranked_rows as (
    select d.*, concat_ws(':', d.section, d.source_type, d.source_id) as cursor_key,
      row_number() over (order by d.created_at desc nulls last, concat_ws(':', d.section, d.source_type, d.source_id) desc) as rn,
      count(*) over () as total_count
    from deduped d where d.created_at is not null
  )
  select r.section, r.source_type, r.source_id, r.title, r.body, r.created_at, r.module_id, r.record_id,
    r.conversation_key, r.payload, r.created_at::text || '|' || r.cursor_key as feed_cursor,
    r.total_count > limits.effective_limit as has_more
  from ranked_rows r cross join limits where r.rn <= limits.effective_limit
  order by r.created_at desc nulls last, r.cursor_key desc;
$$;

grant execute on function public.get_notification_overlay_feed_v4(text, integer) to authenticated;
revoke all on function public.get_notification_overlay_feed_v4(text, integer) from public, anon;
revoke all on function public.kalam_notes_notification_trigger() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
