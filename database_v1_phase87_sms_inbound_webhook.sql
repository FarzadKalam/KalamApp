-- KalamApp V1 - Phase 87
-- Upgrade the existing SMS reports module for inbound/outbound messages and MeliPayamak webhook intake.

begin;

alter table if exists public.outbound_messages
  add column if not exists direction text not null default 'outbound',
  add column if not exists sender text,
  add column if not exists received_at timestamptz,
  add column if not exists assignee_type text,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null;

update public.outbound_messages
set assignee_type = case
  when assignee_role_id is not null then 'role'
  when assignee_id is not null then 'user'
  else nullif(assignee_type, '')
end
where assignee_role_id is not null
   or assignee_id is not null
   or coalesce(assignee_type, '') <> '';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'chk_outbound_messages_status'
  ) then
    alter table public.outbound_messages
      drop constraint chk_outbound_messages_status;
  end if;

  alter table public.outbound_messages
    add constraint chk_outbound_messages_status
    check (status in ('pending', 'sent', 'failed', 'skipped', 'received', 'processed', 'ignored'));

  if exists (
    select 1
    from pg_constraint
    where conname = 'outbound_messages_direction_check'
  ) then
    alter table public.outbound_messages
      drop constraint outbound_messages_direction_check;
  end if;

  alter table public.outbound_messages
    add constraint outbound_messages_direction_check
    check (direction in ('inbound', 'outbound'));

  if exists (
    select 1
    from pg_constraint
    where conname = 'chk_outbound_messages_assignee_type'
  ) then
    alter table public.outbound_messages
      drop constraint chk_outbound_messages_assignee_type;
  end if;

  alter table public.outbound_messages
    add constraint chk_outbound_messages_assignee_type
    check (assignee_type is null or assignee_type in ('user', 'role'));
end $$;

create index if not exists idx_outbound_messages_sms_direction_time
  on public.outbound_messages(org_id, direction, coalesce(received_at, sent_at, created_at) desc)
  where channel_type = 'sms';

create index if not exists idx_outbound_messages_sms_sender_time
  on public.outbound_messages(org_id, sender, coalesce(received_at, sent_at, created_at) desc)
  where channel_type = 'sms' and sender is not null;

create index if not exists idx_outbound_messages_assignee_scope
  on public.outbound_messages(assignee_id, assignee_role_id);

create or replace function public.kalam_phone_lookup_key(p_value text)
returns text
language plpgsql
immutable
as $$
declare
  v_digits text;
begin
  v_digits := regexp_replace(coalesce(p_value, ''), '\D', '', 'g');
  if v_digits = '' then
    return '';
  end if;

  if v_digits like '0098%' then
    v_digits := substr(v_digits, 5);
  elsif v_digits like '98%' and length(v_digits) >= 12 then
    v_digits := substr(v_digits, 3);
  end if;

  if length(v_digits) > 10 and left(v_digits, 1) = '0' then
    v_digits := substr(v_digits, 2);
  end if;

  return v_digits;
end;
$$;

create index if not exists idx_customers_mobile_1_lookup
  on public.customers(org_id, public.kalam_phone_lookup_key(mobile_1))
  where mobile_1 is not null and mobile_1 <> '';

create index if not exists idx_customers_mobile_2_lookup
  on public.customers(org_id, public.kalam_phone_lookup_key(mobile_2))
  where mobile_2 is not null and mobile_2 <> '';

create index if not exists idx_customers_phone_lookup
  on public.customers(org_id, public.kalam_phone_lookup_key(phone))
  where phone is not null and phone <> '';

create index if not exists idx_customers_assistant_phone_lookup
  on public.customers(org_id, public.kalam_phone_lookup_key(assistant_phone))
  where assistant_phone is not null and assistant_phone <> '';

create index if not exists idx_suppliers_mobile_1_lookup
  on public.suppliers(org_id, public.kalam_phone_lookup_key(mobile_1))
  where mobile_1 is not null and mobile_1 <> '';

create index if not exists idx_suppliers_mobile_2_lookup
  on public.suppliers(org_id, public.kalam_phone_lookup_key(mobile_2))
  where mobile_2 is not null and mobile_2 <> '';

