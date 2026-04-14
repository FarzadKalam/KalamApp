-- KalamApp V1 - Phase 86
-- Per-org notification foundation, read states, realtime broadcast topics, and scalable inbox items.

begin;

create or replace function public.kalam_try_uuid(p_value text)
returns uuid
language sql
immutable
as $$
  select case
    when p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then p_value::uuid
    else null
  end
$$;

create or replace function public.kalam_distinct_uuid_array(p_ids uuid[])
returns uuid[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct item order by item), '{}'::uuid[])
  from unnest(coalesce(p_ids, '{}'::uuid[])) as item
  where item is not null
$$;

create or replace function public.kalam_jsonb_uuid_array(p_value jsonb)
returns uuid[]
language plpgsql
stable
as $$
declare
  v_item text;
  v_ids uuid[] := '{}'::uuid[];
begin
  if p_value is null or jsonb_typeof(p_value) <> 'array' then
    return v_ids;
  end if;

  for v_item in select jsonb_array_elements_text(p_value) loop
    if public.kalam_try_uuid(v_item) is not null then
      v_ids := array_append(v_ids, public.kalam_try_uuid(v_item));
    end if;
  end loop;

  return public.kalam_distinct_uuid_array(v_ids);
end;
$$;

create or replace function public.kalam_realtime_org_topic(p_org_id uuid)
returns text
language sql
stable
as $$
  select case when p_org_id is null then null else 'org:' || p_org_id::text || ':notifications' end
$$;

create or replace function public.kalam_realtime_user_topic(p_org_id uuid, p_user_id uuid)
returns text
language sql
stable
as $$
  select case
    when p_org_id is null or p_user_id is null then null
    else 'org:' || p_org_id::text || ':user:' || p_user_id::text || ':notifications'
  end
$$;

create or replace function public.kalam_realtime_role_topic(p_org_id uuid, p_role_id uuid)
returns text
language sql
stable
as $$
  select case
    when p_org_id is null or p_role_id is null then null
    else 'org:' || p_org_id::text || ':role:' || p_role_id::text || ':notifications'
  end
$$;

create or replace function public.kalam_realtime_allowed_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_role_id uuid;
begin
  if p_topic is null or v_user_id is null then
    return false;
  end if;

  select p.org_id, p.role_id
  into v_org_id, v_role_id
  from public.profiles p
  where p.id = v_user_id
  limit 1;

  if v_org_id is null then
    return false;
  end if;

  if p_topic = public.kalam_realtime_org_topic(v_org_id) then
    return true;
  end if;

  if p_topic = public.kalam_realtime_user_topic(v_org_id, v_user_id) then
    return true;
  end if;

  return v_role_id is not null and p_topic = public.kalam_realtime_role_topic(v_org_id, v_role_id);
end;
$$;

create table if not exists public.notification_inbox_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  source_type text not null,
  source_id text not null,
  section text not null default 'notes',
  category text not null default 'general',
  action text not null default 'upsert',
  title text,
  body text,
  module_id text,
  record_id text,
  target_user_ids uuid[] not null default '{}'::uuid[],
  target_role_ids uuid[] not null default '{}'::uuid[],
  is_org_wide boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  last_event_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_notification_inbox_items_section
    check (section in ('notes', 'bot_messages', 'tasks', 'responsibilities', 'voip_calls', 'sms', 'system')),
  constraint chk_notification_inbox_items_action
    check (action in ('insert', 'update', 'upsert', 'delete', 'status'))
);

create unique index if not exists uq_notification_inbox_items_source
  on public.notification_inbox_items(org_id, source_type, source_id);

create index if not exists idx_notification_inbox_items_org_time
  on public.notification_inbox_items(org_id, last_event_at desc);

create index if not exists idx_notification_inbox_items_org_section_time
  on public.notification_inbox_items(org_id, section, last_event_at desc);

create index if not exists idx_notification_inbox_items_target_users
  on public.notification_inbox_items using gin(target_user_ids);

create index if not exists idx_notification_inbox_items_target_roles
  on public.notification_inbox_items using gin(target_role_ids);

