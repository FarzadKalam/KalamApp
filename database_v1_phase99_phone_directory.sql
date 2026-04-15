-- KalamApp V1 - Phase 99
-- Canonical per-org phone directory for SMS and VoIP attribution.

begin;

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

create table if not exists public.phone_numbers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  lookup_key text not null,
  display_number text,
  country_code text not null default 'IR',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_phone_numbers_org_lookup
  on public.phone_numbers(org_id, lookup_key);

create index if not exists idx_phone_numbers_org_updated
  on public.phone_numbers(org_id, updated_at desc);

create table if not exists public.phone_number_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  phone_number_id uuid not null references public.phone_numbers(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  label text,
  is_primary boolean not null default false,
  source_table text,
  source_field text,
  display_title text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_phone_number_links_source
  on public.phone_number_links(org_id, source_table, entity_id, source_field)
  where source_table is not null and source_field is not null;

create index if not exists idx_phone_number_links_phone
  on public.phone_number_links(org_id, phone_number_id);

create index if not exists idx_phone_number_links_entity
  on public.phone_number_links(org_id, entity_type, entity_id);

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists trg_phone_numbers_updated_at on public.phone_numbers;
    create trigger trg_phone_numbers_updated_at
      before update on public.phone_numbers
      for each row execute function public.set_updated_at();

    drop trigger if exists trg_phone_number_links_updated_at on public.phone_number_links;
    create trigger trg_phone_number_links_updated_at
      before update on public.phone_number_links
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table if exists public.outbound_messages
  add column if not exists phone_number_id uuid references public.phone_numbers(id) on delete set null,
  add column if not exists phone_match_status text not null default 'unknown';

alter table if exists public.voip_call_logs
  add column if not exists phone_number_id uuid references public.phone_numbers(id) on delete set null,
  add column if not exists phone_match_status text not null default 'unknown';

alter table if exists public.outbound_messages
  drop constraint if exists chk_outbound_messages_phone_match_status;

alter table if exists public.outbound_messages
  add constraint chk_outbound_messages_phone_match_status
  check (phone_match_status in ('unknown', 'matched', 'ambiguous', 'manual'));

alter table if exists public.voip_call_logs
  drop constraint if exists chk_voip_call_logs_phone_match_status;

alter table if exists public.voip_call_logs
  add constraint chk_voip_call_logs_phone_match_status
  check (phone_match_status in ('unknown', 'matched', 'ambiguous', 'manual'));

create index if not exists idx_outbound_messages_phone_number
  on public.outbound_messages(org_id, phone_number_id, coalesce(received_at, sent_at, created_at) desc)
  where phone_number_id is not null;

create index if not exists idx_voip_call_logs_phone_number
  on public.voip_call_logs(org_id, phone_number_id, coalesce(started_at, created_at) desc)
  where phone_number_id is not null;

create or replace function public.kalam_upsert_phone_number(
  p_org_id uuid,
  p_phone text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := public.kalam_phone_lookup_key(p_phone);
  v_id uuid;
begin
  if p_org_id is null or v_key = '' then
    return null;
  end if;

  insert into public.phone_numbers(org_id, lookup_key, display_number)
  values (p_org_id, v_key, nullif(trim(coalesce(p_phone, '')), ''))
  on conflict (org_id, lookup_key) do update
    set display_number = coalesce(nullif(trim(coalesce(excluded.display_number, '')), ''), public.phone_numbers.display_number),
        updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.kalam_sync_phone_link(
  p_org_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_display_title text,
  p_source_table text,
  p_source_field text,
  p_phone text,
  p_label text,
  p_is_primary boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone_number_id uuid;
begin
  if p_org_id is null or p_entity_id is null or public.kalam_phone_lookup_key(p_phone) = '' then
    return;
  end if;

  v_phone_number_id := public.kalam_upsert_phone_number(p_org_id, p_phone);
  if v_phone_number_id is null then
    return;
  end if;

  insert into public.phone_number_links(
    org_id,
    phone_number_id,
    entity_type,
    entity_id,
    label,
    is_primary,
    source_table,
    source_field,
    display_title
  )
  values (
    p_org_id,
    v_phone_number_id,
    nullif(trim(coalesce(p_entity_type, '')), ''),
    p_entity_id,
    nullif(trim(coalesce(p_label, '')), ''),
    coalesce(p_is_primary, false),
    nullif(trim(coalesce(p_source_table, '')), ''),
    nullif(trim(coalesce(p_source_field, '')), ''),
    nullif(trim(coalesce(p_display_title, '')), '')
  )
  on conflict (org_id, source_table, entity_id, source_field) where source_table is not null and source_field is not null
  do update set
    phone_number_id = excluded.phone_number_id,
    entity_type = excluded.entity_type,
    label = excluded.label,
    is_primary = excluded.is_primary,
    display_title = excluded.display_title,
    updated_at = now();
end;
$$;

create or replace function public.kalam_phone_link_label(p_field text)
returns text
language sql
immutable
as $$
  select case p_field
    when 'mobile' then 'mobile'
    when 'mobile_1' then 'primary_mobile'
    when 'mobile_2' then 'secondary_mobile'
    when 'phone' then 'phone'
    when 'assistant_phone' then 'assistant_phone'
    else p_field
  end
$$;

create or replace function public.kalam_phone_directory_row_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_org_id uuid;
  v_entity_id uuid;
  v_entity_type text;
  v_title text;
  v_field text;
  v_phone text;
begin
  if tg_op = 'DELETE' then
    delete from public.phone_number_links
    where source_table = tg_table_name
      and entity_id = old.id;
    return old;
  end if;

  v_row := to_jsonb(new);
  v_org_id := public.kalam_try_uuid(v_row->>'org_id');
  v_entity_id := public.kalam_try_uuid(v_row->>'id');
  v_entity_type := tg_table_name;

  if v_org_id is null or v_entity_id is null then
    return new;
  end if;

  v_title := coalesce(
    nullif(v_row->>'business_name', ''),
    nullif(v_row->>'full_name', ''),
    nullif(v_row->>'name', ''),
    nullif(concat_ws(' ', nullif(v_row->>'first_name', ''), nullif(v_row->>'last_name', '')), ''),
    nullif(v_row->>'system_code', ''),
    v_entity_id::text
  );

  delete from public.phone_number_links
  where source_table = tg_table_name
    and entity_id = v_entity_id;

  foreach v_field in array array['mobile', 'mobile_1', 'mobile_2', 'phone', 'assistant_phone']
  loop
    if v_row ? v_field then
      v_phone := nullif(trim(coalesce(v_row->>v_field, '')), '');
      if v_phone is not null then
        perform public.kalam_sync_phone_link(
          v_org_id,
          v_entity_type,
          v_entity_id,
          v_title,
          tg_table_name,
          v_field,
          v_phone,
          public.kalam_phone_link_label(v_field),
          v_field in ('mobile', 'mobile_1')
        );
      end if;
    end if;
  end loop;

  return new;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['customers', 'suppliers', 'profiles', 'employees', 'marketing_leads']
  loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format('drop trigger if exists %I on public.%I', 'trg_' || v_table || '_phone_directory_sync', v_table);
      execute format(
        'create trigger %I after insert or update or delete on public.%I for each row execute function public.kalam_phone_directory_row_sync()',
        'trg_' || v_table || '_phone_directory_sync',
        v_table
      );
    end if;
  end loop;
end $$;

create or replace function public.kalam_refresh_phone_directory(p_org_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.phone_number_links
  where source_table in ('customers', 'suppliers', 'profiles', 'employees', 'marketing_leads')
    and (p_org_id is null or org_id = p_org_id);

  insert into public.phone_number_links(org_id, phone_number_id, entity_type, entity_id, label, is_primary, source_table, source_field, display_title)
  select src.org_id,
         public.kalam_upsert_phone_number(src.org_id, src.phone_value),
         src.entity_type,
         src.entity_id,
         src.label,
         src.is_primary,
         src.source_table,
         src.source_field,
         src.display_title
  from (
    select org_id, 'customers'::text entity_type, id entity_id, coalesce(nullif(business_name, ''), nullif(full_name, ''), concat_ws(' ', nullif(first_name, ''), nullif(last_name, '')), system_code, id::text) display_title, 'customers'::text source_table, 'mobile_1'::text source_field, mobile_1 phone_value, 'primary_mobile'::text label, true is_primary from public.customers where mobile_1 is not null
    union all select org_id, 'customers', id, coalesce(nullif(business_name, ''), nullif(full_name, ''), concat_ws(' ', nullif(first_name, ''), nullif(last_name, '')), system_code, id::text), 'customers', 'mobile_2', mobile_2, 'secondary_mobile', false from public.customers where mobile_2 is not null
    union all select org_id, 'customers', id, coalesce(nullif(business_name, ''), nullif(full_name, ''), concat_ws(' ', nullif(first_name, ''), nullif(last_name, '')), system_code, id::text), 'customers', 'phone', phone, 'phone', false from public.customers where phone is not null
    union all select org_id, 'customers', id, coalesce(nullif(business_name, ''), nullif(full_name, ''), concat_ws(' ', nullif(first_name, ''), nullif(last_name, '')), system_code, id::text), 'customers', 'assistant_phone', assistant_phone, 'assistant_phone', false from public.customers where assistant_phone is not null
    union all select org_id, 'suppliers', id, coalesce(nullif(business_name, ''), concat_ws(' ', nullif(first_name, ''), nullif(last_name, '')), system_code, id::text), 'suppliers', 'mobile_1', mobile_1, 'primary_mobile', true from public.suppliers where mobile_1 is not null
    union all select org_id, 'suppliers', id, coalesce(nullif(business_name, ''), concat_ws(' ', nullif(first_name, ''), nullif(last_name, '')), system_code, id::text), 'suppliers', 'mobile_2', mobile_2, 'secondary_mobile', false from public.suppliers where mobile_2 is not null
    union all select org_id, 'suppliers', id, coalesce(nullif(business_name, ''), concat_ws(' ', nullif(first_name, ''), nullif(last_name, '')), system_code, id::text), 'suppliers', 'phone', phone, 'phone', false from public.suppliers where phone is not null
    union all select org_id, 'profiles', id, coalesce(nullif(full_name, ''), mobile, mobile_1, id::text), 'profiles', 'mobile', mobile, 'mobile', true from public.profiles where mobile is not null
    union all select org_id, 'profiles', id, coalesce(nullif(full_name, ''), mobile, mobile_1, id::text), 'profiles', 'mobile_1', mobile_1, 'primary_mobile', true from public.profiles where mobile_1 is not null
    union all select org_id, 'employees', id, coalesce(nullif(full_name, ''), system_code, id::text), 'employees', 'mobile_1', mobile_1, 'primary_mobile', true from public.employees where mobile_1 is not null
    union all select org_id, 'employees', id, coalesce(nullif(full_name, ''), system_code, id::text), 'employees', 'mobile_2', mobile_2, 'secondary_mobile', false from public.employees where mobile_2 is not null
    union all select org_id, 'employees', id, coalesce(nullif(full_name, ''), system_code, id::text), 'employees', 'phone', phone, 'phone', false from public.employees where phone is not null
    union all select org_id, 'marketing_leads', id, coalesce(nullif(business_name, ''), nullif(name, ''), id::text), 'marketing_leads', 'mobile', mobile, 'mobile', true from public.marketing_leads where mobile is not null
  ) src
  where src.org_id is not null
    and public.kalam_phone_lookup_key(src.phone_value) <> ''
    and (p_org_id is null or src.org_id = p_org_id)
  on conflict (org_id, source_table, entity_id, source_field) where source_table is not null and source_field is not null
  do update set
    phone_number_id = excluded.phone_number_id,
    entity_type = excluded.entity_type,
    label = excluded.label,
    is_primary = excluded.is_primary,
    display_title = excluded.display_title,
    updated_at = now();
end;
$$;

select public.kalam_refresh_phone_directory(null);

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

  select count(*)
  into v_count
  from (
    select distinct l.entity_type, l.entity_id
    from public.phone_number_links l
    where l.org_id = p_org_id
      and l.phone_number_id = v_phone_number_id
  ) matched_entities;

  if v_count = 0 then
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

  select *
  into v_link
  from public.phone_number_links l
  where l.org_id = p_org_id
    and l.phone_number_id = v_phone_number_id
  order by l.is_primary desc, l.updated_at desc nulls last
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

    if new.phone_match_status = 'matched' then
      if new.module_id is null then new.module_id := nullif(v_lookup->>'module_id', ''); end if;
      if new.record_id is null then new.record_id := nullif(v_lookup->>'record_id', ''); end if;
      if new.customer_id is null and public.kalam_try_uuid(v_lookup->>'customer_id') is not null then
        new.customer_id := public.kalam_try_uuid(v_lookup->>'customer_id');
      end if;
      if nullif(trim(coalesce(new.title, '')), '') is null then
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

  new.phone_number_id := coalesce(new.phone_number_id, public.kalam_upsert_phone_number(new.org_id, v_phone));
  v_lookup := public.kalam_find_phone_target(new.org_id, v_phone);

  if v_lookup is not null then
    new.phone_match_status := coalesce(nullif(v_lookup->>'match_status', ''), 'unknown');
    if new.phone_number_id is null and public.kalam_try_uuid(v_lookup->>'phone_number_id') is not null then
      new.phone_number_id := public.kalam_try_uuid(v_lookup->>'phone_number_id');
    end if;

    if new.phone_match_status = 'matched' then
      if new.module_id is null then new.module_id := nullif(v_lookup->>'module_id', ''); end if;
      if new.record_id is null then new.record_id := nullif(v_lookup->>'record_id', ''); end if;
      if nullif(trim(coalesce(new.title, '')), '') is null then
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

do $$
begin
  if to_regclass('public.voip_call_logs') is not null then
    drop trigger if exists trg_voip_call_logs_enrich on public.voip_call_logs;
    create trigger trg_voip_call_logs_enrich
      before insert or update on public.voip_call_logs
      for each row execute function public.kalam_enrich_voip_call_log();
  end if;
end $$;

update public.outbound_messages m
set phone_number_id = coalesce(
      m.phone_number_id,
      public.kalam_upsert_phone_number(
        m.org_id,
        case when m.direction = 'inbound' then m.sender else m.recipient end
      )
    ),
    phone_match_status = coalesce(
      nullif(public.kalam_find_phone_target(m.org_id, case when m.direction = 'inbound' then m.sender else m.recipient end)->>'match_status', ''),
      'unknown'
    )
where m.channel_type = 'sms'
  and m.org_id is not null
  and public.kalam_phone_lookup_key(case when m.direction = 'inbound' then m.sender else m.recipient end) <> '';

update public.voip_call_logs c
set phone_number_id = coalesce(
      c.phone_number_id,
      public.kalam_upsert_phone_number(
        c.org_id,
        case
          when coalesce(c.direction, '') = 'incoming' then c.source_number
          when coalesce(c.direction, '') = 'outgoing' then c.destination_number
          else coalesce(c.source_number, c.destination_number)
        end
      )
    ),
    phone_match_status = coalesce(
      nullif(public.kalam_find_phone_target(
        c.org_id,
        case
          when coalesce(c.direction, '') = 'incoming' then c.source_number
          when coalesce(c.direction, '') = 'outgoing' then c.destination_number
          else coalesce(c.source_number, c.destination_number)
        end
      )->>'match_status', ''),
      'unknown'
    )
where c.org_id is not null
  and public.kalam_phone_lookup_key(
    case
      when coalesce(c.direction, '') = 'incoming' then c.source_number
      when coalesce(c.direction, '') = 'outgoing' then c.destination_number
      else coalesce(c.source_number, c.destination_number)
    end
  ) <> '';

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
  m.phone_number_id,
  m.phone_match_status,
  m.received_at,
  coalesce(m.received_at, m.sent_at, m.created_at) as message_at,
  m.assignee_type,
  m.assignee_role_id
from public.outbound_messages m
where m.channel_type = 'sms';

grant select, update on public.sms_delivery_reports to authenticated;
grant select, insert, update, delete on public.phone_numbers to authenticated;
grant select, insert, update, delete on public.phone_number_links to authenticated;

alter table public.phone_numbers enable row level security;
alter table public.phone_number_links enable row level security;

drop policy if exists p_phone_numbers_org_all on public.phone_numbers;
create policy p_phone_numbers_org_all on public.phone_numbers
  for all to authenticated
  using (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id is null
    or org_id = public.current_org_id()
  )
  with check (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id is null
    or org_id = public.current_org_id()
  );

drop policy if exists p_phone_number_links_org_all on public.phone_number_links;
create policy p_phone_number_links_org_all on public.phone_number_links
  for all to authenticated
  using (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id is null
    or org_id = public.current_org_id()
  )
  with check (
    to_regprocedure('public.current_org_id()') is null
    or public.current_org_id() is null
    or org_id is null
    or org_id = public.current_org_id()
  );

notify pgrst, 'reload schema';

commit;
