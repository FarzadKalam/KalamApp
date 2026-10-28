-- نگاشت امن رکوردهای ووکامرس و تنظیم مرجع همگام‌سازی در سطح هر فروشگاه.
begin;

alter table public.external_connections
  add column if not exists sync_policy jsonb not null default '{"products":"manual","customers":"manual","invoices":"manual"}'::jsonb;

create table if not exists public.external_record_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null references public.external_connections(id) on delete cascade,
  module_key text not null check (module_key in ('products','customers','invoices')),
  local_id uuid not null,
  external_id text not null,
  local_updated_at timestamptz,
  external_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  unique (connection_id, module_key, local_id),
  unique (connection_id, module_key, external_id)
);
alter table public.external_record_links enable row level security;
revoke all on public.external_record_links from anon, authenticated;
grant select, insert, update, delete on public.external_record_links to service_role;
create index if not exists external_record_links_org_module_idx
  on public.external_record_links(org_id, module_key, connection_id);

-- تبدیل اتمیک سفارش دریافتی به فاکتور؛ تنها سرویس اتصال حق فراخوانی دارد.
create or replace function public.import_woocommerce_order(p_connection_id uuid, p_external_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.external_connections%rowtype;
  v_order public.external_order_inbox%rowtype;
  v_invoice_id uuid;
  v_customer_id uuid;
  v_product_id uuid;
  v_customer_external text;
  v_line jsonb;
  v_items jsonb := '[]'::jsonb;
  v_currency text;
  v_local_currency text;
  v_factor numeric := 1;
  v_name text;
  v_sku text;
  v_qty numeric;
  v_match_count integer;
  v_existing_paid numeric;
  v_existing_payments jsonb;
  v_subtotal numeric := 0;
  v_origin_code text;
begin
  select * into v_connection from public.external_connections
  where id = p_connection_id and provider = 'woocommerce' and is_active = true;
  if not found then raise exception 'Connection unavailable'; end if;
  select * into v_order from public.external_order_inbox
  where connection_id = p_connection_id and org_id = v_connection.org_id and external_id = p_external_id
  for update;
  if not found then raise exception 'Order unavailable'; end if;
  select local_id into v_invoice_id from public.external_record_links
  where connection_id = p_connection_id and module_key = 'invoices' and external_id = p_external_id;
  if v_invoice_id is null then
    select value->>'value' into v_origin_code
    from jsonb_array_elements(coalesce(v_order.payload->'meta_data', '[]'::jsonb))
    where value->>'key' = '_tazesystem_invoice_code' limit 1;
    if nullif(trim(coalesce(v_origin_code, '')), '') is not null then
      select id into v_invoice_id from public.invoices
      where org_id = v_connection.org_id and system_code = v_origin_code limit 1;
      if v_invoice_id is not null then
        insert into public.external_record_links(org_id, connection_id, module_key, local_id, external_id)
        values (v_connection.org_id, p_connection_id, 'invoices', v_invoice_id, p_external_id);
        update public.external_order_inbox set processing_status = 'processed' where id = v_order.id;
        return v_invoice_id;
      end if;
    end if;
  end if;
  if v_invoice_id is not null and coalesce(v_connection.sync_policy->>'invoices', 'manual') <> 'woocommerce' then
    return v_invoice_id;
  end if;

  select upper(coalesce(currency_code, 'IRT')) into v_local_currency
  from public.company_settings where org_id = v_connection.org_id limit 1;
  v_local_currency := coalesce(v_local_currency, 'IRT');
  v_currency := upper(coalesce(v_order.payload->>'currency', ''));
  if v_currency not in ('IRR', 'IRT') or v_local_currency not in ('IRR', 'IRT') then
    raise exception 'WooCommerce order currency cannot be mapped safely';
  end if;
  if v_currency = 'IRR' and v_local_currency = 'IRT' then v_factor := 0.1; end if;
  if v_currency = 'IRT' and v_local_currency = 'IRR' then v_factor := 10; end if;

  if nullif(trim(v_order.payload#>>'{billing,email}'), '') is not null then
    perform pg_advisory_xact_lock(hashtextextended(
      v_connection.org_id::text || ':woo-customer:' || lower(v_order.payload#>>'{billing,email}'), 0));
  end if;
  v_customer_external := nullif(nullif(trim(coalesce(v_order.payload->>'customer_id', '')), ''), '0');
  if v_customer_external is not null then
    select local_id into v_customer_id from public.external_record_links
    where connection_id = p_connection_id and module_key = 'customers' and external_id = v_customer_external;
  end if;
  if v_customer_id is null and nullif(trim(v_order.payload#>>'{billing,email}'), '') is not null then
    select count(*), (array_agg(id))[1] into v_match_count, v_customer_id from public.customers
    where org_id = v_connection.org_id and lower(email) = lower(v_order.payload#>>'{billing,email}');
    if v_match_count > 1 then raise exception 'Ambiguous customer email'; end if;
  end if;
  if v_customer_id is null and v_invoice_id is not null then
    select customer_id into v_customer_id from public.invoices
    where id = v_invoice_id and org_id = v_connection.org_id;
  end if;
  if v_customer_id is null then
    v_name := trim(concat_ws(' ', nullif(v_order.payload#>>'{billing,first_name}', ''), nullif(v_order.payload#>>'{billing,last_name}', '')));
    insert into public.customers(org_id, full_name, first_name, last_name, email, mobile_1)
    values (v_connection.org_id, coalesce(nullif(v_name, ''), 'مشتری فروشگاه'),
      nullif(v_order.payload#>>'{billing,first_name}', ''), nullif(v_order.payload#>>'{billing,last_name}', ''),
      nullif(v_order.payload#>>'{billing,email}', ''), nullif(v_order.payload#>>'{billing,phone}', ''))
    returning id into v_customer_id;
  end if;
  if v_customer_external is not null then
    insert into public.external_record_links(org_id, connection_id, module_key, local_id, external_id)
    values (v_connection.org_id, p_connection_id, 'customers', v_customer_id, v_customer_external)
    on conflict do nothing;
  end if;

  for v_line in select value from jsonb_array_elements(coalesce(v_order.payload->'line_items', '[]'::jsonb)) loop
    v_product_id := null;
    v_sku := nullif(trim(coalesce(v_line->>'sku', '')), '');
    if nullif(nullif(trim(coalesce(v_line->>'product_id', '')), ''), '0') is not null then
      perform pg_advisory_xact_lock(hashtextextended(
        v_connection.org_id::text || ':woo-product:' || (v_line->>'product_id'), 0));
    end if;
    if nullif(nullif(trim(coalesce(v_line->>'product_id', '')), ''), '0') is not null then
      select local_id into v_product_id from public.external_record_links
      where connection_id = p_connection_id and module_key = 'products'
        and external_id = v_line->>'product_id';
    end if;
    if v_product_id is null and v_sku is not null then
      select count(*), (array_agg(id))[1] into v_match_count, v_product_id from public.products
      where org_id = v_connection.org_id and (lower(manual_code) = lower(v_sku) or lower(system_code) = lower(v_sku));
      if v_match_count > 1 then raise exception 'Ambiguous product SKU'; end if;
    end if;
    if v_product_id is null then
      insert into public.products(org_id, name, manual_code, product_type, sell_price)
      values (v_connection.org_id, coalesce(nullif(v_line->>'name', ''), 'کالای فروشگاه'),
        v_sku, 'goods', coalesce(nullif(v_line->>'price', '')::numeric, 0) * v_factor)
      returning id into v_product_id;
    end if;
    if nullif(nullif(trim(coalesce(v_line->>'product_id', '')), ''), '0') is not null then
      insert into public.external_record_links(org_id, connection_id, module_key, local_id, external_id)
      values (v_connection.org_id, p_connection_id, 'products', v_product_id, v_line->>'product_id')
      on conflict do nothing;
    end if;
    v_qty := greatest(coalesce(nullif(v_line->>'quantity', '')::numeric, 1), 0);
    v_subtotal := v_subtotal + coalesce(nullif(v_line->>'subtotal', '')::numeric, 0) * v_factor;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id, 'quantity', v_qty,
      'unit_price', case when v_qty > 0 then round(coalesce(nullif(v_line->>'subtotal', '')::numeric, 0) * v_factor / v_qty, 2) else 0 end,
      'total_price', round(coalesce(nullif(v_line->>'total', '')::numeric, 0) * v_factor, 2),
      'vat', round(coalesce(nullif(v_line->>'total_tax', '')::numeric, 0) * v_factor, 2)
    ));
  end loop;

  if v_invoice_id is null then
    insert into public.invoices(org_id, name, invoice_date, status, customer_id, sale_source,
      "invoiceItems", subtotal_before_tax, shipping_amount, invoice_discount_amount,
      total_invoice_amount, total_received_amount, remaining_balance)
    values (v_connection.org_id,
      'سفارش فروشگاه شماره ' || coalesce(nullif(v_order.payload->>'number', ''), p_external_id),
      coalesce(nullif(left(v_order.payload->>'date_created', 10), '')::date, current_date),
      'created', v_customer_id, 'woocommerce', v_items,
      round(v_subtotal, 2),
      round(coalesce(nullif(v_order.payload->>'shipping_total', '')::numeric, 0) * v_factor, 2),
      round(coalesce(nullif(v_order.payload->>'discount_total', '')::numeric, 0) * v_factor, 2),
      round(coalesce(nullif(v_order.payload->>'total', '')::numeric, 0) * v_factor, 2), 0,
      round(coalesce(nullif(v_order.payload->>'total', '')::numeric, 0) * v_factor, 2))
    returning id into v_invoice_id;
    insert into public.external_record_links(org_id, connection_id, module_key, local_id, external_id)
    values (v_connection.org_id, p_connection_id, 'invoices', v_invoice_id, p_external_id);
  else
    select total_received_amount, payments into v_existing_paid, v_existing_payments
    from public.invoices where id = v_invoice_id and org_id = v_connection.org_id for update;
    if not found or coalesce(v_existing_paid, 0) <> 0
      or jsonb_array_length(coalesce(v_existing_payments, '[]'::jsonb)) > 0 then
      raise exception 'Paid or missing invoice cannot be overwritten';
    end if;
    update public.invoices set
      name = 'سفارش فروشگاه شماره ' || coalesce(nullif(v_order.payload->>'number', ''), p_external_id),
      customer_id = v_customer_id, "invoiceItems" = v_items,
      subtotal_before_tax = round(v_subtotal, 2),
      shipping_amount = round(coalesce(nullif(v_order.payload->>'shipping_total', '')::numeric, 0) * v_factor, 2),
      invoice_discount_amount = round(coalesce(nullif(v_order.payload->>'discount_total', '')::numeric, 0) * v_factor, 2),
      total_invoice_amount = round(coalesce(nullif(v_order.payload->>'total', '')::numeric, 0) * v_factor, 2),
      remaining_balance = round(coalesce(nullif(v_order.payload->>'total', '')::numeric, 0) * v_factor, 2),
      updated_at = now()
    where id = v_invoice_id and org_id = v_connection.org_id;
    update public.external_record_links set synced_at = now(), external_updated_at = v_order.source_updated_at
    where connection_id = p_connection_id and module_key = 'invoices' and external_id = p_external_id;
  end if;
  update public.external_order_inbox set processing_status = 'processed'
  where id = v_order.id;
  return v_invoice_id;
end;
$$;
revoke all on function public.import_woocommerce_order(uuid, text) from public, anon, authenticated;
grant execute on function public.import_woocommerce_order(uuid, text) to service_role;

-- گزینهٔ منبع فروش فقط برای سازمان‌هایی که فروشگاه متصل دارند ایجاد می‌شود.
insert into public.dynamic_options(org_id, category, label, value, display_order, is_active)
select distinct org_id, 'sales_source', 'فروشگاه وردپرسی', 'woocommerce', 100, true
from public.external_connections
where provider = 'woocommerce'
on conflict (org_id, category, value) do update
  set label = excluded.label, is_active = true, updated_at = now();

-- این ویژگی از رشد به بالا فعال است و متن کارت فقط در رشد افزوده می‌شود.
update public.saas_plans
set enabled_features = coalesce(enabled_features, '{}'::jsonb) || '{"wordpress_connection":true}'::jsonb,
    display_features = case
      when lower(code) = 'cloud_growth'
        and not coalesce(display_features, '[]'::jsonb) ? 'اتصال به وردپرس و ووکامرس'
      then coalesce(display_features, '[]'::jsonb) || '["اتصال به وردپرس و ووکامرس"]'::jsonb
      else display_features
    end,
    updated_at = now()
where lower(code) in ('cloud_growth', 'cloud_enterprise');

notify pgrst, 'reload schema';
commit;
