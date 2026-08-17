-- TazeSystem - Phase 456: Messaging V2 timeline, system inbox and unread repair
-- Date: 2026-08-18
-- Type: Reliability / security / idempotent
--
-- پیام‌های سیستم در برخی داده‌های قدیمی inbox کامل نداشتند. این migration
-- صفحهٔ سیستم را از note اصلی و با همان محدودهٔ گیرندهٔ سخت‌گیرانه می‌خواند؛
-- بنابراین نبود یا کهنگی inbox هرگز باعث نمایش به فرد غیرمجاز نمی‌شود.

begin;

create index if not exists idx_notes_system_timeline_v1
  on public.notes (org_id, created_at desc, id desc)
  where source_type in ('system', 'ai', 'assistant');

create or replace function public.get_system_communication_timeline_v1(
  p_limit integer default 40,
  p_before_cursor text default null
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
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 50);
  v_before_ts timestamptz := null;
  v_before_id text := null;
begin
  if v_user_id is null or v_org_id is null then
    return jsonb_build_object(
      'items', '[]'::jsonb, 'unread_count', 0, 'first_unread_id', null,
      'has_more_before', false, 'next_before_cursor', null, 'read_model', 'cursor'
    );
  end if;

  select profile.role_id into v_role_id
  from public.profiles profile
  where profile.id = v_user_id and profile.org_id = v_org_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'items', '[]'::jsonb, 'unread_count', 0, 'first_unread_id', null,
      'has_more_before', false, 'next_before_cursor', null, 'read_model', 'cursor'
    );
  end if;

  if nullif(trim(coalesce(p_before_cursor, '')), '') is not null then
    v_before_ts := nullif(split_part(p_before_cursor, '|', 1), '')::timestamptz;
    v_before_id := nullif(split_part(p_before_cursor, '|', 2), '');
  end if;

  return (
    with visible as materialized (
      select
        note.id, note.module_id, note.record_id, note.content, note.author_id, note.author_name,
        note.mention_user_ids, note.mention_role_ids, note.created_at, note.reply_to, note.source_type,
        note.metadata, note.is_edited, note.edited_at,
        (
          note.author_id = v_user_id
          or read_state.read_at is not null
          or read_state.dismissed_at is not null
          or (
            cursor_state.read_through_at is not null and (
              note.created_at < cursor_state.read_through_at
              or (
                note.created_at = cursor_state.read_through_at
                and note.id::text <= coalesce(cursor_state.read_through_id, note.id::text)
              )
            )
          )
        ) as is_read
      from public.notes note
      left join lateral (
        select inbox.category, inbox.target_user_ids, inbox.target_role_ids
        from public.notification_inbox_items inbox
        where inbox.org_id = v_org_id
          and inbox.section = 'notes'
          and inbox.source_type = 'note'
          and inbox.source_id = note.id::text
        order by inbox.last_event_at desc, inbox.created_at desc, inbox.id desc
        limit 1
      ) inbox on true
      left join public.notification_read_states read_state
        on read_state.org_id = v_org_id
       and read_state.user_id = v_user_id
       and read_state.section = 'notes'
       and read_state.source_type = 'note'
       and read_state.source_id = note.id::text
      left join public.communication_read_cursors cursor_state
        on cursor_state.org_id = v_org_id
       and cursor_state.user_id = v_user_id
       and cursor_state.channel = 'internal'
       and cursor_state.conversation_key = 'system'
      where note.org_id = v_org_id
        and public.kalam_internal_message_is_system_v2(note.source_type, note.metadata, inbox.category)
        and public.kalam_can_access_internal_message_v2(
          false,
          coalesce(inbox.target_user_ids, '{}'::uuid[]),
          coalesce(inbox.target_role_ids, '{}'::uuid[]),
          note.author_id,
          note.mention_user_ids,
          note.mention_role_ids,
          note.source_type,
          note.metadata,
          coalesce(inbox.category, 'system'),
          v_user_id,
          v_role_id
        )
    ), unread as (
      select count(*) filter (where not is_read)::integer as unread_count
      from visible
    ), windowed as (
      select *
      from visible
      where v_before_ts is null
         or created_at < v_before_ts
         or (created_at = v_before_ts and id::text < coalesce(v_before_id, ''))
      order by created_at desc, id desc
      limit v_limit + 1
    ), page_desc as (
      select * from windowed order by created_at desc, id desc limit v_limit
    ), page as (
      select * from page_desc order by created_at asc, id asc
    ), earliest as (
      select created_at, id::text as id_text from page order by created_at asc, id asc limit 1
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(to_jsonb(page) order by page.created_at asc, page.id asc) from page), '[]'::jsonb),
      'unread_count', coalesce((select unread_count from unread), 0),
      'first_unread_id', (select id::text from page where not is_read order by created_at asc, id asc limit 1),
      'has_more_before', (select count(*) > v_limit from windowed),
      'next_before_cursor', (select public.kalam_cursor_value(created_at, id_text) from earliest),
      'read_model', 'cursor'
    )
  );
