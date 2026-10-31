-- Isolated regression database only. Never run this fixture against an application database.
create role authenticated;
create role anon;
create function public.current_org_id() returns uuid language sql stable as $$
  select nullif(current_setting('test.current_org', true), '')::uuid;
$$;
create table bank_accounts (id uuid primary key, org_id uuid not null, bank_name text, account_number text, opening_balance numeric default 0, created_at timestamptz default now());
create table cash_boxes (id uuid primary key, org_id uuid not null, name text, code text, opening_balance numeric default 0, created_at timestamptz default now());
create table petty_funds (like cash_boxes including all);
create table customers (id uuid primary key, org_id uuid not null, first_name text, last_name text, business_name text, system_code text, previous_system_balance_total numeric default 0, created_at timestamptz default now());
create table suppliers (id uuid primary key, org_id uuid not null, full_name text, business_name text, system_code text, previous_system_balance_total numeric default 0, created_at timestamptz default now());
create table profiles (id uuid primary key, org_id uuid not null, first_name text, last_name text, full_name text);
create table employees (id uuid primary key, org_id uuid not null, first_name text, last_name text, system_code text, previous_system_balance_total numeric default 0, created_at timestamptz default now());
create table invoices (id uuid primary key, org_id uuid not null, name text, system_code text, customer_id uuid, supplier_id uuid, invoice_date date, payments jsonb default '[]', created_at timestamptz default now());
create table purchase_invoices (like invoices including all);
create table cheques (id uuid primary key, org_id uuid not null, amount numeric, bank_account_id uuid, cheque_type text, due_date date, issue_date date, notes text, party_id uuid, party_type text, sayad_id text, serial_no text, status text, created_at timestamptz default now());
create table barters (id uuid primary key, org_id uuid not null, barter_date date, barter_type text, customer_id uuid, employee_id uuid, notes text, remaining_amount numeric, source_invoice_id uuid, source_purchase_invoice_id uuid, status text, supplier_id uuid, created_at timestamptz default now());
create table cash_bank_operations (
  id uuid primary key, org_id uuid not null, operation_type text, payment_type text, status text, operation_date date,
  amount numeric, description text, metadata jsonb default '{}', created_at timestamptz default now(),
  bank_account_id uuid, cash_box_id uuid, petty_fund_id uuid, cheque_id uuid, customer_id uuid, employee_id uuid, supplier_id uuid,
  employee_advance_id uuid, expense_document_id uuid, payroll_slip_id uuid, purchase_invoice_id uuid, sales_invoice_id uuid,
  payment_bank_account_id uuid, payment_cash_box_id uuid, payment_petty_fund_id uuid,
  receipt_bank_account_id uuid, receipt_cash_box_id uuid, receipt_petty_fund_id uuid
);
do $$ declare t text; begin
  foreach t in array array['bank_accounts','cash_boxes','petty_funds','customers','suppliers','profiles','employees','invoices','purchase_invoices','cheques','barters','cash_bank_operations'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant_read on %I for select to authenticated using (org_id = public.current_org_id())', t);
    execute format('grant select on %I to authenticated', t);
    execute format('create index on %I (org_id)', t);
  end loop;
end $$;
insert into cash_bank_operations(id,org_id,operation_type,payment_type,status,operation_date,amount,description) values
 ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','receipt','cash','received','2026-10-01',100.10,'match'),
 ('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','payment','bank','paid','2026-10-02',50.25,'match'),
 ('00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','receipt','cash','pending','2026-09-01',10,'old'),
 ('00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','transfer','transfer','received','2026-10-03',500,'internal'),
 ('00000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002','receipt','cash','received','2026-10-01',9000,'other tenant');
insert into invoices(id,org_id,name,invoice_date,payments) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','sale','2026-09-01','[{"amount":"200.20","payment_type":"cash","status":"received","date":"2026-10-04","description":"match"}]');
insert into purchase_invoices(id,org_id,name,invoice_date,payments) values
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','purchase','2026-10-01','[{"amount":"75.75","payment_type":"bank","status":"paid","date":"2026-10-05","description":"match"}]');
insert into bank_accounts(id,org_id,bank_name,opening_balance) values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','bank',1000);
insert into cheques(id,org_id,amount,cheque_type,due_date,status) values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',300,'received','2026-10-06','new');
insert into barters(id,org_id,remaining_amount,barter_date,status) values
 ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',20,'2026-10-06','open');
