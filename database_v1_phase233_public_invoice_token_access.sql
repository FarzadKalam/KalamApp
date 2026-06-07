-- Phase 233: Public online invoices with unguessable, tenant-safe tokens.
-- Public access remains limited to SECURITY DEFINER RPCs; invoice tables stay behind RLS.

alter table public.invoices
  add column if not exists public_token text;

alter table public.purchase_invoices
  add column if not exists public_token text;

update public.invoices
set public_token = substr(
  encode(sha256(cast(gen_random_uuid()::text || clock_timestamp()::text || random()::text as bytea)), 'hex'),
  1,
  48
)
where public_token is null
   or btrim(public_token) = ''
   or public_token !~ '^[0-9a-f]{48}$';

update public.purchase_invoices
set public_token = substr(
  encode(sha256(cast(gen_random_uuid()::text || clock_timestamp()::text || random()::text as bytea)), 'hex'),
  1,
  48
)
where public_token is null
   or btrim(public_token) = ''
   or public_token !~ '^[0-9a-f]{48}$';

with ranked as (
  select id, row_number() over (partition by public_token order by id) as rn
  from public.invoices
)
update public.invoices i
set public_token = substr(
  encode(sha256(cast(gen_random_uuid()::text || clock_timestamp()::text || random()::text as bytea)), 'hex'),
  1,
  48
)
from ranked r
where i.id = r.id
  and r.rn > 1;

with ranked as (
  select id, row_number() over (partition by public_token order by id) as rn
  from public.purchase_invoices
)
update public.purchase_invoices i
set public_token = substr(
  encode(sha256(cast(gen_random_uuid()::text || clock_timestamp()::text || random()::text as bytea)), 'hex'),
  1,
  48
)
from ranked r
where i.id = r.id
  and r.rn > 1;

alter table public.invoices
  alter column public_token set default substr(
    encode(sha256(cast(gen_random_uuid()::text || clock_timestamp()::text || random()::text as bytea)), 'hex'),
    1,
    48
  ),
  alter column public_token set not null;

alter table public.purchase_invoices
  alter column public_token set default substr(
    encode(sha256(cast(gen_random_uuid()::text || clock_timestamp()::text || random()::text as bytea)), 'hex'),
    1,
    48
  ),
  alter column public_token set not null;

create unique index if not exists invoices_public_token_uidx
  on public.invoices(public_token);

create unique index if not exists purchase_invoices_public_token_uidx
  on public.purchase_invoices(public_token);

create or replace function public.sync_invoice_public_link()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.public_token := substr(
      encode(sha256(cast(gen_random_uuid()::text || clock_timestamp()::text || random()::text as bytea)), 'hex'),
      1,
      48
    );
  elsif new.public_token is distinct from old.public_token then
    new.public_token := old.public_token;
  end if;

  if tg_table_name = 'invoices' then
    new.public_link := '/i/' || new.public_token;
  else
    new.public_link := '/i/' || new.public_token || '?t=p';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_invoices_public_link on public.invoices;
drop trigger if exists trg_invoices_zz_public_link on public.invoices;
create trigger trg_invoices_zz_public_link
  before insert or update of system_code, public_token on public.invoices
  for each row execute function public.sync_invoice_public_link();

drop trigger if exists trg_purchase_invoices_public_link on public.purchase_invoices;
drop trigger if exists trg_purchase_invoices_zz_public_link on public.purchase_invoices;
create trigger trg_purchase_invoices_zz_public_link
  before insert or update of system_code, public_token on public.purchase_invoices
  for each row execute function public.sync_invoice_public_link();

update public.invoices
set public_link = '/i/' || public_token
where public_link is distinct from '/i/' || public_token;

update public.purchase_invoices
set public_link = '/i/' || public_token || '?t=p'
where public_link is distinct from '/i/' || public_token || '?t=p';

