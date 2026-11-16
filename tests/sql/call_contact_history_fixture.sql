-- Isolated test database; extends the existing VoIP fixture.
create schema if not exists auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
grant usage on schema auth to authenticated;
create function public.get_current_organization_context() returns jsonb language sql stable as $$
 select jsonb_build_object('permissions',coalesce(nullif(current_setting('test.permissions',true),''),'{}')::jsonb)
$$;
create table public.customers(id uuid primary key default gen_random_uuid(),org_id uuid not null,full_name text,first_name text,last_name text,business_name text,mobile_1 text,mobile_2 text,phone text,rank text,created_at timestamptz default now(),updated_at timestamptz default now(),assignee_type text,assignee_id uuid,assignee_role_id uuid);
create function public.kalam_phone_lookup_key(text) returns text language sql immutable as $$select regexp_replace($1,'[^0-9]','','g')$$;
create table public.phone_numbers(id uuid,org_id uuid,lookup_key text);
create table public.phone_number_links(org_id uuid,entity_type text,entity_id uuid,source_field text,phone_number_id uuid);
grant select on public.phone_numbers,public.phone_number_links to authenticated;
create table public.projects(id uuid,org_id uuid,customer_id uuid,owner_id uuid,source_purchase_invoice_id uuid,name text,system_code text,status text,start_date date,due_date date,progress_percent numeric,created_at timestamptz,updated_at timestamptz);
create table public.purchase_invoices(id uuid,org_id uuid,supplier_id uuid,project_id uuid,name text,system_code text,status text,invoice_date date,total_invoice_amount numeric,total_received_amount numeric,remaining_balance numeric,payments jsonb,created_at timestamptz,updated_at timestamptz);
create table public.tasks(id uuid,org_id uuid,name text,system_code text,status text,due_date timestamptz,assignee_id uuid,related_customer uuid,related_supplier uuid,source_module_id text,source_record_id uuid,project_id uuid,created_at timestamptz,updated_at timestamptz);
create table public.process_runs(id uuid,org_id uuid,process_name text,system_code text,status text,started_at timestamptz,completed_at timestamptz,module_id text,record_id uuid,created_at timestamptz,updated_at timestamptz);
create table public.counterparty_bot_groups(id uuid,org_id uuid,customer_id uuid,supplier_id uuid,employee_id uuid,group_title text,channel_type text,status text,last_inbound_at timestamptz,created_at timestamptz,updated_at timestamptz);
create table public.sms_delivery_reports(id uuid,org_id uuid,title text,message_text text,status text,direction text,sent_at timestamptz,created_at timestamptz,updated_at timestamptz,related_module_id text,related_record_id uuid,customer_id uuid,phone_number_id uuid);
create table public.email_messages(id uuid,org_id uuid,subject text,status text,direction text,message_at timestamptz,created_at timestamptz,related_module_id text,related_record_id uuid);
create table public.voip_call_logs(id uuid,org_id uuid,title text,direction text,status text,started_at timestamptz,talk_seconds int,created_at timestamptz,updated_at timestamptz,related_module_id text,related_record_id uuid,module_id text,record_id text,phone_number_id uuid);
do $$declare t text;begin foreach t in array array['projects','purchase_invoices','tasks','process_runs','counterparty_bot_groups','sms_delivery_reports','email_messages','voip_call_logs']loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy fixture_org on public.%I to authenticated using(org_id=public.current_org_id())',t);
 execute format('grant select on public.%I to authenticated',t);
end loop;end$$;
create table public.invoices(id uuid primary key default gen_random_uuid(),org_id uuid not null,customer_id uuid,name text,system_code text,status text,invoice_date date,remaining_balance numeric,total_invoice_amount numeric,total_received_amount numeric,payments jsonb,created_at timestamptz,updated_at timestamptz,is_deleted boolean);
alter table public.invoices add column assignee_id uuid,add column assignee_type text,add column assignee_role_id uuid;
alter table public.customers enable row level security;
alter table public.invoices enable row level security;
create policy customer_org on public.customers to authenticated using(org_id=public.current_org_id());
create policy invoice_org on public.invoices to authenticated using(org_id=public.current_org_id());
grant select on public.customers,public.invoices to authenticated;
insert into public.customers(id,org_id,full_name,assignee_type,assignee_id) values('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','مخاطب آزمون','user','20000000-0000-4000-8000-000000000001');
insert into public.customers(org_id,full_name,created_at,updated_at) select '10000000-0000-4000-8000-000000000001','مخاطب دیگر',now()+interval '1 day',now()+interval '1 day' from generate_series(1,21);
insert into public.invoices(org_id,customer_id,name,status,remaining_balance,total_invoice_amount,created_at,updated_at,is_deleted)
 select '10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','فاکتور '||i,
 case when i=1 then 'proforma' when i=2 then 'settled' when i=3 then 'completed' else 'created' end,
 case when i in(2,3)then 0 else 100 end,100,now()-i*interval '1 minute',now()-i*interval '1 minute',false from generate_series(1,21)i;
-- A newer creation date than update date must still place this first.
update public.invoices set created_at=now()+interval '1 minute' where name='فاکتور 21';
update public.invoices set assignee_type='user',assignee_id='20000000-0000-4000-8000-000000000001' where name in('فاکتور 1','فاکتور 2','فاکتور 3');
insert into public.invoices(org_id,customer_id,name,status,remaining_balance,created_at,updated_at,is_deleted) values
 ('10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','نباید دیده شود','settled',0,now(),now(),false),
 ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','حذف‌شده','settled',0,now(),now(),true);
