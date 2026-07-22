-- TazeSystem - Phase 360: secure Telefonchy operator, contact, and recording resolution

begin;

create or replace function public.kalam_phone_lookup_key(p_value text)
returns text
language plpgsql
immutable
as $$
declare
  v_digits text;
begin
  v_digits := regexp_replace(
    translate(coalesce(p_value, ''), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'),
    '\D',
    '',
    'g'
  );
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

create index if not exists idx_profiles_org_voip_extension
  on public.profiles(org_id, (nullif(trim(coalesce(voip_extension, '')), '')))
  where voip_enabled = true and nullif(trim(coalesce(voip_extension, '')), '') is not null;

create index if not exists idx_profiles_org_voip_operator_code
  on public.profiles(org_id, (nullif(trim(coalesce(voip_operator_code, '')), '')))
  where voip_enabled = true and nullif(trim(coalesce(voip_operator_code, '')), '') is not null;

create or replace function public.kalam_enrich_voip_call_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lookup jsonb;
  v_phone text;
  v_assignee_id uuid;
  v_assignee_count integer := 0;
  v_assignee_name text;
  v_assignee_avatar text;
begin
  if new.org_id is null then
    return new;
  end if;

  new.extension := nullif(trim(coalesce(new.extension, '')), '');
  new.operator_code := nullif(trim(coalesce(new.operator_code, '')), '');
  new.source_number := nullif(trim(coalesce(new.source_number, '')), '');
  new.destination_number := nullif(trim(coalesce(new.destination_number, '')), '');

  if new.assignee_id is null and (new.extension is not null or new.operator_code is not null) then
    select count(*), (array_agg(p.id order by p.id))[1]
      into v_assignee_count, v_assignee_id
    from public.profiles p
    where p.org_id = new.org_id
      and p.voip_enabled = true
      and (
        (new.extension is not null and nullif(trim(coalesce(p.voip_extension, '')), '') = new.extension)
        or (new.operator_code is not null and nullif(trim(coalesce(p.voip_operator_code, '')), '') = new.operator_code)
      );

    if v_assignee_count = 1 then
      new.assignee_id := v_assignee_id;
    end if;
  end if;

  if new.assignee_id is not null then
    select nullif(trim(coalesce(p.full_name, '')), ''), p.avatar_url
      into v_assignee_name, v_assignee_avatar
    from public.profiles p
    where p.id = new.assignee_id
      and p.org_id = new.org_id
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
      new.title := coalesce(nullif(v_lookup->>'title', ''), new.title);
    end if;
  else
    new.phone_match_status := 'unknown';
  end if;

  if new.direction = 'incoming'
    and coalesce(new.metadata->>'recording_available', '') = 'false' then
    new.status := 'missed';
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

  new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'operator_display_name', v_assignee_name,
    'operator_avatar_url', v_assignee_avatar,
    'operator_extension', new.extension,
    'operator_code', new.operator_code,
    'operator_resolution', case
      when new.assignee_id is not null then 'matched'
      when v_assignee_count > 1 then 'ambiguous'
      else 'unknown'
    end
  ));

  if nullif(trim(coalesce(new.title, '')), '') is null then
    new.title := coalesce(v_phone, 'تماس VoIP');
  end if;

  return new;
end;
$$;

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
  module_id = case when voip_lookup.lookup->>'match_status' = 'matched' then nullif(voip_lookup.lookup->>'module_id', '') else c.module_id end,
  record_id = case when voip_lookup.lookup->>'match_status' = 'matched' then nullif(voip_lookup.lookup->>'record_id', '') else c.record_id end,
  title = case when voip_lookup.lookup->>'match_status' = 'matched' then coalesce(nullif(voip_lookup.lookup->>'title', ''), c.title) else c.title end
from voip_lookup
where c.id = voip_lookup.id;

update public.voip_call_logs
set metadata = coalesce(metadata, '{}'::jsonb)
where org_id is not null
  and assignee_id is null
  and (nullif(trim(coalesce(extension, '')), '') is not null or nullif(trim(coalesce(operator_code, '')), '') is not null);

notify pgrst, 'reload schema';

commit;