create or replace function public._resolve_org_for_public_invoice(
  p_system_code text,
  p_module text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if p_system_code is null
     or p_system_code !~ '^[0-9a-f]{48}$'
     or p_module not in ('invoices', 'purchase_invoices') then
    return null;
  end if;

  if p_module = 'invoices' then
    select i.org_id
    into v_org_id
    from public.invoices i
    where i.public_token = p_system_code
    limit 1;
  else
    select i.org_id
    into v_org_id
    from public.purchase_invoices i
    where i.public_token = p_system_code
    limit 1;
  end if;

  return v_org_id;
end;
$$;

revoke all on function public._resolve_org_for_public_invoice(text, text) from public, anon, authenticated;

create or replace function public.get_public_invoice(
  p_system_code text,
  p_module text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_invoice_id uuid;
  v_invoice jsonb;
  v_items jsonb := '[]'::jsonb;
  v_payments jsonb := '[]'::jsonb;
  v_notes jsonb := '[]'::jsonb;
  v_branding jsonb := '{}'::jsonb;
  v_online_cfg jsonb := '{}'::jsonb;
begin
  v_org_id := public._resolve_org_for_public_invoice(p_system_code, p_module);
  if v_org_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  if p_module = 'invoices' then
    select
      i.id,
      jsonb_build_object(
        'system_code', i.system_code,
        'public_link', i.public_link,
        'name', i.name,
        'status', i.status,
        'invoice_date', i.invoice_date,
        'description', i.description,
        'customer_name', c.full_name,
        'customer_mobile', c.mobile_1,
        'customer_mobile2', c.mobile_2,
        'customer_assistant_mobile', c.assistant_phone,
        'sale_source', i.sale_source,
        'province', i.province,
        'city', i.city,
        'postal_code', i.postal_code,
        'address', i.address,
        'total_invoice_amount', i.total_invoice_amount,
        'total_received_amount', i.total_received_amount,
        'remaining_balance', i.remaining_balance,
        'customer_confirmed_at', i.customer_confirmed_at,
        'customer_confirmer_name', i.customer_confirmer_name
      )
    into v_invoice_id, v_invoice
    from public.invoices i
    left join public.customers c on c.id = i.customer_id and c.org_id = i.org_id
    where i.org_id = v_org_id and i.public_token = p_system_code
    limit 1;

    select coalesce(
      jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'product_name', coalesce(
              p.name,
              nullif(item_rows.item->>'product_name', ''),
              nullif(item_rows.item->>'name', '')
            ),
            'quantity', item_rows.item->'quantity',
            'main_unit', item_rows.item->'main_unit',
            'unit_price', item_rows.item->'unit_price',
            'discount', item_rows.item->'discount',
            'vat', item_rows.item->'vat',
            'total_price', item_rows.item->'total_price',
            'description', item_rows.item->'description',
            'length', item_rows.item->'length',
            'width', item_rows.item->'width',
            'start_date', item_rows.item->'start_date',
            'end_date', item_rows.item->'end_date',
            'secondary_quantity', item_rows.item->'secondary_quantity',
            'secondary_unit', item_rows.item->'secondary_unit'
          )
        )
        order by
          case
            when coalesce(item_rows.item->>'order_index', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
              then (item_rows.item->>'order_index')::numeric
            else item_rows.ordinality::numeric
          end
      ) filter (where item_rows.item is not null),
      '[]'::jsonb
    )
    into v_items
    from public.invoices i
    left join lateral jsonb_array_elements(coalesce(i."invoiceItems", '[]'::jsonb))
      with ordinality as item_rows(item, ordinality) on true
    left join public.products p
      on p.org_id = i.org_id
     and p.id::text = nullif(item_rows.item->>'product_id', '')
    where i.id = v_invoice_id and i.org_id = v_org_id;

    select coalesce(
      jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'date', payment_row.item->'date',
            'amount', payment_row.item->'amount',
            'payment_type', payment_row.item->'payment_type',
            'description', payment_row.item->'description',
            'status', payment_row.item->'status'
          )
        )
        order by payment_row.ordinality
      ) filter (where payment_row.item is not null),
      '[]'::jsonb
    )
    into v_payments
    from public.invoices i
    left join lateral jsonb_array_elements(coalesce(i.payments, '[]'::jsonb))
      with ordinality as payment_row(item, ordinality) on true
    where i.id = v_invoice_id and i.org_id = v_org_id;
  else
    select
      i.id,
      jsonb_build_object(
        'system_code', i.system_code,
        'public_link', i.public_link,
        'name', i.name,
        'status', i.status,
        'invoice_date', i.invoice_date,
        'description', i.description,
        'supplier_name', s.business_name,
        'supplier_mobile', s.mobile_1,
        'supplier_mobile2', s.mobile_2,
        'purchase_source', i.purchase_source,
        'total_invoice_amount', i.total_invoice_amount,
        'total_received_amount', i.total_received_amount,
        'remaining_balance', i.remaining_balance,
        'supplier_confirmed_at', i.supplier_confirmed_at,
        'supplier_confirmer_name', i.supplier_confirmer_name
      )
    into v_invoice_id, v_invoice
    from public.purchase_invoices i
    left join public.suppliers s on s.id = i.supplier_id and s.org_id = i.org_id
    where i.org_id = v_org_id and i.public_token = p_system_code
    limit 1;

    select coalesce(
      jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'product_name', coalesce(
              p.name,
              nullif(item_rows.item->>'product_name', ''),
              nullif(item_rows.item->>'name', '')
            ),
            'quantity', item_rows.item->'quantity',
            'main_unit', item_rows.item->'main_unit',
            'unit_price', item_rows.item->'unit_price',
            'discount', item_rows.item->'discount',
            'vat', item_rows.item->'vat',
            'total_price', item_rows.item->'total_price',
            'description', item_rows.item->'description',
            'length', item_rows.item->'length',
            'width', item_rows.item->'width',
            'start_date', item_rows.item->'start_date',
            'end_date', item_rows.item->'end_date',
            'secondary_quantity', item_rows.item->'secondary_quantity',
            'secondary_unit', item_rows.item->'secondary_unit'
          )
        )
        order by
          case
            when coalesce(item_rows.item->>'order_index', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
              then (item_rows.item->>'order_index')::numeric
            else item_rows.ordinality::numeric
          end
      ) filter (where item_rows.item is not null),
      '[]'::jsonb
    )
    into v_items
    from public.purchase_invoices i
    left join lateral jsonb_array_elements(coalesce(i."invoiceItems", '[]'::jsonb))
      with ordinality as item_rows(item, ordinality) on true
    left join public.products p
      on p.org_id = i.org_id
     and p.id::text = nullif(item_rows.item->>'product_id', '')
    where i.id = v_invoice_id and i.org_id = v_org_id;

    select coalesce(
      jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'date', payment_row.item->'date',
            'amount', payment_row.item->'amount',
            'payment_type', payment_row.item->'payment_type',
            'description', payment_row.item->'description',
            'status', payment_row.item->'status'
          )
        )
        order by payment_row.ordinality
      ) filter (where payment_row.item is not null),
      '[]'::jsonb
    )
    into v_payments
    from public.purchase_invoices i
    left join lateral jsonb_array_elements(coalesce(i.payments, '[]'::jsonb))
      with ordinality as payment_row(item, ordinality) on true
    where i.id = v_invoice_id and i.org_id = v_org_id;
  end if;

  if v_invoice is null or v_invoice_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'content', n.content,
        'author_name', n.author_name,
        'created_at', n.created_at,
        'metadata', jsonb_build_object('source', n.metadata->>'source')
      )
      order by n.created_at asc
    ),
    '[]'::jsonb
  )
  into v_notes
  from public.notes n
  where n.org_id = v_org_id
    and n.module_id = p_module
    and n.record_id = v_invoice_id::text
    and n.is_public = true;

  with company_row as (
    select jsonb_strip_nulls(jsonb_build_object(
      'company_full_name', cs.company_full_name,
      'trade_name', cs.trade_name,
      'logo_url', cs.logo_url,
      'brand_palette_key', cs.brand_palette_key,
      'address', cs.address,
      'phone', cs.phone,
      'mobile', cs.mobile
    )) as payload
    from public.company_settings cs
    where cs.org_id = v_org_id
    order by cs.updated_at desc nulls last, cs.created_at desc nulls last
    limit 1
  ),
  branding_row as (
    select jsonb_strip_nulls(jsonb_build_object(
      'brand_name', i.settings->>'brand_name',
      'brandName', i.settings->>'brandName',
      'short_name', i.settings->>'short_name',
      'shortName', i.settings->>'shortName',
      'primary_color', i.settings->>'primary_color',
      'palette_key', i.settings->>'palette_key'
    )) as payload
    from public.integration_settings i
    where i.org_id = v_org_id
      and i.connection_type = 'ui_theme'
      and coalesce(i.provider, '') = 'branding'
      and i.is_active = true
    order by i.updated_at desc nulls last, i.created_at desc nulls last
    limit 1
  )
  select jsonb_build_object(
    'company_settings', coalesce((select payload from company_row), '{}'::jsonb),
    'branding_settings', coalesce((select payload from branding_row), '{}'::jsonb)
  )
  into v_branding;

  select coalesce(s.settings->'modules'->p_module->'onlineInvoice', '{}'::jsonb)
  into v_online_cfg
  from public.integration_settings s
  where s.org_id = v_org_id
    and s.connection_type = 'module_settings'
    and s.is_active = true
  order by s.updated_at desc
  limit 1;

  return jsonb_build_object(
    'invoice', v_invoice,
    'items', v_items,
    'payments', v_payments,
    'notes', v_notes,
    'branding', v_branding,
    'online_config', v_online_cfg
  );
