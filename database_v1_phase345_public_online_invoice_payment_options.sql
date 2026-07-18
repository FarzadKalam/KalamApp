-- Phase 345: Expose only eligible public online-payment rows for staged invoice payments.

begin;

create or replace function public.get_public_invoice_online_payment_options(
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
  v_invoice_id uuid;
begin
  if p_module <> 'invoices' then
    return '[]'::jsonb;
  end if;

  v_org_id := public._resolve_org_for_public_invoice(p_system_code, p_module);
  if v_org_id is null then
    return '[]'::jsonb;
  end if;

  select i.id
  into v_invoice_id
  from public.invoices i
  where i.org_id = v_org_id
    and (i.public_slug = p_system_code or i.public_token = p_system_code)
  limit 1;

  if v_invoice_id is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'key', coalesce(nullif(btrim(payment.item ->> 'row_key'), ''), nullif(btrim(payment.item ->> 'payment_id'), ''), nullif(btrim(payment.item ->> 'id'), '')),
        'title', nullif(btrim(coalesce(payment.item ->> 'description', '')), ''),
        'amount', payment.item -> 'amount'
      ))
      order by payment.ordinality
    )
    from public.invoices i
    cross join lateral jsonb_array_elements(coalesce(i.payments, '[]'::jsonb)) with ordinality as payment(item, ordinality)
    where i.id = v_invoice_id
      and i.org_id = v_org_id
      and lower(coalesce(payment.item ->> 'status', '')) = 'pending'
      and lower(coalesce(payment.item ->> 'payment_type', '')) = 'online'
      and coalesce(nullif(payment.item ->> 'amount', ''), '0') ~ '^-?[0-9]+(\.[0-9]+)?$'
      and (payment.item ->> 'amount')::numeric > 0
      and coalesce(nullif(btrim(payment.item ->> 'row_key'), ''), nullif(btrim(payment.item ->> 'payment_id'), ''), nullif(btrim(payment.item ->> 'id'), '')) is not null
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_public_invoice_online_payment_options(text, text) from public;
grant execute on function public.get_public_invoice_online_payment_options(text, text) to anon, authenticated, service_role;

commit;
