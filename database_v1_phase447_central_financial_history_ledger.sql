-- =====================================================
-- KalamApp - Phase 447 Central Financial History Ledger
-- Date: 2026-08-16
-- Type: Additive / idempotent migration
-- Goal: یک منبع سروری برای گردش مالی اشخاص، فیش حقوق و مساعده
-- =====================================================

begin;

-- «تکمیل شده» نیز یک پرداخت قطعی مساعده است. وضعیت «سند شده» برای
-- سازگاری با سوابق قبلی همچنان پذیرفته می‌شود، اما درخواست یا تاییدِ صرف
-- هرگز در گردش مالی شخص وارد نمی‌شود.
alter table public.employee_advances
  drop constraint if exists chk_employee_advances_status;
alter table public.employee_advances
  add constraint chk_employee_advances_status
  check (status in ('draft', 'requested', 'approved', 'paid', 'settled', 'completed', 'posted', 'rejected', 'canceled'));

create or replace function public.financial_history_safe_numeric(p_value text)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_value text := replace(replace(replace(trim(coalesce(p_value, '')), ',', ''), '٬', ''), '،', '');
begin
  if v_value !~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$' then
    return 0;
  end if;
  return v_value::numeric;
end;
$$;

create or replace function public.financial_history_payment_amount(p_payment jsonb)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_amount numeric := public.financial_history_safe_numeric(p_payment ->> 'amount');
  v_total numeric := public.financial_history_safe_numeric(p_payment ->> 'total_price');
  v_quantity numeric := public.financial_history_safe_numeric(p_payment ->> 'quantity');
  v_unit_price numeric := public.financial_history_safe_numeric(p_payment ->> 'unit_price');
begin
  if v_amount <> 0 then return abs(v_amount); end if;
  if v_total <> 0 then return abs(v_total); end if;
  if v_quantity > 0 and v_unit_price > 0 then return v_quantity * v_unit_price; end if;
  return 0;
end;
$$;

