-- Phase 338: Allow a public online payment to settle one pending invoice receipt.

begin;

create or replace function public.apply_online_invoice_payment_transaction(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.payment_transactions%rowtype;
  v_pending_row_key text;
  v_has_pending_row boolean := false;
  v_exists boolean := false;
begin
  select * into v_tx from public.payment_transactions where id = p_transaction_id for update;
  if not found then return jsonb_build_object('success', false, 'message', 'تراکنش پیدا نشد.'); end if;
  if v_tx.purpose <> 'online_invoice' or v_tx.module_id <> 'invoices' or v_tx.record_id is null or v_tx.status not in ('paid', 'verified') then
    return jsonb_build_object('success', false, 'message', 'تراکنش قابل ثبت روی فاکتور نیست.');
  end if;

  select exists (
    select 1 from public.invoices i, lateral jsonb_array_elements(coalesce(i.payments, '[]'::jsonb)) p(item)
    where i.id = v_tx.record_id and i.org_id = v_tx.org_id and p.item ->> 'gateway_transaction_id' = v_tx.id::text
  ) into v_exists;
  if v_exists then return jsonb_build_object('success', true, 'already_exists', true, 'invoice_id', v_tx.record_id); end if;

  v_pending_row_key := nullif(btrim(coalesce(v_tx.metadata ->> 'pending_payment_row_key', '')), '');
  if v_pending_row_key is null then
    return public.append_online_invoice_payment_from_transaction(p_transaction_id);
  end if;

  select exists (
    select 1 from public.invoices i, lateral jsonb_array_elements(coalesce(i.payments, '[]'::jsonb)) p(item)
    where i.id = v_tx.record_id and i.org_id = v_tx.org_id
      and coalesce(p.item ->> 'row_key', p.item ->> 'payment_id', p.item ->> 'id') = v_pending_row_key
      and lower(coalesce(p.item ->> 'status', '')) = 'pending'
  ) into v_has_pending_row;
  if not v_has_pending_row then return jsonb_build_object('success', false, 'message', 'ردیف دریافت در انتظار دیگر قابل پرداخت نیست.'); end if;

  update public.invoices i
  set payments = (
    select coalesce(jsonb_agg(
      case when coalesce(p.item ->> 'row_key', p.item ->> 'payment_id', p.item ->> 'id') = v_pending_row_key then
        p.item || jsonb_strip_nulls(jsonb_build_object(
          'amount', v_tx.amount, 'payment_type', 'online', 'status', 'received',
          'date', to_char(coalesce(v_tx.paid_at, v_tx.verified_at, now()), 'YYYY-MM-DD'),
          'description', trim(both ' ' from concat(coalesce(p.item ->> 'description', ''), ' پرداخت آنلاین زرین‌پال', case when v_tx.ref_id is not null then ' - کد پیگیری: ' || v_tx.ref_id else '' end)),
          'gateway_provider', v_tx.provider, 'gateway_scope', v_tx.gateway_scope,
          'gateway_transaction_id', v_tx.id::text, 'authority', v_tx.authority, 'ref_id', v_tx.ref_id,
          'locked', true, '_readonly', true, '_lockedByGateway', true
        ))
      else p.item end order by p.ordinality), '[]'::jsonb)
    from jsonb_array_elements(coalesce(i.payments, '[]'::jsonb)) with ordinality p(item, ordinality)
  ), updated_at = now()
  where i.id = v_tx.record_id and i.org_id = v_tx.org_id;

  update public.payment_transactions
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'invoice_payment_appended', true, 'invoice_payment_appended_at', now(),
    'invoice_payment_row_key', v_pending_row_key, 'invoice_payment_mode', 'pending_prepayment'
  ) where id = v_tx.id;

  return jsonb_build_object('success', true, 'already_exists', false, 'invoice_id', v_tx.record_id, 'payment_row_key', v_pending_row_key);
end;
$$;

revoke all on function public.apply_online_invoice_payment_transaction(uuid) from public, anon, authenticated;
grant execute on function public.apply_online_invoice_payment_transaction(uuid) to service_role;

commit;
