-- System notes are private to explicit user/role recipients, including direct
-- record-note queries. This restrictive guard cannot be bypassed by a broader
-- permissive notes policy or by being the author of an automated message.
begin;

create or replace function public.kalam_system_note_recipient_guard_v1(
  p_note_id uuid, p_org_id uuid, p_source_type text, p_metadata jsonb,
  p_user_ids uuid[], p_role_ids uuid[]
)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
  viewer_org uuid := public.current_org_id();
  viewer_role uuid;
  inbox_category text;
  inbox_users uuid[];
  inbox_roles uuid[];
begin
  if viewer_id is null or viewer_org is null or p_org_id is distinct from viewer_org then return false; end if;
  select profile.role_id into viewer_role from public.profiles profile
    where profile.id = viewer_id and profile.org_id = viewer_org limit 1;
  if not found then return false; end if;
  select inbox.category, inbox.target_user_ids, inbox.target_role_ids
    into inbox_category, inbox_users, inbox_roles
    from public.notification_inbox_items inbox
    where inbox.org_id = viewer_org and inbox.section = 'notes'
      and inbox.source_type = 'note' and inbox.source_id = p_note_id::text
    order by inbox.last_event_at desc, inbox.created_at desc, inbox.id desc limit 1;
  if not public.kalam_internal_message_is_system_v2(p_source_type, p_metadata, inbox_category) then return true; end if;
  return viewer_id = any(coalesce(p_user_ids, '{}'::uuid[]) || coalesce(inbox_users, '{}'::uuid[]))
    or (viewer_role is not null and viewer_role = any(coalesce(p_role_ids, '{}'::uuid[]) || coalesce(inbox_roles, '{}'::uuid[])));
end;
$$;

revoke all on function public.kalam_system_note_recipient_guard_v1(uuid, uuid, text, jsonb, uuid[], uuid[]) from public, anon;
grant execute on function public.kalam_system_note_recipient_guard_v1(uuid, uuid, text, jsonb, uuid[], uuid[]) to authenticated;

alter table public.notes enable row level security;
drop policy if exists p_notes_system_recipient_guard on public.notes;
create policy p_notes_system_recipient_guard on public.notes as restrictive for select to authenticated
using (org_id = public.current_org_id() and public.kalam_system_note_recipient_guard_v1(
  id, org_id, source_type, metadata, mention_user_ids, mention_role_ids
));

create index if not exists idx_notification_inbox_note_recipient_guard
  on public.notification_inbox_items (org_id, source_id, last_event_at desc, created_at desc, id desc)
  where section = 'notes' and source_type = 'note';

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
    return jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0, 'first_unread_id', null, 'has_more_before', false, 'next_before_cursor', null, 'read_model', 'cursor');
  end if;

  select profile.role_id into v_role_id
  from public.profiles profile
  where profile.id = v_user_id and profile.org_id = v_org_id
  limit 1;
  if not found then
    return jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0, 'first_unread_id', null, 'has_more_before', false, 'next_before_cursor', null, 'read_model', 'cursor');
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
        inbox.target_user_ids, inbox.target_role_ids,
        (
          note.author_id = v_user_id
          or read_state.read_at is not null
          or read_state.dismissed_at is not null
          or (
            cursor_state.read_through_at is not null and (
              note.created_at < cursor_state.read_through_at
              or (note.created_at = cursor_state.read_through_at and note.id::text <= coalesce(cursor_state.read_through_id, note.id::text))
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
      select count(*) filter (where not is_read)::integer as unread_count from visible
    ), windowed as (
      select * from visible
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
      'items', coalesce((
        select jsonb_agg(
          to_jsonb(page) || jsonb_build_object(
            'metadata',
            coalesce(page.metadata, '{}'::jsonb) || jsonb_build_object(
              'read_receipts',
              public.kalam_message_read_receipts_v1(
                v_org_id,
                'internal',
                'system',
                page.author_id,
                page.created_at,
                page.id
              )
            )
          )
          order by page.created_at asc, page.id asc
        )
        from page
      ), '[]'::jsonb),
      'unread_count', coalesce((select unread_count from unread), 0),
      'first_unread_id', (select id::text from page where not is_read order by created_at asc, id asc limit 1),
      'has_more_before', (select count(*) > v_limit from windowed),
      'next_before_cursor', (select public.kalam_cursor_value(created_at, id_text) from earliest),
      'read_model', 'cursor'
    )
  );
end;
$$;
revoke all on function public.get_system_communication_timeline_v1(integer, text) from public, anon;
grant execute on function public.get_system_communication_timeline_v1(integer, text) to authenticated;

notify pgrst, 'reload schema';
commit;