create table if not exists public.notification_read_states (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade default public.current_org_id(),
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  source_type text not null,
  source_id text not null,
  section text not null default 'notes',
  read_at timestamptz,
  dismissed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_notification_read_states_section
    check (section in ('notes', 'bot_messages', 'tasks', 'responsibilities', 'voip_calls', 'sms', 'system'))
);

create unique index if not exists uq_notification_read_states_source
  on public.notification_read_states(org_id, user_id, source_type, source_id);

create index if not exists idx_notification_read_states_user_section
  on public.notification_read_states(org_id, user_id, section, updated_at desc);

create index if not exists idx_notification_read_states_user_read
  on public.notification_read_states(org_id, user_id, read_at desc)
  where read_at is not null;

create index if not exists idx_notification_read_states_user_dismissed
  on public.notification_read_states(org_id, user_id, dismissed_at desc)
  where dismissed_at is not null;

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_notification_inbox_items_updated_at on public.notification_inbox_items;
    create trigger trg_notification_inbox_items_updated_at
      before update on public.notification_inbox_items
      for each row execute function public.set_updated_at();

    drop trigger if exists trg_notification_read_states_updated_at on public.notification_read_states;
    create trigger trg_notification_read_states_updated_at
      before update on public.notification_read_states
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.notification_inbox_items enable row level security;
alter table public.notification_read_states enable row level security;

drop policy if exists p_notification_inbox_items_select_targeted on public.notification_inbox_items;
create policy p_notification_inbox_items_select_targeted on public.notification_inbox_items
  for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      is_org_wide
      or (select auth.uid()) = any(target_user_ids)
      or exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.org_id = notification_inbox_items.org_id
          and p.role_id is not null
          and p.role_id = any(notification_inbox_items.target_role_ids)
      )
    )
  );

drop policy if exists p_notification_read_states_user_all on public.notification_read_states;
create policy p_notification_read_states_user_all on public.notification_read_states
  for all to authenticated
  using (
    org_id = (select public.current_org_id())
    and user_id = (select auth.uid())
  )
  with check (
    org_id = (select public.current_org_id())
    and user_id = (select auth.uid())
  );

grant select on public.notification_inbox_items to authenticated;
grant select, insert, update, delete on public.notification_read_states to authenticated;
grant execute on function public.kalam_realtime_org_topic(uuid) to authenticated;
grant execute on function public.kalam_realtime_user_topic(uuid, uuid) to authenticated;
grant execute on function public.kalam_realtime_role_topic(uuid, uuid) to authenticated;
grant execute on function public.kalam_realtime_allowed_topic(text) to authenticated;

do $$
begin
  if to_regclass('realtime.messages') is not null and to_regprocedure('realtime.topic()') is not null then
    execute 'alter table realtime.messages enable row level security';
    execute 'drop policy if exists p_kalam_notifications_broadcast_topics on realtime.messages';
    execute $policy$
      create policy p_kalam_notifications_broadcast_topics on realtime.messages
        for select to authenticated
        using (
          extension = 'broadcast'
          and public.kalam_realtime_allowed_topic(realtime.topic())
        )
    $policy$;
  end if;
end $$;

