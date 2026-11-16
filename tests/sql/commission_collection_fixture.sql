-- Disposable database only. Minimal dependencies of the real phase-586 save RPC.
do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; end $$;
do $$ begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function current_org_id() returns uuid language sql stable as $$ select nullif(current_setting('test.org',true),'')::uuid $$;
create function current_user_has_role_permission_entry(text,text,text,boolean) returns boolean language sql stable as $$
 select coalesce(current_setting('test.permission',true),'yes')='yes' $$;
create function org_has_plan_feature(uuid,text,boolean) returns boolean language sql stable as $$
 select $1 is not null and coalesce(current_setting('test.plan',true),'yes')='yes' $$;
create function current_org_has_plan_feature(text,boolean) returns boolean language sql stable as $$ select org_has_plan_feature(current_org_id(),$1,$2) $$;
create function release_orphaned_payroll_sources(uuid) returns void language sql as $$ select $$;
create table saas_plans(code text,is_demo_default boolean,enabled_features jsonb);
create table organizations(id uuid primary key);
create table employees(id uuid primary key,org_id uuid not null references organizations);
create table cheques(id uuid primary key,org_id uuid not null references organizations,status text,cleared_at timestamptz,spent_date date,serial_no text,updated_at timestamptz default now());
create table invoices(id uuid primary key,org_id uuid not null references organizations,payments jsonb default '[]');
create table cash_bank_operations(id uuid primary key default gen_random_uuid(),org_id uuid not null,sales_invoice_id uuid,cheque_id uuid,operation_type text);
create table payroll_calculation_entries(
 id uuid primary key default gen_random_uuid(),org_id uuid not null references organizations,employee_id uuid not null references employees,
 period_start date not null,period_end date not null,entry_type text,source_type text,source_key text,source_module_id text,source_record_id uuid,
 title text,amount numeric,quantity numeric,rate numeric,status text,assignee_id uuid,payroll_slip_id uuid,details jsonb default '{}',updated_at timestamptz default clock_timestamp());
create table commission_drafts(
 id uuid primary key default gen_random_uuid(),org_id uuid not null,source_key text,employee_id uuid,assignee_id uuid,period_start date,period_end date,
 source_basis text,percent_mode text,eligibility_event_type text,eligibility_event_at timestamptz,invoice_id uuid,invoice_item_key text,
 entitled_amount numeric,posted_amount numeric,remaining_amount numeric,decision_status text,decision_reason text,deferred_from_period date,deferred_to_period date,
 manual_decision_by uuid,manual_decision_at timestamptz,draft_status text,details jsonb,updated_at timestamptz);
create unique index on commission_drafts(source_key) where source_key is not null;
insert into organizations values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into employees values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002');
insert into cheques(id,org_id,status,cleared_at,serial_no) values
 ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','cleared','2026-05-12','TEST-A'),
 ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','cleared','2026-05-12','TEST-B');
insert into invoices values('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','[{"cheque_id":"20000000-0000-0000-0000-000000000001"}]'),
 ('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','[{"cheque_id":"20000000-0000-0000-0000-000000000002"}]');
insert into payroll_calculation_entries(id,org_id,employee_id,period_start,period_end,source_type,source_key,title,amount,status,details) values
 ('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2026-05-01','2026-05-31','commission','seed-a','سابقهٔ الف',100000,'proposed',
 '{"rows":[{"invoice_id":"30000000-0000-0000-0000-000000000001","cheque_payments":[{"cheque_id":"20000000-0000-0000-0000-000000000001"}]}]}'),
 ('40000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','2026-05-01','2026-05-31','commission','seed-b','سابقهٔ ب',200000,'proposed',
 '{"invoice_id":"30000000-0000-0000-0000-000000000002"}');

create function test_assert(condition boolean,message text) returns void language plpgsql as $$ begin
 if condition is not true then raise exception 'ASSERTION: %',message; end if; end $$;
create function test_expect_error(statement text,expected text) returns void language plpgsql as $$ begin
 begin execute statement;
 exception when others then
   if position(expected in sqlerrm)>0 then return; end if;
   raise exception 'Expected %, got %',expected,sqlerrm;
 end;
 raise exception 'Expected error % but statement succeeded',expected;
end $$;
create function test_commission_snapshot(p_employee uuid) returns jsonb language sql as $$
 select jsonb_build_object('basis','prepaid_and_settled_invoices','percent_mode','product_default','ledger_snapshot',
 coalesce((select jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at) order by id) from payroll_calculation_entries
   where org_id=current_org_id() and employee_id=p_employee and source_type='commission' and status<>'voided'),'[]'::jsonb),'cheque_snapshot','[]'::jsonb) $$;
create function test_save_commission(p_source text,p_employee uuid,p_snapshot jsonb,p_start date default '2026-06-01') returns uuid language plpgsql as $$ begin
 return save_commission_calculation(jsonb_build_object('employee_id',p_employee,'period_start',p_start,'period_end',(p_start+interval '1 month - 1 day')::date,
 'source_key',p_source,'title','آزمون','amount',100000,'status','proposed','details',p_snapshot),'[]');
end $$;
grant usage on schema public to authenticated;
