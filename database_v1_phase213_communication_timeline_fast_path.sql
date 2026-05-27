-- =====================================================
-- KalamApp - Phase 213: Communication timeline fast path
-- Date: 2026-05-27
-- Type: Performance / API / idempotent
-- =====================================================

begin;

create index if not exists idx_notes_org_author_created_id
  on public.notes(org_id, author_id, created_at desc, id desc);

create index if not exists idx_notes_saved_messages_timeline
  on public.notes(org_id, author_id, created_at desc, id desc)
  where lower(trim(coalesce(metadata->>'saved_message', 'false'))) in ('true', '1', 'yes');

create index if not exists idx_notification_read_states_communication_lookup
  on public.notification_read_states(org_id, user_id, section, source_type, source_id);

create index if not exists idx_communication_read_cursors_lookup
  on public.communication_read_cursors(org_id, user_id, channel, conversation_key);

create index if not exists idx_notification_inbox_system_timeline_fast
  on public.notification_inbox_items(org_id, section, source_type, conversation_key, created_at desc, source_id)
  where section = 'notes'
    and source_type = 'note'
    and (
      conversation_key = 'system'
      or category in ('system', 'assistant')
    );

create or replace function public.get_communication_timeline(
  p_channel text,
  p_conversation_key text,
  p_before_cursor text default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid := public.current_org_id();
  v_role_id uuid := null;
  v_key text := nullif(trim(coalesce(p_conversation_key, '')), '');
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_before_ts timestamptz := null;
  v_before_id text := null;
  v_bot_group_id uuid := null;
begin
  if v_user_id is null or v_org_id is null or v_key is null then
    return jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0, 'first_unread_id', null, 'has_more_before', false, 'next_before_cursor', null, 'read_model', 'cursor');
  end if;

  select p.role_id into v_role_id
  from public.profiles p
  where p.id = v_user_id
    and p.org_id = v_org_id
  limit 1;

  if nullif(trim(coalesce(p_before_cursor, '')), '') is not null then
    v_before_ts := nullif(split_part(p_before_cursor, '|', 1), '')::timestamptz;
    v_before_id := nullif(split_part(p_before_cursor, '|', 2), '');
  end if;

  if p_channel = 'internal' and v_key = 'mine' then
    return (
      with page_desc as (
        select
          n.id, n.module_id, n.record_id, n.content,
          n.author_id, n.author_name, n.mention_user_ids, n.mention_role_ids,
          n.created_at, n.reply_to, n.source_type, n.metadata, n.is_edited, n.edited_at
        from public.notes n
        where n.org_id = v_org_id
          and n.author_id = v_user_id
          and nullif(trim(coalesce(n.metadata->>'chat_group_id', '')), '') is null
          and lower(trim(coalesce(n.metadata->>'saved_message', 'false'))) in ('true', '1', 'yes')
          and lower(trim(coalesce(n.source_type, n.metadata->>'source_type', ''))) not in ('system', 'ai')
          and not (coalesce(n.metadata, '{}'::jsonb) ?| array['workflow_id', 'automation_rule_id', 'process_automation_rule_id'])
          and (
            v_before_ts is null
            or n.created_at < v_before_ts
            or (n.created_at = v_before_ts and n.id::text < coalesce(v_before_id, ''))
          )
        order by n.created_at desc, n.id desc
        limit v_limit
      ),
      page as (select * from page_desc order by created_at asc, id asc),
      earliest as (select created_at, id::text as id_text from page order by created_at asc, id asc limit 1)
      select jsonb_build_object(
        'items', coalesce((select jsonb_agg(to_jsonb(page) order by page.created_at asc, page.id asc) from page), '[]'::jsonb),
        'unread_count', 0,
        'first_unread_id', null,
        'has_more_before', exists(
          select 1
          from public.notes n, earliest
          where n.org_id = v_org_id
            and n.author_id = v_user_id
            and nullif(trim(coalesce(n.metadata->>'chat_group_id', '')), '') is null
            and lower(trim(coalesce(n.metadata->>'saved_message', 'false'))) in ('true', '1', 'yes')
            and lower(trim(coalesce(n.source_type, n.metadata->>'source_type', ''))) not in ('system', 'ai')
            and not (coalesce(n.metadata, '{}'::jsonb) ?| array['workflow_id', 'automation_rule_id', 'process_automation_rule_id'])
            and (
              n.created_at < earliest.created_at
              or (n.created_at = earliest.created_at and n.id::text < earliest.id_text)
            )
        ),
        'next_before_cursor', (select public.kalam_cursor_value(created_at, id_text) from earliest),
        'read_model', 'cursor'
      )
    );
  end if;

  if p_channel = 'internal' and v_key = 'system' then
    return (
      with visible as (
        select
          n.id, n.module_id, n.record_id, n.content,
          n.author_id, n.author_name, n.mention_user_ids, n.mention_role_ids,
          n.created_at, n.reply_to, n.source_type, n.metadata, n.is_edited, n.edited_at,
          (n.author_id = v_user_id or rs.read_at is not null or rs.dismissed_at is not null) as is_read
        from public.notification_inbox_items nii
        join public.notes n on n.id::text = nii.source_id and n.org_id = nii.org_id
        left join public.notification_read_states rs
          on rs.org_id = v_org_id and rs.user_id = v_user_id
         and rs.section = 'notes' and rs.source_type = 'note' and rs.source_id = nii.source_id
        where nii.org_id = v_org_id
          and nii.section = 'notes'
          and nii.source_type = 'note'
          and (
            nii.conversation_key = 'system'
            or lower(trim(coalesce(nii.category, ''))) in ('system', 'assistant')
            or public.kalam_note_conversation_key(
              n.org_id, n.id, n.author_id, coalesce(n.mention_user_ids, '{}'::uuid[]),
              coalesce(n.source_type, n.metadata->>'source_type'), coalesce(n.metadata, '{}'::jsonb), n.reply_to
            ) = 'system'
          )
          and (
            nii.is_org_wide = true
            or v_user_id = any(nii.target_user_ids)
            or (v_role_id is not null and v_role_id = any(nii.target_role_ids))
          )
      ),
      page_desc as (
        select *
        from visible
        where v_before_ts is null
           or created_at < v_before_ts
           or (created_at = v_before_ts and id::text < coalesce(v_before_id, ''))
        order by created_at desc, id desc
        limit v_limit
      ),
      page as (select * from page_desc order by created_at asc, id asc),
      earliest as (select created_at, id::text as id_text from page order by created_at asc, id asc limit 1)
      select jsonb_build_object(
        'items', coalesce((select jsonb_agg(to_jsonb(page) order by page.created_at asc, page.id asc) from page), '[]'::jsonb),
        'unread_count', (select count(*)::integer from visible where not is_read),
        'first_unread_id', (select id::text from page where not is_read order by created_at asc, id asc limit 1),
        'has_more_before', exists(
          select 1 from visible, earliest
          where visible.created_at < earliest.created_at
             or (visible.created_at = earliest.created_at and visible.id::text < earliest.id_text)
        ),
        'next_before_cursor', (select public.kalam_cursor_value(created_at, id_text) from earliest),
        'read_model', 'item'
      )
    );
  end if;

  if p_channel = 'internal' then
    return (
      with cursor_state as (
        select read_through_at, read_through_id
        from public.communication_read_cursors
        where org_id = v_org_id
          and user_id = v_user_id
          and channel = 'internal'
          and conversation_key = v_key
      ),
      page_desc as (
        select
          n.id, n.module_id, n.record_id, n.content,
          n.author_id, n.author_name, n.mention_user_ids, n.mention_role_ids,
          n.created_at, n.reply_to, n.source_type,
          coalesce(n.metadata, '{}'::jsonb) || jsonb_build_object(
            'read_receipts',
            coalesce((
              select jsonb_object_agg(
                reader.user_id::text,
                jsonb_build_object(
                  'user_id', reader.user_id::text,
                  'user_name', coalesce(nullif(trim(reader_profile.display_name), ''), nullif(trim(reader_profile.full_name), ''), 'کاربر'),
                  'read_at', reader.updated_at
                )
              )
              from public.communication_read_cursors reader
              left join public.profiles reader_profile on reader_profile.id = reader.user_id
              where reader.org_id = v_org_id
                and reader.channel = 'internal'
                and reader.conversation_key = v_key
                and (n.author_id is null or reader.user_id <> n.author_id)
                and reader.read_through_at is not null
                and (
                  n.created_at < reader.read_through_at
                  or (n.created_at = reader.read_through_at and n.id::text <= coalesce(reader.read_through_id, n.id::text))
                )
            ), '{}'::jsonb)
          ) as metadata,
          n.is_edited, n.edited_at,
          (
            n.author_id = v_user_id
            or rs.read_at is not null
            or rs.dismissed_at is not null
            or (
              crc.read_through_at is not null
              and (
                n.created_at < crc.read_through_at
                or (n.created_at = crc.read_through_at and n.id::text <= coalesce(crc.read_through_id, n.id::text))
              )
            )
          ) as is_read
        from public.notification_inbox_items nii
        join public.notes n on n.id::text = nii.source_id and n.org_id = nii.org_id
        left join public.notification_read_states rs
          on rs.org_id = v_org_id and rs.user_id = v_user_id
         and rs.section = 'notes' and rs.source_type = 'note' and rs.source_id = nii.source_id
        left join cursor_state crc on true
        where nii.org_id = v_org_id
          and nii.section = 'notes'
          and nii.source_type = 'note'
          and lower(trim(coalesce(nii.category, ''))) not in ('system', 'assistant')
          and coalesce(
            nii.conversation_key,
            nullif(trim(nii.payload->>'conversation_key'), ''),
            public.kalam_note_conversation_key(
              n.org_id, n.id, n.author_id, coalesce(n.mention_user_ids, '{}'::uuid[]),
              coalesce(n.source_type, n.metadata->>'source_type'), coalesce(n.metadata, '{}'::jsonb), n.reply_to
            )
          ) = v_key
          and (
            nii.is_org_wide = true
            or v_user_id = any(nii.target_user_ids)
            or (v_role_id is not null and v_role_id = any(nii.target_role_ids))
          )
          and (
            v_before_ts is null
            or n.created_at < v_before_ts
            or (n.created_at = v_before_ts and n.id::text < coalesce(v_before_id, ''))
          )
        order by n.created_at desc, n.id desc
        limit v_limit
      ),
      page as (select * from page_desc order by created_at asc, id asc),
      earliest as (select created_at, id::text as id_text from page order by created_at asc, id asc limit 1),
      unread_stats as (
        select count(*)::integer as unread_count
        from public.notification_inbox_items nii
        join public.notes n on n.id::text = nii.source_id and n.org_id = nii.org_id
        left join public.notification_read_states rs
          on rs.org_id = v_org_id and rs.user_id = v_user_id
         and rs.section = 'notes' and rs.source_type = 'note' and rs.source_id = nii.source_id
        left join cursor_state crc on true
        where nii.org_id = v_org_id
          and nii.section = 'notes'
          and nii.source_type = 'note'
          and lower(trim(coalesce(nii.category, ''))) not in ('system', 'assistant')
          and coalesce(
            nii.conversation_key,
            nullif(trim(nii.payload->>'conversation_key'), ''),
            public.kalam_note_conversation_key(
              n.org_id, n.id, n.author_id, coalesce(n.mention_user_ids, '{}'::uuid[]),
              coalesce(n.source_type, n.metadata->>'source_type'), coalesce(n.metadata, '{}'::jsonb), n.reply_to
            )
          ) = v_key
          and (
            nii.is_org_wide = true
            or v_user_id = any(nii.target_user_ids)
            or (v_role_id is not null and v_role_id = any(nii.target_role_ids))
          )
          and n.author_id <> v_user_id
          and rs.read_at is null
          and rs.dismissed_at is null
          and (
            crc.read_through_at is null
            or n.created_at > crc.read_through_at
            or (n.created_at = crc.read_through_at and n.id::text > coalesce(crc.read_through_id, ''))
          )
      )
      select jsonb_build_object(
        'items', coalesce((select jsonb_agg(to_jsonb(page) order by page.created_at asc, page.id asc) from page), '[]'::jsonb),
        'unread_count', coalesce((select unread_count from unread_stats), 0),
        'first_unread_id', (select id::text from page where not is_read order by created_at asc, id asc limit 1),
        'has_more_before', exists(
          select 1
          from public.notification_inbox_items nii
          join public.notes n on n.id::text = nii.source_id and n.org_id = nii.org_id
          join earliest on true
          where nii.org_id = v_org_id
            and nii.section = 'notes'
            and nii.source_type = 'note'
            and lower(trim(coalesce(nii.category, ''))) not in ('system', 'assistant')
            and coalesce(
              nii.conversation_key,
              nullif(trim(nii.payload->>'conversation_key'), ''),
              public.kalam_note_conversation_key(
                n.org_id, n.id, n.author_id, coalesce(n.mention_user_ids, '{}'::uuid[]),
                coalesce(n.source_type, n.metadata->>'source_type'), coalesce(n.metadata, '{}'::jsonb), n.reply_to
              )
            ) = v_key
            and (
              nii.is_org_wide = true
              or v_user_id = any(nii.target_user_ids)
              or (v_role_id is not null and v_role_id = any(nii.target_role_ids))
            )
            and (
              n.created_at < earliest.created_at
              or (n.created_at = earliest.created_at and n.id::text < earliest.id_text)
            )
        ),
        'next_before_cursor', (select public.kalam_cursor_value(created_at, id_text) from earliest),
        'read_model', 'cursor'
      )
    );
  end if;

  if p_channel = 'bot' then
    v_bot_group_id := public.kalam_try_uuid(replace(v_key, 'bot:', ''));
    if v_bot_group_id is null or not public.kalam_can_access_bot_group(v_bot_group_id, v_org_id) then
      return jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0, 'first_unread_id', null, 'has_more_before', false, 'next_before_cursor', null, 'read_model', 'cursor');
    end if;

    return (
      with cursor_state as (
        select read_through_at, read_through_id
        from public.communication_read_cursors
        where org_id = v_org_id
          and user_id = v_user_id
          and channel = 'bot'
          and conversation_key = v_key
      ),
      page_desc as (
        select
          m.id, m.bot_group_id, m.direction, m.message_type, m.chat_id,
          m.provider_message_id, m.content_text, m.file_url, m.file_name, m.mime_type,
          m.payload, m.created_by, m.created_at,
          (
            m.direction <> 'inbound'
            or rs.read_at is not null
            or rs.dismissed_at is not null
            or (
              crc.read_through_at is not null
              and (
                m.created_at < crc.read_through_at
                or (m.created_at = crc.read_through_at and m.id::text <= coalesce(crc.read_through_id, m.id::text))
              )
            )
          ) as is_read
        from public.counterparty_bot_messages m
        left join public.notification_read_states rs
          on rs.org_id = v_org_id and rs.user_id = v_user_id
         and rs.section = 'bot_messages' and rs.source_type = 'counterparty_bot_message' and rs.source_id = m.id::text
        left join cursor_state crc on true
        where m.org_id = v_org_id
          and m.bot_group_id = v_bot_group_id
          and (
            v_before_ts is null
            or m.created_at < v_before_ts
            or (m.created_at = v_before_ts and m.id::text < coalesce(v_before_id, ''))
          )
        order by m.created_at desc, m.id desc
        limit v_limit
      ),
      page as (select * from page_desc order by created_at asc, id asc),
      earliest as (select created_at, id::text as id_text from page order by created_at asc, id asc limit 1),
      unread_stats as (
        select count(*)::integer as unread_count
        from public.counterparty_bot_messages m
        left join public.notification_read_states rs
          on rs.org_id = v_org_id and rs.user_id = v_user_id
         and rs.section = 'bot_messages' and rs.source_type = 'counterparty_bot_message' and rs.source_id = m.id::text
        left join cursor_state crc on true
        where m.org_id = v_org_id
          and m.bot_group_id = v_bot_group_id
          and m.direction = 'inbound'
          and rs.read_at is null
          and rs.dismissed_at is null
          and (
            crc.read_through_at is null
            or m.created_at > crc.read_through_at
            or (m.created_at = crc.read_through_at and m.id::text > coalesce(crc.read_through_id, ''))
          )
      )
      select jsonb_build_object(
        'items', coalesce((select jsonb_agg(to_jsonb(page) order by page.created_at asc, page.id asc) from page), '[]'::jsonb),
        'unread_count', coalesce((select unread_count from unread_stats), 0),
        'first_unread_id', (select id::text from page where not is_read order by created_at asc, id asc limit 1),
        'has_more_before', exists(
          select 1
          from public.counterparty_bot_messages m, earliest
          where m.org_id = v_org_id
            and m.bot_group_id = v_bot_group_id
            and (
              m.created_at < earliest.created_at
              or (m.created_at = earliest.created_at and m.id::text < earliest.id_text)
            )
        ),
        'next_before_cursor', (select public.kalam_cursor_value(created_at, id_text) from earliest),
        'read_model', 'cursor'
      )
    );
  end if;

  return jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0, 'first_unread_id', null, 'has_more_before', false, 'next_before_cursor', null, 'read_model', 'cursor');
end;
$$;

grant execute on function public.get_communication_timeline(text, text, text, integer) to authenticated;
revoke all on function public.get_communication_timeline(text, text, text, integer) from public, anon;

notify pgrst, 'reload schema';

commit;
