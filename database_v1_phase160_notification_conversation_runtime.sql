-- KalamApp V1 - Phase 160
-- Conversation summary + paginated timelines for notifications/chat without UI behavior changes.

begin;

alter table if exists public.notification_inbox_items
  add column if not exists conversation_key text;

create index if not exists idx_notification_inbox_items_org_section_conversation_time
  on public.notification_inbox_items(org_id, section, conversation_key, last_event_at desc);

create index if not exists idx_notification_inbox_items_notes_conversation_time
  on public.notification_inbox_items(org_id, conversation_key, last_event_at desc)
  where section = 'notes';

create index if not exists idx_notes_org_created_at
  on public.notes(org_id, created_at desc);

create index if not exists idx_notes_author_created_at
  on public.notes(author_id, created_at desc);

create index if not exists idx_notes_mention_user_ids_gin
  on public.notes using gin(mention_user_ids);

create index if not exists idx_notes_metadata_chat_group_id
  on public.notes((metadata->>'chat_group_id'))
  where metadata ? 'chat_group_id';

create index if not exists idx_counterparty_bot_messages_org_group_time
  on public.counterparty_bot_messages(org_id, bot_group_id, created_at desc);

create index if not exists idx_counterparty_bot_messages_group_inbound_time
  on public.counterparty_bot_messages(bot_group_id, created_at desc)
  where direction = 'inbound';

create or replace function public.kalam_direct_conversation_key(p_user_a uuid, p_user_b uuid)
returns text
language sql
immutable
as $$
  select case
    when p_user_a is null or p_user_b is null then null
    when p_user_a::text <= p_user_b::text then 'direct:' || p_user_a::text || ':' || p_user_b::text
    else 'direct:' || p_user_b::text || ':' || p_user_a::text
  end
$$;

create or replace function public.kalam_note_conversation_key(
  p_org_id uuid,
  p_note_id uuid,
  p_author_id uuid,
  p_mention_user_ids uuid[],
  p_source_type text,
  p_metadata jsonb,
  p_reply_to uuid
)
returns text
language plpgsql
stable
as $$
declare
  v_note_source text := lower(trim(coalesce(p_source_type, p_metadata->>'source_type', '')));
  v_group_id uuid := public.kalam_try_uuid(p_metadata->>'chat_group_id');
  v_peer_id uuid := null;
  v_reply_author_id uuid := null;
  v_reply_mention_user_ids uuid[] := '{}'::uuid[];
  v_item uuid;
begin
  if v_note_source = 'system'
    or (p_metadata ? 'workflow_id')
    or (p_metadata ? 'automation_rule_id')
    or (p_metadata ? 'process_automation_rule_id') then
    return 'system';
  end if;

  if v_group_id is not null then
    return 'group:' || v_group_id::text;
  end if;

  foreach v_item in array coalesce(p_mention_user_ids, '{}'::uuid[]) loop
    if v_item is not null and v_item <> p_author_id then
      v_peer_id := v_item;
      exit;
    end if;
  end loop;

  if v_peer_id is null and p_reply_to is not null then
    select n.author_id, coalesce(n.mention_user_ids, '{}'::uuid[])
    into v_reply_author_id, v_reply_mention_user_ids
    from public.notes n
    where n.id = p_reply_to
      and (p_org_id is null or n.org_id = p_org_id)
    limit 1;

    if v_reply_author_id is not null and v_reply_author_id <> p_author_id then
      v_peer_id := v_reply_author_id;
    end if;

    if v_peer_id is null then
      foreach v_item in array coalesce(v_reply_mention_user_ids, '{}'::uuid[]) loop
        if v_item is not null and v_item <> p_author_id then
          v_peer_id := v_item;
          exit;
        end if;
      end loop;
    end if;
  end if;

  if p_author_id is null or v_peer_id is null then
    return null;
  end if;

  return public.kalam_direct_conversation_key(p_author_id, v_peer_id);
end;
$$;

