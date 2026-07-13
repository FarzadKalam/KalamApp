-- Phase 337: Repair public delivery-form read RPC and use module record files only.

begin;

create or replace function public._delivery_normalize_phone(p_raw text)
returns text language sql immutable set search_path = public as $$
  select case
    when regexp_replace(translate(coalesce(p_raw, ''), '۰۱۲۳۴۵۶۷۸۹', '0123456789'), '[^0-9]', '', 'g') ~ '^00989[0-9]{9}$' then '0' || substr(regexp_replace(translate(coalesce(p_raw, ''), '۰۱۲۳۴۵۶۷۸۹', '0123456789'), '[^0-9]', '', 'g'), 5)
    when regexp_replace(translate(coalesce(p_raw, ''), '۰۱۲۳۴۵۶۷۸۹', '0123456789'), '[^0-9]', '', 'g') ~ '^989[0-9]{9}$' then '0' || substr(regexp_replace(translate(coalesce(p_raw, ''), '۰۱۲۳۴۵۶۷۸۹', '0123456789'), '[^0-9]', '', 'g'), 3)
    when regexp_replace(translate(coalesce(p_raw, ''), '۰۱۲۳۴۵۶۷۸۹', '0123456789'), '[^0-9]', '', 'g') ~ '^9[0-9]{9}$' then '0' || regexp_replace(translate(coalesce(p_raw, ''), '۰۱۲۳۴۵۶۷۸۹', '0123456789'), '[^0-9]', '', 'g')
    else regexp_replace(translate(coalesce(p_raw, ''), '۰۱۲۳۴۵۶۷۸۹', '0123456789'), '[^0-9]', '', 'g') end
$$;

create or replace function public._delivery_public_phone_options(p_phone_1 text, p_phone_2 text default null, p_phone_3 text default null)
returns jsonb language plpgsql stable set search_path = public as $$
declare v_result jsonb := '[]'::jsonb; v_seen text[] := array[]::text[]; v_phone text; v_raw text; v_index integer := 0;
begin
  foreach v_raw in array array[p_phone_1, p_phone_2, p_phone_3] loop
    v_phone := public._delivery_normalize_phone(v_raw);
    if v_phone ~ '^09[0-9]{9}$' and not (v_phone = any(v_seen)) then
      v_index := v_index + 1; v_seen := array_append(v_seen, v_phone);
      v_result := v_result || jsonb_build_array(jsonb_build_object('label', case when v_index = 1 then 'موبایل اصلی' else 'موبایل ' || v_index::text end, 'value', 'phone_' || v_index::text, 'phone', v_phone));
    end if;
  end loop;
  return v_result;
end;
$$;

