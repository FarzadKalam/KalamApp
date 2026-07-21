-- مبنای دریافت واقعی پورسانت و مانده اول دوره مشترک اشخاص
-- قابل اجرا به‌صورت تکراری و محدود به سازمان جاری

begin;

-- مشتری از قبل این فیلدها را دارد؛ افزودن تکراری برای نصب‌های قدیمی نیز بی‌خطر است.
alter table if exists public.customers
  add column if not exists previous_system_first_purchase_date date,
  add column if not exists previous_system_invoice_total numeric not null default 0,
  add column if not exists previous_system_paid_total numeric not null default 0,
  add column if not exists previous_system_balance_total numeric not null default 0;

alter table if exists public.suppliers
  add column if not exists previous_system_first_purchase_date date,
  add column if not exists previous_system_invoice_total numeric not null default 0,
  add column if not exists previous_system_paid_total numeric not null default 0,
  add column if not exists previous_system_balance_total numeric not null default 0;

alter table if exists public.employees
  add column if not exists previous_system_first_purchase_date date,
  add column if not exists previous_system_invoice_total numeric not null default 0,
  add column if not exists previous_system_paid_total numeric not null default 0,
  add column if not exists previous_system_balance_total numeric not null default 0;

-- از ایجاد هم‌زمان دو محاسبه باز برای یک دوره و مبنای پورسانت جلوگیری می‌کند.
-- ردیف‌های واردشده در فیش حفظ می‌شوند تا تاریخچه فیش هرگز تغییر نکند.
create unique index if not exists ux_payroll_calculation_entries_open_commission_source
  on public.payroll_calculation_entries(org_id, source_type, employee_id, source_key)
  where source_type = 'commission'
    and source_key is not null
    and status in ('draft', 'proposed');

create index if not exists idx_expense_documents_customer_financial_history
  on public.expense_documents(org_id, customer_id, expense_date)
  where customer_id is not null;
create index if not exists idx_expense_documents_supplier_financial_history
  on public.expense_documents(org_id, supplier_id, expense_date)
  where supplier_id is not null;
create index if not exists idx_expense_documents_employee_financial_history
  on public.expense_documents(org_id, employee_id, expense_date)
  where employee_id is not null;

commit;