create or replace function public.kalam_cursor_value(p_created_at timestamptz, p_id text)
returns text
language sql
immutable
as $$
  select case
    when p_created_at is null or nullif(trim(coalesce(p_id, '')), '') is null then null
    else to_char(p_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || '|' || trim(p_id)
  end
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
  v_record_id text := nullif(v_row->>'id', '');
  v_author_id uuid := public.kalam_try_uuid(v_row->>'author_id');
  v_channel_type text := lower(trim(coalesce(v_row->>'channel_type', '')));
  v_group_id uuid;
  v_group_users uuid[] := '{}'::uuid[];
  v_group_roles uuid[] := '{}'::uuid[];
  v_target_users uuid[] := '{}'::uuid[];
  v_target_roles uuid[] := '{}'::uuid[];
  v_note_source text;
  v_category text;
  v_is_org_wide boolean := false;
  v_conversation_key text;
begin
  if v_org_id is null or v_record_id is null or v_channel_type = 'sms' then
    return new;
  end if;

  v_note_source := coalesce(nullif(trim(v_row->>'source_type'), ''), nullif(trim(v_metadata->>'source_type'), ''), 'user');
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
    where cg.id = v_group_id
      and cg.org_id = v_org_id
    limit 1;
  end if;

  v_target_users := public.kalam_distinct_uuid_array(
    public.kalam_jsonb_uuid_array(v_row->'mention_user_ids')
    || coalesce(v_group_users, '{}'::uuid[])
    || case when v_author_id is null then '{}'::uuid[] else array[v_author_id] end
  );
  v_target_roles := public.kalam_distinct_uuid_array(public.kalam_jsonb_uuid_array(v_row->'mention_role_ids') || coalesce(v_group_roles, '{}'::uuid[]));
  v_is_org_wide := v_category = 'system' and cardinality(v_target_users) = 0 and cardinality(v_target_roles) = 0;
  v_conversation_key := public.kalam_note_conversation_key(
    v_org_id,
    new.id,
    v_author_id,
    coalesce(new.mention_user_ids, '{}'::uuid[]),
    coalesce(new.source_type, v_metadata->>'source_type'),
    v_metadata,
    new.reply_to
  );

  perform public.kalam_upsert_notification_item(
    v_org_id,
    'note',
    v_record_id,
    'notes',
    v_category,
    lower(tg_op),
    case when v_category = 'assistant' then 'پیام هوش مصنوعی' when v_category = 'system' then 'پیام سیستم' else 'پیام داخلی' end,
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

  update public.notification_inbox_items
  set conversation_key = v_conversation_key
  where org_id = v_org_id
    and source_type = 'note'
    and source_id = v_record_id
    and coalesce(conversation_key, '') <> coalesce(v_conversation_key, '');

  return new;
end;
$$;

create or replace function public.kalam_counterparty_bot_message_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group record;
  v_target_users uuid[] := '{}'::uuid[];
  v_target_roles uuid[] := '{}'::uuid[];
  v_is_org_wide boolean := true;
  v_conversation_key text := null;
begin
  if new.org_id is null then
    return new;
  end if;

  if new.bot_group_id is not null then
    select *
    into v_group
    from public.counterparty_bot_groups g
    where g.id = new.bot_group_id
      and g.org_id = new.org_id
    limit 1;

    if found then
      v_target_users := public.kalam_jsonb_uuid_array(v_group.metadata->'allowed_user_ids');
      v_target_roles := public.kalam_jsonb_uuid_array(v_group.metadata->'allowed_role_ids');
      v_conversation_key := 'bot:' || new.bot_group_id::text;
    end if;
  end if;

  if new.created_by is not null then
    v_target_users := public.kalam_distinct_uuid_array(v_target_users || array[new.created_by]);
  end if;
  v_is_org_wide := cardinality(v_target_users) = 0 and cardinality(v_target_roles) = 0;

  perform public.kalam_upsert_notification_item(
    new.org_id,
    'counterparty_bot_message',
    new.id::text,
    'bot_messages',
    coalesce(nullif(trim(new.channel_type), ''), 'bot'),
    lower(tg_op),
    coalesce(nullif(trim(new.channel_type), ''), 'Bot message'),
    nullif(left(coalesce(new.content_text, ''), 240), ''),
    case when new.customer_id is not null then 'customers' when new.supplier_id is not null then 'suppliers' else null end,
    coalesce(new.customer_id::text, new.supplier_id::text, null),
    v_target_users,
    v_target_roles,
    v_is_org_wide,
    jsonb_build_object(
      'bot_group_id', new.bot_group_id,
      'direction', new.direction,
      'message_type', new.message_type,
      'conversation_key', v_conversation_key
    ),
    coalesce(new.created_at, now())
  );

  update public.notification_inbox_items
  set conversation_key = v_conversation_key
  where org_id = new.org_id
    and source_type = 'counterparty_bot_message'
    and source_id = new.id::text
    and coalesce(conversation_key, '') <> coalesce(v_conversation_key, '');

  return new;
end;
$$;

create or replace function public.get_notification_conversations(p_section text default 'notes')
returns table (
  section text,
  conversation_key text,
  kind text,
  title text,
  subtitle text,
  avatar_url text,
  role_label text,
  note_count integer,
  unread_count integer,
  latest_message_at timestamptz,
  last_message_preview text,
  user_id uuid,
  group_id uuid,
  bot_group_id uuid,
  channel_type text,
  status text,
  counterparty_label text,
  bot_chat_id text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select
      auth.uid() as user_id,
      public.current_org_id() as org_id,
      p.role_id
    from public.profiles p
    where p.id = auth.uid()
    limit 1
  ),
  note_base as (
    select
      'notes'::text as section,
      coalesce(
        nii.conversation_key,
        nullif(trim(nii.payload->>'conversation_key'), ''),
        public.kalam_note_conversation_key(
          n.org_id,
          n.id,
          n.author_id,
          coalesce(n.mention_user_ids, '{}'::uuid[]),
          coalesce(n.source_type, n.metadata->>'source_type'),
          coalesce(n.metadata, '{}'::jsonb),
          n.reply_to
        )
      ) as conversation_key,
      case
        when nii.category = 'system' then 'system'
        when nullif(trim(coalesce(nii.payload->>'chat_group_id', n.metadata->>'chat_group_id')), '') is not null then 'group'
        else 'direct'
      end as kind,
      n.id as note_id,
      n.author_id,
      n.created_at,
      coalesce(nullif(trim(n.author_name), ''), nullif(trim(p2.full_name), ''), n.author_id::text) as author_name,
      nullif(trim(coalesce(nii.body, '')), '') as preview,
      rs.read_at is not null or rs.dismissed_at is not null or n.author_id = me.user_id as is_read
    from me
    join public.notification_inbox_items nii
      on nii.org_id = me.org_id
     and nii.section = 'notes'
     and nii.source_type = 'note'
    join public.notes n
      on n.id::text = nii.source_id
     and n.org_id = nii.org_id
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.section = 'notes'
     and rs.source_type = 'note'
     and rs.source_id = nii.source_id
    left join public.profiles p2
      on p2.id = n.author_id
    where p_section = 'notes'
  ),
  note_agg as (
    select
      section,
      conversation_key,
      kind,
      count(*)::integer as note_count,
      count(*) filter (where not is_read)::integer as unread_count,
      max(created_at) as latest_message_at
    from note_base
    where nullif(trim(coalesce(conversation_key, '')), '') is not null
    group by section, conversation_key, kind
  ),
  note_latest as (
    select distinct on (conversation_key)
      conversation_key,
      preview
    from note_base
    where nullif(trim(coalesce(conversation_key, '')), '') is not null
    order by conversation_key, created_at desc, note_id desc
  ),
  note_enriched as (
    select
      na.section,
      na.conversation_key,
      na.kind,
      case
        when na.kind = 'system' then 'پیام‌های سیستم'
        when na.kind = 'group' then coalesce(cg.name, 'گروه')
        else coalesce(other_profile.full_name, other_profile.id::text, split_part(na.conversation_key, ':', 3))
      end as title,
      case
        when na.kind = 'group' then 'گروه داخلی'
        when na.kind = 'direct' then coalesce(other_role.title, null)
        else null
      end as subtitle,
      case when na.kind = 'direct' then other_profile.avatar_url else null end as avatar_url,
      case when na.kind = 'direct' then other_role.title else null end as role_label,
      na.note_count,
      na.unread_count,
      na.latest_message_at,
      nl.preview as last_message_preview,
      case
        when na.kind = 'direct' then
          case
            when split_part(na.conversation_key, ':', 2)::uuid = me.user_id then split_part(na.conversation_key, ':', 3)::uuid
            else split_part(na.conversation_key, ':', 2)::uuid
          end
        else null
      end as user_id,
      case when na.kind = 'group' then public.kalam_try_uuid(split_part(na.conversation_key, ':', 2)) else null end as group_id,
      null::uuid as bot_group_id,
      null::text as channel_type,
      null::text as status,
      null::text as counterparty_label,
      null::text as bot_chat_id
    from note_agg na
    join me on true
    left join note_latest nl
      on nl.conversation_key = na.conversation_key
    left join public.chat_groups cg
      on na.kind = 'group'
     and cg.id = public.kalam_try_uuid(split_part(na.conversation_key, ':', 2))
    left join public.profiles other_profile
      on na.kind = 'direct'
     and other_profile.id = (
       case
         when split_part(na.conversation_key, ':', 2)::uuid = me.user_id then split_part(na.conversation_key, ':', 3)::uuid
         else split_part(na.conversation_key, ':', 2)::uuid
       end
     )
    left join public.org_roles other_role
      on other_role.id = other_profile.role_id
  ),
  bot_base as (
    select
      'bot_messages'::text as section,
      'bot:' || g.id::text as conversation_key,
      'bot'::text as kind,
      g.id as bot_group_id,
      g.group_title,
      g.channel_type,
      g.status,
      g.bot_chat_id,
      g.customer_id,
      g.supplier_id,
      m.id as message_id,
      m.created_at,
      coalesce(nullif(trim(m.content_text), ''), nullif(trim(m.file_name), ''), nullif(trim(m.message_type), '')) as preview,
      m.direction,
      rs.read_at is not null or rs.dismissed_at is not null or m.direction <> 'inbound' as is_read
    from me
    join public.counterparty_bot_groups g
      on g.org_id = me.org_id
    left join public.counterparty_bot_messages m
      on m.bot_group_id = g.id
     and m.org_id = g.org_id
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.section = 'bot_messages'
     and rs.source_type = 'counterparty_bot_message'
     and rs.source_id = m.id::text
    where p_section = 'bot_messages'
      and (
        (
          coalesce(jsonb_array_length(g.metadata->'allowed_user_ids'), 0) = 0
          and coalesce(jsonb_array_length(g.metadata->'allowed_role_ids'), 0) = 0
        )
        or me.user_id = any(public.kalam_jsonb_uuid_array(g.metadata->'allowed_user_ids'))
        or (me.role_id is not null and me.role_id = any(public.kalam_jsonb_uuid_array(g.metadata->'allowed_role_ids')))
      )
  ),
  bot_agg as (
    select
      section,
      conversation_key,
      kind,
      bot_group_id,
      min(group_title) as title,
      min(channel_type) as channel_type,
      min(status) as status,
      min(bot_chat_id) as bot_chat_id,
      count(message_id)::integer as note_count,
      count(message_id) filter (where direction = 'inbound' and not is_read)::integer as unread_count,
      max(created_at) as latest_message_at
    from bot_base
    group by section, conversation_key, kind, bot_group_id
  ),
  bot_latest as (
    select distinct on (conversation_key)
      conversation_key,
      preview
    from bot_base
    where message_id is not null
    order by conversation_key, created_at desc, message_id desc
  ),
  bot_enriched as (
    select
      ba.section,
      ba.conversation_key,
      ba.kind,
      coalesce(nullif(trim(ba.title), ''), 'گروه بات') as title,
      case
        when g.customer_id is not null then coalesce(c.full_name, c.business_name, c.legal_name, c.system_code)
        when g.supplier_id is not null then coalesce(s.business_name, s.full_name, s.system_code)
        else null
      end as subtitle,
      null::text as avatar_url,
      null::text as role_label,
      ba.note_count,
      ba.unread_count,
      ba.latest_message_at,
      bl.preview as last_message_preview,
      null::uuid as user_id,
      null::uuid as group_id,
      ba.bot_group_id,
      ba.channel_type,
      ba.status,
      case
        when g.customer_id is not null then coalesce(c.full_name, c.business_name, c.legal_name, c.system_code)
        when g.supplier_id is not null then coalesce(s.business_name, s.full_name, s.system_code)
        else null
      end as counterparty_label,
      ba.bot_chat_id
    from bot_agg ba
    join public.counterparty_bot_groups g
      on g.id = ba.bot_group_id
    left join bot_latest bl
      on bl.conversation_key = ba.conversation_key
    left join public.customers c
      on c.id = g.customer_id
    left join public.suppliers s
      on s.id = g.supplier_id
  )
  select * from note_enriched
  union all
  select * from bot_enriched
  order by latest_message_at desc nulls last, title asc;
$$;

create or replace function public.get_internal_conversation_timeline(
  p_conversation_key text,
  p_limit integer default 10,
  p_before_cursor text default null,
  p_include_unread_window boolean default true
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
  v_limit integer := greatest(coalesce(p_limit, 10), 1);
  v_unread_count integer := 0;
  v_first_unread_id text := null;
  v_has_more_before boolean := false;
  v_next_before_cursor text := null;
  v_before_ts timestamptz := null;
  v_before_id text := null;
  v_items jsonb := '[]'::jsonb;
begin
  if v_user_id is null or v_org_id is null or nullif(trim(coalesce(p_conversation_key, '')), '') is null then
    return jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0, 'first_unread_id', null, 'has_more_before', false, 'next_before_cursor', null);
  end if;

  if nullif(trim(coalesce(p_before_cursor, '')), '') is not null then
    v_before_ts := nullif(split_part(p_before_cursor, '|', 1), '')::timestamptz;
    v_before_id := nullif(split_part(p_before_cursor, '|', 2), '');
  end if;

  with base as (
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
      coalesce(
        nii.conversation_key,
        nullif(trim(nii.payload->>'conversation_key'), ''),
        public.kalam_note_conversation_key(
          n.org_id,
          n.id,
          n.author_id,
          coalesce(n.mention_user_ids, '{}'::uuid[]),
          coalesce(n.source_type, n.metadata->>'source_type'),
          coalesce(n.metadata, '{}'::jsonb),
          n.reply_to
        )
      ) as conversation_key,
      rs.read_at is not null or rs.dismissed_at is not null or n.author_id = v_user_id as is_read
    from public.notification_inbox_items nii
    join public.notes n
      on n.id::text = nii.source_id
     and n.org_id = nii.org_id
    left join public.notification_read_states rs
      on rs.org_id = v_org_id
     and rs.user_id = v_user_id
     and rs.section = 'notes'
     and rs.source_type = 'note'
     and rs.source_id = nii.source_id
    where nii.org_id = v_org_id
      and nii.section = 'notes'
      and nii.source_type = 'note'
      and coalesce(
        nii.conversation_key,
        nullif(trim(nii.payload->>'conversation_key'), ''),
        public.kalam_note_conversation_key(
          n.org_id,
          n.id,
          n.author_id,
          coalesce(n.mention_user_ids, '{}'::uuid[]),
          coalesce(n.source_type, n.metadata->>'source_type'),
          coalesce(n.metadata, '{}'::jsonb),
          n.reply_to
        )
      ) = p_conversation_key
  )
  select
    count(*) filter (where not is_read)::integer,
    min(id::text) filter (where not is_read)
  into v_unread_count, v_first_unread_id
  from base;

  if v_before_ts is not null then
    with base as (
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
        n.edited_at
      from public.notification_inbox_items nii
      join public.notes n
        on n.id::text = nii.source_id
       and n.org_id = nii.org_id
      where nii.org_id = v_org_id
        and nii.section = 'notes'
        and nii.source_type = 'note'
        and coalesce(
          nii.conversation_key,
          nullif(trim(nii.payload->>'conversation_key'), ''),
          public.kalam_note_conversation_key(
            n.org_id,
            n.id,
            n.author_id,
            coalesce(n.mention_user_ids, '{}'::uuid[]),
            coalesce(n.source_type, n.metadata->>'source_type'),
            coalesce(n.metadata, '{}'::jsonb),
            n.reply_to
          )
        ) = p_conversation_key
        and (
          n.created_at < v_before_ts
          or (n.created_at = v_before_ts and n.id::text < coalesce(v_before_id, ''))
        )
      order by n.created_at desc, n.id desc
      limit v_limit
    ),
    ordered as (
      select * from base order by created_at asc, id asc
    ),
    earliest as (
      select created_at, id::text as id_text
      from ordered
      order by created_at asc, id asc
      limit 1
    )
    select
      coalesce(jsonb_agg(to_jsonb(ordered.*) order by ordered.created_at asc, ordered.id asc), '[]'::jsonb),
      exists(
        select 1
        from public.notification_inbox_items nii
        join public.notes n
          on n.id::text = nii.source_id
         and n.org_id = nii.org_id
        join earliest e on true
        where nii.org_id = v_org_id
          and nii.section = 'notes'
          and nii.source_type = 'note'
          and coalesce(
            nii.conversation_key,
            nullif(trim(nii.payload->>'conversation_key'), ''),
            public.kalam_note_conversation_key(
              n.org_id,
              n.id,
              n.author_id,
              coalesce(n.mention_user_ids, '{}'::uuid[]),
              coalesce(n.source_type, n.metadata->>'source_type'),
              coalesce(n.metadata, '{}'::jsonb),
              n.reply_to
            )
          ) = p_conversation_key
          and (
            n.created_at < e.created_at
            or (n.created_at = e.created_at and n.id::text < e.id_text)
          )
      ),
      (select public.kalam_cursor_value(created_at, id_text) from earliest)
    into v_items, v_has_more_before, v_next_before_cursor
    from ordered;

    return jsonb_build_object(
      'items', coalesce(v_items, '[]'::jsonb),
      'unread_count', coalesce(v_unread_count, 0),
      'first_unread_id', v_first_unread_id,
      'has_more_before', coalesce(v_has_more_before, false),
      'next_before_cursor', v_next_before_cursor
    );
  end if;

  if p_include_unread_window and coalesce(v_unread_count, 0) > 10 then
    with unread_rows as (
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
        n.edited_at
      from public.notification_inbox_items nii
      join public.notes n
        on n.id::text = nii.source_id
       and n.org_id = nii.org_id
      left join public.notification_read_states rs
        on rs.org_id = v_org_id
       and rs.user_id = v_user_id
       and rs.section = 'notes'
       and rs.source_type = 'note'
       and rs.source_id = nii.source_id
      where nii.org_id = v_org_id
        and nii.section = 'notes'
        and nii.source_type = 'note'
        and coalesce(
          nii.conversation_key,
          nullif(trim(nii.payload->>'conversation_key'), ''),
          public.kalam_note_conversation_key(
            n.org_id,
            n.id,
            n.author_id,
            coalesce(n.mention_user_ids, '{}'::uuid[]),
            coalesce(n.source_type, n.metadata->>'source_type'),
            coalesce(n.metadata, '{}'::jsonb),
            n.reply_to
          )
        ) = p_conversation_key
        and rs.read_at is null
        and rs.dismissed_at is null
        and n.author_id <> v_user_id
      order by n.created_at asc, n.id asc
    ),
    earliest as (
      select created_at, id::text as id_text
      from unread_rows
      order by created_at asc, id asc
      limit 1
    )
    select
      coalesce(jsonb_agg(to_jsonb(unread_rows.*) order by unread_rows.created_at asc, unread_rows.id asc), '[]'::jsonb),
      exists(
        select 1
        from public.notification_inbox_items nii
        join public.notes n
          on n.id::text = nii.source_id
         and n.org_id = nii.org_id
        join earliest e on true
        where nii.org_id = v_org_id
          and nii.section = 'notes'
          and nii.source_type = 'note'
          and coalesce(
            nii.conversation_key,
            nullif(trim(nii.payload->>'conversation_key'), ''),
            public.kalam_note_conversation_key(
              n.org_id,
              n.id,
              n.author_id,
              coalesce(n.mention_user_ids, '{}'::uuid[]),
              coalesce(n.source_type, n.metadata->>'source_type'),
              coalesce(n.metadata, '{}'::jsonb),
              n.reply_to
            )
          ) = p_conversation_key
          and (
            n.created_at < e.created_at
            or (n.created_at = e.created_at and n.id::text < e.id_text)
          )
      ),
      (select public.kalam_cursor_value(created_at, id_text) from earliest)
    into v_items, v_has_more_before, v_next_before_cursor
    from unread_rows;
  else
    with latest_rows as (
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
        n.edited_at
      from public.notification_inbox_items nii
      join public.notes n
        on n.id::text = nii.source_id
       and n.org_id = nii.org_id
      where nii.org_id = v_org_id
        and nii.section = 'notes'
        and nii.source_type = 'note'
        and coalesce(
          nii.conversation_key,
          nullif(trim(nii.payload->>'conversation_key'), ''),
          public.kalam_note_conversation_key(
            n.org_id,
            n.id,
            n.author_id,
            coalesce(n.mention_user_ids, '{}'::uuid[]),
            coalesce(n.source_type, n.metadata->>'source_type'),
            coalesce(n.metadata, '{}'::jsonb),
            n.reply_to
          )
        ) = p_conversation_key
      order by n.created_at desc, n.id desc
      limit greatest(v_limit, 10)
    ),
    ordered as (
      select * from latest_rows order by created_at asc, id asc
    ),
    earliest as (
      select created_at, id::text as id_text
      from ordered
      order by created_at asc, id asc
      limit 1
    )
    select
      coalesce(jsonb_agg(to_jsonb(ordered.*) order by ordered.created_at asc, ordered.id asc), '[]'::jsonb),
      exists(
        select 1
        from public.notification_inbox_items nii
        join public.notes n
          on n.id::text = nii.source_id
         and n.org_id = nii.org_id
        join earliest e on true
        where nii.org_id = v_org_id
          and nii.section = 'notes'
          and nii.source_type = 'note'
          and coalesce(
            nii.conversation_key,
            nullif(trim(nii.payload->>'conversation_key'), ''),
            public.kalam_note_conversation_key(
              n.org_id,
              n.id,
              n.author_id,
              coalesce(n.mention_user_ids, '{}'::uuid[]),
              coalesce(n.source_type, n.metadata->>'source_type'),
              coalesce(n.metadata, '{}'::jsonb),
              n.reply_to
            )
          ) = p_conversation_key
          and (
            n.created_at < e.created_at
            or (n.created_at = e.created_at and n.id::text < e.id_text)
          )
      ),
      (select public.kalam_cursor_value(created_at, id_text) from earliest)
    into v_items, v_has_more_before, v_next_before_cursor
    from ordered;
  end if;

  return jsonb_build_object(
    'items', coalesce(v_items, '[]'::jsonb),
    'unread_count', coalesce(v_unread_count, 0),
    'first_unread_id', v_first_unread_id,
    'has_more_before', coalesce(v_has_more_before, false),
    'next_before_cursor', v_next_before_cursor
  );
end;
$$;

create or replace function public.get_bot_conversation_timeline(
  p_bot_group_id uuid,
  p_limit integer default 10,
  p_before_cursor text default null,
  p_include_unread_window boolean default true
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
  v_limit integer := greatest(coalesce(p_limit, 10), 1);
  v_unread_count integer := 0;
  v_first_unread_id text := null;
  v_has_more_before boolean := false;
  v_next_before_cursor text := null;
  v_before_ts timestamptz := null;
  v_before_id text := null;
  v_items jsonb := '[]'::jsonb;
begin
  if v_user_id is null or v_org_id is null or p_bot_group_id is null then
    return jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0, 'first_unread_id', null, 'has_more_before', false, 'next_before_cursor', null);
  end if;

  select p.role_id into v_role_id
  from public.profiles p
  where p.id = v_user_id
  limit 1;

  if not exists (
    select 1
    from public.counterparty_bot_groups g
    where g.id = p_bot_group_id
      and g.org_id = v_org_id
      and (
        (
          coalesce(jsonb_array_length(g.metadata->'allowed_user_ids'), 0) = 0
          and coalesce(jsonb_array_length(g.metadata->'allowed_role_ids'), 0) = 0
        )
        or v_user_id = any(public.kalam_jsonb_uuid_array(g.metadata->'allowed_user_ids'))
        or (v_role_id is not null and v_role_id = any(public.kalam_jsonb_uuid_array(g.metadata->'allowed_role_ids')))
      )
  ) then
    return jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0, 'first_unread_id', null, 'has_more_before', false, 'next_before_cursor', null);
  end if;

  if nullif(trim(coalesce(p_before_cursor, '')), '') is not null then
    v_before_ts := nullif(split_part(p_before_cursor, '|', 1), '')::timestamptz;
    v_before_id := nullif(split_part(p_before_cursor, '|', 2), '');
  end if;

  select
    count(*) filter (where m.direction = 'inbound' and rs.read_at is null and rs.dismissed_at is null)::integer,
    min(m.id::text) filter (where m.direction = 'inbound' and rs.read_at is null and rs.dismissed_at is null)
  into v_unread_count, v_first_unread_id
  from public.counterparty_bot_messages m
  left join public.notification_read_states rs
    on rs.org_id = v_org_id
   and rs.user_id = v_user_id
   and rs.section = 'bot_messages'
   and rs.source_type = 'counterparty_bot_message'
   and rs.source_id = m.id::text
  where m.org_id = v_org_id
    and m.bot_group_id = p_bot_group_id;

  if v_before_ts is not null then
    with page as (
      select
        m.id,
        m.bot_group_id,
        m.direction,
        m.message_type,
        m.chat_id,
        m.provider_message_id,
        m.content_text,
        m.file_url,
        m.file_name,
        m.mime_type,
        m.payload,
        m.created_by,
        m.created_at
      from public.counterparty_bot_messages m
      where m.org_id = v_org_id
        and m.bot_group_id = p_bot_group_id
        and (
          m.created_at < v_before_ts
          or (m.created_at = v_before_ts and m.id::text < coalesce(v_before_id, ''))
        )
      order by m.created_at desc, m.id desc
      limit v_limit
    ),
    ordered as (
      select * from page order by created_at asc, id asc
    ),
    earliest as (
      select created_at, id::text as id_text
      from ordered
      order by created_at asc, id asc
      limit 1
    )
    select
      coalesce(jsonb_agg(to_jsonb(ordered.*) order by ordered.created_at asc, ordered.id asc), '[]'::jsonb),
      exists(
        select 1
        from public.counterparty_bot_messages m
        join earliest e on true
        where m.org_id = v_org_id
          and m.bot_group_id = p_bot_group_id
          and (
            m.created_at < e.created_at
            or (m.created_at = e.created_at and m.id::text < e.id_text)
          )
      ),
      (select public.kalam_cursor_value(created_at, id_text) from earliest)
    into v_items, v_has_more_before, v_next_before_cursor
    from ordered;

    return jsonb_build_object(
      'items', coalesce(v_items, '[]'::jsonb),
      'unread_count', coalesce(v_unread_count, 0),
      'first_unread_id', v_first_unread_id,
      'has_more_before', coalesce(v_has_more_before, false),
      'next_before_cursor', v_next_before_cursor
    );
  end if;

  if p_include_unread_window and coalesce(v_unread_count, 0) > 10 then
    with unread_rows as (
      select
        m.id,
        m.bot_group_id,
        m.direction,
        m.message_type,
        m.chat_id,
        m.provider_message_id,
        m.content_text,
        m.file_url,
        m.file_name,
        m.mime_type,
        m.payload,
        m.created_by,
        m.created_at
      from public.counterparty_bot_messages m
      left join public.notification_read_states rs
        on rs.org_id = v_org_id
       and rs.user_id = v_user_id
       and rs.section = 'bot_messages'
       and rs.source_type = 'counterparty_bot_message'
       and rs.source_id = m.id::text
      where m.org_id = v_org_id
        and m.bot_group_id = p_bot_group_id
        and m.direction = 'inbound'
        and rs.read_at is null
        and rs.dismissed_at is null
      order by m.created_at asc, m.id asc
    ),
    earliest as (
      select created_at, id::text as id_text
      from unread_rows
      order by created_at asc, id asc
      limit 1
    )
    select
      coalesce(jsonb_agg(to_jsonb(unread_rows.*) order by unread_rows.created_at asc, unread_rows.id asc), '[]'::jsonb),
      exists(
        select 1
        from public.counterparty_bot_messages m
        join earliest e on true
        where m.org_id = v_org_id
          and m.bot_group_id = p_bot_group_id
          and (
            m.created_at < e.created_at
            or (m.created_at = e.created_at and m.id::text < e.id_text)
          )
      ),
      (select public.kalam_cursor_value(created_at, id_text) from earliest)
    into v_items, v_has_more_before, v_next_before_cursor
    from unread_rows;
  else
    with latest_rows as (
      select
        m.id,
        m.bot_group_id,
        m.direction,
        m.message_type,
        m.chat_id,
        m.provider_message_id,
        m.content_text,
        m.file_url,
        m.file_name,
        m.mime_type,
        m.payload,
        m.created_by,
        m.created_at
      from public.counterparty_bot_messages m
      where m.org_id = v_org_id
        and m.bot_group_id = p_bot_group_id
      order by m.created_at desc, m.id desc
      limit greatest(v_limit, 10)
    ),
    ordered as (
      select * from latest_rows order by created_at asc, id asc
    ),
    earliest as (
      select created_at, id::text as id_text
      from ordered
      order by created_at asc, id asc
      limit 1
    )
    select
      coalesce(jsonb_agg(to_jsonb(ordered.*) order by ordered.created_at asc, ordered.id asc), '[]'::jsonb),
      exists(
        select 1
        from public.counterparty_bot_messages m
        join earliest e on true
        where m.org_id = v_org_id
          and m.bot_group_id = p_bot_group_id
          and (
            m.created_at < e.created_at
            or (m.created_at = e.created_at and m.id::text < e.id_text)
          )
      ),
      (select public.kalam_cursor_value(created_at, id_text) from earliest)
    into v_items, v_has_more_before, v_next_before_cursor
    from ordered;
  end if;

  return jsonb_build_object(
    'items', coalesce(v_items, '[]'::jsonb),
    'unread_count', coalesce(v_unread_count, 0),
    'first_unread_id', v_first_unread_id,
    'has_more_before', coalesce(v_has_more_before, false),
    'next_before_cursor', v_next_before_cursor
  );
end;
$$;

grant execute on function public.kalam_direct_conversation_key(uuid, uuid) to authenticated;
grant execute on function public.kalam_note_conversation_key(uuid, uuid, uuid, uuid[], text, jsonb, uuid) to authenticated;
grant execute on function public.kalam_cursor_value(timestamptz, text) to authenticated;
grant execute on function public.get_notification_conversations(text) to authenticated;
grant execute on function public.get_internal_conversation_timeline(text, integer, text, boolean) to authenticated;
grant execute on function public.get_bot_conversation_timeline(uuid, integer, text, boolean) to authenticated;

revoke all on function public.kalam_direct_conversation_key(uuid, uuid) from public, anon;
revoke all on function public.kalam_note_conversation_key(uuid, uuid, uuid, uuid[], text, jsonb, uuid) from public, anon;
revoke all on function public.kalam_cursor_value(timestamptz, text) from public, anon;

notify pgrst, 'reload schema';

commit;
