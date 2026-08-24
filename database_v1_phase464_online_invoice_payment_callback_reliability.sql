-- ثبت پرداخت‌های زرین‌پال باید در همان فاکتور به‌صورت اتمیک، تکرارپذیر و بدون وابستگی به نشست مرورگر انجام شود.

begin;

-- callback درگاه با service role اجرا می‌شود و auth.uid() ندارد. دریافت آنلاین هیچ تغییری
-- در اعتبار باشگاه ایجاد نمی‌کند؛ بنابراین منطق اعتبارِ کاربرمحور نباید ثبت دریافت را متوقف کند.
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
  -- فقط اجرای داخلیِ قابل اعتماد (مانند callback درگاه) به این شاخه می‌رسد.
  -- کاربران عادی همچنان با RLS و org_id نشست خود محدود هستند.
  if v_org_id is null then
    return new;
  end if;

  v_customer_id := new.customer_id;
  if tg_op = 'UPDATE' then
    v_old_customer_id := old.customer_id;
  end if;

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

-- اضافه‌کردن یا تبدیل پیش‌دریافت آنلاین، ردیف تخصیص قدیمی را منقضی نمی‌کند.
-- این trigger در callback سیستمی نباید به‌دلیل نبود auth.uid() خطا دهد.
create or replace function public.trigger_cleanup_stale_invoice_payment_allocations()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_invoice_id uuid;
begin
  if tg_op = 'DELETE' then
    v_invoice_id := old.id;
  else
    v_invoice_id := new.id;
  end if;

  if public.current_org_id() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  perform public.cleanup_stale_invoice_payment_allocations(tg_table_name, v_invoice_id);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

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
  v_updated_count integer := 0;
begin
  select * into v_tx
  from public.payment_transactions
  where id = p_transaction_id
  for update;

  if not found then return jsonb_build_object('success', false, 'message', 'تراکنش پیدا نشد.'); end if;
  if v_tx.purpose <> 'online_invoice'
     or v_tx.module_id <> 'invoices'
     or v_tx.record_id is null
     or v_tx.status not in ('paid', 'verified') then
    return jsonb_build_object('success', false, 'message', 'تراکنش قابل ثبت روی فاکتور نیست.');
  end if;

  select exists (
    select 1 from public.invoices i, lateral jsonb_array_elements(coalesce(i.payments, '[]'::jsonb)) p(item)
    where i.id = v_tx.record_id
      and i.org_id = v_tx.org_id
      and p.item ->> 'gateway_transaction_id' = v_tx.id::text
  ) into v_exists;
  if v_exists then
    return jsonb_build_object('success', true, 'already_exists', true, 'invoice_id', v_tx.record_id);
  end if;

  v_pending_row_key := nullif(btrim(coalesce(v_tx.metadata ->> 'pending_payment_row_key', '')), '');
  if v_pending_row_key is null then
    return public.append_online_invoice_payment_from_transaction(p_transaction_id);
  end if;

  select exists (
    select 1 from public.invoices i, lateral jsonb_array_elements(coalesce(i.payments, '[]'::jsonb)) p(item)
    where i.id = v_tx.record_id
      and i.org_id = v_tx.org_id
      and coalesce(p.item ->> 'row_key', p.item ->> 'payment_id', p.item ->> 'id') = v_pending_row_key
      and lower(coalesce(p.item ->> 'status', '')) = 'pending'
      and lower(coalesce(p.item ->> 'payment_type', '')) = 'online'
  ) into v_has_pending_row;
  if not v_has_pending_row then
    return jsonb_build_object('success', false, 'message', 'ردیف دریافت آنلاینِ در انتظار دیگر قابل پرداخت نیست.');
  end if;

  update public.invoices i
  set payments = (
    select coalesce(jsonb_agg(
      case when coalesce(p.item ->> 'row_key', p.item ->> 'payment_id', p.item ->> 'id') = v_pending_row_key then
        p.item || jsonb_strip_nulls(jsonb_build_object(
          'amount', v_tx.amount,
          'payment_type', 'online',
          'status', 'received',
          'date', to_char(coalesce(v_tx.paid_at, v_tx.verified_at, now()), 'YYYY-MM-DD'),
          'description', trim(both ' ' from concat(coalesce(p.item ->> 'description', ''), ' پرداخت آنلاین زرین‌پال', case when v_tx.ref_id is not null then ' - کد پیگیری: ' || v_tx.ref_id else '' end)),
          'gateway_provider', v_tx.provider,
          'gateway_scope', v_tx.gateway_scope,
          'gateway_transaction_id', v_tx.id::text,
          'authority', v_tx.authority,
          'ref_id', v_tx.ref_id,
          'locked', true,
          '_readonly', true,
          '_lockedByGateway', true,
          '_lockedFields', jsonb_build_array('date', 'amount', 'payment_type', 'status', 'description')
        ))
      else p.item end
      order by p.ordinality
    ), '[]'::jsonb)
    from jsonb_array_elements(coalesce(i.payments, '[]'::jsonb)) with ordinality p(item, ordinality)
  ), updated_at = now()
  where i.id = v_tx.record_id
    and i.org_id = v_tx.org_id;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    return jsonb_build_object('success', false, 'message', 'فاکتور برای ثبت دریافت پیدا نشد.');
  end if;

  update public.payment_transactions
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'invoice_payment_appended', true,
    'invoice_payment_appended_at', now(),
    'invoice_payment_row_key', v_pending_row_key,
    'invoice_payment_mode', 'pending_prepayment'
  )
  where id = v_tx.id;

  return jsonb_build_object(
    'success', true,
    'already_exists', false,
    'invoice_id', v_tx.record_id,
    'payment_row_key', v_pending_row_key
  );
