-- TazeSystem V1 - Phase 374
-- Keep communication context separate from the counterparty identity,
-- resolve profiles linked to employees as one person, and page older SMS/VoIP safely.

begin;

-- Invalid legacy manual bindings must not make arbitrary records (such as tasks)
-- appear as communication counterparties.
delete from public.phone_number_links
where source_table = 'manual_phone_binding'
  and source_field = 'identity'
  and entity_type not in ('customers', 'suppliers', 'employees', 'profiles');

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
  v_result jsonb;
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

  with candidate_links as (
    select
      l.*,
      case
        when l.entity_type = 'profiles' and employee.id is not null then 'employees'
        else l.entity_type
      end as resolved_entity_type,
      coalesce(employee.id, l.entity_id) as resolved_entity_id,
      coalesce(
        nullif(trim(coalesce(employee.full_name, '')), ''),
        nullif(trim(coalesce(employee.system_code, '')), ''),
        nullif(trim(coalesce(l.display_title, '')), ''),
        p_phone
      ) as resolved_title,
      case
        when l.source_table = 'manual_phone_binding' and l.source_field = 'identity' then 0
        when l.entity_type = 'employees' then 1
        when l.entity_type = 'customers' then 2
        when l.entity_type = 'suppliers' then 3
        when l.entity_type = 'profiles' and employee.id is not null then 1
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
    left join public.employees employee
      on l.entity_type = 'profiles'
     and employee.org_id = l.org_id
     and employee.related_profile_id = l.entity_id
    where l.org_id = p_org_id
      and l.phone_number_id = v_phone_number_id
      and l.entity_type in ('customers', 'suppliers', 'employees', 'profiles')
  ),
  priority_bucket as (
    select *
    from candidate_links
    where entity_priority = (select min(entity_priority) from candidate_links)
  )
  select count(*)
  into v_count
  from (
    select distinct resolved_entity_type, resolved_entity_id
    from priority_bucket
  ) distinct_entities;

  if coalesce(v_count, 0) = 0 then
    return jsonb_build_object('match_status', 'unknown', 'phone_number_id', v_phone_number_id);
  end if;

  if v_count > 1 then
    return jsonb_build_object(
      'match_status', 'ambiguous',
      'phone_number_id', v_phone_number_id,
      'match_count', v_count
    );
  end if;

  with candidate_links as (
    select
      l.*,
      case
        when l.entity_type = 'profiles' and employee.id is not null then 'employees'
        else l.entity_type
      end as resolved_entity_type,
      coalesce(employee.id, l.entity_id) as resolved_entity_id,
      coalesce(
        nullif(trim(coalesce(employee.full_name, '')), ''),
        nullif(trim(coalesce(employee.system_code, '')), ''),
        nullif(trim(coalesce(l.display_title, '')), ''),
        p_phone
      ) as resolved_title,
      case
        when l.source_table = 'manual_phone_binding' and l.source_field = 'identity' then 0
        when l.entity_type = 'employees' then 1
        when l.entity_type = 'customers' then 2
        when l.entity_type = 'suppliers' then 3
        when l.entity_type = 'profiles' and employee.id is not null then 1
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
    left join public.employees employee
      on l.entity_type = 'profiles'
     and employee.org_id = l.org_id
     and employee.related_profile_id = l.entity_id
    where l.org_id = p_org_id
      and l.phone_number_id = v_phone_number_id
      and l.entity_type in ('customers', 'suppliers', 'employees', 'profiles')
  )
  select jsonb_build_object(
    'match_status', case when source_table = 'manual_phone_binding' and source_field = 'identity' then 'manual' else 'matched' end,
    'phone_number_id', v_phone_number_id,
    'module_id', resolved_entity_type,
    'record_id', resolved_entity_id::text,
    'customer_id', case when resolved_entity_type = 'customers' then resolved_entity_id::text else null end,
    'title', resolved_title,
    'label', label,
    'source_table', source_table,
    'source_field', source_field
  )
  into v_result
  from candidate_links
  order by entity_priority asc, is_primary desc, field_priority asc, updated_at desc nulls last, id desc
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

  -- A non-contact module is the source of the message, never its counterparty.
  if new.module_id is not null
    and new.record_id is not null
    and new.module_id not in ('customers', 'suppliers', 'employees', 'profiles') then
    new.related_module_id := coalesce(nullif(trim(new.related_module_id), ''), new.module_id);
    new.related_record_id := coalesce(nullif(trim(new.related_record_id), ''), new.record_id);
    new.module_id := null;
    new.record_id := null;
    new.customer_id := null;
  end if;

  v_counterparty_phone := case when new.direction = 'inbound' then new.sender else new.recipient end;
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
      new.customer_id := public.kalam_try_uuid(v_lookup->>'customer_id');
      new.title := coalesce(nullif(v_lookup->>'title', ''), new.title);
    elsif new.module_id not in ('customers', 'suppliers', 'employees', 'profiles') then
      new.module_id := null;
      new.record_id := null;
      new.customer_id := null;
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
  if new.assignee_role_id is not null then new.assignee_id := null; end if;
  if nullif(trim(coalesce(new.title, '')), '') is null then
    new.title := case when new.direction = 'inbound' then coalesce(new.sender, new.recipient, 'پیامک ورودی') else coalesce(new.recipient, new.sender, 'پیامک') end;
  end if;
  return new;
