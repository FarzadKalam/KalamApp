begin;

alter table public.external_record_links add column if not exists order_invoice_content_hash text;

-- The order inbox retains the newest WooCommerce payload. Run recognition
-- under the same lock as importing its invoice and recording its outcome.
create or replace function public.import_woocommerce_order_with_outcome(
  p_connection_id uuid, p_external_id text
)
returns table (invoice_id uuid, outcome text)
language plpgsql security definer set search_path = public
as $$
declare
  v_connection public.external_connections%rowtype;
  v_order public.external_order_inbox%rowtype;
  v_invoice public.invoices%rowtype;
  v_before_id uuid;
  v_invoice_id uuid;
  v_origin_code text;
  v_outcome text;
  v_woo_authoritative boolean;
  v_last_imported_at timestamptz;
  v_last_content_hash text;
  v_content_hash text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  select * into v_connection from public.external_connections
  where id = p_connection_id and provider = 'woocommerce' and is_active;
  if not found then raise exception 'Connection unavailable'; end if;

  select * into v_order from public.external_order_inbox
  where org_id = v_connection.org_id and connection_id = p_connection_id and external_id = p_external_id
  for update;
  if not found then raise exception 'Order unavailable'; end if;

  select l.local_id, l.local_updated_at, l.order_invoice_content_hash
    into v_before_id, v_last_imported_at, v_last_content_hash
  from public.external_record_links l
  where l.org_id = v_connection.org_id and l.connection_id = p_connection_id
    and l.module_key = 'invoices' and l.external_id = p_external_id;
  select nullif(trim(meta.value->>'value'), '') into v_origin_code
  from jsonb_array_elements(coalesce(v_order.payload->'meta_data', '[]'::jsonb)) as meta(value)
  where meta.value->>'key' = '_tazesystem_invoice_code' limit 1;

  v_content_hash := md5(jsonb_build_array(
    v_order.payload->'currency', v_order.payload->'total', v_order.payload->'shipping_total',
    v_order.payload->'discount_total', (
      select jsonb_agg(jsonb_build_array(line->'product_id', line->'variation_id', line->'sku',
        line->'quantity', line->'subtotal', line->'total', line->'total_tax') order by ordinal)
      from jsonb_array_elements(coalesce(v_order.payload->'line_items', '[]'::jsonb)) with ordinality lines(line, ordinal)
    )
  )::text);
  v_woo_authoritative := coalesce(v_connection.sync_policy->>'invoices', 'manual') = 'woocommerce';
  if v_before_id is not null then
    select * into v_invoice from public.invoices where org_id = v_connection.org_id and id = v_before_id for update;
    if not found then raise exception 'Linked invoice unavailable'; end if;
    if v_order.processing_status = 'processed' and (
      v_order.external_status is distinct from 'completed' or v_invoice.status is distinct from 'created'
      or v_origin_code is not null or v_invoice.sale_source is distinct from 'woocommerce'
      or not v_woo_authoritative
    ) then
      return query select v_before_id, 'skipped'::text;
      return;
    end if;
    if v_origin_code is not null then
      update public.external_order_inbox set processing_status = 'processed'
      where id = v_order.id and org_id = v_connection.org_id;
      return query select v_before_id, 'skipped'::text;
      return;
    end if;
    if v_order.external_status = 'completed' and v_invoice.sale_source = 'woocommerce'
      and v_invoice.status = 'created' and (coalesce(v_invoice.total_received_amount, 0) <> 0
        or jsonb_array_length(coalesce(v_invoice.payments, '[]'::jsonb)) > 0) then
      raise exception 'Invoice with recorded payments cannot be changed by checkout';
    end if;
    if not v_woo_authoritative then
      -- A newly imported, untouched Woo invoice can be recognized on completion.
      -- Other changes to existing invoices still require a Woo-authoritative policy.
      if coalesce(v_connection.sync_policy->>'invoices', 'manual') <> 'manual'
        or v_order.external_status is distinct from 'completed'
        or v_invoice.status is distinct from 'created'
        or v_invoice.sale_source is distinct from 'woocommerce' or v_last_imported_at is null then
        update public.external_order_inbox set processing_status = 'processed'
        where id = v_order.id and org_id = v_connection.org_id;
        return query select v_before_id, 'skipped'::text;
        return;
      end if;
      if v_invoice.updated_at is distinct from v_last_imported_at then
        raise exception 'Local invoice changed before WooCommerce order completion';
      end if;
      if v_content_hash is distinct from v_last_content_hash then
        raise exception 'WooCommerce order items or total changed before completion';
      end if;
      v_invoice_id := v_before_id;
      v_outcome := 'updated';
    elsif v_order.external_status = 'refunded' then
      raise exception 'The refunded order requires review in the sales return module';
    else
      v_invoice_id := public.import_woocommerce_order(p_connection_id, p_external_id);
      v_outcome := 'updated';
    end if;
  else
    v_invoice_id := public.import_woocommerce_order(p_connection_id, p_external_id);
    v_outcome := case when v_origin_code is not null and exists (
      select 1 from public.invoices i where i.org_id = v_connection.org_id
        and i.id = v_invoice_id and i.system_code = v_origin_code
    ) then 'linked' else 'created' end;
  end if;

  if v_outcome in ('created', 'updated') and v_order.external_status = 'completed' then
    update public.invoices i set status = 'completed', updated_at = now()
    where i.org_id = v_connection.org_id and i.id = v_invoice_id
      and i.sale_source = 'woocommerce' and i.status = 'created'
      and coalesce(i.total_received_amount, 0) = 0
      and jsonb_array_length(coalesce(i.payments, '[]'::jsonb)) = 0;
  end if;
  if v_outcome in ('created', 'updated') and v_order.external_status = 'cancelled' then
    update public.invoices i set status = 'canceled', updated_at = now()
    where i.org_id = v_connection.org_id and i.id = v_invoice_id
      and i.sale_source = 'woocommerce' and i.status in ('created', 'completed')
      and coalesce(i.total_received_amount, 0) = 0
      and jsonb_array_length(coalesce(i.payments, '[]'::jsonb)) = 0;
  end if;
  if v_outcome in ('created', 'updated') then
    update public.external_record_links l set
      synced_at = now(), local_updated_at = i.updated_at, external_updated_at = v_order.source_updated_at,
      order_invoice_content_hash = v_content_hash
    from public.invoices i
    where l.org_id = v_connection.org_id and l.connection_id = p_connection_id and l.module_key = 'invoices'
      and l.external_id = p_external_id and i.org_id = l.org_id and i.id = v_invoice_id;
  end if;
  update public.external_order_inbox set processing_status = 'processed'
  where id = v_order.id and org_id = v_connection.org_id;
  return query select v_invoice_id, v_outcome;