create or replace function public.financial_history_payment_is_final(p_payment jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(nullif(lower(trim(p_payment ->> 'status')), ''), 'received')
    in ('received', 'approved', 'paid', 'settled', 'cleared', 'completed')
$$;

revoke all on function public.financial_history_safe_numeric(text) from public, anon, authenticated;
revoke all on function public.financial_history_payment_amount(jsonb) from public, anon, authenticated;
revoke all on function public.financial_history_payment_is_final(jsonb) from public, anon, authenticated;

-- جمع فیش فقط از حقوق، مزایا و کسورات واقعی ساخته می‌شود. مساعده یک پرداخت
-- مرتبط است و حتی در سوابق قدیمی که به‌اشتباه در اقلام ذخیره شده، کسور فیش
-- محسوب نمی‌شود.
create or replace function public.sync_payroll_slip_summary_from_lines()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line jsonb;
  v_payment jsonb;
  v_line_type text;
  v_line_key text;
  v_amount numeric;
  v_base_salary numeric := 0;
  v_task_wage_total numeric := 0;
  v_bonus_total numeric := 0;
  v_deduction_total numeric := 0;
  v_employee_insurance numeric := 0;
  v_employer_insurance numeric := 0;
  v_paid_amount numeric := 0;
  v_has_payment_status boolean := false;
  v_has_employer_insurance boolean := false;
  v_payment_status text;
begin
  for v_line in
    select value from jsonb_array_elements(coalesce(new.lines, '[]'::jsonb))
  loop
    v_line_type := lower(trim(coalesce(v_line ->> 'line_type', 'earning')));
    v_line_key := lower(trim(coalesce(v_line ->> 'key', '')));

    -- ردیف‌های مساعدهٔ قدیمی در جدول اقلام باقی مانده‌اند تا تاریخچه قابل
    -- پیگیری باشد، اما اثر مالی‌شان فقط از جدول پرداخت‌های فیش خوانده می‌شود.
    if v_line_key = 'employee_advance'
      or nullif(trim(coalesce(v_line -> 'metadata' ->> 'employee_advance_id', '')), '') is not null
    then
      continue;
    end if;

    v_amount := public.payroll_slip_line_amount(v_line);
    if v_line -> 'metadata' ? 'employer_insurance_amount' then
      v_employer_insurance := v_employer_insurance
        + abs(public.payroll_safe_numeric(v_line -> 'metadata' ->> 'employer_insurance_amount'));
      v_has_employer_insurance := true;
    end if;
    if v_amount = 0 then continue; end if;

    if v_line_type = 'deduction' then
      v_deduction_total := v_deduction_total + v_amount;
      if v_line_key = 'employee_insurance'
        or lower(coalesce(v_line ->> 'title', '')) like '%بیمه سهم کارمند%'
      then
        v_employee_insurance := v_employee_insurance + v_amount;
      end if;
    elsif v_line_type = 'bonus' then
      v_bonus_total := v_bonus_total + v_amount;
    elsif v_line_key = 'task_wage'
      or lower(coalesce(v_line ->> 'title', '')) like '%حقوق عملکردی فعالیت%'
    then
      v_task_wage_total := v_task_wage_total + v_amount;
    else
      v_base_salary := v_base_salary + v_amount;
    end if;
  end loop;

  select exists (
    select 1
    from jsonb_array_elements(coalesce(new.payments, '[]'::jsonb)) as payment(value)
    where payment.value ? 'status'
  ) into v_has_payment_status;

  for v_payment in
    select value from jsonb_array_elements(coalesce(new.payments, '[]'::jsonb))
  loop
    v_payment_status := lower(trim(coalesce(v_payment ->> 'status', '')));
    if v_has_payment_status
      and v_payment_status <> ''
      and v_payment_status not in ('received', 'paid', 'approved', 'settled', 'cleared', 'completed')
    then
      continue;
    end if;
    v_paid_amount := v_paid_amount + public.financial_history_payment_amount(v_payment);
  end loop;

  new.base_salary := v_base_salary;
  new.task_wage_total := v_task_wage_total;
  new.bonus_total := v_bonus_total;
  new.earnings_total := v_base_salary + v_task_wage_total + v_bonus_total;
  new.deduction_total := v_deduction_total;
  new.insurance_employee_amount := v_employee_insurance;
  new.insurance_employer_amount := case when v_has_employer_insurance then v_employer_insurance else 0 end;
  new.gross_amount := new.earnings_total - v_deduction_total;
  new.net_amount := new.gross_amount - v_paid_amount;
  return new;
end;
$$;

revoke all on function public.sync_payroll_slip_summary_from_lines() from public, anon, authenticated;

drop trigger if exists trg_payroll_slips_sync_summary_from_lines on public.payroll_slips;
create trigger trg_payroll_slips_sync_summary_from_lines
before insert or update on public.payroll_slips
for each row execute function public.sync_payroll_slip_summary_from_lines();

-- هستهٔ مشترک دفتر گردش اشخاص. این تابع فقط از wrapperهای کنترل‌شده فراخوانی
-- می‌شود؛ بنابراین ورودی سازمان هرگز از سمت کاربر قابل جعل نیست.
create or replace function public._get_operational_financial_history(
  p_org_id uuid,
  p_entity_type text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if p_org_id is null
    or p_entity_id is null
    or p_entity_type not in ('customer', 'supplier', 'employee')
  then
    return jsonb_build_object(
      'rows', '[]'::jsonb,
      'summary', jsonb_build_object('total_debit', 0, 'total_credit', 0, 'final_balance', 0, 'source', 'central_financial_history')
    );
  end if;

  with recursive financial_link_pairs as (
    select 'customer'::text source_type, c.id source_id, 'supplier'::text target_type, c.linked_supplier_id target_id
    from public.customers c where c.org_id = p_org_id and c.linked_supplier_id is not null
    union all
    select 'customer', c.id, 'employee', c.linked_employee_id
    from public.customers c where c.org_id = p_org_id and c.linked_employee_id is not null
    union all
    select 'supplier', s.id, 'customer', s.linked_customer_id
    from public.suppliers s where s.org_id = p_org_id and s.linked_customer_id is not null
    union all
    select 'supplier', s.id, 'employee', s.linked_employee_id
    from public.suppliers s where s.org_id = p_org_id and s.linked_employee_id is not null
    union all
    select 'employee', e.id, 'customer', e.linked_customer_id
    from public.employees e where e.org_id = p_org_id and e.linked_customer_id is not null
    union all
    select 'employee', e.id, 'supplier', e.linked_supplier_id
    from public.employees e where e.org_id = p_org_id and e.linked_supplier_id is not null
  ), financial_links as (
    select source_type, source_id, target_type, target_id from financial_link_pairs
    union all
    select target_type, target_id, source_type, source_id from financial_link_pairs
  ), entity_scope(entity_type, entity_id) as (
    select p_entity_type, p_entity_id
    union
    select link.target_type, link.target_id
    from financial_links link
    join entity_scope current_entity
      on current_entity.entity_type = link.source_type
      and current_entity.entity_id = link.source_id
  ), scoped_customers as (
    select entity_id id from entity_scope where entity_type = 'customer'
  ), scoped_suppliers as (
    select entity_id id from entity_scope where entity_type = 'supplier'
  ), scoped_employees as (
    select e.id, e.related_profile_id
    from public.employees e
    join entity_scope scope on scope.entity_type = 'employee' and scope.entity_id = e.id
    where e.org_id = p_org_id
  ), scoped_sales_invoices as (
    select i.id
    from public.invoices i
    where i.org_id = p_org_id and i.customer_id in (select id from scoped_customers)
  ), scoped_purchase_invoices as (
    select i.id
    from public.purchase_invoices i
    where i.org_id = p_org_id and i.supplier_id in (select id from scoped_suppliers)
  ), scoped_expense_documents as (
    select e.id
    from public.expense_documents e
    where e.org_id = p_org_id and (
      e.customer_id in (select id from scoped_customers)
      or e.supplier_id in (select id from scoped_suppliers)
      or e.employee_id in (select id from scoped_employees)
      or e.employee_id in (select related_profile_id from scoped_employees where related_profile_id is not null)
    )
  ), scoped_payroll_slips as (
    select p.id
    from public.payroll_slips p
    where p.org_id = p_org_id and p.employee_id in (select id from scoped_employees)
  ), scoped_employee_advances as (
    select a.id
    from public.employee_advances a
    where a.org_id = p_org_id and a.employee_id in (select id from scoped_employees)
  ), raw_rows as (
    select
      'opening'::text row_type,
      'مانده اول دوره'::text source_label,
      'customers'::text source_module_id,
      c.id::text source_record_id,
      ''::text payment_type,
      'opening'::text status,
      ''::text cheque_status,
      c.created_at::date row_date,
      case when coalesce(c.previous_system_balance_total, 0) >= 0 then abs(c.previous_system_balance_total) else 0 end debit,
      case when coalesce(c.previous_system_balance_total, 0) < 0 then abs(c.previous_system_balance_total) else 0 end credit,
      coalesce(nullif(btrim(c.system_code), ''), nullif(btrim(c.business_name), ''), nullif(btrim(c.full_name), ''), 'بدون عنوان') invoice_label,
      '-'::text bank_label,
      'مانده اول دوره سیستم قبلی'::text description,
      c.created_at,
      null::text bank_module_id,
      null::text bank_record_id,
      'opening_customer_' || c.id::text key
    from public.customers c
    where c.org_id = p_org_id and c.id in (select id from scoped_customers)
      and coalesce(c.previous_system_balance_total, 0) <> 0

    union all

    select
      'opening', 'مانده اول دوره', 'suppliers', s.id::text, '', 'opening', '', s.created_at::date,
      case when coalesce(s.previous_system_balance_total, 0) < 0 then abs(s.previous_system_balance_total) else 0 end,
      case when coalesce(s.previous_system_balance_total, 0) >= 0 then abs(s.previous_system_balance_total) else 0 end,
      coalesce(nullif(btrim(s.system_code), ''), nullif(btrim(s.business_name), ''), nullif(btrim(s.full_name), ''), 'بدون عنوان'),
      '-', 'مانده اول دوره سیستم قبلی', s.created_at, null, null, 'opening_supplier_' || s.id::text
    from public.suppliers s
    where s.org_id = p_org_id and s.id in (select id from scoped_suppliers)
      and coalesce(s.previous_system_balance_total, 0) <> 0

    union all

    select
      'opening', 'مانده اول دوره', 'employees', e.id::text, '', 'opening', '', e.created_at::date,
      case when coalesce(e.previous_system_balance_total, 0) < 0 then abs(e.previous_system_balance_total) else 0 end,
      case when coalesce(e.previous_system_balance_total, 0) >= 0 then abs(e.previous_system_balance_total) else 0 end,
      coalesce(nullif(btrim(e.system_code), ''), nullif(btrim(e.full_name), ''), 'بدون عنوان'),
      '-', 'مانده اول دوره سیستم قبلی', e.created_at, null, null, 'opening_employee_' || e.id::text
    from public.employees e
    where e.org_id = p_org_id and e.id in (select id from scoped_employees)
      and coalesce(e.previous_system_balance_total, 0) <> 0

    union all

    select
      'invoice', 'صدور فاکتور فروش', 'invoices', i.id::text, '', i.status, '', i.invoice_date,
      abs(coalesce(i.total_invoice_amount, 0)), 0,
      coalesce(nullif(btrim(i.system_code), ''), nullif(btrim(i.name), ''), 'بدون عنوان'), '-',
      concat('فاکتور فروش', case when coalesce(i.remaining_balance, 0) <> 0 then ' | مانده: ' || i.remaining_balance else '' end),
      i.created_at, null, null, 'invoice_' || i.id::text
    from public.invoices i
    where i.org_id = p_org_id and i.customer_id in (select id from scoped_customers)
      and i.status in ('confirmed', 'final', 'settled', 'completed')
      and coalesce(i.total_invoice_amount, 0) > 0

    union all

    select
      'invoice', 'ثبت فاکتور خرید', 'purchase_invoices', i.id::text, '', i.status, '', i.invoice_date,
      0, abs(coalesce(i.total_invoice_amount, 0)),
      coalesce(nullif(btrim(i.system_code), ''), nullif(btrim(i.name), ''), 'بدون عنوان'), '-',
      concat('فاکتور خرید', case when coalesce(i.remaining_balance, 0) <> 0 then ' | مانده: ' || i.remaining_balance else '' end),
      i.created_at, null, null, 'purchase_invoice_' || i.id::text
    from public.purchase_invoices i
    where i.org_id = p_org_id and i.supplier_id in (select id from scoped_suppliers)
      and i.status in ('confirmed', 'final', 'settled', 'completed')
      and coalesce(i.total_invoice_amount, 0) > 0

    union all

    select
      'payroll_slip', 'فیش حقوقی', 'payroll_slips', p.id::text, '', p.status, '', p.period_end,
      0, abs(coalesce(p.gross_amount, p.earnings_total - p.deduction_total, 0)),
      coalesce(nullif(btrim(p.system_code), ''), nullif(btrim(p.name), ''), 'بدون عنوان'), '-',
      'تعهد پرداخت حقوق', p.created_at, null, null, 'payroll_' || p.id::text
    from public.payroll_slips p
    where p.org_id = p_org_id and p.employee_id in (select id from scoped_employees)
      and p.status in ('approved', 'paid', 'posted')
      and coalesce(p.gross_amount, p.earnings_total - p.deduction_total, 0) > 0

    union all

    select
      'expense', 'ثبت هزینه', 'expense_documents', e.id::text, '', e.status, '', e.expense_date,
      0, abs(coalesce(e.total_amount, 0)),
      coalesce(nullif(btrim(e.system_code), ''), nullif(btrim(e.name), ''), 'بدون عنوان'), '-',
      concat('هزینه', case when coalesce(e.remaining_amount, 0) <> 0 then ' | مانده: ' || e.remaining_amount else '' end),
      e.created_at, null, null, 'expense_' || e.id::text
    from public.expense_documents e
    where e.org_id = p_org_id and e.status in ('approved', 'paid', 'posted', 'settled', 'completed')
      and coalesce(e.total_amount, 0) > 0
      and (
        e.customer_id in (select id from scoped_customers)
        or e.supplier_id in (select id from scoped_suppliers)
        or e.employee_id in (select id from scoped_employees)
        or e.employee_id in (select related_profile_id from scoped_employees where related_profile_id is not null)
      )

    union all

    select
      'barter', 'تهاتر', 'barters', b.id::text, 'barter', b.status, '', b.barter_date,
      case when b.barter_type = 'outgoing' then abs(coalesce(b.initial_amount, 0)) else 0 end,
      case when b.barter_type = 'incoming' then abs(coalesce(b.initial_amount, 0)) else 0 end,
      coalesce(nullif(btrim(b.system_code), ''), nullif(btrim(b.name), ''), 'بدون عنوان'), '-', coalesce(b.notes, ''),
      b.created_at, null, null, 'barter_' || b.id::text
    from public.barters b
    where b.org_id = p_org_id and b.status <> 'canceled'
      and (
        b.customer_id in (select id from scoped_customers)
        or b.supplier_id in (select id from scoped_suppliers)
        or b.employee_id in (select id from scoped_employees)
        or b.employee_id in (select related_profile_id from scoped_employees where related_profile_id is not null)
      )

    union all

    select
      case when operation.operation_type = 'payment' then 'payment' else 'receipt' end,
      case
        when operation.sales_invoice_id is not null then 'دریافت فاکتور فروش'
        when operation.purchase_invoice_id is not null then 'پرداخت فاکتور خرید'
        when operation.expense_document_id is not null then 'پرداخت هزینه'
        when operation.employee_advance_id is not null then 'پرداخت مساعده'
        when operation.payroll_slip_id is not null then 'پرداخت فیش حقوقی'
        else 'ثبت مستقیم نقد و بانک'
      end,
      case
        when operation.sales_invoice_id is not null then 'invoices'
        when operation.purchase_invoice_id is not null then 'purchase_invoices'
        when operation.expense_document_id is not null then 'expense_documents'
        when operation.employee_advance_id is not null then 'employee_advances'
        when operation.payroll_slip_id is not null then 'payroll_slips'
        else 'cash_bank_operations'
      end,
      coalesce(operation.sales_invoice_id, operation.purchase_invoice_id, operation.expense_document_id, operation.employee_advance_id, operation.payroll_slip_id, operation.id)::text,
      coalesce(operation.payment_type, ''), coalesce(operation.status, ''), coalesce(operation.cheque_status, ''), operation.operation_date,
      case when operation.operation_type = 'payment' then abs(coalesce(operation.amount, 0)) else 0 end,
      case when operation.operation_type = 'receipt' then abs(coalesce(operation.amount, 0)) else 0 end,
      coalesce(
        nullif(btrim(sales.system_code), ''), nullif(btrim(sales.name), ''),
        nullif(btrim(purchase.system_code), ''), nullif(btrim(purchase.name), ''),
        nullif(btrim(expense.system_code), ''), nullif(btrim(expense.name), ''),
        nullif(btrim(advance.system_code), ''), nullif(btrim(advance.name), ''),
        nullif(btrim(payroll.system_code), ''), nullif(btrim(payroll.name), ''), '-'
      ),
      case
        when bank.id is not null then concat(coalesce(nullif(btrim(bank.bank_name), ''), 'بانک'), case when nullif(btrim(bank.account_number), '') is not null then ' (' || bank.account_number || ')' else '' end)
        when cash.id is not null then concat(coalesce(nullif(btrim(cash.name), ''), 'صندوق'), case when nullif(btrim(cash.code), '') is not null then ' (' || cash.code || ')' else '' end)
        when petty.id is not null then concat(coalesce(nullif(btrim(petty.name), ''), 'تنخواه'), case when nullif(btrim(petty.code), '') is not null then ' (' || petty.code || ')' else '' end)
        else '-'
      end,
      coalesce(operation.description, ''), operation.created_at,
      case when bank.id is not null then 'bank_accounts' when cash.id is not null then 'cash_boxes' when petty.id is not null then 'petty_funds' else null end,
      coalesce(bank.id, cash.id, petty.id)::text,
      'operation_' || operation.id::text
    from public.cash_bank_operations operation
    left join public.invoices sales on sales.id = operation.sales_invoice_id and sales.org_id = p_org_id
    left join public.purchase_invoices purchase on purchase.id = operation.purchase_invoice_id and purchase.org_id = p_org_id
    left join public.expense_documents expense on expense.id = operation.expense_document_id and expense.org_id = p_org_id
    left join public.employee_advances advance on advance.id = operation.employee_advance_id and advance.org_id = p_org_id
    left join public.payroll_slips payroll on payroll.id = operation.payroll_slip_id and payroll.org_id = p_org_id
    left join public.bank_accounts bank on bank.org_id = p_org_id and bank.id = coalesce(operation.payment_bank_account_id, operation.receipt_bank_account_id, operation.bank_account_id)
    left join public.cash_boxes cash on cash.org_id = p_org_id and cash.id = coalesce(operation.payment_cash_box_id, operation.receipt_cash_box_id, operation.cash_box_id)
    left join public.petty_funds petty on petty.org_id = p_org_id and petty.id = coalesce(operation.payment_petty_fund_id, operation.receipt_petty_fund_id, operation.petty_fund_id)
    where operation.org_id = p_org_id
      and operation.operation_type <> 'transfer'
      and lower(coalesce(operation.status, '')) in ('received', 'approved', 'paid', 'settled', 'cleared', 'completed')
      and not (lower(coalesce(operation.payment_type, '')) = 'cheque' and lower(coalesce(operation.cheque_status, '')) in ('bounced', 'returned'))
      and (
        operation.customer_id in (select id from scoped_customers)
        or operation.supplier_id in (select id from scoped_suppliers)
        or operation.sales_invoice_id in (select id from scoped_sales_invoices)
        or operation.purchase_invoice_id in (select id from scoped_purchase_invoices)
        or operation.expense_document_id in (select id from scoped_expense_documents)
        or operation.payroll_slip_id in (select id from scoped_payroll_slips)
        or operation.employee_advance_id in (select id from scoped_employee_advances)
        or exists (
          select 1 from scoped_employees employee
          where operation.employee_id = employee.id or operation.employee_id = employee.related_profile_id
        )
      )

    union all

    select
      case when source.operation_type = 'receipt' then 'receipt' else 'payment' end,
      source.source_label, source.module_id, source.id::text,
      coalesce(payment.item ->> 'payment_type', ''), coalesce(payment.item ->> 'status', 'received'), coalesce(payment.item ->> 'cheque_status', ''),
      case when coalesce(payment.item ->> 'date', '') ~ '^\\d{4}-\\d{2}-\\d{2}$' then (payment.item ->> 'date')::date else source.row_date end,
      case when source.operation_type = 'payment' then public.financial_history_payment_amount(payment.item) else 0 end,
      case when source.operation_type = 'receipt' then public.financial_history_payment_amount(payment.item) else 0 end,
      source.invoice_label, '-', coalesce(payment.item ->> 'description', ''), source.created_at, null, null,
      'legacy_payment_' || source.module_id || '_' || source.id::text || '_' || payment.ordinality::text
    from (
      select 'invoices'::text module_id, 'receipt'::text operation_type, 'دریافت فاکتور فروش'::text source_label,
        i.id, i.invoice_date row_date, i.created_at, i.payments,
        coalesce(nullif(btrim(i.system_code), ''), nullif(btrim(i.name), ''), 'بدون عنوان') invoice_label
      from public.invoices i
      where i.org_id = p_org_id and i.customer_id in (select id from scoped_customers)
      union all
      select 'purchase_invoices', 'payment', 'پرداخت فاکتور خرید', i.id, i.invoice_date, i.created_at, i.payments,
        coalesce(nullif(btrim(i.system_code), ''), nullif(btrim(i.name), ''), 'بدون عنوان')
      from public.purchase_invoices i
      where i.org_id = p_org_id and i.supplier_id in (select id from scoped_suppliers)
      union all
      select 'expense_documents', 'payment', 'پرداخت هزینه', e.id, e.expense_date, e.created_at, e.payments,
        coalesce(nullif(btrim(e.system_code), ''), nullif(btrim(e.name), ''), 'بدون عنوان')
      from public.expense_documents e
      where e.org_id = p_org_id and (
        e.customer_id in (select id from scoped_customers)
        or e.supplier_id in (select id from scoped_suppliers)
        or e.employee_id in (select id from scoped_employees)
        or e.employee_id in (select related_profile_id from scoped_employees where related_profile_id is not null)
      )
      union all
      select 'payroll_slips', 'payment', 'پرداخت فیش حقوقی', p.id, p.period_end, p.created_at, p.payments,
        coalesce(nullif(btrim(p.system_code), ''), nullif(btrim(p.name), ''), 'بدون عنوان')
      from public.payroll_slips p
      where p.org_id = p_org_id and p.employee_id in (select id from scoped_employees)
    ) source
    cross join lateral jsonb_array_elements(coalesce(source.payments, '[]'::jsonb)) with ordinality payment(item, ordinality)
    where public.financial_history_payment_is_final(payment.item)
      and public.financial_history_payment_amount(payment.item) > 0
      -- مساعدهٔ متصل به فیش، همان پرداخت مساعده است و ردیف جداگانهٔ نقد/بانک نمی‌سازد.
      and not (source.module_id = 'payroll_slips' and nullif(trim(coalesce(payment.item ->> 'employee_advance_id', '')), '') is not null)
      and not exists (
        select 1
        from public.cash_bank_operations operation
        where operation.org_id = p_org_id
          and lower(coalesce(operation.status, '')) <> 'canceled'
          and (
            operation.id::text = nullif(payment.item ->> '_cash_bank_operation_id', '')
            or (
              operation.metadata ->> 'source_table' = source.module_id
              and operation.metadata ->> 'source_record_id' = source.id::text
              and operation.metadata ->> 'source_row_key' = coalesce(
                nullif(payment.item ->> 'row_key', ''),
                nullif(payment.item ->> '_cash_bank_operation_id', ''),
                'legacy_' || (payment.ordinality - 1)::text
              )
            )
          )
      )

    union all

    select
      'payment', 'پرداخت مساعده', 'employee_advances', advance.id::text,
      coalesce(payment.item ->> 'payment_type', 'credit'), coalesce(payment.item ->> 'status', advance.status), coalesce(payment.item ->> 'cheque_status', ''),
      case when coalesce(payment.item ->> 'date', '') ~ '^\\d{4}-\\d{2}-\\d{2}$' then (payment.item ->> 'date')::date else advance.request_date end,
      public.financial_history_payment_amount(payment.item), 0,
      coalesce(nullif(btrim(advance.system_code), ''), nullif(btrim(advance.name), ''), 'بدون عنوان'), '-',
      coalesce(payment.item ->> 'description', 'پرداخت مساعده'), advance.created_at, null, null,
      'advance_payment_' || advance.id::text || '_' || payment.ordinality::text
    from public.employee_advances advance
    cross join lateral (
      select item, ordinality
      from jsonb_array_elements(coalesce(advance.payments, '[]'::jsonb)) with ordinality
      union all
      select jsonb_build_object('amount', advance.paid_amount, 'status', advance.status), 0::bigint
      where jsonb_array_length(coalesce(advance.payments, '[]'::jsonb)) = 0
        and coalesce(advance.paid_amount, 0) > 0
    ) payment
    where advance.org_id = p_org_id
      and advance.employee_id in (select id from scoped_employees)
      and lower(coalesce(advance.status, '')) in ('paid', 'settled', 'completed', 'posted')
      and public.financial_history_payment_is_final(payment.item)
      and public.financial_history_payment_amount(payment.item) > 0
      and not exists (
        select 1
        from public.cash_bank_operations operation
        where operation.org_id = p_org_id
          and lower(coalesce(operation.status, '')) <> 'canceled'
          and (
            operation.id::text = nullif(payment.item ->> '_cash_bank_operation_id', '')
            or operation.employee_advance_id = advance.id
            or (
              operation.metadata ->> 'source_table' = 'employee_advances'
              and operation.metadata ->> 'source_record_id' = advance.id::text
              and operation.metadata ->> 'source_row_key' = coalesce(
                nullif(payment.item ->> 'row_key', ''),
                nullif(payment.item ->> '_cash_bank_operation_id', ''),
                'legacy_' || greatest(payment.ordinality - 1, 0)::text
              )
            )
          )
      )
  ), ranked_rows as (
    select
      raw_rows.*,
      sum(coalesce(raw_rows.debit, 0) - coalesce(raw_rows.credit, 0)) over (
        order by (raw_rows.row_type = 'opening') desc, coalesce(raw_rows.row_date, raw_rows.created_at::date), raw_rows.key
        rows between unbounded preceding and current row
      ) balance
    from raw_rows
  )
  select jsonb_build_object(
    'rows', coalesce(
      jsonb_agg(jsonb_build_object(
        'key', key,
        'row_type', row_type,
        'source_label', source_label,
        'source_module_id', source_module_id,
        'source_record_id', source_record_id,
        'payment_type', payment_type,
        'status', status,
        'cheque_status', cheque_status,
        'date', row_date,
        'debit', debit,
        'credit', credit,
        'balance', balance,
        'invoice_label', invoice_label,
        'bank_label', bank_label,
        'description', description,
        'created_at', created_at,
        'bank_module_id', bank_module_id,
        'bank_record_id', bank_record_id
      ) order by (row_type = 'opening') desc, coalesce(row_date, created_at::date), key),
      '[]'::jsonb
    ),
    'summary', jsonb_build_object(
      'total_debit', coalesce(sum(debit), 0),
      'total_credit', coalesce(sum(credit), 0),
      'final_balance', coalesce(sum(debit - credit), 0),
      'source', 'central_financial_history'
    )
  ) into v_result
  from ranked_rows;

  return coalesce(v_result, jsonb_build_object(
    'rows', '[]'::jsonb,
    'summary', jsonb_build_object('total_debit', 0, 'total_credit', 0, 'final_balance', 0, 'source', 'central_financial_history')
  ));
end;
$$;

revoke all on function public._get_operational_financial_history(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.get_operational_financial_history(
  p_entity_type text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_exists boolean := false;
begin
  if v_org_id is null or p_entity_id is null or p_entity_type not in ('customer', 'supplier', 'employee') then
    return jsonb_build_object(
      'rows', '[]'::jsonb,
      'summary', jsonb_build_object('total_debit', 0, 'total_credit', 0, 'final_balance', 0, 'source', 'central_financial_history')
    );
  end if;

  if p_entity_type = 'customer' then
    select exists(select 1 from public.customers where id = p_entity_id and org_id = v_org_id) into v_exists;
  elsif p_entity_type = 'supplier' then
    select exists(select 1 from public.suppliers where id = p_entity_id and org_id = v_org_id) into v_exists;
  else
    select exists(select 1 from public.employees where id = p_entity_id and org_id = v_org_id) into v_exists;
  end if;

  if not v_exists then
    return jsonb_build_object(
      'rows', '[]'::jsonb,
      'summary', jsonb_build_object('total_debit', 0, 'total_credit', 0, 'final_balance', 0, 'source', 'central_financial_history')
    );
  end if;

  return public._get_operational_financial_history(v_org_id, p_entity_type, p_entity_id);
end;
$$;

revoke all on function public.get_operational_financial_history(text, uuid) from public, anon;
grant execute on function public.get_operational_financial_history(text, uuid) to authenticated;

-- کارت عمومی اکنون بدون کپی‌کردن قوانین مالی، مستقیماً همان دفتر سروری را
-- می‌خواند. توکن تنها برای کشف کارت استفاده می‌شود و org_id از کارت معتبر است.
create or replace function public.get_public_online_account_card(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_card public.online_account_cards%rowtype;
  v_entity jsonb := '{}'::jsonb;
  v_name text := '';
  v_company jsonb := '{}'::jsonb;
  v_history jsonb := '{}'::jsonb;
begin
  if p_token is null or p_token !~ '^[0-9A-Za-z]{8,64}$' then
    return jsonb_build_object('error', 'not_found');
  end if;

  select * into v_card
  from public.online_account_cards
  where (public_slug = p_token or public_token = p_token) and is_active = true
  limit 1;
  if not found or not public.org_has_plan_feature(v_card.org_id, 'online_catalog', false) then
    return jsonb_build_object('error', 'not_found');
  end if;

  if v_card.entity_type = 'customer' then
    select to_jsonb(entity) into v_entity from public.customers entity where entity.id = v_card.entity_id and entity.org_id = v_card.org_id;
  elsif v_card.entity_type = 'supplier' then
    select to_jsonb(entity) into v_entity from public.suppliers entity where entity.id = v_card.entity_id and entity.org_id = v_card.org_id;
  else
    select to_jsonb(entity) into v_entity from public.employees entity where entity.id = v_card.entity_id and entity.org_id = v_card.org_id;
  end if;
  if v_entity is null then return jsonb_build_object('error', 'not_found'); end if;

  v_name := coalesce(
    nullif(btrim(v_entity ->> 'full_name'), ''),
    nullif(btrim(v_entity ->> 'business_name'), ''),
    nullif(btrim(v_entity ->> 'legal_name'), ''),
    nullif(btrim(concat_ws(' ', v_entity ->> 'first_name', v_entity ->> 'last_name')), ''),
    nullif(btrim(v_entity ->> 'system_code'), ''),
    case v_card.entity_type when 'customer' then 'مشتری' when 'supplier' then 'تامین‌کننده' else 'کارمند' end
  );
  select jsonb_strip_nulls(jsonb_build_object(
    'company_name', coalesce(company_full_name, company_name, trade_name),
    'trade_name', trade_name,
    'logo_url', logo_url,
    'currency_label', currency_label
  )) into v_company
  from public.company_settings
  where org_id = v_card.org_id
  order by updated_at desc
  limit 1;

  v_history := public._get_operational_financial_history(v_card.org_id, v_card.entity_type, v_card.entity_id);
  return jsonb_build_object(
    'card', jsonb_build_object(
      'title', v_card.title,
      'entity_type', v_card.entity_type,
      'entity_name', v_name,
      'public_link', v_card.public_link
    ),
    'company', coalesce(v_company, '{}'::jsonb),
    'rows', coalesce(v_history -> 'rows', '[]'::jsonb),
    'summary', coalesce(v_history -> 'summary', '{}'::jsonb)
  );
end;
$$;

revoke all on function public.get_public_online_account_card(text) from public, authenticated;
grant execute on function public.get_public_online_account_card(text) to anon;

-- ویزارد تنها محل اتصال مساعده به فیش است. هر مساعدهٔ قطعی دقیقاً یک ردیف
-- پرداختِ دارای relation می‌سازد؛ مبلغ یا اقلام ارسالی از مرورگر مرجع نیستند.
create or replace function public.create_payroll_slip_from_wizard(
  p_payload jsonb,
  p_ledger_entry_ids uuid[] default array[]::uuid[],
  p_bonus_request_ids uuid[] default array[]::uuid[],
  p_penalty_request_ids uuid[] default array[]::uuid[],
  p_advance_ids uuid[] default array[]::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_employee_id uuid := nullif(trim(p_payload ->> 'employee_id'), '')::uuid;
  v_period_start date := nullif(trim(p_payload ->> 'period_start'), '')::date;
  v_period_end date := nullif(trim(p_payload ->> 'period_end'), '')::date;
  v_ledger_ids uuid[] := array[]::uuid[];
  v_advance_ids uuid[] := array[]::uuid[];
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_scope_token uuid := gen_random_uuid();
  v_slip_id uuid;
  v_verified_count integer;
  v_requested_count integer;
  v_advance_payments jsonb := '[]'::jsonb;
  v_clean_lines jsonb := '[]'::jsonb;
  v_existing_non_advance_payments jsonb := '[]'::jsonb;
begin
  if v_org_id is null or v_employee_id is null or v_period_start is null or v_period_end is null then
    raise exception 'invalid_payroll_wizard_payload';
  end if;
  if not public.current_user_has_role_permission_entry('payroll_slips', 'edit', null, true) then
    raise exception 'payroll_creation_not_allowed';
  end if;

  select coalesce(array_agg(distinct item), array[]::uuid[])
    into v_ledger_ids
  from unnest(coalesce(p_ledger_entry_ids, array[]::uuid[])) as item;
  select coalesce(array_agg(distinct item), array[]::uuid[])
    into v_advance_ids
  from unnest(coalesce(p_advance_ids, array[]::uuid[])) as item;

  select count(*) into v_requested_count
  from (select distinct value from unnest(v_advance_ids) as value) requested;
  select count(*) into v_verified_count
  from public.employee_advances advance
  where advance.org_id = v_org_id
    and advance.employee_id = v_employee_id
    and advance.id = any(v_advance_ids)
    and advance.related_payroll_slip_id is null
    and lower(coalesce(advance.status, '')) in ('paid', 'settled', 'completed', 'posted')
    and coalesce(advance.paid_amount, 0) > 0;
  if v_requested_count <> v_verified_count then
    raise exception 'payroll_advances_changed';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'row_key', 'advance_' || advance.id::text,
      'employee_advance_id', advance.id::text,
      'payment_type', 'credit',
      'status', 'paid',
      'date', advance.request_date,
      'amount', advance.paid_amount,
      'description', concat('تسویه با مساعده: ', coalesce(nullif(btrim(advance.system_code), ''), nullif(btrim(advance.name), ''), 'بدون عنوان')),
      'is_advance_settlement', true,
      '_readonly', true,
      '_lockedFields', jsonb_build_array('employee_advance_id', 'amount', 'payment_type', 'status')
    ) order by advance.request_date, advance.id
  ), '[]'::jsonb)
  into v_advance_payments
  from public.employee_advances advance
  where advance.org_id = v_org_id and advance.employee_id = v_employee_id and advance.id = any(v_advance_ids);

  select coalesce(jsonb_agg(line.value), '[]'::jsonb)
  into v_clean_lines
  from jsonb_array_elements(coalesce(v_payload -> 'lines', '[]'::jsonb)) line(value)
  where lower(coalesce(line.value ->> 'key', '')) <> 'employee_advance'
    and nullif(trim(coalesce(line.value -> 'metadata' ->> 'employee_advance_id', '')), '') is null;

  select coalesce(jsonb_agg(payment.value), '[]'::jsonb)
  into v_existing_non_advance_payments
  from jsonb_array_elements(coalesce(v_payload -> 'payments', '[]'::jsonb)) payment(value)
  where nullif(trim(coalesce(payment.value ->> 'employee_advance_id', '')), '') is null;

  insert into public.payroll_source_mutation_scopes (scope_token, org_id, table_name, record_id)
  select v_scope_token, v_org_id, source.table_name, source.record_id
  from (
    select 'payroll_calculation_entries'::text as table_name, item as record_id from unnest(v_ledger_ids) as item
    union all select 'employee_bonus_requests'::text, item from unnest(coalesce(p_bonus_request_ids, array[]::uuid[])) as item
    union all select 'employee_penalty_requests'::text, item from unnest(coalesce(p_penalty_request_ids, array[]::uuid[])) as item
    union all select 'employee_advances'::text, item from unnest(v_advance_ids) as item
  ) source
  where source.record_id is not null
  on conflict do nothing;

  v_payload := v_payload || jsonb_build_object(
    'lines', v_clean_lines,
    'payments', v_existing_non_advance_payments || v_advance_payments,
    'performance_snapshot', coalesce(v_payload -> 'performance_snapshot', '{}'::jsonb)
      || jsonb_build_object(
        'payroll_ledger_entry_ids', to_jsonb(v_ledger_ids),
        'employee_advance_ids', to_jsonb(v_advance_ids)
      )
  );

  v_slip_id := public._create_payroll_slip_from_wizard_internal(
    v_payload, v_ledger_ids, p_bonus_request_ids, p_penalty_request_ids, v_advance_ids
  );

  delete from public.payroll_source_mutation_scopes where scope_token = v_scope_token;
  return v_slip_id;
end;
$$;

revoke all on function public.create_payroll_slip_from_wizard(jsonb, uuid[], uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.create_payroll_slip_from_wizard(jsonb, uuid[], uuid[], uuid[], uuid[]) to authenticated;

-- تبدیل سوابقی که ویزارد قبلی، مساعده را در اقلام کسور نوشته بود. فقط
-- مساعده‌های واقعاً پرداخت‌شده منتقل می‌شوند و trigger، همهٔ جمع‌ها را دوباره
-- از ساختار صحیح می‌سازد. در این بازسازی کوتاه‌مدت فقط قفلِ ویرایش کاربر
-- غیرفعال است؛ trigger محاسبهٔ جمع‌ها همچنان فعال می‌ماند و در همان تراکنش
-- بلافاصله دوباره فعال می‌شود.
do $$
begin
  if exists (
    select 1
    from pg_trigger trigger_row
    join pg_class table_row on table_row.oid = trigger_row.tgrelid
    join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
    where schema_row.nspname = 'public'
      and table_row.relname = 'payroll_slips'
      and trigger_row.tgname = 'trg_prevent_locked_record_mutation'
      and not trigger_row.tgisinternal
  ) then
    alter table public.payroll_slips disable trigger trg_prevent_locked_record_mutation;
  end if;
end;
$$;

with legacy_slips as (
  select p.id, p.org_id, p.employee_id,
    coalesce((
      select jsonb_agg(line.value)
      from jsonb_array_elements(coalesce(p.lines, '[]'::jsonb)) line(value)
      where lower(coalesce(line.value ->> 'key', '')) <> 'employee_advance'
        and nullif(trim(coalesce(line.value -> 'metadata' ->> 'employee_advance_id', '')), '') is null
    ), '[]'::jsonb) clean_lines,
    coalesce((
      select jsonb_agg(payment.value)
      from jsonb_array_elements(coalesce(p.payments, '[]'::jsonb)) payment(value)
      where nullif(trim(coalesce(payment.value ->> 'employee_advance_id', '')), '') is null
    ), '[]'::jsonb) existing_payments,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'row_key', 'advance_' || advance.id::text,
        'employee_advance_id', advance.id::text,
        'payment_type', 'credit',
        'status', 'paid',
        'date', advance.request_date,
        'amount', advance.paid_amount,
        'description', concat('تسویه با مساعده: ', coalesce(nullif(btrim(advance.system_code), ''), nullif(btrim(advance.name), ''), 'بدون عنوان')),
        'is_advance_settlement', true,
        '_readonly', true,
        '_lockedFields', jsonb_build_array('employee_advance_id', 'amount', 'payment_type', 'status')
      ) order by advance.request_date, advance.id)
      from public.employee_advances advance
      where advance.org_id = p.org_id
        and advance.employee_id = p.employee_id
        and (
          advance.related_payroll_slip_id = p.id
          or advance.id::text in (
            select item.value
            from jsonb_array_elements_text(coalesce(p.performance_snapshot -> 'employee_advance_ids', '[]'::jsonb)) item(value)
          )
          or advance.id::text in (
            select nullif(trim(line.value -> 'metadata' ->> 'employee_advance_id'), '')
            from jsonb_array_elements(coalesce(p.lines, '[]'::jsonb)) line(value)
            where nullif(trim(line.value -> 'metadata' ->> 'employee_advance_id'), '') is not null
          )
        )
        and lower(coalesce(advance.status, '')) in ('paid', 'settled', 'completed', 'posted')
        and coalesce(advance.paid_amount, 0) > 0
    ), '[]'::jsonb) advance_payments
  from public.payroll_slips p
  where jsonb_array_length(coalesce(p.performance_snapshot -> 'employee_advance_ids', '[]'::jsonb)) > 0
    or exists (
      select 1
      from public.employee_advances advance
      where advance.org_id = p.org_id and advance.employee_id = p.employee_id
        and advance.related_payroll_slip_id = p.id
    )
    or exists (
      select 1
      from jsonb_array_elements(coalesce(p.lines, '[]'::jsonb)) line(value)
      where lower(coalesce(line.value ->> 'key', '')) = 'employee_advance'
        or nullif(trim(line.value -> 'metadata' ->> 'employee_advance_id'), '') is not null
    )
)
update public.payroll_slips payroll
set lines = legacy.clean_lines,
    payments = legacy.existing_payments || legacy.advance_payments,
    updated_at = now()
