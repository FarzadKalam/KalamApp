-- نمای نقد و بانک باید برای حجم بالای عملیات، فیلتر، مرتب‌سازی و صفحه‌بندی را در دیتابیس انجام دهد.

begin;

create index if not exists idx_cash_bank_operations_org_operation_date
  on public.cash_bank_operations (org_id, operation_date desc, created_at desc);
create index if not exists idx_cheques_org_due_date
  on public.cheques (org_id, due_date desc, created_at desc);
create index if not exists idx_barters_org_barter_date
  on public.barters (org_id, barter_date desc, created_at desc);
create index if not exists idx_invoices_org_legacy_payments
  on public.invoices (org_id, invoice_date desc, created_at desc)
  where jsonb_array_length(coalesce(payments, '[]'::jsonb)) > 0;
create index if not exists idx_purchase_invoices_org_legacy_payments
  on public.purchase_invoices (org_id, invoice_date desc, created_at desc)
  where jsonb_array_length(coalesce(payments, '[]'::jsonb)) > 0;

create or replace function public.get_cash_bank_unified_ledger_page(
  p_page integer default 1,
  p_page_size integer default 20,
  p_sort_field text default 'date',
  p_sort_order text default 'desc',
  p_filters jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 10), 200);
  v_sort_field text := case lower(coalesce(p_sort_field, ''))
    when 'row_type' then 'row_type' when 'source_label' then 'source_label'
    when 'payment_type' then 'payment_type' when 'status' then 'status'
    when 'date' then 'date' when 'amount' then 'amount'
    when 'invoice_label' then 'invoice_label' when 'person_label' then 'person_label'
    when 'bank_label' then 'bank_label' when 'cheque_label' then 'cheque_label'
    when 'description' then 'description' else 'date' end;
  v_sort_order text := case when lower(coalesce(p_sort_order, '')) = 'asc' then 'asc' else 'desc' end;
  v_filters jsonb := coalesce(p_filters, '{}'::jsonb);