end;
$$;

-- Repair legacy rows while retaining activities and other records as context.
with resolved as (
  select
    m.id,
    m.module_id as previous_module_id,
    m.record_id as previous_record_id,
    public.kalam_find_phone_target(
      m.org_id,
      case when m.direction = 'inbound' then m.sender else m.recipient end
    ) as lookup
  from public.outbound_messages m
  where m.channel_type = 'sms'
    and m.org_id is not null
    and (
      m.module_id = 'profiles'
      or m.module_id not in ('customers', 'suppliers', 'employees', 'profiles')
    )
)
update public.outbound_messages m
set
  related_module_id = coalesce(
    nullif(trim(m.related_module_id), ''),
    case when resolved.previous_module_id not in ('customers', 'suppliers', 'employees', 'profiles') then resolved.previous_module_id else null end
  ),
  related_record_id = coalesce(
    nullif(trim(m.related_record_id), ''),
    case when resolved.previous_module_id not in ('customers', 'suppliers', 'employees', 'profiles') then resolved.previous_record_id else null end
  ),
  phone_match_status = coalesce(nullif(resolved.lookup->>'match_status', ''), 'unknown'),
  module_id = case when resolved.lookup->>'match_status' in ('matched', 'manual') then nullif(resolved.lookup->>'module_id', '') else null end,
  record_id = case when resolved.lookup->>'match_status' in ('matched', 'manual') then nullif(resolved.lookup->>'record_id', '') else null end,
  customer_id = case when resolved.lookup->>'match_status' in ('matched', 'manual') then public.kalam_try_uuid(resolved.lookup->>'customer_id') else null end,
  phone_number_id = coalesce(public.kalam_try_uuid(resolved.lookup->>'phone_number_id'), m.phone_number_id),
  title = case when resolved.lookup->>'match_status' in ('matched', 'manual') then coalesce(nullif(resolved.lookup->>'title', ''), m.title) else m.title end
from resolved
where m.id = resolved.id;

