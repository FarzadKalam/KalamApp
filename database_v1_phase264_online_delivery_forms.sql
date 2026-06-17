-- Phase 264: Online delivery forms, party-specific OTP confirmation, and file support.
-- Public access is limited to SECURITY DEFINER RPCs; delivery_forms remains tenant-owned.

begin;

create extension if not exists pgcrypto;

create or replace function public.generate_delivery_share_token(p_length integer default 10)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  v_length integer := greatest(coalesce(p_length, 10), 8);
  v_seed text := encode(
    sha256(cast(gen_random_uuid()::text || clock_timestamp()::text || random()::text as bytea)),
    'hex'
  );
  v_result text := '';
  v_index integer;
  v_pos integer;
  v_chunk text;
begin
  for v_pos in 0..(v_length - 1) loop
    if (v_pos * 2) + 2 > length(v_seed) then
      v_seed := v_seed || encode(
        sha256(cast(gen_random_uuid()::text || clock_timestamp()::text || random()::text || v_pos::text as bytea)),
        'hex'
      );
    end if;
    v_chunk := substr(v_seed, (v_pos * 2) + 1, 2);
    v_index := mod(('x' || v_chunk)::bit(8)::integer, length(v_alphabet));
    v_result := v_result || substr(v_alphabet, v_index + 1, 1);
  end loop;
  return v_result;
end;
$$;

create or replace function public._delivery_normalize_phone(p_raw text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when regexp_replace(translate(coalesce(p_raw, ''), '۰۱۲۳۴۵۶۷۸۹', '0123456789'), '[^0-9]', '', 'g') ~ '^00989[0-9]{9}$'
      then '0' || substr(regexp_replace(translate(coalesce(p_raw, ''), '۰۱۲۳۴۵۶۷۸۹', '0123456789'), '[^0-9]', '', 'g'), 5)
    when regexp_replace(translate(coalesce(p_raw, ''), '۰۱۲۳۴۵۶۷۸۹', '0123456789'), '[^0-9]', '', 'g') ~ '^989[0-9]{9}$'
      then '0' || substr(regexp_replace(translate(coalesce(p_raw, ''), '۰۱۲۳۴۵۶۷۸۹', '0123456789'), '[^0-9]', '', 'g'), 3)
    when regexp_replace(translate(coalesce(p_raw, ''), '۰۱۲۳۴۵۶۷۸۹', '0123456789'), '[^0-9]', '', 'g') ~ '^9[0-9]{9}$'
      then '0' || regexp_replace(translate(coalesce(p_raw, ''), '۰۱۲۳۴۵۶۷۸۹', '0123456789'), '[^0-9]', '', 'g')
    else regexp_replace(translate(coalesce(p_raw, ''), '۰۱۲۳۴۵۶۷۸۹', '0123456789'), '[^0-9]', '', 'g')
  end
$$;

create or replace function public._delivery_public_phone_options(
  p_phone_1 text,
  p_phone_2 text default null,
  p_phone_3 text default null
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_result jsonb := '[]'::jsonb;
  v_seen text[] := array[]::text[];
  v_phone text;
  v_index integer := 0;
  v_raw text;
begin
  foreach v_raw in array array[p_phone_1, p_phone_2, p_phone_3] loop
    v_phone := public._delivery_normalize_phone(v_raw);
    if v_phone ~ '^09[0-9]{9}$' and not (v_phone = any(v_seen)) then
      v_index := v_index + 1;
      v_seen := array_append(v_seen, v_phone);
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'label', case when v_index = 1 then 'موبایل اصلی' else 'موبایل ' || v_index::text end,
        'value', 'phone_' || v_index::text,
        'phone', v_phone
      ));
    end if;
  end loop;
  return v_result;
end;
$$;

alter table if exists public.secretariat_documents
  add column if not exists image_url text;

