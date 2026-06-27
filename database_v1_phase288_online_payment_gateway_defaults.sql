-- Phase 288: Online payment gateway defaults and invoice payment metadata
-- Adds default gateway bank account handling and fills online invoice payment
-- rows with destination account and responsible user.

begin;

create or replace function public.append_online_invoice_payment_from_transaction(
  p_transaction_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.payment_transactions%rowtype;
  v_invoice_json jsonb;
  v_settings jsonb := '{}'::jsonb;
  v_default_bank_account_id uuid := null;
  v_default_bank_account_raw text := null;
  v_responsible_id text := null;
  v_payment_row jsonb;
  v_exists boolean := false;
begin
  select *
  into v_tx
  from public.payment_transactions
  where id = p_transaction_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'message', 'تراکنش پیدا نشد.');
  end if;

  if v_tx.purpose <> 'online_invoice'
     or v_tx.module_id <> 'invoices'
     or v_tx.record_id is null
     or v_tx.status not in ('paid', 'verified') then
    return jsonb_build_object('success', false, 'message', 'تراکنش قابل ثبت روی فاکتور نیست.');
  end if;

  execute 'select to_jsonb(i) from public.invoices i where i.id = $1 and i.org_id = $2'
  into v_invoice_json
  using v_tx.record_id, v_tx.org_id;

  if v_invoice_json is null then
    return jsonb_build_object('success', false, 'message', 'فاکتور پیدا نشد.');
  end if;

  select coalesce(settings, '{}'::jsonb)
  into v_settings
  from public.integration_settings
  where org_id = v_tx.org_id
    and connection_type = 'payment_gateway'
    and provider = 'zarinpal'
  order by is_active desc, updated_at desc nulls last, created_at desc nulls last
  limit 1;

  v_default_bank_account_raw := nullif(trim(coalesce(v_settings ->> 'default_bank_account_id', '')), '');
  if v_default_bank_account_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select ba.id
    into v_default_bank_account_id
    from public.bank_accounts ba
    where ba.id = v_default_bank_account_raw::uuid
      and ba.org_id = v_tx.org_id
      and coalesce(ba.is_active, true) = true
    limit 1;
  end if;

  v_responsible_id := nullif(trim(coalesce(
    v_invoice_json ->> 'assignee_id',
    v_invoice_json ->> 'marketer_id',
    v_invoice_json ->> 'salesperson_id',
    v_invoice_json ->> 'responsible_id',
    ''
  )), '');

  select exists (
    select 1
    from public.invoices i,
         lateral jsonb_array_elements(coalesce(i.payments, '[]'::jsonb)) payment_row(item)
    where i.id = v_tx.record_id
      and i.org_id = v_tx.org_id
      and (
        payment_row.item ->> 'gateway_transaction_id' = v_tx.id::text
        or payment_row.item ->> 'authority' = coalesce(v_tx.authority, '')
      )
  )
  into v_exists;

  if v_exists then
    return jsonb_build_object('success', true, 'already_exists', true, 'invoice_id', v_tx.record_id);
  end if;

  v_payment_row := jsonb_strip_nulls(jsonb_build_object(
    'row_key', 'gateway_' || replace(v_tx.id::text, '-', ''),
    'date', to_char(coalesce(v_tx.paid_at, v_tx.verified_at, now()), 'YYYY-MM-DD'),
    'amount', v_tx.amount,
    'payment_type', 'online',
    'status', 'received',
    'target_account', v_default_bank_account_id,
    'bank_account_id', v_default_bank_account_id,
    'responsible_id', v_responsible_id,
    'description', trim(both ' ' from concat('پرداخت آنلاین زرین‌پال', case when v_tx.ref_id is not null then ' - کد پیگیری: ' || v_tx.ref_id else '' end)),
    'source', 'online_gateway',
    'locked', true,
    '_readonly', true,
    '_lockedByGateway', true,
    '_lockedFields', jsonb_build_array('date', 'amount', 'payment_type', 'status', 'target_account', 'bank_account_id', 'description'),
    'gateway_provider', v_tx.provider,
    'gateway_scope', v_tx.gateway_scope,
    'gateway_transaction_id', v_tx.id::text,
    'authority', v_tx.authority,
    'ref_id', v_tx.ref_id
  ));

  update public.invoices
  set payments = coalesce(payments, '[]'::jsonb) || jsonb_build_array(v_payment_row),
      updated_at = now()
  where id = v_tx.record_id
    and org_id = v_tx.org_id;

  if not found then
    return jsonb_build_object('success', false, 'message', 'فاکتور پیدا نشد.');
  end if;

  update public.payment_transactions
  set metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'invoice_payment_appended', true,
        'invoice_payment_appended_at', now(),
        'invoice_payment_row_key', v_payment_row ->> 'row_key',
        'invoice_payment_target_account', v_default_bank_account_id,
        'invoice_payment_responsible_id', v_responsible_id
      )
  where id = v_tx.id;

  return jsonb_build_object(
    'success', true,
    'already_exists', false,
    'invoice_id', v_tx.record_id,
    'payment_row_key', v_payment_row ->> 'row_key'
  );
end;
$$;

revoke all on function public.append_online_invoice_payment_from_transaction(uuid) from public, anon, authenticated;
grant execute on function public.append_online_invoice_payment_from_transaction(uuid) to service_role;

commit;
