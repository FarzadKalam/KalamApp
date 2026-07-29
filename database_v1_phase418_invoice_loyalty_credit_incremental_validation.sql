-- =====================================================
-- TazeSystem - Phase 418 Invoice Loyalty Credit Incremental Validation
-- Date: 2026-07-29
-- Type: Additive / idempotent migration
-- Goal: جلوگیری از مسدود شدن دریافت‌ها و تخصیص‌های غیر اعتباری
--       به‌خاطر ردیف‌های اعتباری قدیمی، بدون کاهش کنترل اعتبار.
-- =====================================================

begin;

create or replace function public.apply_customer_loyalty_credit_from_invoice()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_payment jsonb;
  v_amount numeric(18,2);
  v_status text;
  v_type text;
  v_row_key text;
  v_existing_balance numeric(18,2) := 0;
  v_existing_source_debit numeric(18,2) := 0;
  v_previous_credit_total numeric(18,2) := 0;
  v_credit_total numeric(18,2) := 0;
  v_customer_id uuid;
  v_old_customer_id uuid;
begin
  if v_org_id is null then
    raise exception 'سازمان فعال مشخص نیست.';
  end if;

  v_customer_id := new.customer_id;
  if tg_op = 'UPDATE' then
    v_old_customer_id := old.customer_id;
  end if;

  -- قفل مشتری، مصرف هم‌زمان اعتبار را fail-closed نگه می‌دارد.
  perform 1
  from public.customers
  where org_id = v_org_id
    and id = any(array_remove(array[v_old_customer_id, v_customer_id]::uuid[], null))
  order by id
  for update;

  if v_customer_id is null then
    delete from public.customer_loyalty_ledger
    where org_id = v_org_id
      and source_type = 'invoice_credit_payment'
      and source_table = 'invoices'
      and source_record_id = new.id;

    if v_old_customer_id is not null then
      perform public.sync_customer_loyalty_balance(v_old_customer_id);
    end if;
    return new;
  end if;

  -- اگر مشتری تغییر نکرده است، فقط افزایش مصرف اعتبار را اعتبارسنجی می‌کنیم.
  -- دریافت‌های غیر اعتباری نباید ردیف‌های اعتباری قدیمی همان فاکتور را دوباره مسدود کنند.
  if tg_op = 'UPDATE' and v_old_customer_id is not distinct from v_customer_id then
    for v_payment in select value from jsonb_array_elements(coalesce(old.payments, '[]'::jsonb)) loop
      v_type := lower(trim(coalesce(v_payment->>'payment_type', '')));
      v_status := lower(trim(coalesce(v_payment->>'status', '')));
      if v_type <> 'credit'
         or ((v_payment ? 'status') and v_status <> '' and v_status not in ('received', 'paid', 'approved', 'cleared'))
      then
        continue;
      end if;
      begin
        v_amount := abs((v_payment->>'amount')::numeric);
      exception when others then
        v_amount := 0;
      end;
      if v_amount > 0 then
        v_previous_credit_total := v_previous_credit_total + v_amount;
      end if;
    end loop;
  end if;

  for v_payment in select value from jsonb_array_elements(coalesce(new.payments, '[]'::jsonb)) loop
    v_type := lower(trim(coalesce(v_payment->>'payment_type', '')));
    v_status := lower(trim(coalesce(v_payment->>'status', '')));
    if v_type <> 'credit'
       or ((v_payment ? 'status') and v_status <> '' and v_status not in ('received', 'paid', 'approved', 'cleared'))
    then
      continue;
    end if;
    begin
      v_amount := abs((v_payment->>'amount')::numeric);
    exception when others then
      v_amount := 0;
    end;
    if v_amount > 0 then
      v_credit_total := v_credit_total + v_amount;
    end if;
  end loop;

  select coalesce(sum(case when entry_type = 'debit' then -amount else amount end), 0)
    into v_existing_balance
  from public.customer_loyalty_ledger
  where org_id = v_org_id
    and customer_id = v_customer_id;

  select coalesce(sum(amount), 0)
    into v_existing_source_debit
  from public.customer_loyalty_ledger
  where org_id = v_org_id
    and customer_id = v_customer_id
    and entry_type = 'debit'
    and source_type = 'invoice_credit_payment'
    and source_table = 'invoices'
    and source_record_id = new.id;

  -- اگر دفتر و ردیف قدیمی هم‌خوان نیست، کنترل کامل انجام می‌شود تا اعتبار
  -- بدون پشتوانه ایجاد نشود. در حالت عادی فقط افزایش جدید کنترل می‌شود.
  if abs(v_existing_source_debit - v_previous_credit_total) > 0.01 then
    if v_credit_total > v_existing_balance + v_existing_source_debit + 0.01 then
      raise exception 'اعتبار باشگاه مشتریان برای این دریافت کافی نیست.';
    end if;
  elsif v_credit_total - v_previous_credit_total > v_existing_balance + 0.01 then
    raise exception 'اعتبار باشگاه مشتریان برای افزایش مبلغ اعتباری کافی نیست.';
  end if;

  delete from public.customer_loyalty_ledger
  where org_id = v_org_id
    and source_type = 'invoice_credit_payment'
    and source_table = 'invoices'
    and source_record_id = new.id;

  if v_old_customer_id is not null and v_old_customer_id is distinct from v_customer_id then
    perform public.sync_customer_loyalty_balance(v_old_customer_id);
  end if;

  for v_payment in select value from jsonb_array_elements(coalesce(new.payments, '[]'::jsonb)) loop
    v_type := lower(trim(coalesce(v_payment->>'payment_type', '')));
    v_status := lower(trim(coalesce(v_payment->>'status', '')));
    if v_type <> 'credit'
       or ((v_payment ? 'status') and v_status <> '' and v_status not in ('received', 'paid', 'approved', 'cleared'))
    then
      continue;
    end if;
    begin
      v_amount := abs((v_payment->>'amount')::numeric);
    exception when others then
      v_amount := 0;
    end;
    if v_amount <= 0 then
      continue;
    end if;
    v_row_key := coalesce(nullif(v_payment->>'row_key', ''), nullif(v_payment->>'key', ''), md5(v_payment::text));

    insert into public.customer_loyalty_ledger (
      org_id, customer_id, entry_type, source_type, source_table, source_record_id,
      source_row_key, amount, effective_date, idempotency_key, description, metadata
    ) values (
      v_org_id, v_customer_id, 'debit', 'invoice_credit_payment', 'invoices', new.id,
      v_row_key, v_amount, coalesce(nullif(v_payment->>'date', '')::date, coalesce(new.invoice_date, current_date)),
      'invoice_credit_payment:' || new.id::text || ':' || v_row_key,
      'مصرف اعتبار در فاکتور فروش',
      jsonb_build_object('invoice_name', coalesce(new.name, new.system_code), 'payment_row', v_payment)
    )
    on conflict (org_id, idempotency_key) do update
      set amount = excluded.amount,
          effective_date = excluded.effective_date,
          metadata = excluded.metadata;
  end loop;

  perform public.sync_customer_loyalty_balance(v_customer_id);
  return new;
end;
$$;

revoke all on function public.apply_customer_loyalty_credit_from_invoice() from public;
grant execute on function public.apply_customer_loyalty_credit_from_invoice() to authenticated;

commit;