alter table if exists public.delivery_forms
  add column if not exists image_url text,
  add column if not exists public_token text,
  add column if not exists public_slug text,
  add column if not exists public_link text,
  add column if not exists delivered_by_type text not null default 'internal',
  add column if not exists received_by_type text not null default 'internal',
  add column if not exists delivered_by_employee_id uuid references public.employees(id) on delete set null,
  add column if not exists received_by_employee_id uuid references public.employees(id) on delete set null,
  add column if not exists delivered_by_customer_id uuid references public.customers(id) on delete set null,
  add column if not exists received_by_customer_id uuid references public.customers(id) on delete set null,
  add column if not exists delivered_by_supplier_id uuid references public.suppliers(id) on delete set null,
  add column if not exists received_by_supplier_id uuid references public.suppliers(id) on delete set null,
  add column if not exists external_delivered_by_phone text,
  add column if not exists external_received_by_phone text,
  add column if not exists delivered_by_confirmed_at timestamptz,
  add column if not exists received_by_confirmed_at timestamptz,
  add column if not exists delivered_by_confirmer_name text,
  add column if not exists received_by_confirmer_name text,
  add column if not exists delivered_by_confirm_phone text,
  add column if not exists received_by_confirm_phone text,
  add column if not exists delivered_by_confirm_otp_hash text,
  add column if not exists received_by_confirm_otp_hash text,
  add column if not exists delivered_by_confirm_otp_expires_at timestamptz,
  add column if not exists received_by_confirm_otp_expires_at timestamptz;

alter table if exists public.delivery_forms
  alter column delivery_date drop default,
  alter column delivery_date type timestamptz using delivery_date::timestamptz,
  alter column delivery_date set default now();

update public.delivery_forms
set public_token = substr(encode(sha256(cast(gen_random_uuid()::text || clock_timestamp()::text || random()::text as bytea)), 'hex'), 1, 48)
where public_token is null
   or btrim(public_token) = ''
   or public_token !~ '^[0-9a-f]{48}$';

update public.delivery_forms
set public_slug = public.generate_delivery_share_token(10)
where public_slug is null
   or btrim(public_slug) = ''
   or public_slug !~ '^[0-9A-Za-z]{8,64}$';

with ranked as (
  select id, row_number() over (partition by public_token order by id) as rn
  from public.delivery_forms
  where public_token is not null and btrim(public_token) <> ''
)
update public.delivery_forms d
set public_token = substr(encode(sha256(cast(gen_random_uuid()::text || clock_timestamp()::text || random()::text as bytea)), 'hex'), 1, 48)
from ranked r
where d.id = r.id
  and r.rn > 1;

with ranked as (
  select id, row_number() over (partition by public_slug order by id) as rn
  from public.delivery_forms
  where public_slug is not null and btrim(public_slug) <> ''
)
update public.delivery_forms d
set public_slug = public.generate_delivery_share_token(10)
from ranked r
where d.id = r.id
  and r.rn > 1;

alter table if exists public.delivery_forms
  alter column public_token set default substr(encode(sha256(cast(gen_random_uuid()::text || clock_timestamp()::text || random()::text as bytea)), 'hex'), 1, 48),
  alter column public_token set not null,
  alter column public_slug set default public.generate_delivery_share_token(10),
  alter column public_slug set not null;

create unique index if not exists delivery_forms_public_token_uidx
  on public.delivery_forms(public_token);

create unique index if not exists delivery_forms_public_slug_uidx
  on public.delivery_forms(public_slug);

create index if not exists idx_secretariat_documents_image_url
  on public.secretariat_documents(org_id)
  where image_url is not null and btrim(image_url) <> '';

create index if not exists idx_delivery_forms_online_status
  on public.delivery_forms(org_id, status, delivery_date desc);

create index if not exists idx_delivery_forms_party_refs
  on public.delivery_forms(org_id, delivered_by_type, received_by_type);

alter table public.delivery_forms
  drop constraint if exists chk_delivery_forms_party_types;

alter table public.delivery_forms
  add constraint chk_delivery_forms_party_types
  check (
    delivered_by_type in ('internal', 'customer', 'supplier', 'other')
    and received_by_type in ('internal', 'customer', 'supplier', 'other')
  );

create or replace function public.sync_delivery_form_public_link()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.public_token is null or btrim(new.public_token) = '' then
      new.public_token := substr(encode(sha256(cast(gen_random_uuid()::text || clock_timestamp()::text || random()::text as bytea)), 'hex'), 1, 48);
    end if;
    if new.public_slug is null or btrim(new.public_slug) = '' then
      new.public_slug := public.generate_delivery_share_token(10);
    end if;
  else
    if new.public_token is distinct from old.public_token then
      new.public_token := old.public_token;
    end if;
    if new.public_slug is distinct from old.public_slug then
      new.public_slug := old.public_slug;
    end if;
  end if;

  new.public_link := '/d/' || coalesce(new.public_slug, new.public_token);
  return new;
end;
$$;