end;
$$;

create or replace function public.insert_public_invoice_note(
  p_system_code text,
  p_module text,
  p_content text,
  p_author_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_invoice_id uuid;
  v_assignee_id uuid;
  v_actual_system_code text;
begin
  if btrim(coalesce(p_content, '')) = '' or length(btrim(p_content)) > 1000 then
    return jsonb_build_object('error', 'invalid_content');
  end if;

  v_org_id := public._resolve_org_for_public_invoice(p_system_code, p_module);
  if v_org_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  if p_module = 'invoices' then
    select id, assignee_id, system_code
    into v_invoice_id, v_assignee_id, v_actual_system_code
    from public.invoices
    where org_id = v_org_id and public_token = p_system_code
    limit 1;
  else
    select id, assignee_id, system_code
    into v_invoice_id, v_assignee_id, v_actual_system_code
    from public.purchase_invoices
    where org_id = v_org_id and public_token = p_system_code
    limit 1;
  end if;

  if v_invoice_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  insert into public.notes (
    org_id,
    module_id,
    record_id,
    content,
    author_name,
    is_public,
    mention_user_ids,
    metadata
  )
  values (
    v_org_id,
    p_module,
    v_invoice_id::text,
    btrim(p_content),
    left(btrim(coalesce(p_author_name, 'مخاطب')), 160),
    true,
    case when v_assignee_id is not null then array[v_assignee_id] else array[]::uuid[] end,
    jsonb_build_object('source', 'online_invoice', 'system_code', v_actual_system_code)
  );

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.send_invoice_confirm_otp(
  p_system_code text,
  p_module text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_invoice_id uuid;
  v_status text;
  v_otp_code text;
  v_otp_hash text;
  v_phone_allowed boolean := false;
  v_phone_normalized text := public._normalize_phone_for_match(p_phone);
begin
  v_org_id := public._resolve_org_for_public_invoice(p_system_code, p_module);
  if v_org_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  if p_module = 'invoices' then
    select
      i.id,
      i.status,
      (
        public._normalize_phone_for_match(c.mobile_1) = v_phone_normalized
        or public._normalize_phone_for_match(c.mobile_2) = v_phone_normalized
        or public._normalize_phone_for_match(c.assistant_phone) = v_phone_normalized
      )
    into v_invoice_id, v_status, v_phone_allowed
    from public.invoices i
    left join public.customers c on c.id = i.customer_id and c.org_id = i.org_id
    where i.org_id = v_org_id and i.public_token = p_system_code
    limit 1;
  else
    select
      i.id,
      i.status,
      (
        public._normalize_phone_for_match(s.mobile_1) = v_phone_normalized
        or public._normalize_phone_for_match(s.mobile_2) = v_phone_normalized
      )
    into v_invoice_id, v_status, v_phone_allowed
    from public.purchase_invoices i
    left join public.suppliers s on s.id = i.supplier_id and s.org_id = i.org_id
    where i.org_id = v_org_id and i.public_token = p_system_code
    limit 1;
  end if;

  if v_invoice_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_status not in ('created', 'proforma') then
    return jsonb_build_object('error', 'invalid_status');
  end if;
  if coalesce(v_phone_allowed, false) = false then
    return jsonb_build_object('error', 'phone_not_allowed');
  end if;

  v_otp_code := lpad(floor(random() * 1000000)::text, 6, '0');
  v_otp_hash := encode(sha256(cast(v_otp_code || v_phone_normalized as bytea)), 'hex');

  if p_module = 'invoices' then
    update public.invoices
    set confirm_otp_hash = v_otp_hash,
        confirm_otp_expires_at = now() + interval '3 minutes'
    where id = v_invoice_id and org_id = v_org_id;
  else
    update public.purchase_invoices
    set confirm_otp_hash = v_otp_hash,
        confirm_otp_expires_at = now() + interval '3 minutes'
    where id = v_invoice_id and org_id = v_org_id;
  end if;

  return jsonb_build_object('otp_code', v_otp_code);
end;
$$;

create or replace function public.verify_invoice_confirm_otp(
  p_system_code text,
  p_module text,
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
  v_invoice_id uuid;
  v_actual_system_code text;
  v_status text;
  v_stored_hash text;
  v_expires_at timestamptz;
  v_expected_hash text;
  v_phone_normalized text := public._normalize_phone_for_match(p_phone);
begin
  v_org_id := public._resolve_org_for_public_invoice(p_system_code, p_module);
  if v_org_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  if p_module = 'invoices' then
    select id, system_code, status, confirm_otp_hash, confirm_otp_expires_at
    into v_invoice_id, v_actual_system_code, v_status, v_stored_hash, v_expires_at
    from public.invoices
    where org_id = v_org_id and public_token = p_system_code
    limit 1;
  else
    select id, system_code, status, confirm_otp_hash, confirm_otp_expires_at
    into v_invoice_id, v_actual_system_code, v_status, v_stored_hash, v_expires_at
    from public.purchase_invoices
    where org_id = v_org_id and public_token = p_system_code
    limit 1;
  end if;

  if v_invoice_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_status not in ('created', 'proforma') then
    return jsonb_build_object('error', 'invalid_status');
  end if;
  if v_stored_hash is null or v_expires_at is null then
    return jsonb_build_object('error', 'otp_not_sent');
  end if;
  if now() > v_expires_at then
    return jsonb_build_object('error', 'otp_expired');
  end if;

  v_expected_hash := encode(sha256(cast(p_otp_code || v_phone_normalized as bytea)), 'hex');
  if v_stored_hash <> v_expected_hash then
    return jsonb_build_object('error', 'otp_invalid');
  end if;

  if p_module = 'invoices' then
    update public.invoices
    set status = 'confirmed',
        customer_confirmed_at = now(),
        customer_confirmer_name = left(btrim(coalesce(p_confirmer_name, 'مشتری')), 160),
        confirm_otp_hash = null,
        confirm_otp_expires_at = null
    where id = v_invoice_id and org_id = v_org_id;
  else
    update public.purchase_invoices
    set status = 'confirmed',
        supplier_confirmed_at = now(),
        supplier_confirmer_name = left(btrim(coalesce(p_confirmer_name, 'تامین‌کننده')), 160),
        confirm_otp_hash = null,
        confirm_otp_expires_at = null
    where id = v_invoice_id and org_id = v_org_id;
  end if;

  insert into public.notes (org_id, module_id, record_id, content, author_name, is_public, metadata)
  values (
    v_org_id,
    p_module,
    v_invoice_id::text,
    'فاکتور توسط ' || left(btrim(coalesce(p_confirmer_name, 'مخاطب')), 160) || ' تایید شد.',
    left(btrim(coalesce(p_confirmer_name, 'مخاطب')), 160),
    true,
    jsonb_build_object(
      'source', 'online_invoice_confirm',
      'phone', v_phone_normalized,
      'system_code', v_actual_system_code
    )
  );

  return jsonb_build_object('success', true, 'confirmed_at', now());
end;
$$;

revoke all on function public.get_public_invoice(text, text) from public;
revoke all on function public.insert_public_invoice_note(text, text, text, text) from public;
revoke all on function public.send_invoice_confirm_otp(text, text, text) from public;
revoke all on function public.verify_invoice_confirm_otp(text, text, text, text, text) from public;

grant execute on function public.get_public_invoice(text, text) to anon, authenticated, service_role;
grant execute on function public.insert_public_invoice_note(text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.send_invoice_confirm_otp(text, text, text) to service_role;
grant execute on function public.verify_invoice_confirm_otp(text, text, text, text, text) to anon, authenticated, service_role;
