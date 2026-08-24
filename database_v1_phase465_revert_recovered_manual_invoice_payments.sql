-- دریافت‌های دستی پیش از بازیابی خودکار ثبت شده‌اند؛ فقط دو ردیف خودکاری که در اجرای
-- migration 464 ایجاد شد حذف می‌شوند. هیچ دریافت دستی یا تراکنش جدیدی انتخاب نمی‌شود.

begin;

do $$
declare
  v_tx record;
begin
  for v_tx in
    select id, org_id, record_id
    from public.payment_transactions
    where purpose = 'online_invoice'
      and module_id = 'invoices'
      and status = 'verified'
      and coalesce((metadata ->> 'invoice_payment_appended')::boolean, false) is true
      and date_trunc('minute', (metadata ->> 'invoice_payment_appended_at')::timestamptz) = timestamptz '2026-08-24 18:55:00+00'
  loop
    update public.invoices invoice
    set payments = (
      select coalesce(jsonb_agg(payment.item order by payment.ordinality) filter (
        where coalesce(payment.item ->> 'gateway_transaction_id', '') <> v_tx.id::text
      ), '[]'::jsonb)
      from jsonb_array_elements(coalesce(invoice.payments, '[]'::jsonb)) with ordinality payment(item, ordinality)
    ), updated_at = now()
    where invoice.id = v_tx.record_id
      and invoice.org_id = v_tx.org_id;

    update public.payment_transactions
    set status = 'failed',
        error_message = 'دریافت این پرداخت پیش‌تر به‌صورت دستی ثبت شده است؛ ثبت خودکار برگشت داده شد.',
        metadata = (coalesce(metadata, '{}'::jsonb) - 'invoice_payment_appended' - 'invoice_payment_appended_at' - 'invoice_payment_row_key' - 'invoice_payment_mode')
          || jsonb_build_object('manual_receipt_authoritative', true, 'automatic_recovery_reverted_at', now())
    where id = v_tx.id;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
