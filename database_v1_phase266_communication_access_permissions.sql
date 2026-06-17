-- =====================================================
-- TazeSystem - Phase 266: Communication access permissions
-- Date: 2026-06-17
-- Type: Security / notification access
-- =====================================================

begin;

-- Ensure the deleted-record guard helper exists (phase239 may not have applied
-- in some production DBs because of a uuid/'' coalesce bug — recreate it here
-- with the source_record_id::text fix so this migration is self-contained).
create or replace function public.kalam_notification_source_exists(
  p_org_id uuid,
  p_source_table text,
  p_source_id text,
  p_record_id text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_source_table text := lower(trim(coalesce(p_source_table, '')));
  v_source_id text := nullif(trim(coalesce(p_source_id, p_record_id, '')), '');
  v_exists boolean := false;
begin
  if p_org_id is null or v_source_table = '' or v_source_id is null then
    return false;
  end if;

  if exists (
    select 1
    from public.recycle_bin_records r
    where r.org_id = p_org_id
      and lower(trim(coalesce(r.source_table, ''))) = v_source_table
      and trim(coalesce(r.source_record_id::text, '')) = v_source_id
  ) then
    return false;
  end if;

  if to_regclass(format('public.%I', v_source_table)) is null then
    return false;
  end if;

  execute format(
    'select exists (
      select 1
      from public.%I src
      where src.org_id = $1
        and src.id::text = $2
    )',
    v_source_table
  )
  into v_exists
  using p_org_id, v_source_id;

  return coalesce(v_exists, false);
exception
  when undefined_table or undefined_column then
    return false;
end;
$$;

grant execute on function public.kalam_notification_source_exists(uuid, text, text, text) to authenticated;
revoke all on function public.kalam_notification_source_exists(uuid, text, text, text) from public, anon;

create or replace function public.kalam_can_view_module_record_by_assignee(
  p_module_id text,
  p_record_org_id uuid,
  p_assignee_type text default null,
  p_assignee_id uuid default null,
  p_assignee_role_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid := public.current_org_id();
  v_role_id uuid;
  v_permissions jsonb := '{}'::jsonb;
  v_module_perm jsonb := '{}'::jsonb;
  v_scope text;
  v_assignee_type text := lower(trim(coalesce(p_assignee_type, '')));
  v_row_user_id uuid;
  v_row_role_id uuid;
begin
  if v_user_id is null or v_org_id is null or p_record_org_id is distinct from v_org_id then
    return false;
  end if;

  select p.role_id, coalesce(r.permissions, '{}'::jsonb)
  into v_role_id, v_permissions
  from public.profiles p
  left join public.org_roles r
    on r.id = p.role_id
   and r.org_id = p.org_id
  where p.id = v_user_id
    and p.org_id = v_org_id
  limit 1;

  if not found then
    return false;
  end if;

  v_module_perm := coalesce(v_permissions -> nullif(trim(coalesce(p_module_id, '')), ''), '{}'::jsonb);
  if lower(trim(coalesce(v_module_perm ->> 'view', 'true'))) = 'false' then
    return false;
  end if;

  v_scope := lower(trim(coalesce(v_module_perm ->> 'record_scope', 'all')));
  if v_scope = '' then
    v_scope := 'all';
  end if;

  if v_scope = 'all' then
    return true;
  end if;

  if v_assignee_type = 'role' then
    v_row_role_id := coalesce(p_assignee_role_id, p_assignee_id);
  elsif v_assignee_type = 'user' then
    v_row_user_id := p_assignee_id;
  else
    v_row_user_id := p_assignee_id;
    v_row_role_id := p_assignee_role_id;
  end if;

  if v_scope = 'own' then
    return v_row_user_id = v_user_id;
  end if;

  if v_scope = 'team' then
    return v_row_user_id = v_user_id or (v_role_id is not null and v_row_role_id = v_role_id);
  end if;

  if v_scope = 'subtree' then
    return v_row_user_id = v_user_id
      or (
        v_role_id is not null
        and v_row_role_id in (
          with recursive role_tree as (
            select id
            from public.org_roles
            where id = v_role_id
              and org_id = v_org_id
            union all
            select child.id
            from public.org_roles child
            join role_tree parent on child.parent_id = parent.id
            where child.org_id = v_org_id
          )
          select id from role_tree
        )
      )
      or (
        v_row_user_id is not null
        and exists (
          with recursive role_tree as (
            select id
            from public.org_roles
            where id = v_role_id
              and org_id = v_org_id
            union all
            select child.id
            from public.org_roles child
            join role_tree parent on child.parent_id = parent.id
            where child.org_id = v_org_id
          )
          select 1
          from public.profiles p
          where p.id = v_row_user_id
            and p.org_id = v_org_id
            and p.role_id in (select id from role_tree)
        )
      );
  end if;

  return false;
end;
$$;

create or replace function public.kalam_can_view_related_communication_target(
  p_module_id text,
  p_record_id uuid,
  p_org_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_module_id text := lower(trim(coalesce(p_module_id, '')));
  v_table_name text;
  v_has_assignee_type boolean;
  v_has_assignee_id boolean;
  v_has_assignee_role_id boolean;
  v_org_id uuid;
  v_assignee_type text;
  v_assignee_id uuid;
  v_assignee_role_id uuid;
  v_sql text;
begin
  if p_org_id is null or p_record_id is null then
    return false;
  end if;

  v_table_name := case v_module_id
    when 'customers' then 'customers'
    when 'suppliers' then 'suppliers'
    when 'employees' then 'employees'
    else null
  end;

  if v_table_name is null then
    return false;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = v_table_name and column_name = 'assignee_type'
  ) into v_has_assignee_type;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = v_table_name and column_name = 'assignee_id'
  ) into v_has_assignee_id;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = v_table_name and column_name = 'assignee_role_id'
  ) into v_has_assignee_role_id;

  v_sql := format(
    'select org_id, %s, %s, %s from public.%I where id = $1 and org_id = $2 limit 1',
    case when v_has_assignee_type then 'assignee_type::text' else 'null::text' end,
    case when v_has_assignee_id then 'assignee_id::uuid' else 'null::uuid' end,
    case when v_has_assignee_role_id then 'assignee_role_id::uuid' else 'null::uuid' end,
    v_table_name
  );

  execute v_sql
  into v_org_id, v_assignee_type, v_assignee_id, v_assignee_role_id
  using p_record_id, p_org_id;

  if v_org_id is null then
    return false;
  end if;

  return public.kalam_can_view_module_record_by_assignee(
    v_module_id,
    v_org_id,
    v_assignee_type,
    v_assignee_id,
    v_assignee_role_id
  );
