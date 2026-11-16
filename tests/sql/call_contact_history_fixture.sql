-- Isolated test database; extends the existing VoIP fixture.
create function public.get_current_organization_context() returns jsonb language sql stable as $$
 select jsonb_build_object('permissions',coalesce(nullif(current_setting('test.permissions',true),''),'{}')::jsonb)
$$;
create table public.customers(id uuid primary key,org_id uuid not null,full_name text);
create table public.invoices(id uuid primary key default gen_random_uuid(),org_id uuid not null,customer_id uuid,name text,system_code text,status text,invoice_date date,remaining_balance numeric,total_invoice_amount numeric,total_received_amount numeric,payments jsonb,created_at timestamptz,updated_at timestamptz,is_deleted boolean);
alter table public.customers enable row level security;
alter table public.invoices enable row level security;
create policy customer_org on public.customers to authenticated using(org_id=public.current_org_id());
create policy invoice_org on public.invoices to authenticated using(org_id=public.current_org_id());
grant select on public.customers,public.invoices to authenticated;
insert into public.customers values('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','مخاطب آزمون');
insert into public.invoices(org_id,customer_id,name,status,remaining_balance,total_invoice_amount,created_at,updated_at,is_deleted)
 select '10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','فاکتور '||i,
 case when i=1 then 'proforma' when i=2 then 'settled' when i=3 then 'completed' else 'created' end,
 case when i in(2,3)then 0 else 100 end,100,now()-i*interval '1 minute',now()-i*interval '1 minute',false from generate_series(1,21)i;
-- A newer creation date than update date must still place this first.
update public.invoices set created_at=now()+interval '1 minute' where name='فاکتور 21';
insert into public.invoices(org_id,customer_id,name,status,remaining_balance,created_at,updated_at,is_deleted) values
 ('10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','نباید دیده شود','settled',0,now(),now(),false),
 ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','حذف‌شده','settled',0,now(),now(),true);