create index if not exists idx_suppliers_phone_lookup
  on public.suppliers(org_id, public.kalam_phone_lookup_key(phone))
  where phone is not null and phone <> '';

create index if not exists idx_profiles_mobile_lookup
  on public.profiles(org_id, public.kalam_phone_lookup_key(mobile))
  where mobile is not null and mobile <> '';

create index if not exists idx_profiles_mobile_1_lookup
  on public.profiles(org_id, public.kalam_phone_lookup_key(mobile_1))
  where mobile_1 is not null and mobile_1 <> '';

create index if not exists idx_employees_mobile_1_lookup
  on public.employees(org_id, public.kalam_phone_lookup_key(mobile_1))
  where mobile_1 is not null and mobile_1 <> '';

create index if not exists idx_employees_mobile_2_lookup
  on public.employees(org_id, public.kalam_phone_lookup_key(mobile_2))
  where mobile_2 is not null and mobile_2 <> '';

create index if not exists idx_employees_phone_lookup
  on public.employees(org_id, public.kalam_phone_lookup_key(phone))
  where phone is not null and phone <> '';

create index if not exists idx_marketing_leads_mobile_lookup
  on public.marketing_leads(org_id, public.kalam_phone_lookup_key(mobile))
  where mobile is not null and mobile <> '';

create index if not exists idx_voip_call_logs_source_lookup
  on public.voip_call_logs(org_id, public.kalam_phone_lookup_key(source_number), created_at desc)
  where source_number is not null and source_number <> '';

create index if not exists idx_voip_call_logs_destination_lookup
  on public.voip_call_logs(org_id, public.kalam_phone_lookup_key(destination_number), created_at desc)
  where destination_number is not null and destination_number <> '';

