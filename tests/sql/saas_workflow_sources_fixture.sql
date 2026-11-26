-- Isolated CI database only.
create schema if not exists auth;
do $$begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end$$;
create function auth.role() returns text language sql as $$select current_setting('test.auth_role',true)$$;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.auth_uid',true),'')::uuid$$;
create function public.support_provider_org_id() returns uuid language sql as $$select '10000000-0000-4000-8000-000000000001'::uuid$$;
create table organizations(id uuid primary key,name text);
create table org_roles(id uuid primary key,org_id uuid,permissions jsonb);
create table profiles(id uuid primary key,org_id uuid,role_id uuid,is_active boolean,full_name text,email text,mobile text,mobile_1 text);
create table saas_org_settings(id uuid primary key,org_id uuid,trial_ends_at timestamptz);
create table saas_onboarding_requests(id uuid primary key,org_id uuid,full_name text,organization_name text,business_name text,mobile text,email text,requested_slug text,demo_url text,status text,is_demo_request boolean,failure_code text,created_at timestamptz,updated_at timestamptz);
create view saas_admin_org_candidates_view with (security_invoker=true) as
  select o.id,'org'::text source_kind,o.id org_id,o.name org_name,s.trial_ends_at from organizations o join saas_org_settings s on s.org_id=o.id;
create table invoices(id uuid primary key default gen_random_uuid(),org_id uuid not null,created_by uuid,updated_by uuid,name text not null,invoice_date date not null,status text,customer_id uuid,"invoiceItems" jsonb,description text,total_invoice_amount numeric,remaining_balance numeric);
create table customers(id uuid primary key,org_id uuid);
insert into organizations values(support_provider_org_id(),'provider'),('20000000-0000-4000-8000-000000000001','demo');
insert into saas_org_settings values('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',now()+interval '1 day');
insert into org_roles values('40000000-0000-4000-8000-000000000001',support_provider_org_id(),'{"__saas_admin":{"view":true,"fields":{"saas_workflows":true}}}');
insert into profiles(id,org_id,role_id,is_active) values('50000000-0000-4000-8000-000000000001',support_provider_org_id(),'40000000-0000-4000-8000-000000000001',true);
