-- KalamApp V1 - Phase 260
-- Separate communication context from resolved contact identity and
-- let manual phone bindings override automatic attribution.

begin;

alter table if exists public.outbound_messages
  add column if not exists related_module_id text,
  add column if not exists related_record_id text;

alter table if exists public.voip_call_logs
  add column if not exists related_module_id text,
  add column if not exists related_record_id text;

create index if not exists idx_outbound_messages_related_record
  on public.outbound_messages(org_id, related_module_id, related_record_id, coalesce(received_at, sent_at, created_at) desc)
  where related_record_id is not null;

create index if not exists idx_voip_call_logs_related_record
  on public.voip_call_logs(org_id, related_module_id, related_record_id, coalesce(started_at, created_at) desc)
  where related_record_id is not null;

update public.outbound_messages
set
  related_module_id = coalesce(related_module_id, module_id),
  related_record_id = coalesce(related_record_id, record_id)
where channel_type = 'sms'
  and (
    related_module_id is null
    or related_record_id is null
  );

update public.voip_call_logs
set
  related_module_id = coalesce(related_module_id, module_id),
  related_record_id = coalesce(related_record_id, record_id)
where related_module_id is null
   or related_record_id is null;

create unique index if not exists idx_phone_number_links_manual_binding
  on public.phone_number_links(org_id, phone_number_id)
  where source_table = 'manual_phone_binding'
    and source_field = 'identity';

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
  m.related_module_id,
  m.related_record_id,
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
  m.assignee_type,
  m.assignee_role_id,
  m.operator_report,
  m.related_task_id,
  m.process_template_id,
  m.direction,
  m.sender,
  case when m.direction = 'inbound' then m.sender else m.recipient end as phone_number,
  m.phone_number_id,
  m.phone_match_status,
  m.received_at,
  coalesce(m.received_at, m.sent_at, m.created_at) as message_at
from public.outbound_messages m
where m.channel_type = 'sms';

grant select, update on public.sms_delivery_reports to authenticated;

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
  v_phone_number_id uuid;
  v_count integer;
  v_link public.phone_number_links%rowtype;
  v_is_manual boolean := false;
