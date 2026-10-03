-- TazeSystem V1 - Phase 535
-- Treat marketing leads as first-class phone-directory contacts without
-- displacing an existing employee, customer, supplier, or manual identity.

begin;

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
        -- A converted lead should resolve as its customer/supplier first.
        when l.entity_type = 'marketing_leads' then 4
        when l.entity_type = 'profiles' and employee.id is not null then 1
        when l.entity_type = 'profiles' then 5
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
      and l.entity_type in ('customers', 'suppliers', 'employees', 'marketing_leads', 'profiles')
  ),
  priority_bucket as (
    select *
    from candidate_links
    where entity_priority = (select min(entity_priority) from candidate_links)
  )
  select count(*) into v_count
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
        when l.entity_type = 'marketing_leads' then 4
        when l.entity_type = 'profiles' and employee.id is not null then 1
        when l.entity_type = 'profiles' then 5
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
      and l.entity_type in ('customers', 'suppliers', 'employees', 'marketing_leads', 'profiles')
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

-- Backfill all historical lead phone fields. New and updated leads are already
-- maintained by the existing phone-directory trigger.
delete from public.phone_number_links
where source_table = 'marketing_leads';

insert into public.phone_number_links(
  org_id, phone_number_id, entity_type, entity_id, label, is_primary, source_table, source_field, display_title
)
select
  source.org_id,
  public.kalam_upsert_phone_number(source.org_id, source.phone_value),
  'marketing_leads',
  source.id,
  source.label,
  source.is_primary,
  'marketing_leads',
  source.source_field,
  source.display_title
from (
  select id, org_id, mobile as phone_value, 'mobile'::text as source_field, 'mobile'::text as label, true as is_primary,
    coalesce(nullif(business_name, ''), nullif(name, ''), nullif(concat_ws(' ', nullif(first_name, ''), nullif(last_name, '')), ''), nullif(sarnakh_code, ''), '[بدون عنوان]') as display_title
  from public.marketing_leads
  where mobile is not null
  union all
  select id, org_id, mobile_2, 'mobile_2', 'secondary_mobile', false,
    coalesce(nullif(business_name, ''), nullif(name, ''), nullif(concat_ws(' ', nullif(first_name, ''), nullif(last_name, '')), ''), nullif(sarnakh_code, ''), '[بدون عنوان]')
  from public.marketing_leads
  where mobile_2 is not null
  union all
  select id, org_id, assistant_phone, 'assistant_phone', 'assistant_phone', false,
    coalesce(nullif(business_name, ''), nullif(name, ''), nullif(concat_ws(' ', nullif(first_name, ''), nullif(last_name, '')), ''), nullif(sarnakh_code, ''), '[بدون عنوان]')
  from public.marketing_leads
  where assistant_phone is not null
) source
where source.org_id is not null
  and public.kalam_phone_lookup_key(source.phone_value) <> ''
on conflict (org_id, source_table, entity_id, source_field) where source_table is not null and source_field is not null
do update set
  phone_number_id = excluded.phone_number_id,
  entity_type = excluded.entity_type,
  label = excluded.label,
  is_primary = excluded.is_primary,
  display_title = excluded.display_title,
  updated_at = now();

-- Refresh existing communication history only when the new resolver identifies
-- a marketing lead, preserving all unrelated records and their source context.
with resolved as (
  select
    message.id,
    public.kalam_find_phone_target(
      message.org_id,
      case when message.direction = 'inbound' then message.sender else message.recipient end
    ) as lookup
  from public.outbound_messages message
  where message.org_id is not null
    and message.channel_type = 'sms'
)
update public.outbound_messages message
set
  phone_match_status = coalesce(nullif(resolved.lookup->>'match_status', ''), message.phone_match_status),
  phone_number_id = coalesce(public.kalam_try_uuid(resolved.lookup->>'phone_number_id'), message.phone_number_id),
  module_id = 'marketing_leads',
  record_id = nullif(resolved.lookup->>'record_id', ''),
  customer_id = null,
  title = coalesce(nullif(resolved.lookup->>'title', ''), message.title)
from resolved
where message.id = resolved.id
  and resolved.lookup->>'module_id' = 'marketing_leads'
  and resolved.lookup->>'match_status' in ('matched', 'manual');

with resolved as (
  select
    voip_log.id,
    public.kalam_find_phone_target(
      voip_log.org_id,
      case
        when coalesce(voip_log.direction, '') = 'incoming' then voip_log.source_number
        when coalesce(voip_log.direction, '') = 'outgoing' then voip_log.destination_number
        else coalesce(voip_log.source_number, voip_log.destination_number)
      end
    ) as lookup
  from public.voip_call_logs voip_log
  where voip_log.org_id is not null
)
update public.voip_call_logs voip_log
set
  phone_match_status = coalesce(nullif(resolved.lookup->>'match_status', ''), voip_log.phone_match_status),
  phone_number_id = coalesce(public.kalam_try_uuid(resolved.lookup->>'phone_number_id'), voip_log.phone_number_id),
  module_id = 'marketing_leads',
  record_id = nullif(resolved.lookup->>'record_id', ''),
  title = coalesce(nullif(resolved.lookup->>'title', ''), voip_log.title)
from resolved
where voip_log.id = resolved.id
  and resolved.lookup->>'module_id' = 'marketing_leads'
  and resolved.lookup->>'match_status' in ('matched', 'manual');

grant execute on function public.kalam_find_phone_target(uuid, text) to authenticated;
revoke all on function public.kalam_find_phone_target(uuid, text) from public, anon;

notify pgrst, 'reload schema';

commit;