end;
$$;

revoke all on function public.import_woocommerce_order_with_outcome(uuid, text) from public, anon, authenticated;
grant execute on function public.import_woocommerce_order_with_outcome(uuid, text) to service_role;

create or replace function public.get_product_sales_summary(p_org_id uuid, p_product_id uuid)
returns table (invoice_count bigint, total_sold_quantity numeric, total_sold_amount numeric, invoice_revision text)
language sql stable security invoker set search_path = public
as $$
  with matching_invoices as (
    select i.id, i.status, i.updated_at, i."invoiceItems"
    from public.invoices i
    where i.org_id = public.current_org_id() and i.org_id = p_org_id
      and public.current_user_can_module_field('products', 'view')
      and public.current_user_can_module_field('invoices', 'view', 'invoiceItems')
      and i."invoiceItems" @> jsonb_build_array(jsonb_build_object('product_id', p_product_id))
  ), sales_lines as (
    select i.id, item.value
    from matching_invoices i
    cross join lateral jsonb_array_elements(i."invoiceItems") item(value)
    -- Matches the sales statuses used by the operational financial overview.
    where i.status in ('confirmed', 'final', 'settled', 'completed')
      and item.value->>'product_id' = p_product_id::text
  )
  select case when public.current_user_can_module_field('products', 'view', 'invoice_count')
      then count(distinct id) end,
    case when public.current_user_can_module_field('products', 'view', 'total_sold_quantity') then
      coalesce(sum(case when value->>'quantity' ~ '^-?[0-9]+(\.[0-9]+)?$' then (value->>'quantity')::numeric end), 0) end,
    case when public.current_user_can_module_field('products', 'view', 'total_sold_amount') then
      coalesce(sum(case when value->>'total_price' ~ '^-?[0-9]+(\.[0-9]+)?$' then (value->>'total_price')::numeric end), 0) end,
    (select concat(count(*), ':', max(updated_at)) from matching_invoices)
  from sales_lines
  having p_org_id = public.current_org_id()
    and public.current_user_can_module_field('products', 'view')
    and public.current_user_can_module_field('invoices', 'view', 'invoiceItems');
$$;

revoke all on function public.get_product_sales_summary(uuid, uuid) from public, anon;
grant execute on function public.get_product_sales_summary(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