begin
  if p_org_id is null or v_key = '' then
    return null;
  end if;

  select id
  into v_phone_number_id
  from public.phone_numbers
  where org_id = p_org_id
    and lookup_key = v_key
  limit 1;

  if v_phone_number_id is null then
    return jsonb_build_object('match_status', 'unknown');
  end if;

  with ranked_links as (
    select
      l.*,
      case
        when l.source_table = 'manual_phone_binding' and l.source_field = 'identity' then 0
        when l.entity_type = 'employees' then 1
        when l.entity_type = 'customers' then 2
        when l.entity_type = 'suppliers' then 3
        when l.entity_type = 'profiles' then 4
        else 99
      end as entity_priority,
      case
        when l.source_table = 'manual_phone_binding' and l.source_field = 'identity' then 0
        when l.label in ('mobile', 'primary_mobile') then 1
        when l.label = 'secondary_mobile' then 2
        when l.label = 'phone' then 3
        when l.label = 'assistant_phone' then 4
        else 9
      end as field_priority
    from public.phone_number_links l
    where l.org_id = p_org_id
      and l.phone_number_id = v_phone_number_id
      and (
        (l.source_table = 'manual_phone_binding' and l.source_field = 'identity')
        or l.entity_type in ('employees', 'customers', 'suppliers', 'profiles')
      )
  ),
  priority_bucket as (
    select *
    from ranked_links
    where entity_priority = (select min(entity_priority) from ranked_links)
  ),
  distinct_entities as (
    select distinct entity_type, entity_id
    from priority_bucket
  )
  select count(*)
  into v_count
  from distinct_entities;

  if coalesce(v_count, 0) = 0 then
    return jsonb_build_object(
      'match_status', 'unknown',
      'phone_number_id', v_phone_number_id
    );
  end if;

  if v_count > 1 then
    return jsonb_build_object(
      'match_status', 'ambiguous',
      'phone_number_id', v_phone_number_id,
      'match_count', v_count
    );
  end if;

  with ranked_links as (
    select
      l.*,
      case
        when l.source_table = 'manual_phone_binding' and l.source_field = 'identity' then 0
        when l.entity_type = 'employees' then 1
        when l.entity_type = 'customers' then 2
        when l.entity_type = 'suppliers' then 3
        when l.entity_type = 'profiles' then 4
        else 99
      end as entity_priority,
      case
        when l.source_table = 'manual_phone_binding' and l.source_field = 'identity' then 0
        when l.label in ('mobile', 'primary_mobile') then 1
        when l.label = 'secondary_mobile' then 2
        when l.label = 'phone' then 3
        when l.label = 'assistant_phone' then 4
        else 9
      end as field_priority
    from public.phone_number_links l
    where l.org_id = p_org_id
      and l.phone_number_id = v_phone_number_id
      and (
        (l.source_table = 'manual_phone_binding' and l.source_field = 'identity')
        or l.entity_type in ('employees', 'customers', 'suppliers', 'profiles')
      )
  )
  select
    l.id,
    l.org_id,
    l.phone_number_id,
    l.entity_type,
    l.entity_id,
    l.label,
    l.is_primary,
    l.source_table,
    l.source_field,
    l.display_title,
    l.metadata,
    l.created_at,
    l.updated_at
  into v_link
  from ranked_links l
  order by l.entity_priority asc, l.is_primary desc, l.field_priority asc, l.updated_at desc nulls last, l.id desc
  limit 1;

  v_is_manual := v_link.source_table = 'manual_phone_binding' and v_link.source_field = 'identity';

  return jsonb_build_object(
    'match_status', case when v_is_manual then 'manual' else 'matched' end,
    'phone_number_id', v_phone_number_id,
    'module_id', v_link.entity_type,
    'record_id', v_link.entity_id::text,
    'customer_id', case when v_link.entity_type = 'customers' then v_link.entity_id::text else null end,
    'title', coalesce(v_link.display_title, p_phone),
    'label', v_link.label,
    'source_table', v_link.source_table,
    'source_field', v_link.source_field
  );
end;
$$;

create or replace function public.kalam_enrich_sms_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
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

  v_counterparty_phone := case
    when new.direction = 'inbound' then new.sender
    else new.recipient
  end;

  new.phone_number_id := coalesce(new.phone_number_id, public.kalam_upsert_phone_number(new.org_id, v_counterparty_phone));
  v_lookup := public.kalam_find_phone_target(new.org_id, v_counterparty_phone);

  if v_lookup is not null then
    new.phone_match_status := coalesce(nullif(v_lookup->>'match_status', ''), 'unknown');
    if new.phone_number_id is null and public.kalam_try_uuid(v_lookup->>'phone_number_id') is not null then
      new.phone_number_id := public.kalam_try_uuid(v_lookup->>'phone_number_id');
    end if;

    if new.phone_match_status in ('matched', 'manual') then
      new.module_id := nullif(v_lookup->>'module_id', '');
      new.record_id := nullif(v_lookup->>'record_id', '');
      new.customer_id := case
        when public.kalam_try_uuid(v_lookup->>'customer_id') is not null
          then public.kalam_try_uuid(v_lookup->>'customer_id')
        else null
      end;
      if nullif(trim(coalesce(new.title, '')), '') is null or new.phone_match_status = 'manual' then
        new.title := nullif(v_lookup->>'title', '');
      end if;
    end if;
  else
    new.phone_match_status := 'unknown';
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

  new.phone_number_id := coalesce(new.phone_number_id, public.kalam_upsert_phone_number(new.org_id, v_phone));
  v_lookup := public.kalam_find_phone_target(new.org_id, v_phone);

  if v_lookup is not null then
    new.phone_match_status := coalesce(nullif(v_lookup->>'match_status', ''), 'unknown');
    if new.phone_number_id is null and public.kalam_try_uuid(v_lookup->>'phone_number_id') is not null then
      new.phone_number_id := public.kalam_try_uuid(v_lookup->>'phone_number_id');
    end if;

    if new.phone_match_status in ('matched', 'manual') then
      new.module_id := nullif(v_lookup->>'module_id', '');
      new.record_id := nullif(v_lookup->>'record_id', '');
      if nullif(trim(coalesce(new.title, '')), '') is null or new.phone_match_status = 'manual' then
        new.title := nullif(v_lookup->>'title', '');
      end if;
    end if;
  else
    new.phone_match_status := 'unknown';
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