from legacy_slips legacy
where payroll.id = legacy.id and payroll.org_id = legacy.org_id;

do $$
begin
  if exists (
    select 1
    from pg_trigger trigger_row
    join pg_class table_row on table_row.oid = trigger_row.tgrelid
    join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
    where schema_row.nspname = 'public'
      and table_row.relname = 'payroll_slips'
      and trigger_row.tgname = 'trg_prevent_locked_record_mutation'
      and not trigger_row.tgisinternal
  ) then
    alter table public.payroll_slips enable trigger trg_prevent_locked_record_mutation;
  end if;
end;
$$;

create index if not exists idx_cash_bank_operations_org_customer_financial_history
  on public.cash_bank_operations(org_id, customer_id, operation_date desc)
  where customer_id is not null;
create index if not exists idx_cash_bank_operations_org_supplier_financial_history
  on public.cash_bank_operations(org_id, supplier_id, operation_date desc)
  where supplier_id is not null;
create index if not exists idx_cash_bank_operations_org_employee_financial_history
  on public.cash_bank_operations(org_id, employee_id, operation_date desc)
  where employee_id is not null;
create index if not exists idx_employee_advances_org_employee_financial_history
  on public.employee_advances(org_id, employee_id, request_date desc);
create index if not exists idx_payroll_slips_org_employee_financial_history
  on public.payroll_slips(org_id, employee_id, period_end desc);

notify pgrst, 'reload schema';

commit;
