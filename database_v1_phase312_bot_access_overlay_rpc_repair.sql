-- =====================================================
-- TazeSystem - Phase 312: Bot access and overlay RPC repair
-- Date: 2026-07-06
-- Type: Security / bug fix / idempotent
-- =====================================================

begin;

alter table if exists public.counterparty_bot_messages
  add column if not exists message_type text not null default 'text',
  add column if not exists file_url text,
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists payload jsonb not null default '{}'::jsonb;

alter table if exists public.counterparty_bot_direct_threads
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

do $$
begin
  if to_regclass('public.counterparty_bot_direct_threads') is not null
     and to_regclass('public.bot_chat_identity_bindings') is not null then
    update public.counterparty_bot_direct_threads t
    set created_by = coalesce(t.created_by, t.profile_id, b.profile_id),
        updated_by = coalesce(t.updated_by, t.profile_id, b.profile_id)
    from public.bot_chat_identity_bindings b
    where b.id = t.binding_id
      and t.org_id = b.org_id
      and (t.created_by is null or t.updated_by is null);
  end if;

  if to_regclass('public.counterparty_bot_direct_threads') is not null then
    update public.counterparty_bot_direct_threads
    set created_by = coalesce(created_by, profile_id),
        updated_by = coalesce(updated_by, profile_id)
    where (created_by is null or updated_by is null)
      and profile_id is not null;
  end if;
end;
$$;

create or replace function public.set_counterparty_bot_direct_thread_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by := auth.uid();
    end if;
    if new.updated_by is null then
      new.updated_by := auth.uid();
    end if;
  elsif tg_op = 'UPDATE' then
    new.updated_by := coalesce(auth.uid(), new.updated_by, old.updated_by);
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.counterparty_bot_direct_threads') is not null then
    drop trigger if exists trg_counterparty_bot_direct_threads_audit on public.counterparty_bot_direct_threads;
    create trigger trg_counterparty_bot_direct_threads_audit
      before insert or update on public.counterparty_bot_direct_threads
      for each row execute function public.set_counterparty_bot_direct_thread_audit();
  end if;
end;
$$;