create or replace function public._resolve_org_for_public_delivery(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org_id uuid;
begin
  if p_code is null or p_code !~ '^[0-9A-Za-z]{8,64}$' then return null; end if;
  select d.org_id into v_org_id from public.delivery_forms d where d.public_slug = p_code or d.public_token = p_code limit 1;
  return v_org_id;
end;
$$;

create or replace function public.get_public_delivery_form(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid; v_delivery_id uuid; v_delivery jsonb := '{}'::jsonb; v_items jsonb := '[]'::jsonb; v_files jsonb := '[]'::jsonb; v_branding jsonb := '{}'::jsonb; v_delivered_phones jsonb := '[]'::jsonb; v_received_phones jsonb := '[]'::jsonb;
begin
  v_org_id := public._resolve_org_for_public_delivery(p_code);
  if v_org_id is null then return jsonb_build_object('error', 'not_found'); end if;

  select d.id,
    jsonb_strip_nulls(jsonb_build_object('system_code', d.system_code, 'public_link', d.public_link, 'name', d.name, 'form_type', d.form_type, 'status', d.status, 'delivery_date', d.delivery_date, 'location_text', d.location_text, 'notes', d.notes,
      'delivered_by_name', case d.delivered_by_type when 'customer' then coalesce(nullif(c_del.full_name, ''), nullif(c_del.business_name, ''), nullif(c_del.legal_name, '')) when 'supplier' then coalesce(nullif(s_del.business_name, ''), nullif(trim(concat_ws(' ', s_del.first_name, s_del.last_name)), '')) when 'other' then nullif(d.external_delivered_by, '') else coalesce(nullif(e_del.full_name, ''), nullif(trim(concat_ws(' ', e_del.first_name, e_del.last_name)), ''), nullif(p_del.full_name, '')) end,
      'received_by_name', case d.received_by_type when 'customer' then coalesce(nullif(c_rec.full_name, ''), nullif(c_rec.business_name, ''), nullif(c_rec.legal_name, '')) when 'supplier' then coalesce(nullif(s_rec.business_name, ''), nullif(trim(concat_ws(' ', s_rec.first_name, s_rec.last_name)), '')) when 'other' then nullif(d.external_received_by, '') else coalesce(nullif(e_rec.full_name, ''), nullif(trim(concat_ws(' ', e_rec.first_name, e_rec.last_name)), ''), nullif(p_rec.full_name, '')) end,
      'delivered_by_confirmed_at', d.delivered_by_confirmed_at, 'received_by_confirmed_at', d.received_by_confirmed_at, 'delivered_by_confirmer_name', d.delivered_by_confirmer_name, 'received_by_confirmer_name', d.received_by_confirmer_name)),
    coalesce(d.items, '[]'::jsonb),
    case d.delivered_by_type when 'customer' then public._delivery_public_phone_options(c_del.mobile_1, c_del.mobile_2, c_del.assistant_phone) when 'supplier' then public._delivery_public_phone_options(s_del.mobile_1, s_del.mobile_2, null) when 'other' then public._delivery_public_phone_options(d.external_delivered_by_phone, null, null) else public._delivery_public_phone_options(e_del.mobile_1, e_del.mobile_2, p_del.mobile) end,
    case d.received_by_type when 'customer' then public._delivery_public_phone_options(c_rec.mobile_1, c_rec.mobile_2, c_rec.assistant_phone) when 'supplier' then public._delivery_public_phone_options(s_rec.mobile_1, s_rec.mobile_2, null) when 'other' then public._delivery_public_phone_options(d.external_received_by_phone, null, null) else public._delivery_public_phone_options(e_rec.mobile_1, e_rec.mobile_2, p_rec.mobile) end
  into v_delivery_id, v_delivery, v_items, v_delivered_phones, v_received_phones
  from public.delivery_forms d
  left join public.employees e_del on e_del.id = d.delivered_by_employee_id and e_del.org_id = d.org_id
  left join public.employees e_rec on e_rec.id = d.received_by_employee_id and e_rec.org_id = d.org_id
  left join public.profiles p_del on p_del.id = d.delivered_by_id and p_del.org_id = d.org_id
  left join public.profiles p_rec on p_rec.id = d.received_by_id and p_rec.org_id = d.org_id
  left join public.customers c_del on c_del.id = d.delivered_by_customer_id and c_del.org_id = d.org_id
  left join public.customers c_rec on c_rec.id = d.received_by_customer_id and c_rec.org_id = d.org_id
  left join public.suppliers s_del on s_del.id = d.delivered_by_supplier_id and s_del.org_id = d.org_id
  left join public.suppliers s_rec on s_rec.id = d.received_by_supplier_id and s_rec.org_id = d.org_id
  where d.org_id = v_org_id and (d.public_slug = p_code or d.public_token = p_code) limit 1;
  if v_delivery_id is null then return jsonb_build_object('error', 'not_found'); end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'url', f.url, 'name', f.name, 'file_type', f.file_type, 'mime_type', f.mime_type, 'sort_order', f.sort_order) order by f.sort_order, f.created_at), '[]'::jsonb) into v_files
  from (
    select rf.id::text as id, rf.file_url as url, coalesce(nullif(rf.file_name, ''), 'فایل تحویل') as name, coalesce(nullif(rf.file_type, ''), 'file') as file_type, rf.mime_type, coalesce(rf.sort_order, 0) as sort_order, rf.created_at from public.record_files rf where rf.org_id = v_org_id and rf.module_id = 'delivery_forms' and rf.record_id = v_delivery_id::text and nullif(btrim(coalesce(rf.file_url, '')), '') is not null
    union all
    select fe.id::text, coalesce(nullif(fa.target_url, ''), fa.metadata->>'publicUrl', fa.metadata->>'public_url'), coalesce(nullif(fe.entry_name, ''), nullif(fa.display_name, ''), 'فایل تحویل'), coalesce(nullif(fa.file_type, ''), 'file'), fa.mime_type, coalesce(fe.sort_order, 0), fe.created_at from public.file_entries fe join public.file_assets fa on fa.id = fe.asset_id and fa.org_id = fe.org_id where fe.org_id = v_org_id and fe.module_id = 'delivery_forms' and fe.record_id = v_delivery_id and coalesce(fe.is_deleted, false) = false and nullif(btrim(coalesce(fa.target_url, fa.metadata->>'publicUrl', fa.metadata->>'public_url', '')), '') is not null
  ) f;

  select coalesce(jsonb_build_object('branding_settings', s.branding_settings, 'company_settings', s.company_settings), '{}'::jsonb) into v_branding from public.saas_org_settings s where s.org_id = v_org_id limit 1;
  return jsonb_build_object('delivery', v_delivery, 'items', coalesce(v_items, '[]'::jsonb), 'files', coalesce(v_files, '[]'::jsonb), 'branding', coalesce(v_branding, '{}'::jsonb), 'phone_options', jsonb_build_object('delivered_by', coalesce(v_delivered_phones, '[]'::jsonb), 'received_by', coalesce(v_received_phones, '[]'::jsonb)));
end;
$$;

revoke all on function public._resolve_org_for_public_delivery(text) from public, anon, authenticated;
revoke all on function public.get_public_delivery_form(text) from public;
grant execute on function public.get_public_delivery_form(text) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
commit;
