-- عنوان تابلوهای تبلیغاتی را فقط برای اقلام همان فاکتور عمومی برمی‌گرداند.
-- This migration is idempotent and keeps public access scoped to the shared invoice.

begin;

create or replace function public.get_public_invoice_billboard_titles(
  p_system_code text,
  p_module text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_items jsonb := '[]'::jsonb;
begin
  if p_module not in ('invoices', 'purchase_invoices') then
    return v_items;
  end if;

  v_org_id := public._resolve_org_for_public_invoice(p_system_code, p_module);
  if v_org_id is null then
    return v_items;
  end if;

  if p_module = 'invoices' then
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'title', case when b.id is null then null else concat_ws(' ',
        'اجاره تابلوی تبلیغاتی',
        nullif(btrim(b.category), ''),
        coalesce(
          nullif(btrim(b.address), ''),
          nullif(concat_ws(' ', nullif(btrim(b.city_name), ''), nullif(btrim(b.name), '')), '')
        )
      ) end
    )) order by case
      when coalesce(item_rows.item ->> 'order_index', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (item_rows.item ->> 'order_index')::numeric
      else item_rows.ordinality::numeric
    end), '[]'::jsonb)
    into v_items
    from public.invoices i
    left join lateral jsonb_array_elements(coalesce(i."invoiceItems", '[]'::jsonb)) with ordinality as item_rows(item, ordinality) on true
    left join public.billboards b
      on b.org_id = i.org_id
     and b.id::text = nullif(item_rows.item ->> 'product_id', '')
    where i.org_id = v_org_id
      and (i.public_slug = p_system_code or i.public_token = p_system_code);
  else
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'title', case when b.id is null then null else concat_ws(' ',
        'اجاره تابلوی تبلیغاتی',
        nullif(btrim(b.category), ''),
        coalesce(
          nullif(btrim(b.address), ''),
          nullif(concat_ws(' ', nullif(btrim(b.city_name), ''), nullif(btrim(b.name), '')), '')
        )
      ) end
    )) order by case
      when coalesce(item_rows.item ->> 'order_index', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (item_rows.item ->> 'order_index')::numeric
      else item_rows.ordinality::numeric
    end), '[]'::jsonb)
    into v_items
    from public.purchase_invoices i
    left join lateral jsonb_array_elements(coalesce(i."invoiceItems", '[]'::jsonb)) with ordinality as item_rows(item, ordinality) on true
    left join public.billboards b
      on b.org_id = i.org_id
     and b.id::text = nullif(item_rows.item ->> 'product_id', '')
    where i.org_id = v_org_id
      and (i.public_slug = p_system_code or i.public_token = p_system_code);
  end if;

  return v_items;
end;
$$;

revoke all on function public.get_public_invoice_billboard_titles(text, text) from public;
grant execute on function public.get_public_invoice_billboard_titles(text, text) to anon, authenticated, service_role;

commit;