drop trigger if exists trg_delivery_forms_public_link on public.delivery_forms;
drop trigger if exists trg_delivery_forms_zz_public_link on public.delivery_forms;
create trigger trg_delivery_forms_zz_public_link
  before insert or update of system_code, public_token, public_slug on public.delivery_forms
  for each row execute function public.sync_delivery_form_public_link();

update public.delivery_forms
set public_link = '/d/' || coalesce(public_slug, public_token)
where public_link is distinct from '/d/' || coalesce(public_slug, public_token);

create or replace function public._resolve_org_for_public_delivery(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if p_code is null or p_code !~ '^[0-9A-Za-z]{8,64}$' then
    return null;
  end if;

  select d.org_id
  into v_org_id
  from public.delivery_forms d
  where d.public_slug = p_code
     or d.public_token = p_code
  limit 1;

  return v_org_id;
end;
$$;

revoke all on function public._resolve_org_for_public_delivery(text) from public, anon, authenticated;

create or replace function public.get_public_delivery_form(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_delivery_id uuid;
  v_delivery jsonb := '{}'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_files jsonb := '[]'::jsonb;
  v_branding jsonb := '{}'::jsonb;
  v_delivered_phone_options jsonb := '[]'::jsonb;
  v_received_phone_options jsonb := '[]'::jsonb;
begin
  v_org_id := public._resolve_org_for_public_delivery(p_code);
  if v_org_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  select
    d.id,
    jsonb_strip_nulls(jsonb_build_object(
      'system_code', d.system_code,
      'public_link', d.public_link,
      'name', d.name,
      'form_type', d.form_type,
      'status', d.status,
      'delivery_date', d.delivery_date,
      'location_text', d.location_text,
      'notes', d.notes,
      'image_url', d.image_url,
      'delivered_by_name',
        case d.delivered_by_type
          when 'customer' then coalesce(nullif(c_del.full_name, ''), nullif(c_del.business_name, ''), nullif(c_del.legal_name, ''))
          when 'supplier' then coalesce(nullif(s_del.business_name, ''), nullif(trim(concat_ws(' ', s_del.first_name, s_del.last_name)), ''))
          when 'other' then nullif(d.external_delivered_by, '')
          else coalesce(nullif(e_del.full_name, ''), nullif(trim(concat_ws(' ', e_del.first_name, e_del.last_name)), ''), nullif(p_del.full_name, ''))
        end,
      'received_by_name',
        case d.received_by_type
          when 'customer' then coalesce(nullif(c_rec.full_name, ''), nullif(c_rec.business_name, ''), nullif(c_rec.legal_name, ''))
          when 'supplier' then coalesce(nullif(s_rec.business_name, ''), nullif(trim(concat_ws(' ', s_rec.first_name, s_rec.last_name)), ''))
          when 'other' then nullif(d.external_received_by, '')
          else coalesce(nullif(e_rec.full_name, ''), nullif(trim(concat_ws(' ', e_rec.first_name, e_rec.last_name)), ''), nullif(p_rec.full_name, ''))
        end,
      'delivered_by_confirmed_at', d.delivered_by_confirmed_at,
      'received_by_confirmed_at', d.received_by_confirmed_at,
      'delivered_by_confirmer_name', d.delivered_by_confirmer_name,
      'received_by_confirmer_name', d.received_by_confirmer_name
    )),
    coalesce(d.items, '[]'::jsonb),
    case d.delivered_by_type
      when 'customer' then public._delivery_public_phone_options(c_del.mobile_1, c_del.mobile_2, c_del.assistant_phone)
      when 'supplier' then public._delivery_public_phone_options(s_del.mobile_1, s_del.mobile_2, null)
      when 'other' then public._delivery_public_phone_options(d.external_delivered_by_phone, null, null)
      else public._delivery_public_phone_options(e_del.mobile_1, e_del.mobile_2, p_del.mobile)
    end,
    case d.received_by_type
      when 'customer' then public._delivery_public_phone_options(c_rec.mobile_1, c_rec.mobile_2, c_rec.assistant_phone)
      when 'supplier' then public._delivery_public_phone_options(s_rec.mobile_1, s_rec.mobile_2, null)
      when 'other' then public._delivery_public_phone_options(d.external_received_by_phone, null, null)
      else public._delivery_public_phone_options(e_rec.mobile_1, e_rec.mobile_2, p_rec.mobile)
    end
  into v_delivery_id, v_delivery, v_items, v_delivered_phone_options, v_received_phone_options
  from public.delivery_forms d
  left join public.employees e_del on e_del.id = d.delivered_by_employee_id and e_del.org_id = d.org_id
  left join public.employees e_rec on e_rec.id = d.received_by_employee_id and e_rec.org_id = d.org_id
  left join public.profiles p_del on p_del.id = d.delivered_by_id and p_del.org_id = d.org_id
  left join public.profiles p_rec on p_rec.id = d.received_by_id and p_rec.org_id = d.org_id
  left join public.customers c_del on c_del.id = d.delivered_by_customer_id and c_del.org_id = d.org_id
  left join public.customers c_rec on c_rec.id = d.received_by_customer_id and c_rec.org_id = d.org_id
  left join public.suppliers s_del on s_del.id = d.delivered_by_supplier_id and s_del.org_id = d.org_id
  left join public.suppliers s_rec on s_rec.id = d.received_by_supplier_id and s_rec.org_id = d.org_id
  where d.org_id = v_org_id
    and (d.public_slug = p_code or d.public_token = p_code)
  limit 1;

  if v_delivery_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id,
    'url', f.url,
    'name', f.name,
    'file_type', f.file_type,
    'mime_type', f.mime_type,
    'sort_order', f.sort_order
  ) order by f.sort_order, f.created_at), '[]'::jsonb)
  into v_files
  from (
    select
      'main_image'::text as id,
      d.image_url as url,
      'تصویر اصلی'::text as name,
      'image'::text as file_type,
      null::text as mime_type,
      -1::integer as sort_order,
      d.created_at
    from public.delivery_forms d
    where d.id = v_delivery_id
      and d.org_id = v_org_id
      and nullif(btrim(coalesce(d.image_url, '')), '') is not null
    union all
    select
      rf.id::text,
      rf.file_url,
      coalesce(nullif(rf.file_name, ''), 'فایل تحویل'),
      coalesce(nullif(rf.file_type, ''), 'file'),
      rf.mime_type,
      coalesce(rf.sort_order, 0),
      rf.created_at
    from public.record_files rf
    where rf.org_id = v_org_id
      and rf.module_id = 'delivery_forms'
      and rf.record_id = v_delivery_id::text
      and nullif(btrim(coalesce(rf.file_url, '')), '') is not null
    union all
    select
      fe.id::text,
      coalesce(nullif(fa.target_url, ''), fa.metadata->>'publicUrl', fa.metadata->>'public_url'),
      coalesce(nullif(fe.entry_name, ''), nullif(fa.display_name, ''), 'فایل تحویل'),
      coalesce(nullif(fa.file_type, ''), 'file'),
      fa.mime_type,
      coalesce(fe.sort_order, 0),
      fe.created_at
    from public.file_entries fe
    join public.file_assets fa on fa.id = fe.asset_id and fa.org_id = fe.org_id
    where fe.org_id = v_org_id
      and fe.module_id = 'delivery_forms'
      and fe.record_id = v_delivery_id
      and coalesce(fe.is_deleted, false) = false
      and nullif(btrim(coalesce(fa.target_url, fa.metadata->>'publicUrl', fa.metadata->>'public_url', '')), '') is not null
  ) f;

  select coalesce(jsonb_build_object(
    'branding_settings', s.branding_settings,
    'company_settings', s.company_settings
  ), '{}'::jsonb)
  into v_branding
  from public.saas_org_settings s
  where s.org_id = v_org_id
  limit 1;

  return jsonb_build_object(
    'delivery', v_delivery,
    'items', coalesce(v_items, '[]'::jsonb),
    'files', coalesce(v_files, '[]'::jsonb),
    'branding', coalesce(v_branding, '{}'::jsonb),
    'phone_options', jsonb_build_object(
      'delivered_by', coalesce(v_delivered_phone_options, '[]'::jsonb),
      'received_by', coalesce(v_received_phone_options, '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.send_delivery_confirm_otp(
  p_code text,
  p_party text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_delivery_id uuid;
  v_status text;
  v_party text := btrim(coalesce(p_party, ''));
  v_phone text := public._delivery_normalize_phone(p_phone);
  v_phone_options jsonb := '[]'::jsonb;
  v_already_confirmed boolean := false;
  v_otp_code text;
  v_otp_hash text;
begin
  if v_party not in ('delivered_by', 'received_by') then
    return jsonb_build_object('error', 'invalid_party');
  end if;
  if v_phone !~ '^09[0-9]{9}$' then
    return jsonb_build_object('error', 'invalid_phone');
  end if;

  v_org_id := public._resolve_org_for_public_delivery(p_code);
  if v_org_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  select d.id, d.status,
    case when v_party = 'delivered_by' then d.delivered_by_confirmed_at is not null else d.received_by_confirmed_at is not null end,
    case
      when v_party = 'delivered_by' and d.delivered_by_type = 'customer' then public._delivery_public_phone_options(c_del.mobile_1, c_del.mobile_2, c_del.assistant_phone)
      when v_party = 'delivered_by' and d.delivered_by_type = 'supplier' then public._delivery_public_phone_options(s_del.mobile_1, s_del.mobile_2, null)
      when v_party = 'delivered_by' and d.delivered_by_type = 'other' then public._delivery_public_phone_options(d.external_delivered_by_phone, null, null)
      when v_party = 'delivered_by' then public._delivery_public_phone_options(e_del.mobile_1, e_del.mobile_2, p_del.mobile)
      when v_party = 'received_by' and d.received_by_type = 'customer' then public._delivery_public_phone_options(c_rec.mobile_1, c_rec.mobile_2, c_rec.assistant_phone)
      when v_party = 'received_by' and d.received_by_type = 'supplier' then public._delivery_public_phone_options(s_rec.mobile_1, s_rec.mobile_2, null)
      when v_party = 'received_by' and d.received_by_type = 'other' then public._delivery_public_phone_options(d.external_received_by_phone, null, null)
      else public._delivery_public_phone_options(e_rec.mobile_1, e_rec.mobile_2, p_rec.mobile)
    end
  into v_delivery_id, v_status, v_already_confirmed, v_phone_options
  from public.delivery_forms d
  left join public.employees e_del on e_del.id = d.delivered_by_employee_id and e_del.org_id = d.org_id
  left join public.employees e_rec on e_rec.id = d.received_by_employee_id and e_rec.org_id = d.org_id
  left join public.profiles p_del on p_del.id = d.delivered_by_id and p_del.org_id = d.org_id
  left join public.profiles p_rec on p_rec.id = d.received_by_id and p_rec.org_id = d.org_id
  left join public.customers c_del on c_del.id = d.delivered_by_customer_id and c_del.org_id = d.org_id
  left join public.customers c_rec on c_rec.id = d.received_by_customer_id and c_rec.org_id = d.org_id
  left join public.suppliers s_del on s_del.id = d.delivered_by_supplier_id and s_del.org_id = d.org_id
  left join public.suppliers s_rec on s_rec.id = d.received_by_supplier_id and s_rec.org_id = d.org_id
  where d.org_id = v_org_id
    and (d.public_slug = p_code or d.public_token = p_code)
  limit 1;

  if v_delivery_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_status not in ('draft', 'pending_signature', 'signed') then
    return jsonb_build_object('error', 'invalid_status');
  end if;
  if v_already_confirmed then
    return jsonb_build_object('error', 'already_confirmed');
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(coalesce(v_phone_options, '[]'::jsonb)) item
    where item->>'phone' = v_phone
  ) then
    return jsonb_build_object('error', 'phone_not_allowed');
  end if;

  v_otp_code := lpad(floor(random() * 1000000)::text, 6, '0');
  v_otp_hash := encode(sha256(cast(v_otp_code || v_phone as bytea)), 'hex');

  if v_party = 'delivered_by' then
    update public.delivery_forms
    set delivered_by_confirm_otp_hash = v_otp_hash,
        delivered_by_confirm_otp_expires_at = now() + interval '3 minutes',
        status = case when status = 'draft' then 'pending_signature' else status end
    where id = v_delivery_id and org_id = v_org_id;
  else
    update public.delivery_forms
    set received_by_confirm_otp_hash = v_otp_hash,
        received_by_confirm_otp_expires_at = now() + interval '3 minutes',
        status = case when status = 'draft' then 'pending_signature' else status end
    where id = v_delivery_id and org_id = v_org_id;
  end if;

  return jsonb_build_object('otp_code', v_otp_code);
end;
$$;

create or replace function public.verify_delivery_confirm_otp(
  p_code text,
  p_party text,
  p_phone text,
  p_otp_code text,
  p_confirmer_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_delivery_id uuid;
  v_system_code text;
  v_status text;
  v_party text := btrim(coalesce(p_party, ''));
  v_phone text := public._delivery_normalize_phone(p_phone);
  v_stored_hash text;
  v_expires_at timestamptz;
  v_expected_hash text;
  v_delivered_done boolean := false;
  v_received_done boolean := false;
  v_confirmer_name text := left(btrim(coalesce(p_confirmer_name, 'مخاطب')), 160);
begin
  if v_party not in ('delivered_by', 'received_by') then
    return jsonb_build_object('error', 'invalid_party');
  end if;
  if v_phone !~ '^09[0-9]{9}$' then
    return jsonb_build_object('error', 'invalid_phone');
  end if;

  v_org_id := public._resolve_org_for_public_delivery(p_code);
  if v_org_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  select
    id,
    system_code,
    status,
    case when v_party = 'delivered_by' then delivered_by_confirm_otp_hash else received_by_confirm_otp_hash end,
    case when v_party = 'delivered_by' then delivered_by_confirm_otp_expires_at else received_by_confirm_otp_expires_at end,
    delivered_by_confirmed_at is not null,
    received_by_confirmed_at is not null
  into v_delivery_id, v_system_code, v_status, v_stored_hash, v_expires_at, v_delivered_done, v_received_done
  from public.delivery_forms
  where org_id = v_org_id
    and (public_slug = p_code or public_token = p_code)
  limit 1;

  if v_delivery_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_status not in ('draft', 'pending_signature', 'signed') then
    return jsonb_build_object('error', 'invalid_status');
  end if;
  if (v_party = 'delivered_by' and v_delivered_done) or (v_party = 'received_by' and v_received_done) then
    return jsonb_build_object('error', 'already_confirmed');
  end if;
  if v_stored_hash is null or v_expires_at is null then
    return jsonb_build_object('error', 'otp_not_sent');
  end if;
  if now() > v_expires_at then
    return jsonb_build_object('error', 'otp_expired');
  end if;

  v_expected_hash := encode(sha256(cast(coalesce(p_otp_code, '') || v_phone as bytea)), 'hex');
  if v_stored_hash <> v_expected_hash then
    return jsonb_build_object('error', 'otp_invalid');
  end if;

  if v_party = 'delivered_by' then
    update public.delivery_forms
    set delivered_by_confirmed_at = now(),
        delivered_by_confirmer_name = v_confirmer_name,
        delivered_by_confirm_phone = v_phone,
        delivered_by_confirm_otp_hash = null,
        delivered_by_confirm_otp_expires_at = null
    where id = v_delivery_id and org_id = v_org_id;
  else
    update public.delivery_forms
    set received_by_confirmed_at = now(),
        received_by_confirmer_name = v_confirmer_name,
        received_by_confirm_phone = v_phone,
        received_by_confirm_otp_hash = null,
        received_by_confirm_otp_expires_at = null
    where id = v_delivery_id and org_id = v_org_id;
  end if;

  select delivered_by_confirmed_at is not null, received_by_confirmed_at is not null
  into v_delivered_done, v_received_done
  from public.delivery_forms
  where id = v_delivery_id and org_id = v_org_id;

  update public.delivery_forms
  set status = case when v_delivered_done and v_received_done then 'confirmed' else 'signed' end
  where id = v_delivery_id and org_id = v_org_id;

  insert into public.notes (org_id, module_id, record_id, content, author_name, is_public, metadata)
  values (
    v_org_id,
    'delivery_forms',
    v_delivery_id::text,
    case when v_party = 'delivered_by' then 'تحویل‌دهنده فرم تحویل را تایید کرد.' else 'تحویل‌گیرنده فرم تحویل را تایید کرد.' end,
    v_confirmer_name,
    true,
    jsonb_build_object(
      'source', 'online_delivery_confirm',
      'party', v_party,
      'phone', v_phone,
      'system_code', v_system_code
    )
  );

  return jsonb_build_object(
    'success', true,
    'confirmed_at', now(),
    'all_confirmed', v_delivered_done and v_received_done
  );
end;
$$;

revoke all on function public.get_public_delivery_form(text) from public;
revoke all on function public.send_delivery_confirm_otp(text, text, text) from public;
revoke all on function public.verify_delivery_confirm_otp(text, text, text, text, text) from public;

grant execute on function public.get_public_delivery_form(text) to anon, authenticated, service_role;
grant execute on function public.send_delivery_confirm_otp(text, text, text) to service_role;
grant execute on function public.verify_delivery_confirm_otp(text, text, text, text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