create or replace function public.kalam_find_phone_target(
  p_org_id uuid,
  p_phone text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_key text := public.kalam_phone_lookup_key(p_phone);
  v_result jsonb;
begin
  if p_org_id is null or v_key = '' then
    return null;
  end if;

  select jsonb_build_object(
    'module_id', 'customers',
    'record_id', c.id::text,
    'customer_id', c.id,
    'assignee_id', c.assignee_id,
    'assignee_type', c.assignee_type,
    'assignee_role_id', c.assignee_role_id,
    'title', coalesce(nullif(c.business_name, ''), concat_ws(' ', c.first_name, c.last_name), c.system_code, c.mobile_1)
  )
  into v_result
  from public.customers c
  where c.org_id = p_org_id
    and (
      public.kalam_phone_lookup_key(c.mobile_1) = v_key
      or public.kalam_phone_lookup_key(c.mobile_2) = v_key
      or public.kalam_phone_lookup_key(c.phone) = v_key
      or public.kalam_phone_lookup_key(c.assistant_phone) = v_key
    )
  order by c.updated_at desc nulls last, c.created_at desc nulls last
  limit 1;

  if v_result is not null then
    return v_result;
  end if;

  select jsonb_build_object(
    'module_id', 'suppliers',
    'record_id', s.id::text,
    'customer_id', null,
    'assignee_id', null,
    'assignee_type', null,
    'assignee_role_id', null,
    'title', coalesce(nullif(s.business_name, ''), concat_ws(' ', s.first_name, s.last_name), s.system_code, s.mobile_1)
  )
  into v_result
  from public.suppliers s
  where s.org_id = p_org_id
    and (
      public.kalam_phone_lookup_key(s.mobile_1) = v_key
      or public.kalam_phone_lookup_key(s.mobile_2) = v_key
      or public.kalam_phone_lookup_key(s.phone) = v_key
    )
  order by s.updated_at desc nulls last, s.created_at desc nulls last
  limit 1;

  if v_result is not null then
    return v_result;
  end if;

  select jsonb_build_object(
    'module_id', 'profiles',
    'record_id', p.id::text,
    'customer_id', null,
    'assignee_id', p.id,
    'assignee_type', 'user',
    'assignee_role_id', null,
    'title', coalesce(nullif(p.full_name, ''), p.mobile, p.mobile_1, p.id::text)
  )
  into v_result
  from public.profiles p
  where p.org_id = p_org_id
    and (
      public.kalam_phone_lookup_key(p.mobile) = v_key
      or public.kalam_phone_lookup_key(p.mobile_1) = v_key
    )
  order by p.updated_at desc nulls last, p.created_at desc nulls last
  limit 1;

  if v_result is not null then
    return v_result;
  end if;

  select jsonb_build_object(
    'module_id', 'marketing_leads',
    'record_id', m.id::text,
    'customer_id', m.customer_id,
    'assignee_id', coalesce(m.assignee_id, m.owner_id),
    'assignee_type', m.assignee_type,
    'assignee_role_id', m.assignee_role_id,
    'title', coalesce(nullif(m.business_name, ''), nullif(m.name, ''), m.mobile)
  )
  into v_result
  from public.marketing_leads m
  where m.org_id = p_org_id
    and public.kalam_phone_lookup_key(m.mobile) = v_key
  order by m.updated_at desc nulls last, m.created_at desc nulls last
  limit 1;

  if v_result is not null then
    return v_result;
  end if;

  select jsonb_build_object(
    'module_id', 'employees',
    'record_id', e.id::text,
    'customer_id', null,
    'assignee_id', e.related_profile_id,
    'assignee_type', case when e.related_profile_id is not null then 'user' else null end,
    'assignee_role_id', null,
    'title', coalesce(nullif(e.full_name, ''), e.system_code, e.mobile_1)
  )
  into v_result
  from public.employees e
  where e.org_id = p_org_id
    and (
      public.kalam_phone_lookup_key(e.mobile_1) = v_key
      or public.kalam_phone_lookup_key(e.mobile_2) = v_key
      or public.kalam_phone_lookup_key(e.phone) = v_key
    )
  order by e.updated_at desc nulls last, e.created_at desc nulls last
  limit 1;

  return v_result;
end;
$$;

create or replace function public.kalam_enrich_sms_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_context public.outbound_messages%rowtype;
  v_lookup jsonb;
  v_counterparty_phone text;
begin
  if new.channel_type <> 'sms' or new.org_id is null then
    return new;
  end if;

  new.direction := coalesce(nullif(trim(new.direction), ''), 'outbound');
  new.sender := nullif(trim(coalesce(new.sender, '')), '');
  new.recipient := nullif(trim(coalesce(new.recipient, '')), '');

  if new.direction = 'inbound' and new.received_at is null then
    new.received_at := coalesce(new.sent_at, new.created_at, now());
  end if;

  if new.direction = 'inbound' then
    select *
    into v_context
    from public.outbound_messages m
    where m.org_id = new.org_id
      and m.channel_type = 'sms'
      and m.direction = 'outbound'
      and public.kalam_phone_lookup_key(m.recipient) = public.kalam_phone_lookup_key(new.sender)
    order by coalesce(m.sent_at, m.created_at) desc
    limit 1;

    if found then
      if new.module_id is null then new.module_id := v_context.module_id; end if;
      if new.record_id is null then new.record_id := v_context.record_id; end if;
      if new.customer_id is null then new.customer_id := v_context.customer_id; end if;
      if new.assignee_id is null then new.assignee_id := v_context.assignee_id; end if;
      if new.assignee_type is null then new.assignee_type := v_context.assignee_type; end if;
      if new.assignee_role_id is null then new.assignee_role_id := v_context.assignee_role_id; end if;
      if new.related_task_id is null then new.related_task_id := v_context.related_task_id; end if;
    end if;
  end if;

  v_counterparty_phone := case
    when new.direction = 'inbound' then new.sender
    else new.recipient
  end;

  v_lookup := public.kalam_find_phone_target(new.org_id, v_counterparty_phone);
  if v_lookup is not null then
    if new.module_id is null then new.module_id := nullif(v_lookup->>'module_id', ''); end if;
    if new.record_id is null then new.record_id := nullif(v_lookup->>'record_id', ''); end if;
    if new.customer_id is null and public.kalam_try_uuid(v_lookup->>'customer_id') is not null then
      new.customer_id := public.kalam_try_uuid(v_lookup->>'customer_id');
    end if;
    if new.assignee_id is null and public.kalam_try_uuid(v_lookup->>'assignee_id') is not null then
      new.assignee_id := public.kalam_try_uuid(v_lookup->>'assignee_id');
    end if;
    if new.assignee_role_id is null and public.kalam_try_uuid(v_lookup->>'assignee_role_id') is not null then
      new.assignee_role_id := public.kalam_try_uuid(v_lookup->>'assignee_role_id');
    end if;
    if new.assignee_type is null then
      new.assignee_type := nullif(v_lookup->>'assignee_type', '');
    end if;
    if nullif(trim(coalesce(new.title, '')), '') is null then
      new.title := nullif(v_lookup->>'title', '');
    end if;
  end if;

  new.assignee_type := case
    when new.assignee_role_id is not null then 'role'
    when lower(nullif(new.assignee_type, '')) = 'role' and new.assignee_id is not null then 'role'
    when new.assignee_id is not null then coalesce(nullif(new.assignee_type, ''), 'user')
    else nullif(new.assignee_type, '')
  end;
  if new.assignee_role_id is not null then
    new.assignee_id := null;
  end if;

  if nullif(trim(coalesce(new.title, '')), '') is null then
    new.title := case
      when new.direction = 'inbound' then coalesce(new.sender, new.recipient, 'پیامک ورودی')
      else coalesce(new.recipient, new.sender, 'پیامک')
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_outbound_messages_enrich_sms on public.outbound_messages;
create trigger trg_outbound_messages_enrich_sms
  before insert or update on public.outbound_messages
  for each row execute function public.kalam_enrich_sms_message();

create or replace function public.kalam_enrich_voip_call_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lookup jsonb;
  v_phone text;
begin
  if new.org_id is null then
    return new;
  end if;

  new.extension := nullif(trim(coalesce(new.extension, '')), '');
  new.source_number := nullif(trim(coalesce(new.source_number, '')), '');
  new.destination_number := nullif(trim(coalesce(new.destination_number, '')), '');

  if new.assignee_id is null and new.extension is not null then
    select p.id
    into new.assignee_id
    from public.profiles p
    where p.org_id = new.org_id
      and p.voip_enabled = true
      and nullif(trim(coalesce(p.voip_extension, '')), '') = new.extension
    order by p.updated_at desc nulls last
    limit 1;
  end if;

  v_phone := case
    when coalesce(new.direction, '') = 'incoming' then new.source_number
    when coalesce(new.direction, '') = 'outgoing' then new.destination_number
    else coalesce(new.source_number, new.destination_number)
  end;

  v_lookup := public.kalam_find_phone_target(new.org_id, v_phone);
  if v_lookup is not null then
    if new.module_id is null then new.module_id := nullif(v_lookup->>'module_id', ''); end if;
    if new.record_id is null then new.record_id := nullif(v_lookup->>'record_id', ''); end if;
    if new.assignee_id is null and public.kalam_try_uuid(v_lookup->>'assignee_id') is not null then
      new.assignee_id := public.kalam_try_uuid(v_lookup->>'assignee_id');
    end if;
    if new.assignee_role_id is null and public.kalam_try_uuid(v_lookup->>'assignee_role_id') is not null then
      new.assignee_role_id := public.kalam_try_uuid(v_lookup->>'assignee_role_id');
    end if;
    if new.assignee_type is null then
      new.assignee_type := nullif(v_lookup->>'assignee_type', '');
    end if;
    if nullif(trim(coalesce(new.title, '')), '') is null then
      new.title := nullif(v_lookup->>'title', '');
    end if;
  end if;

  new.assignee_type := case
    when new.assignee_role_id is not null then 'role'
    when lower(nullif(new.assignee_type, '')) = 'role' and new.assignee_id is not null then 'role'
    when new.assignee_id is not null then coalesce(nullif(new.assignee_type, ''), 'user')
    else nullif(new.assignee_type, '')
  end;
  if new.assignee_role_id is not null then
    new.assignee_id := null;
  end if;

  if nullif(trim(coalesce(new.title, '')), '') is null then
    new.title := coalesce(v_phone, 'تماس VoIP');
  end if;

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

    update public.voip_call_logs
    set assignee_type = case
      when assignee_role_id is not null then 'role'
      when assignee_id is not null then 'user'
      else nullif(assignee_type, '')
    end
    where assignee_role_id is not null
       or assignee_id is not null
       or coalesce(assignee_type, '') <> '';

    alter table public.voip_call_logs
      drop constraint if exists chk_voip_call_logs_assignee_type;

    alter table public.voip_call_logs
      add constraint chk_voip_call_logs_assignee_type
      check (assignee_type is null or assignee_type in ('user', 'role'));

    create index if not exists idx_voip_call_logs_assignee_scope
      on public.voip_call_logs(assignee_id, assignee_role_id);

    drop trigger if exists trg_voip_call_logs_enrich on public.voip_call_logs;
    create trigger trg_voip_call_logs_enrich
      before insert or update on public.voip_call_logs
      for each row execute function public.kalam_enrich_voip_call_log();
  end if;
end $$;

drop view if exists public.sms_delivery_reports;
create view public.sms_delivery_reports
with (security_invoker = true)
as
select
  m.id,
  m.org_id,
  coalesce(nullif(m.title, ''), nullif(m.sender, ''), nullif(m.recipient, ''), 'پیامک') as title,
  m.channel_type,
  m.provider,
  m.module_id,
  m.record_id,
  m.customer_id,
  m.recipient,
  m.message_text,
  m.status,
  m.provider_message_id,
  m.error_message,
  m.metadata,
  m.sent_at,
  m.created_at,
  m.updated_at,
  m.tags,
  m.assignee_id,
  m.operator_report,
  m.related_task_id,
  m.direction,
  m.sender,
  case when m.direction = 'inbound' then m.sender else m.recipient end as phone_number,
  m.received_at,
  coalesce(m.received_at, m.sent_at, m.created_at) as message_at,
  m.assignee_type,
  m.assignee_role_id
from public.outbound_messages m
where m.channel_type = 'sms';

grant select, update on public.sms_delivery_reports to authenticated;

create or replace function public.kalam_sms_message_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_users uuid[] := '{}'::uuid[];
  v_target_roles uuid[] := '{}'::uuid[];
  v_is_org_wide boolean := false;
  v_assignee_type text;
begin
  if new.org_id is null or new.channel_type <> 'sms' then
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

  if new.direction = 'inbound' and cardinality(v_target_users) = 0 and cardinality(v_target_roles) = 0 then
    v_is_org_wide := true;
  end if;

  if to_regprocedure('public.kalam_upsert_notification_item(uuid,text,text,text,text,text,text,text,text,text,uuid[],uuid[],boolean,jsonb,timestamptz)') is not null then
    perform public.kalam_upsert_notification_item(
      new.org_id,
      case when new.direction = 'inbound' then 'inbound_sms' else 'outbound_message' end,
      new.id::text,
      'sms',
      coalesce(nullif(trim(new.direction), ''), 'outbound'),
      lower(tg_op),
      coalesce(nullif(trim(new.title), ''), nullif(trim(new.sender), ''), nullif(trim(new.recipient), ''), 'پیامک'),
      nullif(left(coalesce(new.message_text, ''), 240), ''),
      new.module_id,
      new.record_id,
      v_target_users,
      v_target_roles,
      v_is_org_wide,
      jsonb_build_object(
        'direction', new.direction,
        'sender', new.sender,
        'recipient', new.recipient,
        'provider', new.provider,
        'status', new.status
      ),
      coalesce(new.received_at, new.sent_at, new.updated_at, new.created_at, now())
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_outbound_messages_sms_notification_inbox on public.outbound_messages;
create trigger trg_outbound_messages_sms_notification_inbox
  after insert or update on public.outbound_messages
  for each row execute function public.kalam_sms_message_notification_trigger();

revoke all on function public.kalam_sms_message_notification_trigger() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