with sms_lookup as (
  select
    m.id,
    public.kalam_find_phone_target(
      m.org_id,
      case when m.direction = 'inbound' then m.sender else m.recipient end
    ) as lookup
  from public.outbound_messages m
  where m.channel_type = 'sms'
    and m.org_id is not null
    and public.kalam_phone_lookup_key(case when m.direction = 'inbound' then m.sender else m.recipient end) <> ''
)
update public.outbound_messages m
set
  phone_number_id = coalesce(public.kalam_try_uuid(sms_lookup.lookup->>'phone_number_id'), m.phone_number_id),
  phone_match_status = coalesce(nullif(sms_lookup.lookup->>'match_status', ''), 'unknown'),
  module_id = case
    when sms_lookup.lookup->>'match_status' in ('matched', 'manual') then nullif(sms_lookup.lookup->>'module_id', '')
    else m.module_id
  end,
  record_id = case
    when sms_lookup.lookup->>'match_status' in ('matched', 'manual') then nullif(sms_lookup.lookup->>'record_id', '')
    else m.record_id
  end,
  customer_id = case
    when sms_lookup.lookup->>'match_status' in ('matched', 'manual')
      then public.kalam_try_uuid(sms_lookup.lookup->>'customer_id')
    else m.customer_id
  end,
  title = case
    when sms_lookup.lookup->>'match_status' in ('matched', 'manual')
      then coalesce(nullif(sms_lookup.lookup->>'title', ''), m.title)
    else m.title
  end
from sms_lookup
where m.id = sms_lookup.id;

with voip_lookup as (
  select
    c.id,
    public.kalam_find_phone_target(
      c.org_id,
      case
        when coalesce(c.direction, '') = 'incoming' then c.source_number
        when coalesce(c.direction, '') = 'outgoing' then c.destination_number
        else coalesce(c.source_number, c.destination_number)
      end
    ) as lookup
  from public.voip_call_logs c
  where c.org_id is not null
    and public.kalam_phone_lookup_key(
      case
        when coalesce(c.direction, '') = 'incoming' then c.source_number
        when coalesce(c.direction, '') = 'outgoing' then c.destination_number
        else coalesce(c.source_number, c.destination_number)
      end
    ) <> ''
)
update public.voip_call_logs c
set
  phone_number_id = coalesce(public.kalam_try_uuid(voip_lookup.lookup->>'phone_number_id'), c.phone_number_id),
  phone_match_status = coalesce(nullif(voip_lookup.lookup->>'match_status', ''), 'unknown'),
  module_id = case
    when voip_lookup.lookup->>'match_status' in ('matched', 'manual') then nullif(voip_lookup.lookup->>'module_id', '')
    else c.module_id
  end,
  record_id = case
    when voip_lookup.lookup->>'match_status' in ('matched', 'manual') then nullif(voip_lookup.lookup->>'record_id', '')
    else c.record_id
  end,
  title = case
    when voip_lookup.lookup->>'match_status' in ('matched', 'manual')
      then coalesce(nullif(voip_lookup.lookup->>'title', ''), c.title)
    else c.title
  end
from voip_lookup
where c.id = voip_lookup.id;

grant execute on function public.kalam_find_phone_target(uuid, text) to authenticated;
revoke all on function public.kalam_find_phone_target(uuid, text) from public, anon;

notify pgrst, 'reload schema';

commit;
