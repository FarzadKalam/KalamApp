-- Reduce repeated organization resolution in the cash/bank page, totals and print.
-- Existing tenant RLS, grants and host/membership semantics are unchanged.
-- No cached request identity, timeout increase or SECURITY DEFINER ledger view.
begin;

create or replace function public.current_org_id()
returns uuid language plpgsql stable security definer set search_path=public as $$
declare v_headers jsonb; v_host text; v_org uuid; v_requested text; v_candidates integer;
begin
  if auth.uid() is null then return null; end if;
  begin v_headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  exception when others then return null; end;
  v_host:=lower(split_part(split_part(regexp_replace(coalesce(v_headers->>'origin',''),'^https?://',''), '/',1),':',1));
  -- Host binding wins over caller-provided context, including the internal and provider panels.
  if v_host not in ('','localhost','127.0.0.1','app.tazesystem.ir','tazesystem.ir','www.tazesystem.ir') then
    -- Same host resolution as get_public_branding, without materializing public
    -- branding, subscription and integration JSON for every RLS predicate.
    -- SECURITY DEFINER remains necessary to avoid recursive profile RLS;
    -- the active membership/organization check below remains mandatory.
    if v_host in ('kalam.tazesystem.ir','kalamapp.ir','www.kalamapp.ir') then
      select count(*), (array_agg(candidate.org_id))[1] into v_candidates,v_org
      from (
        select distinct cs.org_id from public.company_settings cs
        join public.org_roles r on r.org_id=cs.org_id
        left join public.saas_org_settings s on s.org_id=cs.org_id
        where cs.org_id is not null
          and coalesce(s.is_billing_provider,false)=false
          and nullif(trim(coalesce(s.resolved_host,'')),'') is null
          and (lower(coalesce(r.permissions->'__saas_admin'->>'view','false'))='true'
            or lower(coalesce(r.permissions->'__saas_admin'->>'edit','false'))='true')
      ) candidate;
      if v_candidates<>1 then return null; end if;
    else
      select s.org_id into v_org from public.saas_org_settings s
      join public.organizations o on o.id=s.org_id
      where lower(s.resolved_host)=v_host
      order by s.updated_at desc nulls last limit 1;
    end if;
    if v_org is null then return null; end if;
  else
    -- x-client-info is already allowed by Supabase CORS; no gateway configuration change is needed.
    v_requested:=coalesce(nullif(trim(v_headers->>'x-organization-id'),''),
      substring(coalesce(v_headers->>'x-client-info','') from '(?:^|;\s*)org=([0-9a-fA-F-]{36})(?:;|$)'));
    if v_requested is not null then
      begin v_org:=v_requested::uuid; exception when invalid_text_representation then return null; end;
    elsif v_host in ('app.tazesystem.ir','tazesystem.ir','www.tazesystem.ir') then
      return null; -- Shared login is not a tenant and must not inherit another tab's organization.
    else
      -- Compatibility for trusted server requests without Origin and local development.
      select org_id into v_org from public.profiles where id=auth.uid();
    end if;
  end if;
  if exists(select 1 from public.user_organization_memberships m
    join public.organizations o on o.id=m.org_id and o.is_active
    where m.user_id=auth.uid() and m.org_id=v_org and m.is_active)
  then return v_org; end if;
  return null;
end;
$$;