begin
  if v_org_id is null then
    return jsonb_build_object('rows', '[]'::jsonb, 'total', 0);
  end if;

  return (
    with account_directory as (
      select id::text, 'bank_accounts'::text module_id, concat_ws(' ', nullif(btrim(bank_name), ''), case when nullif(btrim(account_number), '') is not null then '(' || account_number || ')' end) label
      from public.bank_accounts where org_id = v_org_id
      union all
      select id::text, 'cash_boxes'::text, concat_ws(' ', nullif(btrim(name), ''), case when nullif(btrim(code), '') is not null then '(' || code || ')' end)
      from public.cash_boxes where org_id = v_org_id
      union all
      select id::text, 'petty_funds'::text, concat_ws(' ', nullif(btrim(name), ''), case when nullif(btrim(code), '') is not null then '(' || code || ')' end)
      from public.petty_funds where org_id = v_org_id
    ), party_directory as (
      select id::text, 'customers'::text module_id, coalesce(nullif(btrim(concat_ws(' ', first_name, last_name)), ''), nullif(btrim(business_name), ''), nullif(btrim(system_code), ''), 'بدون عنوان') label from public.customers where org_id = v_org_id
      union all select id::text, 'suppliers'::text, coalesce(nullif(btrim(business_name), ''), nullif(btrim(full_name), ''), nullif(btrim(system_code), ''), 'بدون عنوان') from public.suppliers where org_id = v_org_id
      union all select id::text, 'profiles'::text, coalesce(nullif(btrim(full_name), ''), nullif(btrim(concat_ws(' ', first_name, last_name)), ''), 'بدون عنوان') from public.profiles where org_id = v_org_id
      union all select id::text, 'employees'::text, coalesce(nullif(btrim(concat_ws(' ', first_name, last_name)), ''), nullif(btrim(system_code), ''), 'بدون عنوان') from public.employees where org_id = v_org_id
    ), source_rows as (
      select
        'op_' || op.id::text row_key, 'cash_bank_operation'::text kind,
        case when op.operation_type = 'transfer' then 'transfer' when op.operation_type = 'payment' then 'payment' else 'receipt' end row_type,
        case when op.operation_type = 'transfer' then 'انتقال مستقیم نقد و بانک' else 'ثبت مستقیم نقد و بانک' end source_label,
        op.id::text source_record_id, coalesce(op.payment_type, '') payment_type, coalesce(op.status, '') status, op.operation_date row_date, coalesce(op.amount, 0) amount,
        '-'::text invoice_label,
        case when op.operation_type = 'transfer' then '-' else coalesce(party.label, '-') end person_label,
        case when op.operation_type = 'transfer' then concat_ws(' ← ', nullif(pay_account.label, ''), nullif(receive_account.label, '')) else coalesce(account.label, '-') end bank_label,
        coalesce(nullif(concat_ws(' ', cheque.serial_no, case when cheque.sayad_id is not null then '(' || cheque.sayad_id || ')' end), ''), '-') cheque_label,
        coalesce(op.description, '') description, op.created_at,
        null::text invoice_module_id, null::text invoice_record_id,
        case when op.operation_type = 'transfer' then null else party.module_id end person_module_id,
        case when op.operation_type = 'transfer' then null else party.id end person_record_id,
        case when op.operation_type = 'transfer' then null else account.module_id end bank_module_id,
        case when op.operation_type = 'transfer' then null else account.id end bank_record_id,
        case when op.operation_type = 'transfer' then coalesce((select jsonb_agg(item) from (values
          (case when pay_account.id is not null then jsonb_build_object('moduleId', pay_account.module_id, 'recordId', pay_account.id, 'label', pay_account.label) end),
          (case when receive_account.id is not null then jsonb_build_object('moduleId', receive_account.module_id, 'recordId', receive_account.id, 'label', receive_account.label) end)
        ) relation_values(item) where item is not null), '[]'::jsonb) else '[]'::jsonb end bank_relations,
        case when cheque.id is not null then cheque.id::text end cheque_record_id
      from public.cash_bank_operations op
      left join party_directory party on (op.customer_id::text = party.id and party.module_id = 'customers') or (op.supplier_id::text = party.id and party.module_id = 'suppliers') or (op.employee_id::text = party.id and party.module_id = 'profiles')
      left join account_directory account on account.id = coalesce(op.bank_account_id, op.cash_box_id, op.petty_fund_id)::text
      left join account_directory pay_account on pay_account.id = coalesce(op.payment_bank_account_id, op.payment_cash_box_id, op.payment_petty_fund_id)::text
      left join account_directory receive_account on receive_account.id = coalesce(op.receipt_bank_account_id, op.receipt_cash_box_id, op.receipt_petty_fund_id)::text
      left join public.cheques cheque on cheque.id = op.cheque_id and cheque.org_id = v_org_id
      where op.org_id = v_org_id
        and coalesce(op.metadata->>'is_auto_generated', 'false') <> 'true'
        and op.sales_invoice_id is null and op.purchase_invoice_id is null and op.expense_document_id is null and op.employee_advance_id is null and op.payroll_slip_id is null

      union all
      select
        'sales_' || invoice.id::text || '_' || payment.ordinality::text, 'sales_payment', 'receipt', 'دریافت فاکتور فروش', invoice.id::text,
        coalesce(payment.item->>'payment_type', ''), coalesce(payment.item->>'status', ''), coalesce(nullif(payment.item->>'date', '')::date, invoice.invoice_date),
        case when coalesce(payment.item->>'amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then (payment.item->>'amount')::numeric else 0 end,
        coalesce(nullif(btrim(invoice.name), ''), nullif(btrim(invoice.system_code), ''), '-'), coalesce(customer.label, '-'), coalesce(account.label, '-'), coalesce(cheque_label.label, '-'), coalesce(payment.item->>'description', ''), invoice.created_at,
        'invoices', invoice.id::text, 'customers', invoice.customer_id::text, account.module_id, account.id, '[]'::jsonb, nullif(payment.item->>'cheque_id', '')
      from public.invoices invoice
      cross join lateral jsonb_array_elements(coalesce(invoice.payments, '[]'::jsonb)) with ordinality payment(item, ordinality)
      left join party_directory customer on customer.id = invoice.customer_id::text and customer.module_id = 'customers'
      left join account_directory account on account.id = nullif(payment.item->>'target_account', '')
      left join lateral (select coalesce(nullif(concat_ws(' ', c.serial_no, case when c.sayad_id is not null then '(' || c.sayad_id || ')' end), ''), '-') label from public.cheques c where c.org_id = v_org_id and c.id::text = nullif(payment.item->>'cheque_id', '') limit 1) cheque_label on true
      where invoice.org_id = v_org_id

      union all
      select
        'purchase_' || invoice.id::text || '_' || payment.ordinality::text, 'purchase_payment', 'payment', 'پرداخت فاکتور خرید', invoice.id::text,
        coalesce(payment.item->>'payment_type', ''), coalesce(payment.item->>'status', ''), coalesce(nullif(payment.item->>'date', '')::date, invoice.invoice_date),
        case when coalesce(payment.item->>'amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then (payment.item->>'amount')::numeric else 0 end,
        coalesce(nullif(btrim(invoice.name), ''), nullif(btrim(invoice.system_code), ''), '-'), coalesce(supplier.label, '-'), coalesce(account.label, '-'), coalesce(cheque_label.label, '-'), coalesce(payment.item->>'description', ''), invoice.created_at,
        'purchase_invoices', invoice.id::text, 'suppliers', invoice.supplier_id::text, account.module_id, account.id, '[]'::jsonb, nullif(payment.item->>'cheque_id', '')
      from public.purchase_invoices invoice
      cross join lateral jsonb_array_elements(coalesce(invoice.payments, '[]'::jsonb)) with ordinality payment(item, ordinality)
      left join party_directory supplier on supplier.id = invoice.supplier_id::text and supplier.module_id = 'suppliers'
      left join account_directory account on account.id = nullif(payment.item->>'source_account', '')
      left join lateral (select coalesce(nullif(concat_ws(' ', c.serial_no, case when c.sayad_id is not null then '(' || c.sayad_id || ')' end), ''), '-') label from public.cheques c where c.org_id = v_org_id and c.id::text = nullif(payment.item->>'cheque_id', '') limit 1) cheque_label on true
      where invoice.org_id = v_org_id

      union all
      select
        'cheque_' || cheque.id::text, 'cheque', 'cheque', case when cheque.cheque_type = 'issued' then 'چک پرداختی' else 'چک دریافتی' end, cheque.id::text,
        'cheque', coalesce(cheque.status, ''), coalesce(cheque.due_date, cheque.issue_date), coalesce(cheque.amount, 0), '-', coalesce(party.label, '-'), coalesce(account.label, '-'),
        coalesce(nullif(concat_ws(' ', cheque.serial_no, case when cheque.sayad_id is not null then '(' || cheque.sayad_id || ')' end), ''), '-'), coalesce(cheque.notes, ''), cheque.created_at,
        null, null, party.module_id, party.id, account.module_id, account.id, '[]'::jsonb, cheque.id::text
      from public.cheques cheque
      left join party_directory party on party.id = cheque.party_id::text and party.module_id = case cheque.party_type when 'customer' then 'customers' when 'supplier' then 'suppliers' else 'profiles' end
      left join account_directory account on account.id = cheque.bank_account_id::text
      where cheque.org_id = v_org_id

      union all
      select
        'barter_' || barter.id::text, 'barter', 'barter', case when barter.barter_type = 'outgoing' then 'تهاتر پرداختی' else 'تهاتر دریافتی' end, barter.id::text,
        'barter', coalesce(barter.status, ''), barter.barter_date, coalesce(barter.remaining_amount, 0),
        coalesce(nullif(btrim(sales.name), ''), nullif(btrim(sales.system_code), ''), nullif(btrim(purchase.name), ''), nullif(btrim(purchase.system_code), ''), '-'),
        coalesce(customer.label, supplier.label, employee.label, '-'), '-', '-', coalesce(barter.notes, ''), barter.created_at,
        case when barter.source_invoice_id is not null then 'invoices' when barter.source_purchase_invoice_id is not null then 'purchase_invoices' end,
        coalesce(barter.source_invoice_id, barter.source_purchase_invoice_id)::text,
        coalesce(customer.module_id, supplier.module_id, employee.module_id), coalesce(customer.id, supplier.id, employee.id), null, null, '[]'::jsonb, null
      from public.barters barter
      left join public.invoices sales on sales.id = barter.source_invoice_id and sales.org_id = v_org_id
      left join public.purchase_invoices purchase on purchase.id = barter.source_purchase_invoice_id and purchase.org_id = v_org_id
      left join party_directory customer on customer.id = barter.customer_id::text and customer.module_id = 'customers'
      left join party_directory supplier on supplier.id = barter.supplier_id::text and supplier.module_id = 'suppliers'
      left join party_directory employee on employee.id = barter.employee_id::text and employee.module_id = 'profiles'
      where barter.org_id = v_org_id

      union all
      select
        'opening_bank_' || account.id::text, 'bank_account_opening', 'opening', 'مانده اول دوره حساب بانکی', account.id::text,
        ''::text, 'opening'::text, account.created_at::date, abs(coalesce(account.opening_balance, 0)),
        '-'::text, '-'::text, coalesce(directory.label, '-'), '-'::text, 'مانده اول دوره حساب بانکی'::text, account.created_at,
        null, null, null, null, 'bank_accounts', account.id::text, '[]'::jsonb, null
      from public.bank_accounts account
      left join account_directory directory on directory.id = account.id::text and directory.module_id = 'bank_accounts'
      where account.org_id = v_org_id and coalesce(account.opening_balance, 0) <> 0

      union all
      select
        'opening_cash_' || account.id::text, 'cash_box_opening', 'opening', 'مانده اول دوره صندوق', account.id::text,
        ''::text, 'opening'::text, account.created_at::date, abs(coalesce(account.opening_balance, 0)),
        '-'::text, '-'::text, coalesce(directory.label, '-'), '-'::text, 'مانده اول دوره صندوق'::text, account.created_at,
        null, null, null, null, 'cash_boxes', account.id::text, '[]'::jsonb, null
      from public.cash_boxes account
      left join account_directory directory on directory.id = account.id::text and directory.module_id = 'cash_boxes'
      where account.org_id = v_org_id and coalesce(account.opening_balance, 0) <> 0

      union all
      select
        'opening_petty_' || account.id::text, 'petty_fund_opening', 'opening', 'مانده اول دوره تنخواه', account.id::text,
        ''::text, 'opening'::text, account.created_at::date, abs(coalesce(account.opening_balance, 0)),
        '-'::text, '-'::text, coalesce(directory.label, '-'), '-'::text, 'مانده اول دوره تنخواه'::text, account.created_at,
        null, null, null, null, 'petty_funds', account.id::text, '[]'::jsonb, null
      from public.petty_funds account
      left join account_directory directory on directory.id = account.id::text and directory.module_id = 'petty_funds'
      where account.org_id = v_org_id and coalesce(account.opening_balance, 0) <> 0

      union all
      select
        'opening_customer_' || party.id::text, 'customer_opening', 'opening', 'مانده اول دوره مشتری', party.id::text,
        ''::text, 'opening'::text, party.created_at::date, abs(coalesce(party.previous_system_balance_total, 0)),
        '-'::text, coalesce(directory.label, '-'), '-'::text, '-'::text, case when party.previous_system_balance_total >= 0 then 'مانده اول دوره مشتری: طلب از مشتری' else 'مانده اول دوره مشتری: بدهی به مشتری' end, party.created_at,
        null, null, 'customers', party.id::text, null, null, '[]'::jsonb, null
      from public.customers party
      left join party_directory directory on directory.id = party.id::text and directory.module_id = 'customers'
      where party.org_id = v_org_id and coalesce(party.previous_system_balance_total, 0) <> 0

      union all
      select
        'opening_supplier_' || party.id::text, 'supplier_opening', 'opening', 'مانده اول دوره تأمین‌کننده', party.id::text,
        ''::text, 'opening'::text, party.created_at::date, abs(coalesce(party.previous_system_balance_total, 0)),
        '-'::text, coalesce(directory.label, '-'), '-'::text, '-'::text, case when party.previous_system_balance_total >= 0 then 'مانده اول دوره تأمین‌کننده: بدهی به تأمین‌کننده' else 'مانده اول دوره تأمین‌کننده: طلب از تأمین‌کننده' end, party.created_at,
        null, null, 'suppliers', party.id::text, null, null, '[]'::jsonb, null
      from public.suppliers party
      left join party_directory directory on directory.id = party.id::text and directory.module_id = 'suppliers'
      where party.org_id = v_org_id and coalesce(party.previous_system_balance_total, 0) <> 0

      union all
      select
        'opening_employee_' || party.id::text, 'employee_opening', 'opening', 'مانده اول دوره کارمند', party.id::text,
        ''::text, 'opening'::text, party.created_at::date, abs(coalesce(party.previous_system_balance_total, 0)),
        '-'::text, coalesce(directory.label, '-'), '-'::text, '-'::text, case when party.previous_system_balance_total >= 0 then 'مانده اول دوره کارمند: بدهی به کارمند' else 'مانده اول دوره کارمند: طلب از کارمند' end, party.created_at,
        null, null, 'employees', party.id::text, null, null, '[]'::jsonb, null
      from public.employees party
      left join party_directory directory on directory.id = party.id::text and directory.module_id = 'employees'
      where party.org_id = v_org_id and coalesce(party.previous_system_balance_total, 0) <> 0
    ), filtered as (
      select * from source_rows row_item
      where (jsonb_array_length(coalesce(v_filters->'row_types', '[]'::jsonb)) = 0 or row_item.row_type in (select jsonb_array_elements_text(v_filters->'row_types')))
        and (jsonb_array_length(coalesce(v_filters->'payment_types', '[]'::jsonb)) = 0 or row_item.payment_type in (select jsonb_array_elements_text(v_filters->'payment_types')))
        and (jsonb_array_length(coalesce(v_filters->'statuses', '[]'::jsonb)) = 0 or row_item.status in (select jsonb_array_elements_text(v_filters->'statuses')))
        and (nullif(v_filters->>'source_query', '') is null or lower(row_item.source_label) like '%' || lower(v_filters->>'source_query') || '%')
        and (nullif(v_filters->>'invoice_query', '') is null or lower(row_item.invoice_label) like '%' || lower(v_filters->>'invoice_query') || '%')
        and (nullif(v_filters->>'person_query', '') is null or lower(row_item.person_label) like '%' || lower(v_filters->>'person_query') || '%')
        and (nullif(v_filters->>'bank_query', '') is null or lower(row_item.bank_label) like '%' || lower(v_filters->>'bank_query') || '%')
        and (nullif(v_filters->>'cheque_query', '') is null or lower(row_item.cheque_label) like '%' || lower(v_filters->>'cheque_query') || '%')
        and (nullif(v_filters->>'description_query', '') is null or lower(row_item.description) like '%' || lower(v_filters->>'description_query') || '%')
        and (nullif(v_filters->>'date_from', '') is null or row_item.row_date >= (v_filters->>'date_from')::date)
        and (nullif(v_filters->>'date_to', '') is null or row_item.row_date <= (v_filters->>'date_to')::date)
        and (nullif(v_filters->>'amount_from', '') is null or row_item.amount >= (v_filters->>'amount_from')::numeric)
        and (nullif(v_filters->>'amount_to', '') is null or row_item.amount <= (v_filters->>'amount_to')::numeric)
    ), ordered as (
      select * from filtered
      order by
        case when row_type = 'opening' then 0 else 1 end asc,
        case when v_sort_field = 'row_type' and v_sort_order = 'asc' then row_type end asc, case when v_sort_field = 'row_type' and v_sort_order = 'desc' then row_type end desc,
        case when v_sort_field = 'source_label' and v_sort_order = 'asc' then source_label end asc, case when v_sort_field = 'source_label' and v_sort_order = 'desc' then source_label end desc,
        case when v_sort_field = 'payment_type' and v_sort_order = 'asc' then payment_type end asc, case when v_sort_field = 'payment_type' and v_sort_order = 'desc' then payment_type end desc,
        case when v_sort_field = 'status' and v_sort_order = 'asc' then status end asc, case when v_sort_field = 'status' and v_sort_order = 'desc' then status end desc,
        case when v_sort_field = 'date' and v_sort_order = 'asc' then row_date end asc nulls last, case when v_sort_field = 'date' and v_sort_order = 'desc' then row_date end desc nulls last,
        case when v_sort_field = 'amount' and v_sort_order = 'asc' then amount end asc, case when v_sort_field = 'amount' and v_sort_order = 'desc' then amount end desc,
        case when v_sort_field = 'invoice_label' and v_sort_order = 'asc' then invoice_label end asc, case when v_sort_field = 'invoice_label' and v_sort_order = 'desc' then invoice_label end desc,
        case when v_sort_field = 'person_label' and v_sort_order = 'asc' then person_label end asc, case when v_sort_field = 'person_label' and v_sort_order = 'desc' then person_label end desc,
        case when v_sort_field = 'bank_label' and v_sort_order = 'asc' then bank_label end asc, case when v_sort_field = 'bank_label' and v_sort_order = 'desc' then bank_label end desc,
        case when v_sort_field = 'cheque_label' and v_sort_order = 'asc' then cheque_label end asc, case when v_sort_field = 'cheque_label' and v_sort_order = 'desc' then cheque_label end desc,
        case when v_sort_field = 'description' and v_sort_order = 'asc' then description end asc, case when v_sort_field = 'description' and v_sort_order = 'desc' then description end desc,
        row_key asc
    ), paged as (
      select * from ordered limit v_page_size offset (v_page - 1) * v_page_size
    )
    select jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(paged)), '[]'::jsonb), 'total', (select count(*) from filtered)) from paged
  );