create or replace function public.kalam_broadcast_notification(
  p_topic text,
  p_event text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_topic is null or p_event is null then
    return;
  end if;

  if to_regnamespace('realtime') is null or to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then
    return;
  end if;

  execute 'select realtime.send($1, $2, $3, true)'
    using coalesce(p_payload, '{}'::jsonb), p_event, p_topic;
exception
  when invalid_schema_name or undefined_function then
    return;
  when others then
    raise notice 'notification broadcast skipped: %', sqlerrm;
end;
$$;

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
begin
  if p_org_id is null or nullif(trim(coalesce(p_source_type, '')), '') is null or nullif(trim(coalesce(p_source_id, '')), '') is null then
    return null;
  end if;

  insert into public.notification_inbox_items (
    org_id,
    source_type,
    source_id,
    section,
    category,
    action,
    title,
    body,
    module_id,
    record_id,
    target_user_ids,
    target_role_ids,
    is_org_wide,
    payload,
    last_event_at
  )
  values (
    p_org_id,
    trim(p_source_type),
    trim(p_source_id),
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
    last_event_at = greatest(public.notification_inbox_items.last_event_at, excluded.last_event_at),
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.kalam_emit_notification_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_user_id uuid;
  v_role_id uuid;
begin
  v_payload := jsonb_build_object(
    'id', new.id,
    'org_id', new.org_id,
    'source_type', new.source_type,
    'source_id', new.source_id,
    'section', new.section,
    'category', new.category,
    'action', new.action,
    'last_event_at', new.last_event_at,
    'targeted', not new.is_org_wide
  );

  if new.is_org_wide then
    perform public.kalam_broadcast_notification(public.kalam_realtime_org_topic(new.org_id), 'notification', v_payload);
  end if;

  foreach v_user_id in array public.kalam_distinct_uuid_array(new.target_user_ids) loop
    perform public.kalam_broadcast_notification(public.kalam_realtime_user_topic(new.org_id, v_user_id), 'notification', v_payload);
  end loop;

  foreach v_role_id in array public.kalam_distinct_uuid_array(new.target_role_ids) loop
    perform public.kalam_broadcast_notification(public.kalam_realtime_role_topic(new.org_id, v_role_id), 'notification', v_payload);
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notification_inbox_items_broadcast on public.notification_inbox_items;
create trigger trg_notification_inbox_items_broadcast
  after insert or update on public.notification_inbox_items
  for each row execute function public.kalam_emit_notification_item();

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
      'reply_to', nullif(v_row->>'reply_to', '')
    ),
    coalesce(nullif(v_row->>'updated_at', '')::timestamptz, nullif(v_row->>'created_at', '')::timestamptz, now())
  );

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.notes') is not null then
    drop trigger if exists trg_notes_notification_inbox on public.notes;
    create trigger trg_notes_notification_inbox
      after insert or update on public.notes
      for each row execute function public.kalam_notes_notification_trigger();
  end if;
end $$;

create or replace function public.kalam_tasks_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_users uuid[] := '{}'::uuid[];
  v_target_roles uuid[] := '{}'::uuid[];
  v_assignee_type text;
begin
  if new.org_id is null then
    return new;
  end if;

  v_assignee_type := lower(trim(coalesce(new.assignee_type, '')));
  if v_assignee_type = 'role' then
    v_target_roles := public.kalam_distinct_uuid_array(
      case
        when new.assignee_role_id is not null then array[new.assignee_role_id]
        when new.assignee_id is not null then array[new.assignee_id]
        else '{}'::uuid[]
      end
    );
  else
    v_target_users := public.kalam_distinct_uuid_array(
      case when new.assignee_id is null then '{}'::uuid[] else array[new.assignee_id] end
    );
    if new.assignee_role_id is not null then
      v_target_roles := array[new.assignee_role_id];
    end if;
  end if;

  perform public.kalam_upsert_notification_item(
    new.org_id,
    'task',
    new.id::text,
    'tasks',
    coalesce(nullif(trim(new.status), ''), 'task'),
    lower(tg_op),
    nullif(new.name, ''),
    nullif(left(coalesce(new.description, ''), 240), ''),
    'tasks',
    new.id::text,
    v_target_users,
    v_target_roles,
    false,
    jsonb_build_object('status', new.status, 'priority', new.priority, 'due_date', new.due_date),
    coalesce(new.updated_at, new.created_at, now())
  );

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.tasks') is not null then
    drop trigger if exists trg_tasks_notification_inbox on public.tasks;
    create trigger trg_tasks_notification_inbox
      after insert or update on public.tasks
      for each row execute function public.kalam_tasks_notification_trigger();
  end if;
end $$;

