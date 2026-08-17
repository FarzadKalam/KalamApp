-- مبلغ پرداخت کارت حساب باید با همان دفتر مالی سروریِ نمایش‌داده‌شده به مخاطب یکی باشد.
-- بخش باقی‌مانده‌ای که به فاکتور مشخصی تعلق ندارد نیز به‌صورت دریافت مستقیم ثبت می‌شود.

begin;

create or replace function public.get_public_online_account_card_payment_state(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_card public.online_account_cards%rowtype;
  v_history jsonb := '{}'::jsonb;
  v_amount numeric := 0;
  v_settings jsonb := '{}'::jsonb;
  v_gateway_active boolean := false;
  v_scope text := 'system';
  v_currency text := 'IRR';
  v_allowed boolean := false;
begin
  if p_token is null or p_token !~ '^[0-9A-Za-z]{8,64}$' then
    return jsonb_build_object('available', false, 'reason', 'not_found');
  end if;

  select * into v_card
  from public.online_account_cards
  where (public_slug = p_token or public_token = p_token)
    and is_active = true
  limit 1;

  if not found
    or v_card.entity_type <> 'customer'
    or not public.org_has_plan_feature(v_card.org_id, 'online_catalog', false)
  then
    return jsonb_build_object('available', false, 'reason', 'not_found');
  end if;

  -- این همان منبعی است که جمع‌ها و ماندهٔ کارت عمومی را تولید می‌کند.
  v_history := public._get_operational_financial_history(
    v_card.org_id,
    'customer',
    v_card.entity_id
  );
  v_amount := greatest(
    public.financial_history_safe_numeric(v_history -> 'summary' ->> 'final_balance'),
    0
  );

  select coalesce(settings, '{}'::jsonb), is_active = true
  into v_settings, v_gateway_active
  from public.integration_settings
  where org_id = v_card.org_id
    and connection_type = 'payment_gateway'
    and coalesce(provider, '') = 'zarinpal'
  order by is_active desc, updated_at desc nulls last, created_at desc nulls last
  limit 1;

  v_scope := case when coalesce(v_settings ->> 'gateway_scope', 'system') = 'org' then 'org' else 'system' end;
  v_currency := case when coalesce(v_settings ->> 'currency', 'IRR') = 'IRT' then 'IRT' else 'IRR' end;
  v_gateway_active := coalesce(v_gateway_active, false)
    and coalesce((v_settings ->> 'online_invoice_payments_enabled')::boolean, false)
    and nullif(btrim(coalesce(v_settings ->> 'payment_domain', '')), '') is not null;

  v_allowed := v_gateway_active
    and v_amount > 0
    and (
      (v_scope = 'system' and public.org_has_saas_admin_payment_access(v_card.org_id))
      or (
        v_scope = 'org'
        and public.org_has_plan_feature(v_card.org_id, 'custom_domain', false)
        and public.org_has_plan_feature(v_card.org_id, 'own_payment_gateway', false)
        and public.org_has_plan_feature(v_card.org_id, 'online_invoice_payment', false)
        and nullif(btrim(coalesce(v_settings ->> 'merchant_id', '')), '') is not null
      )
    );

  return jsonb_build_object(
    'available', v_allowed,
    'amount', v_amount,
    'currency', v_currency,
    'gateway_scope', v_scope,
    'balance_source', 'central_financial_history'
  );
end;
$$;

revoke all on function public.get_public_online_account_card_payment_state(text) from public;
grant execute on function public.get_public_online_account_card_payment_state(text) to anon, authenticated, service_role;

create or replace function public.apply_online_account_card_payment_transaction(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.payment_transactions%rowtype;
  v_invoice record;
  v_remaining numeric;
  v_applied numeric := 0;
  v_row jsonb;
  v_index integer := 0;
  v_direct_receipt_id uuid;
  v_direct_receipt_amount numeric := 0;
begin
  select * into v_tx
  from public.payment_transactions
  where id = p_transaction_id
  for update;

  if not found
    or v_tx.purpose <> 'online_account_card'
    or v_tx.module_id <> 'customers'
    or v_tx.record_id is null
    or v_tx.status not in ('paid', 'verified')
  then
    return jsonb_build_object('success', false, 'message', 'تراکنش کارت حساب قابل ثبت نیست.');
  end if;

  if coalesce((v_tx.metadata ->> 'account_card_payment_applied')::boolean, false) then
    return jsonb_build_object('success', true, 'already_exists', true);
  end if;

  v_remaining := greatest(coalesce(v_tx.amount, 0), 0);
  for v_invoice in
    select id, remaining_balance
    from public.invoices
    where org_id = v_tx.org_id
      and customer_id = v_tx.record_id
      and status in ('confirmed', 'final', 'settled', 'completed')
      and coalesce(remaining_balance, 0) > 0
    order by invoice_date nulls last, created_at, id
    for update
  loop
    exit when v_remaining <= 0;
    v_index := v_index + 1;
    v_applied := least(v_remaining, greatest(coalesce(v_invoice.remaining_balance, 0), 0));
    v_row := jsonb_strip_nulls(jsonb_build_object(
      'row_key', 'gateway_' || replace(v_tx.id::text, '-', '') || '_' || v_index,
      'date', to_char(coalesce(v_tx.paid_at, v_tx.verified_at, now()), 'YYYY-MM-DD'),
      'amount', v_applied,
      'payment_type', 'online',
      'status', 'received',
      'description', trim(both ' ' from concat('پرداخت آنلاین زرین‌پال', case when v_tx.ref_id is not null then ' - کد پیگیری: ' || v_tx.ref_id else '' end)),
      'source', 'online_gateway',
      'locked', true,
      '_readonly', true,
      '_lockedByGateway', true,
      '_lockedFields', jsonb_build_array('date', 'amount', 'payment_type', 'status', 'description'),
      'gateway_provider', v_tx.provider,
      'gateway_scope', v_tx.gateway_scope,
      'gateway_transaction_id', v_tx.id::text,
      'authority', v_tx.authority,
      'ref_id', v_tx.ref_id
    ));

    update public.invoices
    set payments = coalesce(payments, '[]'::jsonb) || jsonb_build_array(v_row),
        updated_at = now()
    where id = v_invoice.id
      and org_id = v_tx.org_id;

    v_remaining := v_remaining - v_applied;
  end loop;

  v_direct_receipt_amount := v_remaining;
  if v_direct_receipt_amount > 0 then
    insert into public.cash_bank_operations (
      org_id,
      operation_type,
      payment_type,
      status,
      operation_date,
      amount,
      customer_id,
      description,
      metadata
    ) values (
      v_tx.org_id,
      'receipt',
      'online',
      'received',
      coalesce(v_tx.paid_at, v_tx.verified_at, now())::date,
      v_direct_receipt_amount,
      v_tx.record_id,
      trim(both ' ' from concat('پرداخت آنلاین زرین‌پال بابت مانده کارت حساب', case when v_tx.ref_id is not null then ' - کد پیگیری: ' || v_tx.ref_id else '' end)),
      jsonb_strip_nulls(jsonb_build_object(
        'source', 'online_gateway',
        'locked', true,
        '_readonly', true,
        '_lockedByGateway', true,
        '_lockedFields', jsonb_build_array('operation_date', 'amount', 'payment_type', 'status', 'description'),
        'gateway_provider', v_tx.provider,
        'gateway_scope', v_tx.gateway_scope,
        'gateway_transaction_id', v_tx.id::text,
        'authority', v_tx.authority,
        'ref_id', v_tx.ref_id,
        'account_card_id', v_tx.metadata ->> 'account_card_id'
      ))
    ) returning id into v_direct_receipt_id;
  end if;

  update public.payment_transactions
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'account_card_payment_applied', true,
    'account_card_payment_applied_at', now(),
    'allocated_amount', v_tx.amount - v_remaining,
    'direct_receipt_amount', v_direct_receipt_amount,
    'direct_receipt_operation_id', v_direct_receipt_id,
    'unallocated_amount', 0
  ))
  where id = v_tx.id;

  return jsonb_build_object(
    'success', true,
    'already_exists', false,
    'allocated_amount', v_tx.amount - v_remaining,
    'direct_receipt_amount', v_direct_receipt_amount,
    'unallocated_amount', 0
  );
end;
$$;

revoke all on function public.apply_online_account_card_payment_transaction(uuid) from public, anon, authenticated;
grant execute on function public.apply_online_account_card_payment_transaction(uuid) to service_role;

create index if not exists idx_cash_bank_operations_org_gateway_transaction
  on public.cash_bank_operations(org_id, (metadata ->> 'gateway_transaction_id'))
  where metadata ? 'gateway_transaction_id';

notify pgrst, 'reload schema';
commit;
