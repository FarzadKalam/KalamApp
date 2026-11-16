-- Isolated PostgreSQL test only.
do $$begin create role service_role;exception when duplicate_object then null;end$$;
create function public.current_org_id() returns uuid language sql stable as $$select nullif(current_setting('test.org',true),'')::uuid$$;
create table public.organizations(id uuid primary key);
create table public.profiles(id uuid primary key);
create table public.voip_sip_endpoints(id uuid primary key,org_id uuid,assignee_profile_id uuid,extension text,display_name text,sip_secret text,metadata jsonb,is_active boolean,updated_at timestamptz default now());
insert into organizations values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into profiles values ('20000000-0000-4000-8000-000000000001');
insert into voip_sip_endpoints values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','101','اپراتور','fixture-secret','{"provider":"telefonchy","wss_url":"192.0.2.10","sip_domain":"pbx.example.test"}',true,now()),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','102','اپراتور','fixture-other-secret','{"provider":"telefonchy","wss_url":"wss://pbx.example.test/socket","sip_domain":"pbx.example.test"}',true,now()),
 ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',null,'103','داخلی محلی','fixture-local-secret','{}',true,now());