create or replace function public.kalam_responsibility_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_org_id uuid := public.kalam_try_uuid(v_row->>'org_id');
  v_record_id text := nullif(v_row->>'id', '');
  v_assignee_id uuid := public.kalam_try_uuid(v_row->>'assignee_id');
  v_assignee_role_id uuid := public.kalam_try_uuid(v_row->>'assignee_role_id');
  v_assignee_type text := lower(trim(coalesce(v_row->>'assignee_type', '')));
  v_target_users uuid[] := '{}'::uuid[];
  v_target_roles uuid[] := '{}'::uuid[];
  v_title text;
begin
  if v_org_id is null or v_record_id is null then
    return new;
  end if;

  if v_assignee_type = 'role' then
    v_target_roles := public.kalam_distinct_uuid_array(
      case
        when v_assignee_role_id is not null then array[v_assignee_role_id]
        when v_assignee_id is not null then array[v_assignee_id]
        else '{}'::uuid[]
      end
    );
  else
    if v_assignee_id is not null then
      v_target_users := array[v_assignee_id];
    end if;
    if v_assignee_role_id is not null then
      v_target_roles := array[v_assignee_role_id];
    end if;
  end if;

  if cardinality(v_target_users) = 0 and cardinality(v_target_roles) = 0 then
    return new;
  end if;

  v_title := coalesce(
    nullif(v_row->>'name', ''),
    nullif(v_row->>'title', ''),
    nullif(v_row->>'full_name', ''),
    nullif(v_row->>'system_code', ''),
    tg_table_name || ':' || v_record_id
  );

  perform public.kalam_upsert_notification_item(
    v_org_id,
    tg_table_name,
    v_record_id,
    'responsibilities',
    tg_table_name,
    lower(tg_op),
    v_title,
    nullif(left(coalesce(v_row->>'description', v_row->>'summary', ''), 240), ''),
    tg_table_name,
    v_record_id,
    v_target_users,
    v_target_roles,
    false,
    jsonb_build_object('table', tg_table_name),
    now()
  );

  return new;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
      and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.column_name = 'assignee_id'
      and exists (
        select 1
        from information_schema.columns idc
        where idc.table_schema = c.table_schema
          and idc.table_name = c.table_name
          and idc.column_name = 'id'
      )
      and exists (
        select 1
        from information_schema.columns orgc
        where orgc.table_schema = c.table_schema
          and orgc.table_name = c.table_name
          and orgc.column_name = 'org_id'
      )
      and c.table_name not in (
        'tasks',
        'profiles',
        'voip_call_logs',
        'outbound_messages',
        'notification_inbox_items',
        'notification_read_states'
      )
  loop
    execute format('drop trigger if exists trg_%I_notification_inbox on public.%I', r.table_name, r.table_name);
    execute format(
      'create trigger trg_%I_notification_inbox after insert or update on public.%I for each row execute function public.kalam_responsibility_notification_trigger()',
      r.table_name,
      r.table_name
    );
  end loop;
end $$;

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
      'message_type', new.message_type
    ),
    coalesce(new.created_at, now())
  );

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.counterparty_bot_messages') is not null then
    drop trigger if exists trg_counterparty_bot_messages_notification_inbox on public.counterparty_bot_messages;
    create trigger trg_counterparty_bot_messages_notification_inbox
      after insert or update on public.counterparty_bot_messages
      for each row execute function public.kalam_counterparty_bot_message_notification_trigger();
  end if;
end $$;

create or replace function public.kalam_counterparty_bot_group_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_users uuid[] := '{}'::uuid[];
  v_target_roles uuid[] := '{}'::uuid[];
  v_is_org_wide boolean := true;
