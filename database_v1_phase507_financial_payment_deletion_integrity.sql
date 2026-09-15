-- حذف سندهای مالی باید دریافت/پرداخت وابسته را نیز حذف کند؛ این trigger برای
-- مسیرهای قدیمی یا هر حذف مستقیم هم همان تضمین را برقرار می‌کند.
-- داده‌های یتیم قبلی نیز به سطل بازیافت منتقل و خلاصهٔ مشتریان از دفتر مرکزی
-- دوباره محاسبه می‌شود. اجرای migration تکراری بی‌اثر است.

begin;

create or replace function public.recycle_cash_bank_operations_before_financial_source_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operation_ids uuid[];
begin
  select coalesce(array_agg(operation.id), array[]::uuid[])
  into v_operation_ids
  from public.cash_bank_operations operation
  where operation.org_id = old.org_id
    and (
      (tg_table_name = 'invoices' and operation.sales_invoice_id = old.id)
      or (tg_table_name = 'purchase_invoices' and operation.purchase_invoice_id = old.id)
      or (tg_table_name = 'expense_documents' and operation.expense_document_id = old.id)
      or (tg_table_name = 'employee_advances' and operation.employee_advance_id = old.id)
      or (tg_table_name = 'payroll_slips' and operation.payroll_slip_id = old.id)
      or (
        case tg_table_name
          when 'invoices' then operation.sales_invoice_id is null
          when 'purchase_invoices' then operation.purchase_invoice_id is null
          when 'expense_documents' then operation.expense_document_id is null
          when 'employee_advances' then operation.employee_advance_id is null
          when 'payroll_slips' then operation.payroll_slip_id is null
          else false
        end
        and trim(coalesce(operation.metadata ->> 'source_table', '')) = tg_table_name
        and trim(coalesce(operation.metadata ->> 'source_record_id', '')) = old.id::text
      )
    );

  if coalesce(array_length(v_operation_ids, 1), 0) > 0 then
    perform public.move_records_to_recycle_bin(
      'cash_bank_operations',
      'cash_bank_operations',
      v_operation_ids,
      null,
      null,
      old.org_id
    );
  end if;

  return old;
end;
$$;

drop trigger if exists trg_recycle_cash_bank_operations_before_invoice_delete on public.invoices;
create trigger trg_recycle_cash_bank_operations_before_invoice_delete
  before delete on public.invoices
  for each row execute function public.recycle_cash_bank_operations_before_financial_source_delete();

drop trigger if exists trg_recycle_cash_bank_operations_before_purchase_invoice_delete on public.purchase_invoices;
create trigger trg_recycle_cash_bank_operations_before_purchase_invoice_delete
  before delete on public.purchase_invoices
  for each row execute function public.recycle_cash_bank_operations_before_financial_source_delete();

drop trigger if exists trg_recycle_cash_bank_operations_before_expense_document_delete on public.expense_documents;
create trigger trg_recycle_cash_bank_operations_before_expense_document_delete
  before delete on public.expense_documents
  for each row execute function public.recycle_cash_bank_operations_before_financial_source_delete();

drop trigger if exists trg_recycle_cash_bank_operations_before_employee_advance_delete on public.employee_advances;
create trigger trg_recycle_cash_bank_operations_before_employee_advance_delete
  before delete on public.employee_advances
  for each row execute function public.recycle_cash_bank_operations_before_financial_source_delete();

drop trigger if exists trg_recycle_cash_bank_operations_before_payroll_slip_delete on public.payroll_slips;
create trigger trg_recycle_cash_bank_operations_before_payroll_slip_delete
  before delete on public.payroll_slips
  for each row execute function public.recycle_cash_bank_operations_before_financial_source_delete();

-- عملیات خودکارِ باقی‌مانده از سندی که دیگر وجود ندارد، نباید در نقد و بانک یا
-- دفتر شخص محاسبه شود. فقط وابستگی‌های منقضی‌شده جابه‌جا می‌شوند، نه عملیات مستقیم.
do $$
declare
  v_org_id uuid;
  v_operation_ids uuid[];
