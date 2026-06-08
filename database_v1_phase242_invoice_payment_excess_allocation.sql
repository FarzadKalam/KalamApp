-- Phase 242: Atomic allocation of excess invoice receipts/payments.
-- Production drift check was attempted on 2026-06-08 but the remote SSH
-- migration listing timed out before returning the applied-object list.

create or replace function public.allocate_invoice_payment_excess(
  p_module_id text,
  p_source_invoice_id uuid,
  p_source_row_key text,
  p_source_payments jsonb,
  p_allocations jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_party_id uuid;
  v_source_total numeric(18,2);
  v_source_paid numeric(18,2) := 0;
  v_allocated numeric(18,2) := 0;
  v_item jsonb;
  v_payment jsonb;
  v_target_id uuid;
  v_target_party_id uuid;
  v_target_remaining numeric(18,2);
  v_amount numeric(18,2);
  v_status text;
  v_changed_ids uuid[] := array[p_source_invoice_id];
begin
  if v_org_id is null then
    raise exception 'سازمان فعال مشخص نیست.';
  end if;
  if p_module_id not in ('invoices', 'purchase_invoices') then
    raise exception 'ماژول فاکتور معتبر نیست.';
  end if;
  if p_source_invoice_id is null or nullif(trim(p_source_row_key), '') is null then
    raise exception 'اطلاعات ردیف مبدا کامل نیست.';
  end if;
  if jsonb_typeof(coalesce(p_source_payments, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_allocations, '[]'::jsonb)) <> 'array' then
    raise exception 'ساختار تخصیص معتبر نیست.';
  end if;

  if p_module_id = 'invoices' then
    select customer_id, total_invoice_amount
      into v_party_id, v_source_total
    from public.invoices
    where id = p_source_invoice_id
      and org_id = v_org_id
    for update;
  else
    select supplier_id, total_invoice_amount
      into v_party_id, v_source_total
    from public.purchase_invoices
    where id = p_source_invoice_id
      and org_id = v_org_id
    for update;
  end if;

  if v_party_id is null then
    raise exception 'فاکتور مبدا یا طرف حساب آن یافت نشد.';
  end if;

  for v_payment in select value from jsonb_array_elements(p_source_payments) loop
    v_status := lower(trim(coalesce(v_payment->>'status', '')));
    if (v_payment ? 'status')
       and v_status <> ''
       and v_status not in ('received', 'paid', 'approved', 'cleared') then
      continue;
    end if;
    begin
      v_source_paid := v_source_paid + abs(coalesce((v_payment->>'amount')::numeric, 0));
    exception when others then
      raise exception 'مبلغ یکی از ردیف‌های دریافت/پرداخت معتبر نیست.';
    end;
  end loop;

  if v_source_paid > coalesce(v_source_total, 0) then
    raise exception 'مبلغ فاکتور مبدا پس از تخصیص همچنان بیشتر از جمع فاکتور است.';
  end if;
  if abs(v_source_paid - coalesce(v_source_total, 0)) > 0.01 then
    raise exception 'برای توزیع اضافه‌مبلغ، فاکتور مبدا باید تا سقف مبلغ خود تسویه شود.';
  end if;

  for v_item in select value from jsonb_array_elements(p_allocations) loop
    begin
      v_amount := round(abs(coalesce((v_item->>'amount')::numeric, 0)), 2);
      v_target_id := (v_item->>'invoice_id')::uuid;
    exception when others then
      raise exception 'یکی از مقادیر تخصیص معتبر نیست.';
    end;
    if v_amount <= 0 or v_target_id = p_source_invoice_id then
      raise exception 'مقصد یا مبلغ تخصیص معتبر نیست.';
    end if;
    if jsonb_typeof(v_item->'payment_row') <> 'object' then
      raise exception 'اطلاعات ردیف تخصیص ناقص است.';
    end if;
    v_allocated := v_allocated + v_amount;
  end loop;

  if v_allocated <= 0 then
    raise exception 'حداقل یک تخصیص معتبر لازم است.';
  end if;

  -- Lock all destinations in a stable order before validating capacities.
  if p_module_id = 'invoices' then
    perform 1
    from public.invoices i
    where i.id in (
      select distinct (value->>'invoice_id')::uuid
      from jsonb_array_elements(p_allocations)
    )
      and i.org_id = v_org_id
    order by i.id
    for update;
  else
    perform 1
    from public.purchase_invoices i
    where i.id in (
      select distinct (value->>'invoice_id')::uuid
      from jsonb_array_elements(p_allocations)
    )
      and i.org_id = v_org_id
    order by i.id
    for update;
  end if;

  if p_module_id = 'invoices' then
    update public.invoices
    set payments = p_source_payments
    where id = p_source_invoice_id
      and org_id = v_org_id;
  else
    update public.purchase_invoices
    set payments = p_source_payments
    where id = p_source_invoice_id
      and org_id = v_org_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_allocations) loop
    v_target_id := (v_item->>'invoice_id')::uuid;
    v_amount := round(abs((v_item->>'amount')::numeric), 2);

    if p_module_id = 'invoices' then
      select customer_id, remaining_balance
        into v_target_party_id, v_target_remaining
      from public.invoices
      where id = v_target_id
        and org_id = v_org_id
        and status is distinct from 'canceled';
    else
      select supplier_id, remaining_balance
        into v_target_party_id, v_target_remaining
      from public.purchase_invoices
      where id = v_target_id
        and org_id = v_org_id
        and status is distinct from 'canceled';
    end if;

    if v_target_party_id is null or v_target_party_id <> v_party_id then
      raise exception 'یکی از فاکتورهای مقصد متعلق به این طرف حساب نیست.';
    end if;
    if coalesce(v_target_remaining, 0) < v_amount then
      raise exception 'مانده یکی از فاکتورهای مقصد برای تخصیص کافی نیست.';
    end if;

    v_payment := (v_item->'payment_row')
      || jsonb_build_object(
        'amount', v_amount,
        '_cash_bank_operation_id', null,
        'allocation_source_invoice_id', p_source_invoice_id,
        'allocation_source_row_key', p_source_row_key
      );

    if p_module_id = 'invoices' then
      update public.invoices
      set payments = coalesce(payments, '[]'::jsonb) || jsonb_build_array(v_payment)
      where id = v_target_id
        and org_id = v_org_id;
    else
      update public.purchase_invoices
      set payments = coalesce(payments, '[]'::jsonb) || jsonb_build_array(v_payment)
      where id = v_target_id
        and org_id = v_org_id;
    end if;

    if not (v_target_id = any(v_changed_ids)) then
      v_changed_ids := array_append(v_changed_ids, v_target_id);
    end if;
  end loop;

  return (
    select jsonb_agg(jsonb_build_object('invoice_id', changed_id))
    from unnest(v_changed_ids) as changed_id
  );
end;
$$;

revoke all on function public.allocate_invoice_payment_excess(text, uuid, text, jsonb, jsonb) from public;
grant execute on function public.allocate_invoice_payment_excess(text, uuid, text, jsonb, jsonb) to authenticated;
