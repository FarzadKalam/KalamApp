-- TazeSystem - Phase 403: repair and keep the unified internal messaging inbox complete
-- Internal messages are read from notification_inbox_items by the V2 runtime.
-- This backfills messages written while the inbox trigger was incomplete and
-- ensures all future messages retain their canonical conversation key.

begin;

create or replace function public.kalam_upsert_notification_item(
  p_org_id uuid,
  p_source_type text,
  p_source_id text,
  p_section text,
  p_category text,
  p_action text,
  p_title text,
  p_body text,
  p_module_id text,
  p_record_id text,
  p_target_user_ids uuid[],
  p_target_role_ids uuid[],
  p_is_org_wide boolean,
  p_payload jsonb,
  p_last_event_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_conversation_key text := nullif(trim(coalesce(p_payload->>'conversation_key', '')), '');
begin
  if p_org_id is null
    or nullif(trim(coalesce(p_source_type, '')), '') is null
    or nullif(trim(coalesce(p_source_id, '')), '') is null then
    return null;
  end if;

  insert into public.notification_inbox_items (
    org_id, source_type, source_id, section, category, action, title, body,
    module_id, record_id, target_user_ids, target_role_ids, is_org_wide,
    payload, conversation_key, last_event_at
  )
  values (
    p_org_id, trim(p_source_type), trim(p_source_id),
    coalesce(nullif(trim(p_section), ''), 'notes'),
    coalesce(nullif(trim(p_category), ''), 'general'),
    coalesce(nullif(trim(p_action), ''), 'upsert'),
    nullif(trim(coalesce(p_title, '')), ''),
    nullif(trim(coalesce(p_body, '')), ''),
    nullif(trim(coalesce(p_module_id, '')), ''),
    nullif(trim(coalesce(p_record_id, '')), ''),
    public.kalam_distinct_uuid_array(p_target_user_ids),
    public.kalam_distinct_uuid_array(p_target_role_ids),
    coalesce(p_is_org_wide, false),
    coalesce(p_payload, '{}'::jsonb),
    v_conversation_key,
    coalesce(p_last_event_at, now())
  )
  on conflict (org_id, source_type, source_id)
  do update set
    section = excluded.section,
    category = excluded.category,
    action = excluded.action,
    title = coalesce(excluded.title, public.notification_inbox_items.title),
    body = coalesce(excluded.body, public.notification_inbox_items.body),
    module_id = excluded.module_id,
    record_id = excluded.record_id,
    target_user_ids = excluded.target_user_ids,
    target_role_ids = excluded.target_role_ids,
    is_org_wide = excluded.is_org_wide,
    payload = public.notification_inbox_items.payload || excluded.payload,
    conversation_key = coalesce(excluded.conversation_key, public.notification_inbox_items.conversation_key),
    last_event_at = greatest(public.notification_inbox_items.last_event_at, excluded.last_event_at),
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

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
  v_category := case
    when v_note_source = 'ai' then 'assistant'
    when v_note_source = 'system' then 'system'
    when nullif(trim(v_metadata->>'chat_group_id'), '') is not null then 'group'
    else 'internal'
  end;

  v_group_id := public.kalam_try_uuid(v_metadata->>'chat_group_id');
  if v_group_id is not null then
    select coalesce(cg.user_ids, '{}'::uuid[]), coalesce(cg.role_ids, '{}'::uuid[])
      into v_group_users, v_group_roles
    from public.chat_groups cg
    where cg.id = v_group_id and cg.org_id = v_org_id
    limit 1;
  end if;

  v_target_users := public.kalam_distinct_uuid_array(
    public.kalam_jsonb_uuid_array(v_row->'mention_user_ids')
    || coalesce(v_group_users, '{}'::uuid[])
    || case when v_author_id is null then '{}'::uuid[] else array[v_author_id] end
  );
  v_target_roles := public.kalam_distinct_uuid_array(
    public.kalam_jsonb_uuid_array(v_row->'mention_role_ids') || coalesce(v_group_roles, '{}'::uuid[])
  );
  v_is_org_wide := v_category = 'system'
    and cardinality(v_target_users) = 0
    and cardinality(v_target_roles) = 0;

  -- A direct composer always persists conversation_key in metadata.  The
  -- deterministic fallbacks keep old direct and saved messages in one thread
  -- without creating one thread per mentioned role.
  v_conversation_key := case
    when v_group_id is not null then 'group:' || v_group_id::text
    when v_category in ('system', 'assistant') then 'system'
    when lower(trim(coalesce(v_metadata->>'saved_message', 'false'))) in ('true', '1', 'yes') then 'mine'
    when nullif(trim(v_metadata->>'conversation_key'), '') is not null then trim(v_metadata->>'conversation_key')
    when v_author_id is not null
      and cardinality(public.kalam_jsonb_uuid_array(v_row->'mention_user_ids')) = 1
      then public.kalam_direct_conversation_key(
        v_author_id,
        (public.kalam_jsonb_uuid_array(v_row->'mention_user_ids'))[1]
      )
    when v_author_id is not null then 'mine'
    else null
  end;

  perform public.kalam_upsert_notification_item(
    v_org_id,
    'note',
    v_note_id,
    'notes',
    v_category,
    lower(tg_op),
    case
      when v_category = 'assistant' then 'پیام هوش مصنوعی'
      when v_category = 'system' then 'پیام سیستم'
      else 'پیام داخلی'
    end,
    nullif(left(coalesce(v_row->>'content', ''), 240), ''),
    nullif(v_row->>'module_id', ''),
    nullif(v_row->>'record_id', ''),
    v_target_users,
    v_target_roles,
    v_is_org_wide,
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

drop trigger if exists trg_notes_notification_inbox on public.notes;
create trigger trg_notes_notification_inbox
  after insert or update on public.notes
  for each row execute function public.kalam_notes_notification_trigger();

-- Rows created during the trigger gap never reached notification_inbox_items,
-- so the fast V2 RPC could not discover them.  Only messaging-shaped notes are
-- repaired here; ordinary record comments remain outside the messenger.
insert into public.notification_inbox_items (
  org_id, source_type, source_id, section, category, action, title, body,
  module_id, record_id, target_user_ids, target_role_ids, is_org_wide, payload,
  conversation_key, last_event_at
)
select
  n.org_id,
  'note',
  n.id::text,
  'notes',
  case
    when lower(trim(coalesce(n.source_type, n.metadata->>'source_type', ''))) = 'ai' then 'assistant'
    when lower(trim(coalesce(n.source_type, n.metadata->>'source_type', ''))) = 'system' then 'system'
    when public.kalam_try_uuid(n.metadata->>'chat_group_id') is not null then 'group'
    else 'internal'
  end,
  'upsert',
  'پیام داخلی',
  nullif(left(coalesce(n.content, ''), 240), ''),
  n.module_id,
  n.record_id,
  public.kalam_distinct_uuid_array(
    coalesce(n.mention_user_ids, '{}'::uuid[])
    || coalesce(group_row.user_ids, '{}'::uuid[])
    || case when n.author_id is null then '{}'::uuid[] else array[n.author_id] end
  ),
  public.kalam_distinct_uuid_array(
    coalesce(n.mention_role_ids, '{}'::uuid[]) || coalesce(group_row.role_ids, '{}'::uuid[])
  ),
  false,
  jsonb_build_object(
    'note_source', lower(trim(coalesce(n.source_type, n.metadata->>'source_type', 'internal_message'))),
    'chat_group_id', public.kalam_try_uuid(n.metadata->>'chat_group_id'),
    'reply_to', n.reply_to,
    'conversation_key', case
      when public.kalam_try_uuid(n.metadata->>'chat_group_id') is not null
        then 'group:' || public.kalam_try_uuid(n.metadata->>'chat_group_id')::text
      when lower(trim(coalesce(n.source_type, n.metadata->>'source_type', ''))) in ('system', 'ai') then 'system'
      when lower(trim(coalesce(n.metadata->>'saved_message', 'false'))) in ('true', '1', 'yes') then 'mine'
      when nullif(trim(n.metadata->>'conversation_key'), '') is not null then trim(n.metadata->>'conversation_key')
      when n.author_id is not null and cardinality(coalesce(n.mention_user_ids, '{}'::uuid[])) = 1
        then public.kalam_direct_conversation_key(n.author_id, n.mention_user_ids[1])
      when n.author_id is not null then 'mine'
      else null
    end
  ),
  case
    when public.kalam_try_uuid(n.metadata->>'chat_group_id') is not null
      then 'group:' || public.kalam_try_uuid(n.metadata->>'chat_group_id')::text
    when lower(trim(coalesce(n.source_type, n.metadata->>'source_type', ''))) in ('system', 'ai') then 'system'
    when lower(trim(coalesce(n.metadata->>'saved_message', 'false'))) in ('true', '1', 'yes') then 'mine'
    when nullif(trim(n.metadata->>'conversation_key'), '') is not null then trim(n.metadata->>'conversation_key')
    when n.author_id is not null and cardinality(coalesce(n.mention_user_ids, '{}'::uuid[])) = 1
      then public.kalam_direct_conversation_key(n.author_id, n.mention_user_ids[1])
    when n.author_id is not null then 'mine'
    else null
  end,
  coalesce(n.updated_at, n.created_at, now())
from public.notes n
left join public.chat_groups group_row
  on group_row.org_id = n.org_id
 and group_row.id = public.kalam_try_uuid(n.metadata->>'chat_group_id')
where n.org_id is not null
  and (
    lower(trim(coalesce(n.source_type, n.metadata->>'source_type', ''))) = 'internal_message'
    or lower(trim(coalesce(n.metadata->>'saved_message', 'false'))) in ('true', '1', 'yes')
    or nullif(trim(n.metadata->>'conversation_key'), '') is not null
    or (
      public.kalam_try_uuid(n.metadata->>'chat_group_id') is not null
      and lower(trim(coalesce(n.source_type, n.metadata->>'source_type', ''))) not in ('system', 'ai')
    )
  )
on conflict (org_id, source_type, source_id) do update set
  category = excluded.category,
  body = coalesce(excluded.body, public.notification_inbox_items.body),
  target_user_ids = excluded.target_user_ids,
  target_role_ids = excluded.target_role_ids,
  payload = public.notification_inbox_items.payload || excluded.payload,
  conversation_key = coalesce(excluded.conversation_key, public.notification_inbox_items.conversation_key),
  last_event_at = greatest(public.notification_inbox_items.last_event_at, excluded.last_event_at),
  updated_at = now()
where public.notification_inbox_items.payload->>'conversation_key'
  is distinct from excluded.payload->>'conversation_key';

revoke all on function public.kalam_notes_notification_trigger() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
