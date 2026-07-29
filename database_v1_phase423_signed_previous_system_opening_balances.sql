-- مانده اول دوره سیستم قبلی برای هر سه نوع مخاطب می‌تواند بدهکار یا بستانکار باشد.
-- کارت حساب عمومی باید همان جهت مانده و ترتیب سوابق مالی داخلی را نمایش دهد.

begin;

create or replace function public.get_public_online_account_card(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_card public.online_account_cards%rowtype;
  v_entity jsonb := '{}'::jsonb;
  v_name text := '';
  v_company jsonb := '{}'::jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  if p_token is null or p_token !~ '^[0-9A-Za-z]{8,64}$' then return jsonb_build_object('error', 'not_found'); end if;
  select * into v_card from public.online_account_cards where (public_slug = p_token or public_token = p_token) and is_active = true limit 1;
  if not found or not public.org_has_plan_feature(v_card.org_id, 'online_catalog', false) then return jsonb_build_object('error', 'not_found'); end if;
  if v_card.entity_type = 'customer' then select to_jsonb(entity) into v_entity from public.customers entity where id = v_card.entity_id and org_id = v_card.org_id;
  elsif v_card.entity_type = 'supplier' then select to_jsonb(entity) into v_entity from public.suppliers entity where id = v_card.entity_id and org_id = v_card.org_id;
  else select to_jsonb(entity) into v_entity from public.employees entity where id = v_card.entity_id and org_id = v_card.org_id; end if;
  if v_entity is null then return jsonb_build_object('error', 'not_found'); end if;
  v_name := coalesce(nullif(btrim(v_entity ->> 'full_name'), ''), nullif(btrim(v_entity ->> 'business_name'), ''), nullif(btrim(v_entity ->> 'legal_name'), ''), nullif(btrim(concat_ws(' ', v_entity ->> 'first_name', v_entity ->> 'last_name')), ''), nullif(btrim(v_entity ->> 'system_code'), ''), case v_card.entity_type when 'customer' then 'مشتری' when 'supplier' then 'تامین‌کننده' else 'کارمند' end);
  select jsonb_strip_nulls(jsonb_build_object('company_name', coalesce(company_full_name, company_name, trade_name), 'trade_name', trade_name, 'logo_url', logo_url, 'currency_label', currency_label)) into v_company
  from public.company_settings where org_id = v_card.org_id order by updated_at desc limit 1;
  with raw_rows as (
    select 'opening'::text row_type, 'مانده اول دوره'::text source_label, null::text status, null::text payment_type,
      coalesce(c.previous_system_first_purchase_date, '1900-01-01'::date) row_date,
      case when (v_card.entity_type = 'customer' and c.previous_system_balance_total >= 0) or (v_card.entity_type <> 'customer' and c.previous_system_balance_total < 0) then abs(c.previous_system_balance_total) else 0 end debit,
      case when (v_card.entity_type = 'customer' and c.previous_system_balance_total < 0) or (v_card.entity_type <> 'customer' and c.previous_system_balance_total >= 0) then abs(c.previous_system_balance_total) else 0 end credit,
      'مانده اول دوره سیستم قبلی'::text description, c.created_at, 'opening_' || c.id::text key
    from (
      select id, created_at, previous_system_first_purchase_date, previous_system_balance_total from public.customers where v_card.entity_type = 'customer' and id = v_card.entity_id and org_id = v_card.org_id
      union all select id, created_at, previous_system_first_purchase_date, previous_system_balance_total from public.suppliers where v_card.entity_type = 'supplier' and id = v_card.entity_id and org_id = v_card.org_id
      union all select id, created_at, previous_system_first_purchase_date, previous_system_balance_total from public.employees where v_card.entity_type = 'employee' and id = v_card.entity_id and org_id = v_card.org_id
    ) c where coalesce(c.previous_system_balance_total, 0) <> 0
    union all
    select 'invoice', case when v_card.entity_type = 'customer' then 'صدور فاکتور فروش' else 'ثبت فاکتور خرید' end, i.status, null, i.invoice_date,
      case when v_card.entity_type = 'customer' then i.total_invoice_amount else 0 end, case when v_card.entity_type = 'supplier' then i.total_invoice_amount else 0 end,
      concat(case when v_card.entity_type = 'customer' then 'فاکتور فروش' else 'فاکتور خرید' end, case when coalesce(i.remaining_balance, 0) <> 0 then ' | مانده: ' || i.remaining_balance else '' end), i.created_at, 'invoice_' || i.id::text
    from (
      select id, invoice_date, status, total_invoice_amount, remaining_balance, created_at from public.invoices where v_card.entity_type = 'customer' and customer_id = v_card.entity_id and org_id = v_card.org_id and status in ('confirmed','final','settled','completed')
      union all select id, invoice_date, status, total_invoice_amount, remaining_balance, created_at from public.purchase_invoices where v_card.entity_type = 'supplier' and supplier_id = v_card.entity_id and org_id = v_card.org_id and status in ('confirmed','final','settled','completed')
    ) i
    union all
    select case when o.operation_type = 'payment' then 'payment' else 'receipt' end, 'عملیات نقد و بانک', o.status, o.payment_type, o.operation_date,
      case when v_card.entity_type = 'customer' and o.operation_type = 'receipt' then abs(o.amount) when v_card.entity_type <> 'customer' and o.operation_type = 'payment' then abs(o.amount) else 0 end,
      case when v_card.entity_type = 'customer' and o.operation_type = 'payment' then abs(o.amount) when v_card.entity_type <> 'customer' and o.operation_type = 'receipt' then abs(o.amount) else 0 end,
      coalesce(o.description, ''), o.created_at, 'operation_' || o.id::text
    from public.cash_bank_operations o where o.org_id = v_card.org_id and o.status in ('received','approved','paid','settled','cleared') and o.operation_type <> 'transfer'
      and ((v_card.entity_type = 'customer' and o.customer_id = v_card.entity_id) or (v_card.entity_type = 'supplier' and o.supplier_id = v_card.entity_id) or (v_card.entity_type = 'employee' and o.employee_id = v_card.entity_id))
    union all
    select case when v_card.entity_type = 'customer' then 'receipt' else 'payment' end, case when v_card.entity_type = 'customer' then 'دریافت فاکتور فروش' else 'پرداخت فاکتور خرید' end, coalesce(p.item ->> 'status', 'received'), coalesce(p.item ->> 'payment_type', ''), coalesce(nullif(p.item ->> 'date', '')::date, i.invoice_date),
      case when v_card.entity_type = 'customer' then abs((p.item ->> 'amount')::numeric) else 0 end, case when v_card.entity_type = 'supplier' then abs((p.item ->> 'amount')::numeric) else 0 end, coalesce(p.item ->> 'description', ''), i.created_at, 'legacy_payment_' || i.id::text || '_' || p.ordinality::text
    from (
      select id, invoice_date, created_at, payments from public.invoices where v_card.entity_type = 'customer' and customer_id = v_card.entity_id and org_id = v_card.org_id
      union all select id, invoice_date, created_at, payments from public.purchase_invoices where v_card.entity_type = 'supplier' and supplier_id = v_card.entity_id and org_id = v_card.org_id
    ) i cross join lateral jsonb_array_elements(coalesce(i.payments, '[]'::jsonb)) with ordinality p(item, ordinality)
    where lower(coalesce(p.item ->> 'status', 'received')) in ('received','paid','approved','cleared') and coalesce(p.item ->> 'amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
      and not exists (select 1 from public.cash_bank_operations o where o.org_id = v_card.org_id and ((v_card.entity_type = 'customer' and o.sales_invoice_id = i.id) or (v_card.entity_type = 'supplier' and o.purchase_invoice_id = i.id)))
    union all select 'payroll_slip', 'فیش حقوقی', p.status, null, p.period_end, 0, p.net_amount, 'تعهد پرداخت حقوق', p.created_at, 'payroll_' || p.id::text from public.payroll_slips p where v_card.entity_type = 'employee' and p.org_id = v_card.org_id and p.employee_id = v_card.entity_id and p.status in ('approved','paid','posted') and coalesce(p.net_amount, 0) > 0
    union all select 'advance', 'درخواست مساعده', a.status, null, a.request_date, 0, a.amount, concat('مساعده', case when coalesce(a.remaining_amount,0) <> 0 then ' | مانده: ' || a.remaining_amount else '' end), a.created_at, 'advance_' || a.id::text from public.employee_advances a where v_card.entity_type = 'employee' and a.org_id = v_card.org_id and a.employee_id = v_card.entity_id and a.status in ('requested','approved','paid','settled','posted') and coalesce(a.amount, 0) > 0
    union all select 'expense', 'ثبت هزینه', e.status, null, e.expense_date, 0, e.total_amount, concat('هزینه', case when coalesce(e.remaining_amount,0) <> 0 then ' | مانده: ' || e.remaining_amount else '' end), e.created_at, 'expense_' || e.id::text from public.expense_documents e where e.org_id = v_card.org_id and e.status in ('approved','paid','posted','settled','completed') and coalesce(e.total_amount,0) > 0 and ((v_card.entity_type = 'customer' and e.customer_id = v_card.entity_id) or (v_card.entity_type = 'supplier' and e.supplier_id = v_card.entity_id) or (v_card.entity_type = 'employee' and e.employee_id = v_card.entity_id))
    union all select 'barter', 'تهاتر', b.status, 'barter', b.barter_date, case when b.barter_type = 'outgoing' then abs(b.initial_amount) else 0 end, case when b.barter_type = 'incoming' then abs(b.initial_amount) else 0 end, coalesce(b.notes, ''), b.created_at, 'barter_' || b.id::text from public.barters b where b.org_id = v_card.org_id and b.status <> 'canceled' and ((v_card.entity_type = 'customer' and b.customer_id = v_card.entity_id) or (v_card.entity_type = 'supplier' and b.supplier_id = v_card.entity_id) or (v_card.entity_type = 'employee' and b.employee_id = v_card.entity_id))
  ), ranked as (
    select *, sum(coalesce(debit,0) - coalesce(credit,0)) over (order by (row_type = 'opening') desc, coalesce(row_date, created_at::date), key rows between unbounded preceding and current row) balance from raw_rows
  )
  select coalesce(jsonb_agg(jsonb_build_object('key', key, 'row_type', row_type, 'source_label', source_label, 'status', status, 'payment_type', payment_type, 'date', row_date, 'debit', debit, 'credit', credit, 'balance', balance, 'description', description) order by (row_type = 'opening') desc, coalesce(row_date, created_at::date), key), '[]'::jsonb), jsonb_build_object('total_debit', coalesce(sum(debit),0), 'total_credit', coalesce(sum(credit),0), 'final_balance', coalesce((array_agg(balance order by (row_type = 'opening') asc, coalesce(row_date, created_at::date) desc, key desc))[1],0)) into v_rows, v_summary from ranked;
  return jsonb_build_object('card', jsonb_build_object('title', v_card.title, 'entity_type', v_card.entity_type, 'entity_name', v_name, 'public_link', v_card.public_link), 'company', coalesce(v_company, '{}'::jsonb), 'rows', v_rows, 'summary', v_summary);
end;
$$;

revoke all on function public.get_public_online_account_card(text) from public, authenticated;
grant execute on function public.get_public_online_account_card(text) to anon;

commit;
