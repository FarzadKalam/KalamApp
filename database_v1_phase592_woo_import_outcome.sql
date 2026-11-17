-- Phase 577: atomically classify imported WooCommerce orders for accurate sync-history row counts.
begin;

create or replace function public.import_woocommerce_order_with_outcome(
  p_connection_id uuid,
  p_external_id text
)
returns table (invoice_id uuid, outcome text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.external_connections%rowtype;
  v_order public.external_order_inbox%rowtype;
  v_invoice_id uuid;
  v_origin_code text;
  v_outcome text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select * into v_connection
  from public.external_connections
  where id = p_connection_id and provider = 'woocommerce' and is_active = true;
  if not found then raise exception 'Connection unavailable'; end if;

  -- Lock the inbox order so concurrent webhook/manual runs cannot both report a new invoice.
  select * into v_order
  from public.external_order_inbox
  where connection_id = p_connection_id
    and org_id = v_connection.org_id
    and external_id = p_external_id
  for update;
  if not found then raise exception 'Order unavailable'; end if;

  select l.local_id into v_invoice_id
  from public.external_record_links l
  where l.connection_id = p_connection_id
    and l.org_id = v_connection.org_id
    and l.module_key = 'invoices'
    and l.external_id = p_external_id;

  if v_invoice_id is not null then
    v_outcome := case when coalesce(v_connection.sync_policy->>'invoices', 'manual') = 'woocommerce'
      then 'updated' else 'skipped' end;
  else
    select nullif(trim(meta.value->>'value'), '') into v_origin_code
    from jsonb_array_elements(coalesce(v_order.payload->'meta_data', '[]'::jsonb)) as meta(value)
    where meta.value->>'key' = '_tazesystem_invoice_code'
    limit 1;
    if v_origin_code is not null and exists (
      select 1 from public.invoices i
      where i.org_id = v_connection.org_id and i.system_code = v_origin_code
    ) then
      v_outcome := 'linked';
    else
      v_outcome := 'created';
    end if;
  end if;

  v_invoice_id := public.import_woocommerce_order(p_connection_id, p_external_id);
  return query select v_invoice_id, v_outcome;
end;
$$;

revoke all on function public.import_woocommerce_order_with_outcome(uuid, text) from public, anon, authenticated;
grant execute on function public.import_woocommerce_order_with_outcome(uuid, text) to service_role;

notify pgrst, 'reload schema';
commit;