-- Keep the existing one-argument RPC intact. A separate paging RPC avoids
-- changing an already-published PostgREST function signature in place.
create or replace function public.get_accessible_sms_delivery_reports_page(
  p_limit integer default 80,
  p_before_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid, title text, module_id text, record_id text, related_module_id text, related_record_id uuid, customer_id uuid,
  assignee_id uuid, assignee_type text, assignee_role_id uuid, direction text, provider text, provider_message_id text,
  sender text, recipient text, phone_number text, phone_number_id uuid, phone_match_status text, message_text text,
  status text, error_message text, metadata jsonb, sent_at timestamptz, received_at timestamptz, message_at timestamptz,
  created_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  with limits as (select least(greatest(coalesce(p_limit, 80), 1), 200) as effective_limit),
  candidate_messages as (
    select m.*, coalesce(m.received_at, m.sent_at, m.created_at) as message_at
    from public.outbound_messages m
    cross join limits
    where m.org_id = public.current_org_id()
      and m.channel_type = 'sms'
      and (
        p_before_at is null
        or coalesce(m.received_at, m.sent_at, m.created_at) < p_before_at
        or (coalesce(m.received_at, m.sent_at, m.created_at) = p_before_at and p_before_id is not null and m.id < p_before_id)
      )
    order by coalesce(m.received_at, m.sent_at, m.created_at) desc nulls last, m.created_at desc, m.id desc
    limit least(greatest((select effective_limit from limits) * 20, 400), 2000)
  )
  select m.id, coalesce(nullif(m.title, ''), nullif(m.sender, ''), nullif(m.recipient, ''), 'پیامک'),
    m.module_id, m.record_id, m.related_module_id, public.kalam_try_uuid(m.related_record_id), m.customer_id,
    m.assignee_id, m.assignee_type, m.assignee_role_id, coalesce(nullif(m.direction, ''), 'outbound'), m.provider,
    m.provider_message_id, m.sender, m.recipient,
    case when coalesce(nullif(m.direction, ''), 'outbound') = 'inbound' then m.sender else m.recipient end,
    m.phone_number_id, m.phone_match_status, m.message_text, m.status, m.error_message, m.metadata,
    m.sent_at, m.received_at, m.message_at, m.created_at, m.updated_at
  from candidate_messages m
  where public.kalam_can_view_communication_record_v2(
    'sms', public.current_org_id(), m.assignee_type, m.assignee_id, m.assignee_role_id,
    m.module_id, public.kalam_try_uuid(m.record_id), m.related_module_id, public.kalam_try_uuid(m.related_record_id),
    m.customer_id, m.sender, m.recipient,
    case when coalesce(nullif(m.direction, ''), 'outbound') = 'inbound' then m.sender else m.recipient end,
    null, null, null
  )
  order by m.message_at desc nulls last, m.created_at desc, m.id desc
  limit (select effective_limit from limits);
$$;

create or replace function public.get_accessible_voip_call_logs_page(
  p_limit integer default 80,
  p_before_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid, title text, direction text, status text, source_number text, destination_number text, extension text,
  module_id text, record_id text, related_module_id text, related_record_id uuid, phone_number_id uuid, phone_match_status text,
  assignee_id uuid, assignee_type text, assignee_role_id uuid, started_at timestamptz, ended_at timestamptz,
  created_at timestamptz, talk_seconds integer, wait_seconds integer, call_id text, file_id text, recording_url text
)
language sql stable security definer set search_path = public
as $$
  with limits as (select least(greatest(coalesce(p_limit, 80), 1), 200) as effective_limit),
  candidate_calls as (
    select c.*
    from public.voip_call_logs c
    cross join limits
    where c.org_id = public.current_org_id()
      and (
        p_before_at is null
        or coalesce(c.started_at, c.created_at) < p_before_at
        or (coalesce(c.started_at, c.created_at) = p_before_at and p_before_id is not null and c.id < p_before_id)
      )
    order by c.started_at desc nulls last, c.created_at desc, c.id desc
    limit least(greatest((select effective_limit from limits) * 20, 400), 2000)
  )
  select c.id, c.title, c.direction, c.status, c.source_number, c.destination_number, c.extension,
    c.module_id, c.record_id, c.related_module_id, public.kalam_try_uuid(c.related_record_id), c.phone_number_id,
    c.phone_match_status, c.assignee_id, c.assignee_type, c.assignee_role_id, c.started_at, c.ended_at,
    c.created_at, c.talk_seconds, c.wait_seconds, c.call_id, c.file_id, c.recording_url
  from candidate_calls c
  where public.kalam_can_view_communication_record_v3(
    'voip', public.current_org_id(), c.assignee_type, c.assignee_id, c.assignee_role_id,
    c.module_id, public.kalam_try_uuid(c.record_id), c.related_module_id, public.kalam_try_uuid(c.related_record_id),
    null::uuid, c.source_number, c.destination_number, c.extension
  )
  order by c.started_at desc nulls last, c.created_at desc, c.id desc
  limit (select effective_limit from limits);
$$;

grant execute on function public.kalam_find_phone_target(uuid, text) to authenticated;
grant execute on function public.get_accessible_sms_delivery_reports_page(integer, timestamptz, uuid) to authenticated;
grant execute on function public.get_accessible_voip_call_logs_page(integer, timestamptz, uuid) to authenticated;
revoke all on function public.kalam_find_phone_target(uuid, text) from public, anon;
revoke all on function public.get_accessible_sms_delivery_reports_page(integer, timestamptz, uuid) from public, anon;
revoke all on function public.get_accessible_voip_call_logs_page(integer, timestamptz, uuid) from public, anon;

notify pgrst, 'reload schema';

commit;