create or replace view public.cash_bank_unified_ledger with (security_invoker = true) as
with account_directory as (
      select id::text, 'bank_accounts'::text module_id, concat_ws(' ', nullif(btrim(bank_name), ''), case when nullif(btrim(account_number), '') is not null then '(' || account_number || ')' end) label
      from public.bank_accounts where org_id = (select public.current_org_id())
      union all
      select id::text, 'cash_boxes'::text, concat_ws(' ', nullif(btrim(name), ''), case when nullif(btrim(code), '') is not null then '(' || code || ')' end)
      from public.cash_boxes where org_id = (select public.current_org_id())
      union all
      select id::text, 'petty_funds'::text, concat_ws(' ', nullif(btrim(name), ''), case when nullif(btrim(code), '') is not null then '(' || code || ')' end)
      from public.petty_funds where org_id = (select public.current_org_id())
    ), party_directory as (
      select id::text, 'customers'::text module_id, coalesce(nullif(btrim(concat_ws(' ', first_name, last_name)), ''), nullif(btrim(business_name), ''), nullif(btrim(system_code), ''), 'بدون عنوان') label from public.customers where org_id = (select public.current_org_id())
      union all select id::text, 'suppliers'::text, coalesce(nullif(btrim(business_name), ''), nullif(btrim(full_name), ''), nullif(btrim(system_code), ''), 'بدون عنوان') from public.suppliers where org_id = (select public.current_org_id())
      union all select id::text, 'profiles'::text, coalesce(nullif(btrim(full_name), ''), nullif(btrim(concat_ws(' ', first_name, last_name)), ''), 'بدون عنوان') from public.profiles where org_id = (select public.current_org_id())
      union all select id::text, 'employees'::text, coalesce(nullif(btrim(concat_ws(' ', first_name, last_name)), ''), nullif(btrim(system_code), ''), 'بدون عنوان') from public.employees where org_id = (select public.current_org_id())
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
      left join public.cheques cheque on cheque.id = op.cheque_id and cheque.org_id = (select public.current_org_id())
      where op.org_id = (select public.current_org_id())
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
      left join lateral (select coalesce(nullif(concat_ws(' ', c.serial_no, case when c.sayad_id is not null then '(' || c.sayad_id || ')' end), ''), '-') label from public.cheques c where c.org_id = (select public.current_org_id()) and c.id::text = nullif(payment.item->>'cheque_id', '') limit 1) cheque_label on true
      where invoice.org_id = (select public.current_org_id())

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
      left join lateral (select coalesce(nullif(concat_ws(' ', c.serial_no, case when c.sayad_id is not null then '(' || c.sayad_id || ')' end), ''), '-') label from public.cheques c where c.org_id = (select public.current_org_id()) and c.id::text = nullif(payment.item->>'cheque_id', '') limit 1) cheque_label on true
      where invoice.org_id = (select public.current_org_id())

      union all
      select
        'cheque_' || cheque.id::text, 'cheque', 'cheque', case when cheque.cheque_type = 'issued' then 'چک پرداختی' else 'چک دریافتی' end, cheque.id::text,
        'cheque', coalesce(cheque.status, ''), coalesce(cheque.due_date, cheque.issue_date), coalesce(cheque.amount, 0), '-', coalesce(party.label, '-'), coalesce(account.label, '-'),
        coalesce(nullif(concat_ws(' ', cheque.serial_no, case when cheque.sayad_id is not null then '(' || cheque.sayad_id || ')' end), ''), '-'), coalesce(cheque.notes, ''), cheque.created_at,
        null, null, party.module_id, party.id, account.module_id, account.id, '[]'::jsonb, cheque.id::text
      from public.cheques cheque
      left join party_directory party on party.id = cheque.party_id::text and party.module_id = case cheque.party_type when 'customer' then 'customers' when 'supplier' then 'suppliers' else 'profiles' end
      left join account_directory account on account.id = cheque.bank_account_id::text
      where cheque.org_id = (select public.current_org_id())

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
      left join public.invoices sales on sales.id = barter.source_invoice_id and sales.org_id = (select public.current_org_id())
      left join public.purchase_invoices purchase on purchase.id = barter.source_purchase_invoice_id and purchase.org_id = (select public.current_org_id())
      left join party_directory customer on customer.id = barter.customer_id::text and customer.module_id = 'customers'
      left join party_directory supplier on supplier.id = barter.supplier_id::text and supplier.module_id = 'suppliers'
      left join party_directory employee on employee.id = barter.employee_id::text and employee.module_id = 'profiles'
      where barter.org_id = (select public.current_org_id())

      union all
      select
        'opening_bank_' || account.id::text, 'bank_account_opening', 'opening', 'مانده اول دوره حساب بانکی', account.id::text,
        ''::text, 'opening'::text, account.created_at::date, abs(coalesce(account.opening_balance, 0)),
        '-'::text, '-'::text, coalesce(directory.label, '-'), '-'::text, 'مانده اول دوره حساب بانکی'::text, account.created_at,
        null, null, null, null, 'bank_accounts', account.id::text, '[]'::jsonb, null
      from public.bank_accounts account
      left join account_directory directory on directory.id = account.id::text and directory.module_id = 'bank_accounts'
      where account.org_id = (select public.current_org_id()) and coalesce(account.opening_balance, 0) <> 0

      union all
      select
        'opening_cash_' || account.id::text, 'cash_box_opening', 'opening', 'مانده اول دوره صندوق', account.id::text,
        ''::text, 'opening'::text, account.created_at::date, abs(coalesce(account.opening_balance, 0)),
        '-'::text, '-'::text, coalesce(directory.label, '-'), '-'::text, 'مانده اول دوره صندوق'::text, account.created_at,
        null, null, null, null, 'cash_boxes', account.id::text, '[]'::jsonb, null
      from public.cash_boxes account
      left join account_directory directory on directory.id = account.id::text and directory.module_id = 'cash_boxes'
      where account.org_id = (select public.current_org_id()) and coalesce(account.opening_balance, 0) <> 0

      union all
      select
        'opening_petty_' || account.id::text, 'petty_fund_opening', 'opening', 'مانده اول دوره تنخواه', account.id::text,
        ''::text, 'opening'::text, account.created_at::date, abs(coalesce(account.opening_balance, 0)),
        '-'::text, '-'::text, coalesce(directory.label, '-'), '-'::text, 'مانده اول دوره تنخواه'::text, account.created_at,
        null, null, null, null, 'petty_funds', account.id::text, '[]'::jsonb, null
      from public.petty_funds account
      left join account_directory directory on directory.id = account.id::text and directory.module_id = 'petty_funds'
      where account.org_id = (select public.current_org_id()) and coalesce(account.opening_balance, 0) <> 0

      union all
      select
        'opening_customer_' || party.id::text, 'customer_opening', 'opening', 'مانده اول دوره مشتری', party.id::text,
        ''::text, 'opening'::text, party.created_at::date, abs(coalesce(party.previous_system_balance_total, 0)),
        '-'::text, coalesce(directory.label, '-'), '-'::text, '-'::text, case when party.previous_system_balance_total >= 0 then 'مانده اول دوره مشتری: طلب از مشتری' else 'مانده اول دوره مشتری: بدهی به مشتری' end, party.created_at,
        null, null, 'customers', party.id::text, null, null, '[]'::jsonb, null
      from public.customers party
      left join party_directory directory on directory.id = party.id::text and directory.module_id = 'customers'
      where party.org_id = (select public.current_org_id()) and coalesce(party.previous_system_balance_total, 0) <> 0

      union all
      select
        'opening_supplier_' || party.id::text, 'supplier_opening', 'opening', 'مانده اول دوره تأمین‌کننده', party.id::text,
        ''::text, 'opening'::text, party.created_at::date, abs(coalesce(party.previous_system_balance_total, 0)),
        '-'::text, coalesce(directory.label, '-'), '-'::text, '-'::text, case when party.previous_system_balance_total >= 0 then 'مانده اول دوره تأمین‌کننده: بدهی به تأمین‌کننده' else 'مانده اول دوره تأمین‌کننده: طلب از تأمین‌کننده' end, party.created_at,
        null, null, 'suppliers', party.id::text, null, null, '[]'::jsonb, null
      from public.suppliers party
      left join party_directory directory on directory.id = party.id::text and directory.module_id = 'suppliers'
      where party.org_id = (select public.current_org_id()) and coalesce(party.previous_system_balance_total, 0) <> 0

      union all
      select
        'opening_employee_' || party.id::text, 'employee_opening', 'opening', 'مانده اول دوره کارمند', party.id::text,
        ''::text, 'opening'::text, party.created_at::date, abs(coalesce(party.previous_system_balance_total, 0)),
        '-'::text, coalesce(directory.label, '-'), '-'::text, '-'::text, case when party.previous_system_balance_total >= 0 then 'مانده اول دوره کارمند: بدهی به کارمند' else 'مانده اول دوره کارمند: طلب از کارمند' end, party.created_at,
        null, null, 'employees', party.id::text, null, null, '[]'::jsonb, null
      from public.employees party
      left join party_directory directory on directory.id = party.id::text and directory.module_id = 'employees'
      where party.org_id = (select public.current_org_id()) and coalesce(party.previous_system_balance_total, 0) <> 0
    )
select * from source_rows where (select public.current_org_id()) is not null;


commit;
