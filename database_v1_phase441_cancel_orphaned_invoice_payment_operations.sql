-- ترمیم گردش‌های قدیمی: عملیات نقد و بانک خودکاری که ردیف دریافت/پرداختشان
-- از فاکتور پاک شده یا دیگر وضعیت موثر ندارد، نباید در سوابق مالی بمانند.

begin;

with active_invoice_payment_keys as (
  select distinct
    invoice.org_id,
    invoice.id::text as source_record_id,
    candidate.row_key
  from public.invoices invoice
  cross join lateral jsonb_array_elements(coalesce(invoice.payments, '[]'::jsonb)) with ordinality as payment(item, ordinality)
  cross join lateral unnest(array[
    nullif(trim(payment.item->>'row_key'), ''),
    nullif(trim(payment.item->>'_cash_bank_operation_id'), ''),
    nullif(trim(payment.item->>'_barter_allocation_key'), ''),
    case
      when nullif(trim(payment.item->>'key'), '') is not null
        then 'key_' || trim(payment.item->>'key')
      else null
    end,
    'legacy_' || (payment.ordinality - 1)::text
  ]) as candidate(row_key)
  where candidate.row_key is not null
    and (
      not (payment.item ? 'status')
      or nullif(trim(payment.item->>'status'), '') is null
      or lower(trim(payment.item->>'status')) in ('received', 'paid', 'approved', 'cleared')
    )
)
update public.cash_bank_operations operation
set status = 'canceled', updated_at = now()
where operation.operation_type = 'receipt'
  and coalesce(operation.status, '') <> 'canceled'
  and operation.metadata->>'is_auto_generated' = 'true'
  and operation.metadata->>'source_table' = 'invoices'
  and nullif(trim(operation.metadata->>'source_record_id'), '') is not null
  and nullif(trim(operation.metadata->>'source_row_key'), '') is not null
  and not exists (
    select 1
    from active_invoice_payment_keys payment_key
    where payment_key.org_id = operation.org_id
      and payment_key.source_record_id = operation.metadata->>'source_record_id'
      and payment_key.row_key = operation.metadata->>'source_row_key'
  );

with active_purchase_invoice_payment_keys as (
  select distinct
    invoice.org_id,
    invoice.id::text as source_record_id,
    candidate.row_key
  from public.purchase_invoices invoice
  cross join lateral jsonb_array_elements(coalesce(invoice.payments, '[]'::jsonb)) with ordinality as payment(item, ordinality)
  cross join lateral unnest(array[
    nullif(trim(payment.item->>'row_key'), ''),
    nullif(trim(payment.item->>'_cash_bank_operation_id'), ''),
    nullif(trim(payment.item->>'_barter_allocation_key'), ''),
    case
      when nullif(trim(payment.item->>'key'), '') is not null
        then 'key_' || trim(payment.item->>'key')
      else null
    end,
    'legacy_' || (payment.ordinality - 1)::text
  ]) as candidate(row_key)
  where candidate.row_key is not null
    and (
      not (payment.item ? 'status')
      or nullif(trim(payment.item->>'status'), '') is null
      or lower(trim(payment.item->>'status')) in ('received', 'paid', 'approved', 'cleared')
    )
)
update public.cash_bank_operations operation
set status = 'canceled', updated_at = now()
where operation.operation_type = 'payment'
  and coalesce(operation.status, '') <> 'canceled'
  and operation.metadata->>'is_auto_generated' = 'true'
  and operation.metadata->>'source_table' = 'purchase_invoices'
  and nullif(trim(operation.metadata->>'source_record_id'), '') is not null
  and nullif(trim(operation.metadata->>'source_row_key'), '') is not null
  and not exists (
    select 1
    from active_purchase_invoice_payment_keys payment_key
    where payment_key.org_id = operation.org_id
      and payment_key.source_record_id = operation.metadata->>'source_record_id'
      and payment_key.row_key = operation.metadata->>'source_row_key'
  );

commit;
