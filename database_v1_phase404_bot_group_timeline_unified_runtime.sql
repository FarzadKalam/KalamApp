-- TazeSystem - Phase 404: unified, tenant-safe bot-group timeline runtime
-- Repairs historical bot-message ownership and replaces the parallel generic
-- and legacy bot timeline paths with one dedicated RPC.

begin;

create index if not exists idx_counterparty_bot_messages_org_group_created_v2
  on public.counterparty_bot_messages (org_id, bot_group_id, created_at desc, id desc);

-- Some older imports wrote the group relation but omitted its tenant.  The
-- group is the authoritative owner, so this is a safe repair with no data loss.
update public.counterparty_bot_messages message_row
set org_id = bot_group.org_id
from public.counterparty_bot_groups bot_group
where bot_group.id = message_row.bot_group_id
  and message_row.org_id is distinct from bot_group.org_id;

create or replace function public.get_bot_group_timeline_v2(
  p_bot_group_id uuid,
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
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 50);
  v_before_ts timestamptz := null;
  v_before_id text := null;
begin
  if v_user_id is null
    or v_org_id is null
    or p_bot_group_id is null
    or not public.kalam_can_access_bot_group(p_bot_group_id, v_org_id) then
    return jsonb_build_object(
      'items', '[]'::jsonb,
      'unread_count', 0,
      'first_unread_id', null,
      'has_more_before', false,
      'next_before_cursor', null,
      'read_model', 'cursor'
    );
  end if;

  if nullif(trim(coalesce(p_before_cursor, '')), '') is not null then
    v_before_ts := nullif(split_part(p_before_cursor, '|', 1), '')::timestamptz;
    v_before_id := nullif(split_part(p_before_cursor, '|', 2), '');
  end if;

  return (
    with cursor_state as materialized (
      select read_through_at, read_through_id
      from public.communication_read_cursors
      where org_id = v_org_id
        and user_id = v_user_id
        and channel = 'bot'
        and conversation_key = 'bot:' || p_bot_group_id::text
    ),
    visible as materialized (
      select
        message_row.id,
        message_row.bot_group_id,
        message_row.direction,
        message_row.message_type,
        message_row.chat_id,
        message_row.provider_message_id,
        message_row.content_text,
        message_row.file_url,
        message_row.file_name,
        message_row.mime_type,
        message_row.payload,
        message_row.created_by,
        message_row.created_at,
        (
          message_row.direction <> 'inbound'
          or read_state.read_at is not null
          or read_state.dismissed_at is not null
          or (
            cursor_state.read_through_at is not null
            and (
              message_row.created_at < cursor_state.read_through_at
              or (
                message_row.created_at = cursor_state.read_through_at
                and message_row.id::text <= coalesce(cursor_state.read_through_id, message_row.id::text)
              )
            )
          )
        ) as is_read
      from public.counterparty_bot_messages message_row
      left join public.notification_read_states read_state
        on read_state.org_id = v_org_id
       and read_state.user_id = v_user_id
       and read_state.section = 'bot_messages'
       and read_state.source_type = 'counterparty_bot_message'
       and read_state.source_id = message_row.id::text
      left join cursor_state on true
      where message_row.org_id = v_org_id
        and message_row.bot_group_id = p_bot_group_id
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
      select * from windowed order by created_at desc, id desc limit v_limit
    ),
    page as (
      select * from page_desc order by created_at asc, id asc
    ),
    earliest as (
      select created_at, id::text as id_text from page order by created_at asc, id asc limit 1
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(to_jsonb(page) order by page.created_at asc, page.id asc) from page), '[]'::jsonb),
      'unread_count', coalesce((select count(*) filter (where not is_read)::integer from visible), 0),
      'first_unread_id', (select id::text from page where not is_read order by created_at asc, id asc limit 1),
      'has_more_before', (select count(*) > v_limit from windowed),
      'next_before_cursor', (select public.kalam_cursor_value(created_at, id_text) from earliest),
      'read_model', 'cursor'
    )
  );
end;
$$;

grant execute on function public.get_bot_group_timeline_v2(uuid, integer, text) to authenticated;
revoke all on function public.get_bot_group_timeline_v2(uuid, integer, text) from public, anon;

notify pgrst, 'reload schema';

commit;