exception
  when undefined_table or undefined_column or invalid_text_representation then
    return false;
end;
$$;

create or replace function public.kalam_can_view_communication_record(
  p_channel text,
  p_row_org_id uuid,
  p_assignee_type text default null,
  p_assignee_id uuid default null,
  p_assignee_role_id uuid default null,
  p_module_id text default null,
  p_record_id uuid default null,
  p_related_module_id text default null,
  p_related_record_id uuid default null,
  p_customer_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_channel text := lower(trim(coalesce(p_channel, '')));
  v_direct_module text;
  v_module_id text := lower(trim(coalesce(p_module_id, '')));
  v_related_module_id text := lower(trim(coalesce(p_related_module_id, '')));
begin
  if auth.uid() is null or public.current_org_id() is null or p_row_org_id is distinct from public.current_org_id() then
    return false;
  end if;

  v_direct_module := case v_channel
    when 'sms' then 'sms_delivery_reports'
    when 'voip' then 'voip_call_reports'
    else null
  end;

  if v_direct_module is not null and public.kalam_can_view_module_record_by_assignee(
    v_direct_module,
    p_row_org_id,
    p_assignee_type,
    p_assignee_id,
    p_assignee_role_id
  ) then
    return true;
  end if;

  if v_module_id in ('customers', 'suppliers', 'employees')
    and public.kalam_can_view_related_communication_target(v_module_id, p_record_id, p_row_org_id) then
    return true;
  end if;

  if v_related_module_id in ('customers', 'suppliers', 'employees')
    and public.kalam_can_view_related_communication_target(v_related_module_id, p_related_record_id, p_row_org_id) then
    return true;
  end if;

  if p_customer_id is not null
    and public.kalam_can_view_related_communication_target('customers', p_customer_id, p_row_org_id) then
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.get_accessible_sms_delivery_reports(
  p_limit integer default 80
)
returns table (
  id uuid,
  title text,
  module_id text,
  record_id text,
  related_module_id text,
  related_record_id uuid,
  customer_id uuid,
  assignee_id uuid,
  assignee_type text,
  assignee_role_id uuid,
  direction text,
  provider text,
  provider_message_id text,
  sender text,
  recipient text,
  phone_number text,
  phone_number_id uuid,
  phone_match_status text,
  message_text text,
  status text,
  error_message text,
  metadata jsonb,
  sent_at timestamptz,
  received_at timestamptz,
  message_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.title,
    m.module_id,
    m.record_id,
    m.related_module_id,
    public.kalam_try_uuid(m.related_record_id) as related_record_id,
    m.customer_id,
    m.assignee_id,
    m.assignee_type,
    m.assignee_role_id,
    m.direction,
    m.provider,
    m.provider_message_id,
    m.sender,
    m.recipient,
    m.phone_number,
    m.phone_number_id,
    m.phone_match_status,
    m.message_text,
    m.status,
    m.error_message,
    m.metadata,
    m.sent_at,
    m.received_at,
    m.message_at,
    m.created_at,
    m.updated_at
  from public.sms_delivery_reports m
  where m.org_id = public.current_org_id()
    and public.kalam_can_view_communication_record(
      'sms',
      m.org_id,
      m.assignee_type,
      m.assignee_id,
      m.assignee_role_id,
      m.module_id,
      public.kalam_try_uuid(m.record_id),
      m.related_module_id,
      public.kalam_try_uuid(m.related_record_id),
      m.customer_id
    )
  order by m.message_at desc nulls last, m.created_at desc
  limit least(greatest(coalesce(p_limit, 80), 1), 200);
$$;

create or replace function public.get_accessible_voip_call_logs(
  p_limit integer default 80
)
returns table (
  id uuid,
  title text,
  direction text,
  status text,
  source_number text,
  destination_number text,
  extension text,
  module_id text,
  record_id text,
  related_module_id text,
  related_record_id uuid,
  phone_number_id uuid,
  phone_match_status text,
  assignee_id uuid,
  assignee_type text,
  assignee_role_id uuid,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz,
  talk_seconds integer,
  wait_seconds integer,
  call_id text,
  file_id text,
  recording_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.title,
    c.direction,
    c.status,
    c.source_number,
    c.destination_number,
    c.extension,
    c.module_id,
    c.record_id,
    c.related_module_id,
    public.kalam_try_uuid(c.related_record_id) as related_record_id,
    c.phone_number_id,
    c.phone_match_status,
    c.assignee_id,
    c.assignee_type,
    c.assignee_role_id,
    c.started_at,
    c.ended_at,
    c.created_at,
    c.talk_seconds,
    c.wait_seconds,
    c.call_id,
    c.file_id,
    c.recording_url
  from public.voip_call_logs c
  where c.org_id = public.current_org_id()
    and public.kalam_can_view_communication_record(
      'voip',
      c.org_id,
      c.assignee_type,
      c.assignee_id,
      c.assignee_role_id,
      c.module_id,
      public.kalam_try_uuid(c.record_id),
      c.related_module_id,
      public.kalam_try_uuid(c.related_record_id),
      null::uuid
    )
  order by c.started_at desc nulls last, c.created_at desc
  limit least(greatest(coalesce(p_limit, 80), 1), 200);
$$;

grant execute on function public.kalam_can_view_module_record_by_assignee(text, uuid, text, uuid, uuid) to authenticated;
grant execute on function public.kalam_can_view_related_communication_target(text, uuid, uuid) to authenticated;
grant execute on function public.kalam_can_view_communication_record(text, uuid, text, uuid, uuid, text, uuid, text, uuid, uuid) to authenticated;
grant execute on function public.get_accessible_sms_delivery_reports(integer) to authenticated;
grant execute on function public.get_accessible_voip_call_logs(integer) to authenticated;

revoke all on function public.kalam_can_view_module_record_by_assignee(text, uuid, text, uuid, uuid) from public, anon;
revoke all on function public.kalam_can_view_related_communication_target(text, uuid, uuid) from public, anon;
revoke all on function public.kalam_can_view_communication_record(text, uuid, text, uuid, uuid, text, uuid, text, uuid, uuid) from public, anon;
revoke all on function public.get_accessible_sms_delivery_reports(integer) from public, anon;
revoke all on function public.get_accessible_voip_call_logs(integer) from public, anon;

create or replace function public.get_notification_unread_summary_v1(
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
  with me as (
    select
      auth.uid() as user_id,
      public.current_org_id() as org_id,
      p.role_id,
      lower(trim(coalesce(p_variant, ''))) as requested_variant
    from public.profiles p
    where p.id = auth.uid()
      and p.org_id = public.current_org_id()
    limit 1
  ),
  internal_scoped as (
    select
      me.user_id,
      me.org_id,
      n.id as message_id,
      n.author_id,
      n.created_at,
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
      rs.read_at,
      rs.dismissed_at
    from me
    join public.notification_inbox_items nii
      on nii.org_id = me.org_id
     and nii.section = 'notes'
     and nii.source_type = 'note'
     and lower(trim(coalesce(nii.category, ''))) not in ('system', 'assistant')
     and (
       nii.is_org_wide = true
       or me.user_id = any(nii.target_user_ids)
       or (me.role_id is not null and me.role_id = any(nii.target_role_ids))
     )
    join public.notes n
      on n.id::text = nii.source_id
     and n.org_id = nii.org_id
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.section = 'notes'
     and rs.source_type = 'note'
     and rs.source_id = nii.source_id
  ),
  internal_total as (
    select count(*)::integer as value
    from internal_scoped scoped
    left join public.communication_read_cursors crc
      on crc.org_id = scoped.org_id
     and crc.user_id = scoped.user_id
     and crc.channel = 'internal'
     and crc.conversation_key = scoped.conversation_key
    where scoped.conversation_key is not null
      and scoped.conversation_key <> 'system'
      and scoped.author_id is distinct from scoped.user_id
      and scoped.read_at is null
      and scoped.dismissed_at is null
      and not (
        crc.read_through_at is not null
        and (
          scoped.created_at < crc.read_through_at
          or (
            scoped.created_at = crc.read_through_at
            and scoped.message_id::text <= coalesce(crc.read_through_id, scoped.message_id::text)
          )
        )
      )
  ),
  note_like_total as (
    select count(*)::integer as value
    from me
    join public.notification_inbox_items nii
      on nii.org_id = me.org_id
     and nii.section = 'notes'
     and nii.source_type = 'note_like'
     and (
       nii.is_org_wide = true
       or me.user_id = any(nii.target_user_ids)
       or (me.role_id is not null and me.role_id = any(nii.target_role_ids))
     )
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.section = 'notes'
     and rs.source_type = 'note_like'
     and rs.source_id = nii.source_id
    where rs.read_at is null
      and rs.dismissed_at is null
  ),
  bot_total as (
    select coalesce(sum(unread.unread_count), 0)::integer as value
    from me
    join public.counterparty_bot_groups g
      on g.org_id = me.org_id
     and public.kalam_can_access_bot_group(g.id, g.org_id)
    left join public.communication_read_cursors crc
      on crc.org_id = me.org_id
     and crc.user_id = me.user_id
     and crc.channel = 'bot'
     and crc.conversation_key = 'bot:' || g.id::text
    left join lateral (
      select count(*)::integer as unread_count
      from public.counterparty_bot_messages m
      left join public.notification_read_states rs
        on rs.org_id = me.org_id
       and rs.user_id = me.user_id
       and rs.section = 'bot_messages'
       and rs.source_type = 'counterparty_bot_message'
       and rs.source_id = m.id::text
      where m.org_id = g.org_id
        and m.bot_group_id = g.id
        and m.direction = 'inbound'
        and rs.read_at is null
        and rs.dismissed_at is null
        and (
          crc.read_through_at is null
          or m.created_at > crc.read_through_at
          or (
            m.created_at = crc.read_through_at
            and m.id::text > coalesce(crc.read_through_id, '')
          )
        )
    ) unread on true
  ),
  sms_total as (
    select count(*)::integer as value
    from me
    join public.outbound_messages m
      on m.org_id = me.org_id
     and m.channel_type = 'sms'
     and m.direction = 'inbound'
     and public.kalam_can_view_communication_record(
       'sms',
       m.org_id,
       m.assignee_type,
       m.assignee_id,
       m.assignee_role_id,
       m.module_id,
       public.kalam_try_uuid(m.record_id),
       m.related_module_id,
       public.kalam_try_uuid(m.related_record_id),
       m.customer_id
     )
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.section in ('sms', 'sms_messages')
     and rs.source_type = 'inbound_sms'
     and rs.source_id = m.id::text
    where rs.read_at is null
      and rs.dismissed_at is null
  ),
  voip_total as (
    select count(*)::integer as value
    from me
    join public.voip_call_logs c
      on c.org_id = me.org_id
     and c.direction = 'incoming'
     and public.kalam_can_view_communication_record(
       'voip',
       c.org_id,
       c.assignee_type,
       c.assignee_id,
       c.assignee_role_id,
       c.module_id,
       public.kalam_try_uuid(c.record_id),
       c.related_module_id,
       public.kalam_try_uuid(c.related_record_id),
       null::uuid
     )
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.section = 'voip_calls'
     and rs.source_type = 'voip_call'
     and rs.source_id = c.id::text
    where rs.read_at is null
      and rs.dismissed_at is null
  ),
  tasks_total as (
    select count(distinct t.id)::integer as value
    from me
    join public.tasks t
      on t.org_id = me.org_id
     and lower(trim(coalesce(t.status, ''))) <> 'canceled'
     and not exists (
       select 1
       from public.recycle_bin_records r
       where r.org_id = me.org_id
         and lower(trim(coalesce(r.source_table, ''))) = 'tasks'
         and trim(coalesce(r.source_record_id::text, '')) = t.id::text
     )
     and (
       (t.assignee_type = 'user' and t.assignee_id = me.user_id)
       or (t.assignee_type = 'role' and me.role_id is not null and t.assignee_role_id = me.role_id)
       or (t.assignee_type = 'role' and me.role_id is not null and t.assignee_id = me.role_id)
       or (nullif(trim(coalesce(t.assignee_type, '')), '') is null and t.assignee_id = me.user_id)
       or (nullif(trim(coalesce(t.assignee_type, '')), '') is null and me.role_id is not null and t.assignee_id = me.role_id)
     )
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.section = 'tasks'
     and rs.source_type = 'task'
     and rs.source_id = t.id::text
    where rs.read_at is null
      and rs.dismissed_at is null
  ),
  responsibilities_total as (
    select count(*)::integer as value
    from me
    join public.notification_inbox_items nii
      on nii.org_id = me.org_id
     and nii.section = 'responsibilities'
     and public.kalam_notification_source_exists(
       me.org_id,
       nii.source_type,
       coalesce(nullif(trim(nii.source_id), ''), nullif(trim(nii.record_id), '')),
       nii.record_id
     )
     and (
       nii.is_org_wide = true
       or me.user_id = any(nii.target_user_ids)
       or (me.role_id is not null and me.role_id = any(nii.target_role_ids))
     )
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.section = 'responsibilities'
     and rs.source_type = nii.source_type
     and rs.source_id = nii.source_id
    where rs.read_at is null
      and rs.dismissed_at is null
  ),
  summary as (
    select 'notes'::text as section, (coalesce(internal_total.value, 0) + coalesce(note_like_total.value, 0))::integer as unread_count from internal_total cross join note_like_total
    union all select 'bot_messages', coalesce(value, 0)::integer from bot_total
    union all select 'sms_messages', coalesce(value, 0)::integer from sms_total
    union all select 'voip_calls', coalesce(value, 0)::integer from voip_total
    union all select 'tasks', coalesce(value, 0)::integer from tasks_total
    union all select 'responsibilities', coalesce(value, 0)::integer from responsibilities_total
  )
  select summary.section, summary.unread_count
  from summary
  cross join me
  where me.requested_variant not in ('chat', 'alerts')
     or (me.requested_variant = 'chat' and summary.section in ('notes', 'bot_messages', 'sms_messages', 'voip_calls'))
     or (me.requested_variant = 'alerts' and summary.section in ('tasks', 'responsibilities'))
  order by case summary.section
    when 'notes' then 1
    when 'bot_messages' then 2
    when 'sms_messages' then 3
    when 'voip_calls' then 4
    when 'tasks' then 5
    when 'responsibilities' then 6
    else 99
  end;
$$;

grant execute on function public.get_notification_unread_summary_v1(text) to authenticated;
revoke all on function public.get_notification_unread_summary_v1(text) from public, anon;

create or replace function public.get_notification_overlay_feed_v1(
  p_before_cursor text default null,
  p_limit integer default 20
)
returns table (
  section text,
  source_type text,
  source_id text,
  title text,
  body text,
  created_at timestamptz,
  module_id text,
  record_id text,
  conversation_key text,
  payload jsonb,
  feed_cursor text,
  has_more boolean
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
      and p.org_id = public.current_org_id()
    limit 1
  ),
  cursor_value as (
    select
      nullif(split_part(coalesce(p_before_cursor, ''), '|', 1), '')::timestamptz as before_at,
      nullif(split_part(coalesce(p_before_cursor, ''), '|', 2), '') as before_key
  ),
  note_rows as (
    select
      'notes'::text as section,
      nii.source_type,
      nii.source_id,
      coalesce(nullif(trim(nii.title), ''), case when nii.category in ('system', 'assistant') then 'پیام سیستم' else 'پیام داخلی' end) as title,
      coalesce(nullif(trim(nii.body), ''), nullif(trim(n.content), ''), 'پیام جدید') as body,
      coalesce(nii.last_event_at, nii.created_at, n.created_at) as created_at,
      nullif(trim(coalesce(nii.module_id, n.module_id)), '') as module_id,
      nullif(trim(coalesce(nii.record_id, n.record_id)), '') as record_id,
      conv.conversation_key,
      coalesce(nii.payload, '{}'::jsonb)
        || jsonb_build_object(
          'category', nii.category,
          'conversation_key', conv.conversation_key,
          'author_name', coalesce(nullif(trim(n.author_name), ''), nullif(trim(author_profile.full_name), '')),
          'author_avatar_url', nullif(trim(coalesce(author_profile.avatar_url, '')), ''),
          'conversation_title',
            case
              when conv.conversation_key = 'system' then 'پیام‌های سیستم'
              when conv.conversation_key like 'group:%' then coalesce(nullif(trim(chat_group.name), ''), 'گروه')
              else coalesce(nullif(trim(n.author_name), ''), nullif(trim(author_profile.full_name), ''), 'کاربر سیستم')
            end,
          'conversation_avatar_url',
            case
              when conv.conversation_key like 'direct:%' then nullif(trim(coalesce(author_profile.avatar_url, '')), '')
              else null
            end,
          'group_title', nullif(trim(coalesce(chat_group.name, '')), '')
        ) as payload
    from me
    join public.notification_inbox_items nii
      on nii.org_id = me.org_id
     and nii.section = 'notes'
     and nii.source_type = 'note'
     and (
       nii.is_org_wide = true
       or me.user_id = any(nii.target_user_ids)
       or (me.role_id is not null and me.role_id = any(nii.target_role_ids))
     )
    join public.notes n
      on n.org_id = nii.org_id
     and n.id::text = nii.source_id
    left join public.profiles author_profile
      on author_profile.org_id = me.org_id
     and author_profile.id = n.author_id
    left join lateral (
      select coalesce(
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
      ) as conversation_key
    ) conv on true
    left join public.chat_groups chat_group
      on chat_group.org_id = me.org_id
     and chat_group.id = case
       when conv.conversation_key ~ '^group:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         then substring(conv.conversation_key from 7)::uuid
       else null::uuid
     end
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.source_type = nii.source_type
     and rs.source_id = nii.source_id
    left join public.communication_read_cursors crc
      on crc.org_id = me.org_id
     and crc.user_id = me.user_id
     and crc.channel = 'internal'
     and crc.conversation_key = conv.conversation_key
    where n.author_id is distinct from me.user_id
      and rs.read_at is null
      and rs.dismissed_at is null
      and (rs.snoozed_until is null or rs.snoozed_until <= now())
      and (
        conv.conversation_key = 'system'
        or crc.read_through_at is null
        or n.created_at > crc.read_through_at
        or (
          n.created_at = crc.read_through_at
          and n.id::text > coalesce(crc.read_through_id, '')
        )
      )
  ),
  responsibility_rows as (
    select
      'responsibilities'::text,
      nii.source_type,
      nii.source_id,
      coalesce(nullif(trim(nii.title), ''), 'مسئولیت جدید'),
      coalesce(nullif(trim(nii.body), ''), 'یک رکورد نیاز به رسیدگی دارد.'),
      coalesce(nii.last_event_at, nii.created_at),
      nullif(trim(nii.module_id), ''),
      nullif(trim(nii.record_id), ''),
      null::text,
      coalesce(nii.payload, '{}'::jsonb)
    from me
    join public.notification_inbox_items nii
      on nii.org_id = me.org_id
     and nii.section = 'responsibilities'
     and public.kalam_notification_source_exists(
       me.org_id,
       nii.source_type,
       coalesce(nullif(trim(nii.source_id), ''), nullif(trim(nii.record_id), '')),
       nii.record_id
     )
     and (
       nii.is_org_wide = true
       or me.user_id = any(nii.target_user_ids)
       or (me.role_id is not null and me.role_id = any(nii.target_role_ids))
     )
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.source_type = nii.source_type
     and rs.source_id = nii.source_id
    where rs.read_at is null
      and rs.dismissed_at is null
      and (rs.snoozed_until is null or rs.snoozed_until <= now())
  ),
  task_rows as (
    select
      'tasks'::text,
      'task'::text,
      t.id::text,
      coalesce(nullif(trim(t.name), ''), 'فعالیت جدید'),
      'یک فعالیت به شما ارجاع شده است.'::text,
      t.created_at,
      'tasks'::text,
      t.id::text,
      null::text,
      jsonb_build_object('status', t.status, 'priority', t.priority)
    from me
    join public.tasks t
      on t.org_id = me.org_id
     and lower(trim(coalesce(t.status, ''))) <> 'canceled'
     and not exists (
       select 1
       from public.recycle_bin_records r
       where r.org_id = me.org_id
         and lower(trim(coalesce(r.source_table, ''))) = 'tasks'
         and trim(coalesce(r.source_record_id::text, '')) = t.id::text
     )
     and (
       (t.assignee_type = 'user' and t.assignee_id = me.user_id)
       or (t.assignee_type = 'role' and me.role_id is not null and (t.assignee_role_id = me.role_id or t.assignee_id = me.role_id))
       or (nullif(trim(coalesce(t.assignee_type, '')), '') is null and (t.assignee_id = me.user_id or t.assignee_id = me.role_id))
     )
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.source_type = 'task'
     and rs.source_id = t.id::text
    where rs.read_at is null
      and rs.dismissed_at is null
      and (rs.snoozed_until is null or rs.snoozed_until <= now())
  ),
  bot_rows as (
    select
      'bot_messages'::text,
      'counterparty_bot_message'::text,
      m.id::text,
      coalesce(nullif(trim(g.group_title), ''), 'پیام جدید بات'),
      coalesce(nullif(trim(m.content_text), ''), nullif(trim(m.file_name), ''), 'پیام جدید'),
      m.created_at,
      null::text,
      null::text,
      'bot:' || g.id::text,
      coalesce(m.payload, '{}'::jsonb)
        || jsonb_build_object(
          'bot_group_id', g.id::text,
          'group_title', coalesce(nullif(trim(g.group_title), ''), nullif(trim(c.business_name), ''), nullif(trim(c.full_name), ''), nullif(trim(s.business_name), ''), nullif(trim(s.full_name), ''), 'گروه بات'),
          'conversation_title', coalesce(nullif(trim(g.group_title), ''), 'گروه بات'),
          'group_avatar_url', coalesce(nullif(trim(c.image_url), ''), nullif(trim(s.image_url), ''), nullif(trim(g.metadata->>'avatar_url'), '')),
          'counterparty_image_url', coalesce(nullif(trim(c.image_url), ''), nullif(trim(s.image_url), '')),
          'sender_display_name', coalesce(
            nullif(trim(m.payload->>'sender_display_name'), ''),
            nullif(trim(m.payload->>'sender_name'), ''),
            nullif(trim(m.payload->>'username'), ''),
            nullif(trim(m.payload->>'sender_id'), ''),
            nullif(trim(m.payload->>'user_id'), '')
          ),
          'sender_avatar_url', nullif(trim(coalesce(m.payload->>'sender_avatar_url', '')), '')
        )
    from me
    join public.counterparty_bot_groups g
      on g.org_id = me.org_id
     and public.kalam_can_access_bot_group(g.id, g.org_id)
    join public.counterparty_bot_messages m
      on m.org_id = g.org_id
     and m.bot_group_id = g.id
     and m.direction = 'inbound'
    left join public.customers c
      on c.org_id = me.org_id
     and c.id = g.customer_id
    left join public.suppliers s
      on s.org_id = me.org_id
     and s.id = g.supplier_id
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.source_type = 'counterparty_bot_message'
     and rs.source_id = m.id::text
    left join public.communication_read_cursors crc
      on crc.org_id = me.org_id
     and crc.user_id = me.user_id
     and crc.channel = 'bot'
     and crc.conversation_key = 'bot:' || g.id::text
    where rs.read_at is null
      and rs.dismissed_at is null
      and (rs.snoozed_until is null or rs.snoozed_until <= now())
      and (
        crc.read_through_at is null
        or m.created_at > crc.read_through_at
        or (m.created_at = crc.read_through_at and m.id::text > coalesce(crc.read_through_id, ''))
      )
  ),
  sms_rows as (
    select
      'sms_messages'::text,
      'inbound_sms'::text,
      m.id::text,
      coalesce(nullif(trim(m.sender), ''), 'پیامک ورودی'),
      coalesce(nullif(trim(m.message_text), ''), 'پیامک جدید'),
      coalesce(m.received_at, m.sent_at, m.created_at),
      nullif(trim(m.module_id), ''),
      nullif(trim(m.record_id), ''),
      null::text,
      jsonb_build_object(
        'sender', m.sender,
        'related_module_id', m.related_module_id,
        'related_record_id', m.related_record_id,
        'customer_id', m.customer_id
      )
    from me
    join public.outbound_messages m
      on m.org_id = me.org_id
     and m.channel_type = 'sms'
     and m.direction = 'inbound'
     and public.kalam_can_view_communication_record(
       'sms',
       m.org_id,
       m.assignee_type,
       m.assignee_id,
       m.assignee_role_id,
       m.module_id,
       public.kalam_try_uuid(m.record_id),
       m.related_module_id,
       public.kalam_try_uuid(m.related_record_id),
       m.customer_id
     )
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.source_type = 'inbound_sms'
     and rs.source_id = m.id::text
    where rs.read_at is null
      and rs.dismissed_at is null
      and (rs.snoozed_until is null or rs.snoozed_until <= now())
  ),
  voip_rows as (
    select
      'voip_calls'::text,
      'voip_call'::text,
      c.id::text,
      coalesce(nullif(trim(c.title), ''), nullif(trim(c.source_number), ''), 'تماس ورودی'),
      'تماس ورودی پاسخ‌داده‌نشده یا بررسی‌نشده'::text,
      coalesce(c.started_at, c.created_at),
      nullif(trim(c.module_id), ''),
      nullif(trim(c.record_id), ''),
      null::text,
      jsonb_build_object(
        'source_number', c.source_number,
        'extension', c.extension,
        'related_module_id', c.related_module_id,
        'related_record_id', c.related_record_id
      )
    from me
    join public.voip_call_logs c
      on c.org_id = me.org_id
     and c.direction = 'incoming'
     and public.kalam_can_view_communication_record(
       'voip',
       c.org_id,
       c.assignee_type,
       c.assignee_id,
       c.assignee_role_id,
       c.module_id,
       public.kalam_try_uuid(c.record_id),
       c.related_module_id,
       public.kalam_try_uuid(c.related_record_id),
       null::uuid
     )
    left join public.notification_read_states rs
      on rs.org_id = me.org_id
     and rs.user_id = me.user_id
     and rs.source_type = 'voip_call'
     and rs.source_id = c.id::text
    where rs.read_at is null
      and rs.dismissed_at is null
      and (rs.snoozed_until is null or rs.snoozed_until <= now())
  ),
  all_rows as (
    select * from note_rows
    union all select * from responsibility_rows
    union all select * from task_rows
    union all select * from bot_rows
    union all select * from sms_rows
    union all select * from voip_rows
  ),
  scoped as (
    select all_rows.*
    from all_rows
    cross join cursor_value c
    where c.before_at is null
       or all_rows.created_at < c.before_at
       or (
         all_rows.created_at = c.before_at
         and concat_ws(':', all_rows.section, all_rows.source_type, all_rows.source_id) < coalesce(c.before_key, '')
       )
  ),
  page as (
    select *
    from scoped
    order by created_at desc, section desc, source_type desc, source_id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50) + 1
  ),
  visible_page as (
    select *
    from page
    order by created_at desc, section desc, source_type desc, source_id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ),
  page_meta as (
    select count(*) > least(greatest(coalesce(p_limit, 20), 1), 50) as has_more
    from page
  )
  select
    visible_page.section,
    visible_page.source_type,
    visible_page.source_id,
    visible_page.title,
    visible_page.body,
    visible_page.created_at,
    visible_page.module_id,
    visible_page.record_id,
    visible_page.conversation_key,
    visible_page.payload,
    visible_page.created_at::text || '|' || concat_ws(':', visible_page.section, visible_page.source_type, visible_page.source_id) as feed_cursor,
    page_meta.has_more
  from visible_page
  cross join page_meta
  order by visible_page.created_at desc, visible_page.section desc, visible_page.source_type desc, visible_page.source_id desc;
$$;

grant execute on function public.get_notification_overlay_feed_v1(text, integer) to authenticated;
revoke all on function public.get_notification_overlay_feed_v1(text, integer) from public, anon;

notify pgrst, 'reload schema';

commit;