begin
  if new.org_id is null then
    return new;
  end if;

  v_target_users := public.kalam_jsonb_uuid_array(new.metadata->'allowed_user_ids');
  v_target_roles := public.kalam_jsonb_uuid_array(new.metadata->'allowed_role_ids');
  if new.created_by is not null then
    v_target_users := public.kalam_distinct_uuid_array(v_target_users || array[new.created_by]);
  end if;
  v_is_org_wide := cardinality(v_target_users) = 0 and cardinality(v_target_roles) = 0;

  perform public.kalam_upsert_notification_item(
    new.org_id,
    'counterparty_bot_group',
    new.id::text,
    'bot_messages',
    coalesce(nullif(trim(new.channel_type), ''), 'bot'),
    lower(tg_op),
    coalesce(nullif(trim(new.group_title), ''), nullif(trim(new.group_platform_id), ''), 'گروه بات'),
    nullif(trim(new.status), ''),
    case when new.customer_id is not null then 'customers' when new.supplier_id is not null then 'suppliers' else null end,
    coalesce(new.customer_id::text, new.supplier_id::text, null),
    v_target_users,
    v_target_roles,
    v_is_org_wide,
    jsonb_build_object('status', new.status, 'target_type', new.target_type),
    coalesce(new.updated_at, new.created_at, now())
  );

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.counterparty_bot_groups') is not null then
    drop trigger if exists trg_counterparty_bot_groups_notification_inbox on public.counterparty_bot_groups;
    create trigger trg_counterparty_bot_groups_notification_inbox
      after insert or update on public.counterparty_bot_groups
      for each row execute function public.kalam_counterparty_bot_group_notification_trigger();
  end if;
end $$;

create or replace function public.kalam_voip_call_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_users uuid[] := '{}'::uuid[];
  v_target_roles uuid[] := '{}'::uuid[];
  v_profile_ids uuid[];
  v_title text;
  v_assignee_type text;
begin
  if new.org_id is null then
    return new;
  end if;

  v_assignee_type := lower(trim(coalesce(new.assignee_type, '')));
  if v_assignee_type = 'role' then
    v_target_roles := public.kalam_distinct_uuid_array(
      case
        when new.assignee_role_id is not null then array[new.assignee_role_id]
        when new.assignee_id is not null then array[new.assignee_id]
        else '{}'::uuid[]
      end
    );
  elsif new.assignee_id is not null then
    v_target_users := array[new.assignee_id];
  end if;

  if nullif(trim(coalesce(new.extension, '')), '') is not null then
    select coalesce(array_agg(p.id), '{}'::uuid[])
    into v_profile_ids
    from public.profiles p
    where p.org_id = new.org_id
      and nullif(trim(coalesce(p.voip_extension, '')), '') = nullif(trim(coalesce(new.extension, '')), '')
      and coalesce(p.voip_enabled, false);

    v_target_users := public.kalam_distinct_uuid_array(v_target_users || coalesce(v_profile_ids, '{}'::uuid[]));
  end if;

  v_title := coalesce(nullif(trim(new.title), ''), nullif(trim(new.source_number), ''), 'تماس VoIP');

  perform public.kalam_upsert_notification_item(
    new.org_id,
    'voip_call',
    new.id::text,
    'voip_calls',
    coalesce(nullif(trim(new.status), ''), 'call'),
    lower(tg_op),
    v_title,
    nullif(trim(new.destination_number), ''),
    'voip_call_reports',
    new.id::text,
    v_target_users,
    v_target_roles,
    false,
    jsonb_build_object(
      'direction', new.direction,
      'status', new.status,
      'extension', new.extension,
      'module_id', new.module_id,
      'record_id', new.record_id
    ),
    coalesce(new.updated_at, new.started_at, new.created_at, now())
  );

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.voip_call_logs') is not null then
    alter table public.voip_call_logs
      add column if not exists title text,
      add column if not exists assignee_type text,
      add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null;

    drop trigger if exists trg_voip_call_logs_notification_inbox on public.voip_call_logs;
    create trigger trg_voip_call_logs_notification_inbox
      after insert or update on public.voip_call_logs
      for each row execute function public.kalam_voip_call_notification_trigger();
  end if;
end $$;

create or replace function public.kalam_outbound_message_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_users uuid[] := '{}'::uuid[];
  v_target_roles uuid[] := '{}'::uuid[];
  v_section text;
  v_assignee_type text;