end;
$$;

create or replace function public.get_cash_bank_dashboard_stats()
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'bankAccounts', (select count(*) from public.bank_accounts where org_id = public.current_org_id() and is_active = true),
    'cashBoxes', (select count(*) from public.cash_boxes where org_id = public.current_org_id() and is_active = true),
    'pettyFunds', (select count(*) from public.petty_funds where org_id = public.current_org_id() and is_active = true),
    'openCheques', (select count(*) from public.cheques where org_id = public.current_org_id() and status in ('new', 'in_bank')),
    'chequesAmount', (select coalesce(sum(amount), 0) from public.cheques where org_id = public.current_org_id() and status in ('new', 'in_bank')),
    'openBarters', (select count(*) from public.barters where org_id = public.current_org_id() and status in ('open', 'partial')),
    'bartersAmount', (select coalesce(sum(remaining_amount), 0) from public.barters where org_id = public.current_org_id() and status in ('open', 'partial'))
  )
  where public.current_org_id() is not null;
$$;

revoke all on function public.get_cash_bank_unified_ledger_page(integer, integer, text, text, jsonb) from public, anon;
revoke all on function public.get_cash_bank_dashboard_stats() from public, anon;
grant execute on function public.get_cash_bank_unified_ledger_page(integer, integer, text, text, jsonb) to authenticated;
grant execute on function public.get_cash_bank_dashboard_stats() to authenticated;

commit;