begin
  for v_org_id in
    select distinct operation.org_id
    from public.cash_bank_operations operation
    where operation.org_id is not null
      and (
        (operation.sales_invoice_id is not null and not exists (
          select 1 from public.invoices invoice where invoice.org_id = operation.org_id and invoice.id = operation.sales_invoice_id
        ))
        or (operation.purchase_invoice_id is not null and not exists (
          select 1 from public.purchase_invoices invoice where invoice.org_id = operation.org_id and invoice.id = operation.purchase_invoice_id
        ))
        or (operation.expense_document_id is not null and not exists (
          select 1 from public.expense_documents document where document.org_id = operation.org_id and document.id = operation.expense_document_id
        ))
        or (operation.employee_advance_id is not null and not exists (
          select 1 from public.employee_advances advance where advance.org_id = operation.org_id and advance.id = operation.employee_advance_id
        ))
        or (operation.payroll_slip_id is not null and not exists (
          select 1 from public.payroll_slips payroll where payroll.org_id = operation.org_id and payroll.id = operation.payroll_slip_id
        ))
        or (
          operation.sales_invoice_id is null
          and trim(coalesce(operation.metadata ->> 'source_table', '')) = 'invoices'
          and nullif(trim(coalesce(operation.metadata ->> 'source_record_id', '')), '') is not null
          and not exists (
            select 1 from public.invoices invoice
            where invoice.org_id = operation.org_id and invoice.id::text = operation.metadata ->> 'source_record_id'
          )
        )
        or (
          operation.purchase_invoice_id is null
          and trim(coalesce(operation.metadata ->> 'source_table', '')) = 'purchase_invoices'
          and nullif(trim(coalesce(operation.metadata ->> 'source_record_id', '')), '') is not null
          and not exists (
            select 1 from public.purchase_invoices invoice
            where invoice.org_id = operation.org_id and invoice.id::text = operation.metadata ->> 'source_record_id'
          )
        )
        or (
          operation.expense_document_id is null
          and trim(coalesce(operation.metadata ->> 'source_table', '')) = 'expense_documents'
          and nullif(trim(coalesce(operation.metadata ->> 'source_record_id', '')), '') is not null
          and not exists (
            select 1 from public.expense_documents document
            where document.org_id = operation.org_id and document.id::text = operation.metadata ->> 'source_record_id'
          )
        )
        or (
          operation.employee_advance_id is null
          and trim(coalesce(operation.metadata ->> 'source_table', '')) = 'employee_advances'
          and nullif(trim(coalesce(operation.metadata ->> 'source_record_id', '')), '') is not null
          and not exists (
            select 1 from public.employee_advances advance
            where advance.org_id = operation.org_id and advance.id::text = operation.metadata ->> 'source_record_id'
          )
        )
        or (
          operation.payroll_slip_id is null
          and trim(coalesce(operation.metadata ->> 'source_table', '')) = 'payroll_slips'
          and nullif(trim(coalesce(operation.metadata ->> 'source_record_id', '')), '') is not null
          and not exists (
            select 1 from public.payroll_slips payroll
            where payroll.org_id = operation.org_id and payroll.id::text = operation.metadata ->> 'source_record_id'
          )
        )
      )
  loop
    select coalesce(array_agg(operation.id), array[]::uuid[])
    into v_operation_ids
    from public.cash_bank_operations operation
    where operation.org_id = v_org_id
      and (
        (operation.sales_invoice_id is not null and not exists (select 1 from public.invoices invoice where invoice.org_id = operation.org_id and invoice.id = operation.sales_invoice_id))
        or (operation.purchase_invoice_id is not null and not exists (select 1 from public.purchase_invoices invoice where invoice.org_id = operation.org_id and invoice.id = operation.purchase_invoice_id))
        or (operation.expense_document_id is not null and not exists (select 1 from public.expense_documents document where document.org_id = operation.org_id and document.id = operation.expense_document_id))
        or (operation.employee_advance_id is not null and not exists (select 1 from public.employee_advances advance where advance.org_id = operation.org_id and advance.id = operation.employee_advance_id))
        or (operation.payroll_slip_id is not null and not exists (select 1 from public.payroll_slips payroll where payroll.org_id = operation.org_id and payroll.id = operation.payroll_slip_id))
        or (operation.sales_invoice_id is null and trim(coalesce(operation.metadata ->> 'source_table', '')) = 'invoices' and nullif(trim(coalesce(operation.metadata ->> 'source_record_id', '')), '') is not null and not exists (select 1 from public.invoices invoice where invoice.org_id = operation.org_id and invoice.id::text = operation.metadata ->> 'source_record_id'))
        or (operation.purchase_invoice_id is null and trim(coalesce(operation.metadata ->> 'source_table', '')) = 'purchase_invoices' and nullif(trim(coalesce(operation.metadata ->> 'source_record_id', '')), '') is not null and not exists (select 1 from public.purchase_invoices invoice where invoice.org_id = operation.org_id and invoice.id::text = operation.metadata ->> 'source_record_id'))
        or (operation.expense_document_id is null and trim(coalesce(operation.metadata ->> 'source_table', '')) = 'expense_documents' and nullif(trim(coalesce(operation.metadata ->> 'source_record_id', '')), '') is not null and not exists (select 1 from public.expense_documents document where document.org_id = operation.org_id and document.id::text = operation.metadata ->> 'source_record_id'))
        or (operation.employee_advance_id is null and trim(coalesce(operation.metadata ->> 'source_table', '')) = 'employee_advances' and nullif(trim(coalesce(operation.metadata ->> 'source_record_id', '')), '') is not null and not exists (select 1 from public.employee_advances advance where advance.org_id = operation.org_id and advance.id::text = operation.metadata ->> 'source_record_id'))
        or (operation.payroll_slip_id is null and trim(coalesce(operation.metadata ->> 'source_table', '')) = 'payroll_slips' and nullif(trim(coalesce(operation.metadata ->> 'source_record_id', '')), '') is not null and not exists (select 1 from public.payroll_slips payroll where payroll.org_id = operation.org_id and payroll.id::text = operation.metadata ->> 'source_record_id'))
      );
    if coalesce(array_length(v_operation_ids, 1), 0) > 0 then
      perform public.move_records_to_recycle_bin('cash_bank_operations', 'cash_bank_operations', v_operation_ids, null, null, v_org_id);
    end if;
  end loop;
end;
$$;

-- فیلدهای خلاصهٔ مشتری و کارت حساب آنلاین از همین دفتر مرکزی می‌آیند؛ پس بعد
-- از پاک‌سازی، تمام مقدارهای پیشین نیز یک‌بار با همان منبع بازسازی می‌شوند.
do $$
declare
  v_customer record;
begin
  for v_customer in select id, org_id from public.customers loop
    perform public._sync_customer_financial_stats_for_org(v_customer.org_id, v_customer.id);
  end loop;
end;
$$;

revoke all on function public.recycle_cash_bank_operations_before_financial_source_delete() from public, anon, authenticated;

commit;