begin
  if new.org_id is null then
    return new;
  end if;

  if lower(trim(coalesce(new.channel_type, ''))) = 'sms' then
    return new;
  end if;

  v_assignee_type := lower(trim(coalesce(new.assignee_type, '')));
  if v_assignee_type = 'role' then
    v_target_roles := public.kalam_distinct_uuid_array(
      case
        when new.assignee_role_id is not null then array[new.assignee_role_id]
        when new.assignee_id is not null then array[new.assignee_id]
        else '{}'::uuid[]
      end
    );
  elsif new.assignee_id is not null then
    v_target_users := array[new.assignee_id];
  elsif new.created_by is not null then
    v_target_users := array[new.created_by];
  end if;

  if cardinality(v_target_users) = 0 and cardinality(v_target_roles) = 0 then
    return new;
  end if;

  v_section := 'bot_messages';

  perform public.kalam_upsert_notification_item(
    new.org_id,
    'outbound_message',
    new.id::text,
    v_section,
    coalesce(nullif(trim(new.channel_type), ''), 'message'),
    lower(tg_op),
    coalesce(nullif(trim(new.title), ''), nullif(trim(new.recipient), ''), 'پیام خروجی'),
    nullif(left(coalesce(new.message_text, ''), 240), ''),
    new.module_id,
    new.record_id,
    v_target_users,
    v_target_roles,
    false,
    jsonb_build_object('status', new.status, 'provider', new.provider, 'related_task_id', new.related_task_id),
    coalesce(new.updated_at, new.sent_at, new.created_at, now())
  );

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.outbound_messages') is not null then
    alter table public.outbound_messages
      add column if not exists assignee_type text,
      add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null;

    drop trigger if exists trg_outbound_messages_notification_inbox on public.outbound_messages;
    create trigger trg_outbound_messages_notification_inbox
      after insert or update on public.outbound_messages
      for each row execute function public.kalam_outbound_message_notification_trigger();
  end if;
end $$;

do $$
declare
  v_duplicate_count integer := 0;
begin
  if to_regclass('public.counterparty_bot_messages') is not null then
    select count(*)
    into v_duplicate_count
    from (
      select org_id, channel_type, provider_message_id
      from public.counterparty_bot_messages
      where provider_message_id is not null
      group by org_id, channel_type, provider_message_id
      having count(*) > 1
    ) dupes;

    if v_duplicate_count = 0 then
      create unique index if not exists uq_counterparty_bot_messages_provider_message
        on public.counterparty_bot_messages(org_id, channel_type, provider_message_id)
        where provider_message_id is not null;
    else
      raise notice 'Skipped uq_counterparty_bot_messages_provider_message because duplicate provider messages exist: %', v_duplicate_count;
    end if;
  end if;
end $$;

do $$
declare
  v_duplicate_count integer := 0;
begin
  if to_regclass('public.outbound_messages') is not null then
    select count(*)
    into v_duplicate_count
    from (
      select org_id, channel_type, provider_message_id
      from public.outbound_messages
      where provider_message_id is not null
      group by org_id, channel_type, provider_message_id
      having count(*) > 1
    ) dupes;

    if v_duplicate_count = 0 then
      create unique index if not exists uq_outbound_messages_provider_message
        on public.outbound_messages(org_id, channel_type, provider_message_id)
        where provider_message_id is not null;
    else
      raise notice 'Skipped uq_outbound_messages_provider_message because duplicate provider messages exist: %', v_duplicate_count;
    end if;
  end if;
end $$;

revoke all on function public.kalam_broadcast_notification(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.kalam_upsert_notification_item(uuid, text, text, text, text, text, text, text, text, text, uuid[], uuid[], boolean, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.kalam_emit_notification_item() from public, anon, authenticated;
revoke all on function public.kalam_notes_notification_trigger() from public, anon, authenticated;
revoke all on function public.kalam_tasks_notification_trigger() from public, anon, authenticated;
revoke all on function public.kalam_responsibility_notification_trigger() from public, anon, authenticated;
revoke all on function public.kalam_counterparty_bot_message_notification_trigger() from public, anon, authenticated;
revoke all on function public.kalam_counterparty_bot_group_notification_trigger() from public, anon, authenticated;
revoke all on function public.kalam_voip_call_notification_trigger() from public, anon, authenticated;
revoke all on function public.kalam_outbound_message_notification_trigger() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