end;
$$;

revoke all on function public.apply_online_invoice_payment_transaction(uuid) from public, anon, authenticated;
grant execute on function public.apply_online_invoice_payment_transaction(uuid) to service_role;

create or replace function public.get_online_invoice_payment_customer_club_benefits(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.payment_transactions%rowtype;
  v_customer_id uuid;
  v_customer_name text := 'مشتری عزیز';
  v_result jsonb := '[]'::jsonb;
begin
  select * into v_tx
  from public.payment_transactions
  where id = p_transaction_id
    and purpose = 'online_invoice'
    and module_id = 'invoices'
    and status in ('verified', 'paid');
  if not found or coalesce((v_tx.metadata ->> 'invoice_payment_appended')::boolean, false) is not true then
    return v_result;
  end if;

  select i.customer_id,
         coalesce(nullif(btrim(c.full_name), ''), nullif(btrim(c.business_name), ''), 'مشتری عزیز')
  into v_customer_id, v_customer_name
  from public.invoices i
  left join public.customers c on c.id = i.customer_id and c.org_id = i.org_id
  where i.id = v_tx.record_id and i.org_id = v_tx.org_id;
  if v_customer_id is null then
    return v_result;
  end if;

  select coalesce(jsonb_agg(item order by item ->> 'title'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'kind', 'reward',
      'title', coalesce(nullif(btrim(rule.name), ''), ledger.description, 'مزیت باشگاه مشتریان'),
      'message_template', nullif(btrim(coalesce(rule.config ->> 'online_payment_success_message', '')), ''),
      'amount', ledger.amount,
      'currency', v_tx.currency,
      'customer_name', v_customer_name,
      'rule_name', rule.name,
      'source_type', ledger.source_type
    )) as item
    from public.customer_loyalty_ledger ledger
    left join public.customer_loyalty_rules rule
      on rule.id = ledger.rule_id and rule.org_id = ledger.org_id
    where ledger.org_id = v_tx.org_id
      and ledger.customer_id = v_customer_id
      and ledger.entry_type = 'credit'
      and ledger.source_table = 'invoices'
      and ledger.source_record_id = v_tx.record_id

    union all

    select jsonb_strip_nulls(jsonb_build_object(
      'kind', 'discount_code',
      'title', coalesce(nullif(btrim(code.title), ''), 'کد تخفیف باشگاه مشتریان'),
      'message_template', nullif(btrim(coalesce(code.metadata ->> 'online_payment_success_message', '')), ''),
      'discount_code', code.code,
      'customer_name', v_customer_name
    )) as item
    from public.customer_discount_codes code
    where code.org_id = v_tx.org_id
      and code.customer_id = v_customer_id
      and code.is_active = true
      and (code.starts_at is null or code.starts_at <= coalesce(v_tx.paid_at, v_tx.verified_at, now()))
      and (code.ends_at is null or code.ends_at >= coalesce(v_tx.paid_at, v_tx.verified_at, now()))
      and (
        code.metadata ->> 'source_invoice_id' = v_tx.record_id::text
        or code.metadata ->> 'source_record_id' = v_tx.record_id::text
      )
  ) benefits;

  return v_result;
end;
$$;

revoke all on function public.get_online_invoice_payment_customer_club_benefits(uuid) from public, anon, authenticated;
grant execute on function public.get_online_invoice_payment_customer_club_benefits(uuid) to service_role;

-- فقط تراکنش‌هایی که زرین‌پال قبلاً تأیید کرده و دقیقاً به‌علت خطای context
-- باشگاه مشتریان متوقف شده‌اند بازیابی می‌شوند؛ هیچ تراکنش ناموفق دیگری حدس زده نمی‌شود.
do $$
declare
  v_tx record;
  v_result jsonb;
begin
  for v_tx in
    select id
    from public.payment_transactions
    where purpose = 'online_invoice'
      and module_id = 'invoices'
      and status = 'failed'
      and verified_at is not null
      and coalesce(verify_payload -> 'data' ->> 'code', '') in ('100', '101')
      and error_message = 'سازمان فعال مشخص نیست.'
  loop
    update public.payment_transactions
    set status = 'verified',
        error_message = null
    where id = v_tx.id;

    v_result := public.apply_online_invoice_payment_transaction(v_tx.id);
    if coalesce((v_result ->> 'success')::boolean, false) is not true then
      update public.payment_transactions
      set status = 'failed',
          error_message = coalesce(v_result ->> 'message', 'بازیابی ثبت دریافت آنلاین ناموفق بود.')
      where id = v_tx.id;
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