end;
$$;

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
    where profile.id = auth.uid() and profile.org_id = public.current_org_id()
    limit 1
  )
  select count(*) filter (
    where note.author_id is distinct from me.user_id
      and read_state.read_at is null
      and read_state.dismissed_at is null
      and (
        cursor_state.read_through_at is null
        or note.created_at > cursor_state.read_through_at
        or (
          note.created_at = cursor_state.read_through_at
          and note.id::text > coalesce(cursor_state.read_through_id, '')
        )
      )
  )::integer
  from me
  join public.notes note on note.org_id = me.org_id
  left join lateral (
    select inbox.category, inbox.target_user_ids, inbox.target_role_ids
    from public.notification_inbox_items inbox
    where inbox.org_id = me.org_id
      and inbox.section = 'notes'
      and inbox.source_type = 'note'
      and inbox.source_id = note.id::text
    order by inbox.last_event_at desc, inbox.created_at desc, inbox.id desc
    limit 1
  ) inbox on true
  left join public.notification_read_states read_state
    on read_state.org_id = me.org_id
   and read_state.user_id = me.user_id
   and read_state.section = 'notes'
   and read_state.source_type = 'note'
   and read_state.source_id = note.id::text
  left join public.communication_read_cursors cursor_state
    on cursor_state.org_id = me.org_id
   and cursor_state.user_id = me.user_id
   and cursor_state.channel = 'internal'
   and cursor_state.conversation_key = 'system'
  where public.kalam_internal_message_is_system_v2(note.source_type, note.metadata, inbox.category)
    and public.kalam_can_access_internal_message_v2(
      false,
      coalesce(inbox.target_user_ids, '{}'::uuid[]),
      coalesce(inbox.target_role_ids, '{}'::uuid[]),
      note.author_id,
      note.mention_user_ids,
      note.mention_role_ids,
      note.source_type,
      note.metadata,
      coalesce(inbox.category, 'system'),
      me.user_id,
      me.role_id
    );
$$;

create or replace function public.get_notification_unread_summary_v2(
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
  with requested_variant as (
    select lower(trim(coalesce(p_variant, ''))) as value
  ), base_summary as (
    select * from public.get_notification_unread_summary_v1(p_variant)
  ), internal_total as (
    select coalesce(public.get_internal_messaging_unread_total_v2(), 0)::integer as value
  ), system_total as (
    select coalesce(public.get_system_messaging_unread_total_v1(), 0)::integer as value
  ), bot_group_total as (
    select coalesce(max(unread_count) filter (where section = 'bot_messages'), 0)::integer as value
    from base_summary
  ), bot_direct_total as (
    select count(*)::integer as value
    from public.profiles me
    join public.counterparty_bot_direct_threads thread
      on thread.org_id = me.org_id
     and public.kalam_can_access_bot_direct_thread(thread.id, thread.org_id)
    join public.counterparty_bot_direct_messages message
      on message.org_id = me.org_id
     and message.direct_thread_id = thread.id
     and message.direction = 'inbound'
    left join public.notification_read_states read_state
      on read_state.org_id = me.org_id
     and read_state.user_id = me.id
     and read_state.source_type = 'counterparty_bot_direct_message'
     and read_state.source_id = message.id::text
     and read_state.section in ('bot_direct_messages', 'bot_messages')
    left join public.communication_read_cursors cursor_state
      on cursor_state.org_id = me.org_id
     and cursor_state.user_id = me.id
     and cursor_state.channel = 'bot'
     and cursor_state.conversation_key = 'bot:direct:' || coalesce(thread.channel_type, '') || ':' || coalesce(thread.chat_id, '')
    where me.id = auth.uid()
      and me.org_id = public.current_org_id()
      and read_state.read_at is null
      and read_state.dismissed_at is null
      and (
        cursor_state.read_through_at is null
        or message.created_at > cursor_state.read_through_at
        or (message.created_at = cursor_state.read_through_at and message.id::text > coalesce(cursor_state.read_through_id, ''))
      )
  ), patched_summary as (
    select section, unread_count
    from base_summary
    where section not in ('notes', 'bot_messages')
    union all select 'notes'::text, value from internal_total
    union all select 'system_messages'::text, value from system_total
    union all select 'bot_group_messages'::text, value from bot_group_total
    union all select 'bot_direct_messages'::text, value from bot_direct_total
    union all
    select 'bot_messages'::text, (bot_group_total.value + bot_direct_total.value)::integer
    from bot_group_total cross join bot_direct_total
  )
  select patched_summary.section, patched_summary.unread_count
  from patched_summary
  cross join requested_variant
  where requested_variant.value not in ('chat', 'alerts')
     or (requested_variant.value = 'chat' and patched_summary.section in ('notes', 'system_messages', 'bot_messages', 'bot_group_messages', 'bot_direct_messages', 'sms_messages', 'voip_calls'))
     or (requested_variant.value = 'alerts' and patched_summary.section in ('tasks', 'responsibilities'))
  order by case patched_summary.section
    when 'notes' then 1
    when 'system_messages' then 2
    when 'bot_messages' then 3
    when 'bot_group_messages' then 4
    when 'bot_direct_messages' then 5
    when 'sms_messages' then 6
    when 'voip_calls' then 7
    when 'tasks' then 8
    when 'responsibilities' then 9
    else 99
  end;
$$;

grant execute on function public.get_system_communication_timeline_v1(integer, text) to authenticated;
grant execute on function public.get_system_messaging_unread_total_v1() to authenticated;
grant execute on function public.get_notification_unread_summary_v2(text) to authenticated;
revoke all on function public.get_system_communication_timeline_v1(integer, text) from public, anon;
revoke all on function public.get_system_messaging_unread_total_v1() from public, anon;
revoke all on function public.get_notification_unread_summary_v2(text) from public, anon;

notify pgrst, 'reload schema';

commit;
