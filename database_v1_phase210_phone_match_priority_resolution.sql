-- =====================================================
-- KalamApp - Phase 210: Priority-based phone match resolution
-- Date: 2026-05-27
-- Type: Data quality / communication attribution / idempotent
-- =====================================================

begin;

-- Resolve shared phone numbers by business priority instead of marking every
-- multi-link number as ambiguous. Priority order:
--   1) profiles/users
--   2) employees
--   3) customers
--   4) suppliers
-- Ambiguity remains only when multiple distinct records exist in the same
-- highest-priority bucket for the same phone number.
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
      case l.entity_type
        when 'profiles' then 1
        when 'employees' then 2
        when 'customers' then 3
        when 'suppliers' then 4
        else 99
      end as entity_priority,
      case l.label
        when 'mobile' then 1
        when 'primary_mobile' then 1
        when 'secondary_mobile' then 2
        when 'phone' then 3
        when 'assistant_phone' then 4
        else 9
      end as field_priority
    from public.phone_number_links l
    where l.org_id = p_org_id
      and l.phone_number_id = v_phone_number_id
      and l.entity_type in ('profiles', 'employees', 'customers', 'suppliers')
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
      case l.entity_type
        when 'profiles' then 1
        when 'employees' then 2
        when 'customers' then 3
        when 'suppliers' then 4
        else 99
      end as entity_priority,
      case l.label
        when 'mobile' then 1
        when 'primary_mobile' then 1
        when 'secondary_mobile' then 2
        when 'phone' then 3
        when 'assistant_phone' then 4
        else 9
      end as field_priority
    from public.phone_number_links l
    where l.org_id = p_org_id
      and l.phone_number_id = v_phone_number_id
      and l.entity_type in ('profiles', 'employees', 'customers', 'suppliers')
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

  return jsonb_build_object(
    'match_status', 'matched',
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

-- Recompute existing SMS attribution for all non-manual rows.
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
    and coalesce(m.phone_match_status, 'unknown') <> 'manual'
    and public.kalam_phone_lookup_key(case when m.direction = 'inbound' then m.sender else m.recipient end) <> ''
)
update public.outbound_messages m
set
  phone_number_id = coalesce(public.kalam_try_uuid(sms_lookup.lookup->>'phone_number_id'), m.phone_number_id),
  phone_match_status = coalesce(nullif(sms_lookup.lookup->>'match_status', ''), 'unknown'),
  module_id = case
    when sms_lookup.lookup->>'match_status' = 'matched' then nullif(sms_lookup.lookup->>'module_id', '')
    else m.module_id
  end,
  record_id = case
    when sms_lookup.lookup->>'match_status' = 'matched' then nullif(sms_lookup.lookup->>'record_id', '')
    else m.record_id
  end,
  customer_id = case
    when sms_lookup.lookup->>'match_status' = 'matched'
      then public.kalam_try_uuid(sms_lookup.lookup->>'customer_id')
    else m.customer_id
  end,
  title = case
    when sms_lookup.lookup->>'match_status' = 'matched'
      then coalesce(nullif(sms_lookup.lookup->>'title', ''), m.title)
    else m.title
  end
from sms_lookup
where m.id = sms_lookup.id;

-- Recompute existing VoIP attribution for all non-manual rows.
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
    and coalesce(c.phone_match_status, 'unknown') <> 'manual'
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
    when voip_lookup.lookup->>'match_status' = 'matched' then nullif(voip_lookup.lookup->>'module_id', '')
    else c.module_id
  end,
  record_id = case
    when voip_lookup.lookup->>'match_status' = 'matched' then nullif(voip_lookup.lookup->>'record_id', '')
    else c.record_id
  end,
  title = case
    when voip_lookup.lookup->>'match_status' = 'matched'
      then coalesce(nullif(voip_lookup.lookup->>'title', ''), c.title)
    else c.title
  end
from voip_lookup
where c.id = voip_lookup.id;

grant execute on function public.kalam_find_phone_target(uuid, text) to authenticated;
revoke all on function public.kalam_find_phone_target(uuid, text) from public, anon;

notify pgrst, 'reload schema';

commit;