create or replace function public.kalam_normalize_phone_digits(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(
    translate(
      coalesce(p_value, ''),
      '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩',
      '01234567890123456789'
    ),
    '\D',
    '',
    'g'
  );
$$;

create or replace function public.kalam_can_access_bot_group(p_group_id uuid, p_org_id uuid default null)
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
  v_group record;
  v_allowed_users uuid[];
  v_allowed_roles uuid[];
begin
  if v_user_id is null or v_org_id is null or p_group_id is null then
    return false;
  end if;

  if p_org_id is not null and p_org_id is distinct from v_org_id then
    return false;
  end if;

  select p.role_id
  into v_role_id
  from public.profiles p
  where p.id = v_user_id
    and p.org_id = v_org_id
  limit 1;

  select
    g.created_by,
    coalesce(g.metadata, '{}'::jsonb) as metadata
  into v_group
  from public.counterparty_bot_groups g
  where g.id = p_group_id
    and g.org_id = v_org_id
  limit 1;

  if not found then
    return false;
  end if;

  v_allowed_users := public.kalam_jsonb_uuid_array(v_group.metadata -> 'allowed_user_ids');
  v_allowed_roles := public.kalam_jsonb_uuid_array(v_group.metadata -> 'allowed_role_ids');

  if coalesce(v_group.created_by = v_user_id, false) then
    return true;
  end if;

  if coalesce(array_length(v_allowed_users, 1), 0) = 0
     and coalesce(array_length(v_allowed_roles, 1), 0) = 0 then
    return false;
  end if;

  return v_user_id = any(v_allowed_users)
    or (v_role_id is not null and v_role_id = any(v_allowed_roles));
end;
$$;

create or replace function public.kalam_can_access_bot_direct_thread(p_thread_id uuid, p_org_id uuid default null)
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
  v_thread record;
  v_allowed_users uuid[];
  v_allowed_roles uuid[];
begin
  if v_user_id is null or v_org_id is null or p_thread_id is null then
    return false;
  end if;

  if p_org_id is not null and p_org_id is distinct from v_org_id then
    return false;
  end if;

  select p.role_id
  into v_role_id
  from public.profiles p
  where p.id = v_user_id
    and p.org_id = v_org_id
  limit 1;

  select
    t.created_by,
    t.profile_id,
    coalesce(t.metadata, '{}'::jsonb) as metadata
  into v_thread
  from public.counterparty_bot_direct_threads t
  where t.id = p_thread_id
    and t.org_id = v_org_id
  limit 1;

  if not found then
    return false;
  end if;

  v_allowed_users := public.kalam_jsonb_uuid_array(v_thread.metadata -> 'allowed_user_ids');
  v_allowed_roles := public.kalam_jsonb_uuid_array(v_thread.metadata -> 'allowed_role_ids');

  if coalesce(v_thread.created_by = v_user_id, false)
     or coalesce(v_thread.profile_id = v_user_id, false) then
    return true;
  end if;

  if coalesce(array_length(v_allowed_users, 1), 0) = 0
     and coalesce(array_length(v_allowed_roles, 1), 0) = 0 then
    return false;
  end if;

  return v_user_id = any(v_allowed_users)
    or (v_role_id is not null and v_role_id = any(v_allowed_roles));
end;
$$;

do $$
begin
  if to_regclass('public.counterparty_bot_direct_threads') is not null then
    alter table public.counterparty_bot_direct_threads enable row level security;

    drop policy if exists p_counterparty_bot_direct_threads_tenant_select on public.counterparty_bot_direct_threads;
    drop policy if exists p_counterparty_bot_direct_threads_tenant_insert on public.counterparty_bot_direct_threads;
    drop policy if exists p_counterparty_bot_direct_threads_tenant_update on public.counterparty_bot_direct_threads;
    drop policy if exists p_counterparty_bot_direct_threads_tenant_delete on public.counterparty_bot_direct_threads;

    create policy p_counterparty_bot_direct_threads_tenant_select
      on public.counterparty_bot_direct_threads
      for select
      to authenticated
      using (
        org_id = public.current_org_id()
        and public.kalam_can_access_bot_direct_thread(id, org_id)
      );

    create policy p_counterparty_bot_direct_threads_tenant_insert
      on public.counterparty_bot_direct_threads
      for insert
      to authenticated
      with check (
        org_id = public.current_org_id()
        and (created_by is null or created_by = auth.uid())
      );

    create policy p_counterparty_bot_direct_threads_tenant_update
      on public.counterparty_bot_direct_threads
      for update
      to authenticated
      using (
        org_id = public.current_org_id()
        and public.kalam_can_access_bot_direct_thread(id, org_id)
      )
      with check (
        org_id = public.current_org_id()
        and public.kalam_can_access_bot_direct_thread(id, org_id)
      );

    create policy p_counterparty_bot_direct_threads_tenant_delete
      on public.counterparty_bot_direct_threads
      for delete
      to authenticated
      using (
        org_id = public.current_org_id()
        and public.kalam_can_access_bot_direct_thread(id, org_id)
      );
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.counterparty_bot_direct_messages') is not null then
    alter table public.counterparty_bot_direct_messages enable row level security;

    drop policy if exists p_counterparty_bot_direct_messages_tenant_select on public.counterparty_bot_direct_messages;
    drop policy if exists p_counterparty_bot_direct_messages_tenant_insert on public.counterparty_bot_direct_messages;
    drop policy if exists p_counterparty_bot_direct_messages_tenant_update on public.counterparty_bot_direct_messages;
    drop policy if exists p_counterparty_bot_direct_messages_tenant_delete on public.counterparty_bot_direct_messages;

    create policy p_counterparty_bot_direct_messages_tenant_select
      on public.counterparty_bot_direct_messages
      for select
      to authenticated
      using (
        org_id = public.current_org_id()
        and direct_thread_id is not null
        and public.kalam_can_access_bot_direct_thread(direct_thread_id, org_id)
      );

    create policy p_counterparty_bot_direct_messages_tenant_insert
      on public.counterparty_bot_direct_messages
      for insert
      to authenticated
      with check (
        org_id = public.current_org_id()
        and direct_thread_id is not null
        and public.kalam_can_access_bot_direct_thread(direct_thread_id, org_id)
        and (created_by is null or created_by = auth.uid())
      );

    create policy p_counterparty_bot_direct_messages_tenant_update
      on public.counterparty_bot_direct_messages
      for update
      to authenticated
      using (
        org_id = public.current_org_id()
        and direct_thread_id is not null
        and public.kalam_can_access_bot_direct_thread(direct_thread_id, org_id)
      )
      with check (
        org_id = public.current_org_id()
        and direct_thread_id is not null
        and public.kalam_can_access_bot_direct_thread(direct_thread_id, org_id)
      );

    create policy p_counterparty_bot_direct_messages_tenant_delete
      on public.counterparty_bot_direct_messages
      for delete
      to authenticated
      using (
        org_id = public.current_org_id()
        and direct_thread_id is not null
        and public.kalam_can_access_bot_direct_thread(direct_thread_id, org_id)
      );
  end if;
end;
$$;

create or replace function public.kalam_can_view_communication_record_v2(
  p_channel text,
  p_row_org_id uuid,
  p_assignee_type text default null,
  p_assignee_id uuid default null,
  p_assignee_role_id uuid default null,
  p_module_id text default null,
  p_record_id uuid default null,
  p_related_module_id text default null,
  p_related_record_id uuid default null,
  p_customer_id uuid default null,
  p_sender text default null,
  p_recipient text default null,
  p_phone_number text default null,
  p_source_number text default null,
  p_destination_number text default null,
  p_extension text default null
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
  v_user_id uuid := auth.uid();
  v_org_id uuid := public.current_org_id();
  v_profile_mobile_1 text;
  v_profile_mobile text;
  v_profile_voip_extension text;
  v_profile_phone text;
  v_profile_phone_tail text;
  v_sender text := public.kalam_normalize_phone_digits(p_sender);
  v_recipient text := public.kalam_normalize_phone_digits(p_recipient);
  v_phone_number text := public.kalam_normalize_phone_digits(p_phone_number);
  v_source_number text := public.kalam_normalize_phone_digits(p_source_number);
  v_destination_number text := public.kalam_normalize_phone_digits(p_destination_number);
begin
  if v_user_id is null or v_org_id is null or p_row_org_id is distinct from v_org_id then
    return false;
  end if;

  select
    p.mobile_1,
    p.mobile,
    p.voip_extension
  into v_profile_mobile_1, v_profile_mobile, v_profile_voip_extension
  from public.profiles p
  where p.id = v_user_id
    and p.org_id = v_org_id
  limit 1;

  if not found then
    return false;
  end if;

  v_profile_phone := public.kalam_normalize_phone_digits(coalesce(v_profile_mobile_1, v_profile_mobile, ''));
  v_profile_phone_tail := case when length(v_profile_phone) >= 10 then right(v_profile_phone, 10) else v_profile_phone end;

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

  if v_channel = 'sms'
     and v_profile_phone <> ''
     and (
       v_sender like '%' || v_profile_phone
       or v_recipient like '%' || v_profile_phone
       or v_phone_number like '%' || v_profile_phone
       or (v_profile_phone_tail <> '' and (
         right(v_sender, 10) = v_profile_phone_tail
         or right(v_recipient, 10) = v_profile_phone_tail
         or right(v_phone_number, 10) = v_profile_phone_tail
       ))
     ) then
    return true;
  end if;

  if v_channel = 'voip'
     and nullif(trim(coalesce(v_profile_voip_extension, '')), '') is not null
     and nullif(trim(coalesce(p_extension, '')), '') = nullif(trim(coalesce(v_profile_voip_extension, '')), '') then
    return true;
  end if;

  if v_channel = 'voip'
     and v_profile_phone <> ''
     and (
       v_source_number like '%' || v_profile_phone
       or v_destination_number like '%' || v_profile_phone
       or v_phone_number like '%' || v_profile_phone
       or (v_profile_phone_tail <> '' and (
         right(v_source_number, 10) = v_profile_phone_tail
         or right(v_destination_number, 10) = v_profile_phone_tail
         or right(v_phone_number, 10) = v_profile_phone_tail
       ))
     ) then
    return true;
  end if;

  if v_module_id = 'profiles' and p_record_id = v_user_id then
    return true;
  end if;

  if v_related_module_id = 'profiles' and p_related_record_id = v_user_id then
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
    and public.kalam_can_view_communication_record_v2(
      'sms',
      m.org_id,
      m.assignee_type,
      m.assignee_id,
      m.assignee_role_id,
      m.module_id,
      public.kalam_try_uuid(m.record_id),
      m.related_module_id,
      public.kalam_try_uuid(m.related_record_id),
      m.customer_id,
      m.sender,
      m.recipient,
      m.phone_number,
      null,
      null,
      null
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
    and public.kalam_can_view_communication_record_v2(
      'voip',
      c.org_id,
      c.assignee_type,
      c.assignee_id,
      c.assignee_role_id,
      c.module_id,
      public.kalam_try_uuid(c.record_id),
      c.related_module_id,
      public.kalam_try_uuid(c.related_record_id),
      null::uuid,
      null,
      null,
      null,
      c.source_number,
      c.destination_number,
      c.extension
    )
  order by c.started_at desc nulls last, c.created_at desc
  limit least(greatest(coalesce(p_limit, 80), 1), 200);
$$;

create or replace function public.get_notification_overlay_feed_v3(
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
  select
    feed.section,
    feed.source_type,
    feed.source_id,
    feed.title,
    feed.body,
    feed.created_at,
    feed.module_id,
    feed.record_id,
    feed.conversation_key,
    coalesce(feed.payload, '{}'::jsonb)
      || case
        when feed.section = 'notes' and n.id is not null then
          jsonb_build_object(
            'attachment_previews',
            public.kalam_extract_note_attachment_previews(n.content)
          )
        when feed.section = 'bot_messages' and m.id is not null then
          jsonb_build_object(
            'attachment_previews',
            (
              case
                when jsonb_typeof(coalesce(m.payload, '{}'::jsonb) -> 'attachments') = 'array'
                  then coalesce(m.payload, '{}'::jsonb) -> 'attachments'
                else '[]'::jsonb
              end
            )
            || case
              when nullif(trim(coalesce(m.file_url, '')), '') is not null then
                jsonb_build_array(jsonb_build_object(
                  'name', coalesce(nullif(trim(m.file_name), ''), 'فایل'),
                  'url', nullif(trim(m.file_url), ''),
                  'mime_type', nullif(trim(coalesce(m.mime_type, '')), ''),
                  'file_type', nullif(trim(coalesce(m.message_type, '')), '')
                ))
              else '[]'::jsonb
            end
          )
        else '{}'::jsonb
      end as payload,
    feed.feed_cursor,
    feed.has_more
  from public.get_notification_overlay_feed_v2(p_before_cursor, p_limit) feed
  left join public.notes n
    on feed.section = 'notes'
   and feed.source_type = 'note'
   and n.org_id = public.current_org_id()
   and n.id = public.kalam_try_uuid(feed.source_id)
  left join public.counterparty_bot_messages m
    on feed.section = 'bot_messages'
   and feed.source_type = 'counterparty_bot_message'
   and m.org_id = public.current_org_id()
   and m.id = public.kalam_try_uuid(feed.source_id);
$$;

grant execute on function public.kalam_normalize_phone_digits(text) to authenticated;
grant execute on function public.kalam_can_access_bot_group(uuid, uuid) to authenticated;
grant execute on function public.kalam_can_access_bot_direct_thread(uuid, uuid) to authenticated;
grant execute on function public.kalam_can_view_communication_record_v2(text, uuid, text, uuid, uuid, text, uuid, text, uuid, uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.get_accessible_sms_delivery_reports(integer) to authenticated;
grant execute on function public.get_accessible_voip_call_logs(integer) to authenticated;
grant execute on function public.get_notification_overlay_feed_v3(text, integer) to authenticated;

revoke all on function public.kalam_normalize_phone_digits(text) from public, anon;
revoke all on function public.kalam_can_access_bot_group(uuid, uuid) from public, anon;
revoke all on function public.kalam_can_access_bot_direct_thread(uuid, uuid) from public, anon;
revoke all on function public.kalam_can_view_communication_record_v2(text, uuid, text, uuid, uuid, text, uuid, text, uuid, uuid, text, text, text, text, text, text) from public, anon;
revoke all on function public.get_accessible_sms_delivery_reports(integer) from public, anon;
revoke all on function public.get_accessible_voip_call_logs(integer) from public, anon;
revoke all on function public.get_notification_overlay_feed_v3(text, integer) from public, anon;

notify pgrst, 'reload schema';

commit;
