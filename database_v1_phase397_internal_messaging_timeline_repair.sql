-- TazeSystem - Phase 397: reliable, tenant-scoped internal message timelines
-- Repairs production drift where the conversation summary could contain a
-- direct conversation while its timeline RPC returned an empty response.

begin;

create index if not exists idx_notification_inbox_internal_timeline_v2
  on public.notification_inbox_items (org_id, conversation_key, created_at desc, source_id)
  where section = 'notes'
    and source_type = 'note';

create or replace function public.get_internal_conversation_timeline_v2(
  p_conversation_key text,
  p_limit integer default 20,
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
  v_key text := nullif(trim(coalesce(p_conversation_key, '')), '');
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_before_ts timestamptz := null;
  v_before_id text := null;
begin
  if v_user_id is null or v_org_id is null or v_key is null then
    return jsonb_build_object(
      'items', '[]'::jsonb,
      'unread_count', 0,
      'first_unread_id', null,
      'has_more_before', false,
      'next_before_cursor', null,
      'read_model', 'cursor'
    );
  end if;

  select p.role_id
    into v_role_id
  from public.profiles p
  where p.id = v_user_id
    and p.org_id = v_org_id
  limit 1;

  if nullif(trim(coalesce(p_before_cursor, '')), '') is not null then
    v_before_ts := nullif(split_part(p_before_cursor, '|', 1), '')::timestamptz;
    v_before_id := nullif(split_part(p_before_cursor, '|', 2), '');
  end if;

  return (
    with inbox_rows as materialized (
      select nii.*
      from public.notification_inbox_items nii
      where nii.org_id = v_org_id
        and nii.section = 'notes'
        and nii.source_type = 'note'
        and nii.conversation_key = v_key
        and (
          (v_key = 'system' and lower(trim(coalesce(nii.category, ''))) in ('system', 'assistant'))
          or (v_key <> 'system' and lower(trim(coalesce(nii.category, ''))) not in ('system', 'assistant'))
        )

      union all

      select nii.*
      from public.notification_inbox_items nii
      join public.notes legacy_note
        on legacy_note.id::text = nii.source_id
       and legacy_note.org_id = nii.org_id
      where nii.org_id = v_org_id
        and nii.section = 'notes'
        and nii.source_type = 'note'
        and nii.conversation_key is distinct from v_key
        and (
          (v_key = 'system' and lower(trim(coalesce(nii.category, ''))) in ('system', 'assistant'))
          or (v_key <> 'system' and lower(trim(coalesce(nii.category, ''))) not in ('system', 'assistant'))
        )
        and coalesce(
          nullif(trim(nii.payload->>'conversation_key'), ''),
          public.kalam_note_conversation_key(
            legacy_note.org_id,
            legacy_note.id,
            legacy_note.author_id,
            coalesce(legacy_note.mention_user_ids, '{}'::uuid[]),
            coalesce(legacy_note.source_type, legacy_note.metadata->>'source_type'),
            coalesce(legacy_note.metadata, '{}'::jsonb),
            legacy_note.reply_to
          )
        ) = v_key
    ),
    visible as materialized (
      select
        n.id,
        n.module_id,
        n.record_id,
        n.content,
        n.author_id,
        n.author_name,
        n.mention_user_ids,
        n.mention_role_ids,
        n.created_at,
        n.reply_to,
        n.source_type,
        n.metadata,
        n.is_edited,
        n.edited_at,
        (
          n.author_id = v_user_id
          or rs.read_at is not null
          or rs.dismissed_at is not null
          or (
            cursor_state.read_through_at is not null
            and (
              n.created_at < cursor_state.read_through_at
              or (
                n.created_at = cursor_state.read_through_at
                and n.id::text <= coalesce(cursor_state.read_through_id, n.id::text)
              )
            )
          )
        ) as is_read
      from inbox_rows nii
      join public.notes n
        on n.id::text = nii.source_id
       and n.org_id = v_org_id
      left join public.notification_read_states rs
        on rs.org_id = v_org_id
       and rs.user_id = v_user_id
       and rs.section = 'notes'
       and rs.source_type = 'note'
       and rs.source_id = nii.source_id
      left join public.communication_read_cursors cursor_state
        on cursor_state.org_id = v_org_id
       and cursor_state.user_id = v_user_id
       and cursor_state.channel = 'internal'
       and cursor_state.conversation_key = v_key
      where (
        nii.is_org_wide = true
        or v_user_id = any(nii.target_user_ids)
        or (v_role_id is not null and v_role_id = any(nii.target_role_ids))
      )
    ),
    unread as (
      select count(*) filter (where not is_read)::integer as unread_count
      from visible
    ),
    windowed as (
      select *
      from visible
      where v_before_ts is null
         or created_at < v_before_ts
         or (created_at = v_before_ts and id::text < coalesce(v_before_id, ''))
      order by created_at desc, id desc
      limit v_limit + 1
    ),
    page_desc as (
      select *
      from windowed
      order by created_at desc, id desc
      limit v_limit
    ),
    page as (
      select *
      from page_desc
      order by created_at asc, id asc
    ),
    earliest as (
      select created_at, id::text as id_text
      from page
      order by created_at asc, id asc
      limit 1
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

grant execute on function public.get_internal_conversation_timeline_v2(text, integer, text) to authenticated;
revoke all on function public.get_internal_conversation_timeline_v2(text, integer, text) from public, anon;

notify pgrst, 'reload schema';

commit;
