-- =====================================================
-- TazeSystem - Phase 502: Messaging read-receipt timeline repair
-- Adds recipient-safe read receipts to the current internal, system and bot
-- timeline payloads without changing message visibility or unread state.
-- =====================================================

begin;

create or replace function public.kalam_message_read_receipts_v1(
  p_org_id uuid,
  p_channel text,
  p_conversation_key text,
  p_author_id uuid,
  p_created_at timestamptz,
  p_message_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_object_agg(
      reader.user_id::text,
      jsonb_build_object(
        'user_id', reader.user_id::text,
        'user_name', coalesce(nullif(trim(reader_profile.full_name), ''), 'کاربر'),
        'read_at', reader.updated_at
      )
    ),
    '{}'::jsonb
  )
  from public.communication_read_cursors reader
  left join public.profiles reader_profile
    on reader_profile.id = reader.user_id
   and reader_profile.org_id = reader.org_id
  where reader.org_id = p_org_id
    and reader.channel = p_channel
    and reader.conversation_key = p_conversation_key
    and (p_author_id is null or reader.user_id <> p_author_id)
    and reader.read_through_at is not null
    and (
      p_created_at < reader.read_through_at
      or (
        p_created_at = reader.read_through_at
        and p_message_id::text <= coalesce(reader.read_through_id, p_message_id::text)
      )
    );
$$;

do $receipt_patch$
declare
  v_definition text;
  v_old_fragment text := 'jsonb_agg(to_jsonb(page) order by page.created_at asc, page.id asc)';
  v_new_fragment text;
  v_signature regprocedure;
begin
  -- Apply only to the definitions currently used in production. Failing closed
  -- here prevents a future, unrelated function rewrite from being overwritten.
  foreach v_signature in array array[
    'public.get_internal_communication_timeline_v3(text,integer,text)'::regprocedure,
    'public.get_system_communication_timeline_v1(integer,text)'::regprocedure,
    'public.get_bot_group_timeline_v2(uuid,integer,text)'::regprocedure
  ]
  loop
    select pg_get_functiondef(v_signature::oid) into v_definition;

    if position('kalam_message_read_receipts_v1' in v_definition) > 0 then
      continue;
    end if;

    if position(v_old_fragment in v_definition) = 0 then
      raise exception 'Could not locate timeline payload aggregation in %', v_signature::text;
    end if;

    if v_signature = 'public.get_bot_group_timeline_v2(uuid,integer,text)'::regprocedure then
      v_new_fragment := $replacement$
jsonb_agg(
  to_jsonb(page) || jsonb_build_object(
    'payload',
    coalesce(page.payload, '{}'::jsonb) || jsonb_build_object(
      'read_receipts',
      public.kalam_message_read_receipts_v1(
        v_org_id,
        'bot',
        'bot:' || p_bot_group_id::text,
        page.created_by,
        page.created_at,
        page.id
      )
    )
  )
  order by page.created_at asc, page.id asc
)$replacement$;
    elsif v_signature = 'public.get_system_communication_timeline_v1(integer,text)'::regprocedure then
      v_new_fragment := $replacement$
jsonb_agg(
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
)$replacement$;
    else
      v_new_fragment := $replacement$
jsonb_agg(
  to_jsonb(page) || jsonb_build_object(
    'metadata',
    coalesce(page.metadata, '{}'::jsonb) || jsonb_build_object(
      'read_receipts',
      public.kalam_message_read_receipts_v1(
        v_org_id,
        'internal',
        v_key,
        page.author_id,
        page.created_at,
        page.id
      )
    )
  )
  order by page.created_at asc, page.id asc
)$replacement$;
    end if;

    execute replace(v_definition, v_old_fragment, v_new_fragment);
  end loop;
end;
$receipt_patch$;

grant execute on function public.get_internal_communication_timeline_v3(text, integer, text) to authenticated;
grant execute on function public.get_system_communication_timeline_v1(integer, text) to authenticated;
grant execute on function public.get_bot_group_timeline_v2(uuid, integer, text) to authenticated;
revoke all on function public.kalam_message_read_receipts_v1(uuid, text, text, uuid, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.get_internal_communication_timeline_v3(text, integer, text) from public, anon;
revoke all on function public.get_system_communication_timeline_v1(integer, text) from public, anon;
revoke all on function public.get_bot_group_timeline_v2(uuid, integer, text) from public, anon;

notify pgrst, 'reload schema';

commit;
