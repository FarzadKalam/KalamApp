-- Phase 350: Complete internal price-list and package row details in public online catalogs.
-- The RPC returns only the explicitly safe, customer-facing row values needed by the catalog UI.

begin;

create or replace function public.get_public_online_catalog(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_catalog public.online_catalogs%rowtype;
  v_company jsonb := '{}'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_ids uuid[];
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return jsonb_build_object('error', 'not_found'); end if;
  select * into v_catalog from public.online_catalogs where public_token = p_token and is_active = true limit 1;
  if not found then return jsonb_build_object('error', 'not_found'); end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'company_name', coalesce(company_full_name, company_name, trade_name), 'trade_name', trade_name,
    'company_name_en', company_name_en, 'slogan', slogan, 'logo_url', logo_url, 'phone', phone,
    'mobile', mobile, 'email', email, 'website', website, 'address', address, 'instagram_id', instagram_id,
    'whatsapp_number', whatsapp_number, 'telegram_id', telegram_id, 'palette_key', brand_palette_key, 'currency_label', currency_label
  )) into v_company from public.company_settings where org_id = v_catalog.org_id order by updated_at desc limit 1;

  select coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_ids
  from jsonb_array_elements_text(v_catalog.source_record_ids)
  where value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

  if v_catalog.module_id in ('products', 'billboards') then
    if v_catalog.module_id = 'products' then
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'title', p.name, 'image_url', p.image_url, 'status', p.status,
        'fields', public.online_catalog_filter_fields(to_jsonb(p), v_catalog.display_field_keys)
      )) order by p.updated_at desc), '[]'::jsonb) into v_items from public.products p where p.org_id = v_catalog.org_id and p.id = any(v_ids);
    else
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'title', coalesce(b.name, b.address), 'image_url', b.image_url, 'status', b.status, 'location', b.location,
        'fields', public.online_catalog_filter_fields(to_jsonb(b), v_catalog.display_field_keys)
      )) order by b.updated_at desc), '[]'::jsonb) into v_items from public.billboards b where b.org_id = v_catalog.org_id and b.id = any(v_ids);
    end if;
  elsif v_catalog.module_id = 'price_lists' then
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'title', coalesce(p.name, b.name, item.value->>'product_name', item.value->>'name'),
      'image_url', coalesce(p.image_url, b.image_url), 'status', coalesce(p.status, b.status), 'location', b.location,
      'catalog_details', jsonb_strip_nulls(jsonb_build_object(
        'price', item.value->'price',
        'currency_label', nullif(item.value->>'currency_label', ''),
        'unit_name', coalesce(nullif(item.value->>'unit_name', ''), nullif(p.main_unit, '')),
        'description', nullif(item.value->>'description', '')
      )),
      'fields', public.online_catalog_filter_fields(item.value, v_catalog.display_field_keys)
    ))), '[]'::jsonb) into v_items
    from public.price_lists pl cross join lateral jsonb_array_elements(coalesce(pl.items, '[]'::jsonb)) item
    left join public.products p on p.id::text = item.value->>'product_id' and p.org_id = pl.org_id
    left join public.billboards b on b.id::text = item.value->>'product_id' and b.org_id = pl.org_id
    where pl.org_id = v_catalog.org_id and pl.id = any(v_ids);
  else
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'title', coalesce(p.name, b.name, item.value->>'product_name', item.value->>'name'),
      'image_url', coalesce(p.image_url, b.image_url), 'status', coalesce(p.status, b.status), 'location', b.location,
      'catalog_details', jsonb_strip_nulls(jsonb_build_object(
        'quantity', item.value->'quantity',
        'unit_name', coalesce(nullif(item.value->>'main_unit', ''), nullif(p.main_unit, '')),
        'unit_price', item.value->'unit_price',
        'total_price', item.value->'total_price',
        'description', nullif(item.value->>'description', '')
      )),
      'fields', public.online_catalog_filter_fields(item.value, v_catalog.display_field_keys)
    ))), '[]'::jsonb) into v_items
    from public.product_bundles pb cross join lateral jsonb_array_elements(coalesce(pb.products, '[]'::jsonb)) item
    left join public.products p on p.id::text = item.value->>'product_id' and p.org_id = pb.org_id
    left join public.billboards b on b.id::text = item.value->>'product_id' and b.org_id = pb.org_id
    where pb.org_id = v_catalog.org_id and pb.id = any(v_ids);
  end if;

  return jsonb_build_object(
    'catalog', jsonb_build_object('title', v_catalog.title, 'description', v_catalog.public_description,
      'template_id', v_catalog.template_id, 'presentation', v_catalog.presentation, 'record_count', jsonb_array_length(v_items),
      'last_refreshed_at', v_catalog.last_refreshed_at, 'module_id', v_catalog.module_id, 'display_field_keys', v_catalog.display_field_keys, 'tags', v_catalog.tags),
    'company', coalesce(v_company, '{}'::jsonb), 'items', v_items
  );
end;
$$;

revoke all on function public.get_public_online_catalog(text) from public, authenticated;
grant execute on function public.get_public_online_catalog(text) to anon;

commit;
