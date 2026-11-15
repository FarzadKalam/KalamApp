create schema if not exists auth;
create table public.saas_ai_default_models(slot_key text primary key);
do $$ begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;
do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$;
do $$ begin if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
create function public.current_org_id() returns uuid language sql stable as $$ select nullif(current_setting('test.org',true),'')::uuid $$;
create function public.current_user_has_role_permission_entry(text,text,text,boolean) returns boolean language sql stable as $$
  select coalesce(current_setting('test.deny',true),'') <> coalesce($3,$1 || ':' || $2)
$$;
create table public.org_ai_usage_ledger(id uuid primary key,org_id uuid,user_id uuid,model text,capability text,agent_key text,status text,billed_amount_irt numeric,raw_cost_irt numeric,cached_input_tokens bigint,cache_savings_irt numeric,usage jsonb);
create table public.process_runs(id uuid primary key,org_id uuid);
create table public.process_run_stages(id uuid primary key,process_run_id uuid,status text,task_id uuid,assignee_user_id uuid,assignee_role_id uuid,planned_due_at timestamptz,started_at timestamptz,completed_at timestamptz,updated_at timestamptz);
create table public.tasks(id uuid primary key,org_id uuid,name text,description text,status text,priority text,start_date timestamptz,due_date timestamptz,assignee_id uuid,assignee_role_id uuid,assignee_type text,completed_at timestamptz,actual_start_at timestamptz,actual_end_at timestamptz,recurrence_info jsonb,updated_at timestamptz,updated_by uuid,process_run_id uuid,process_run_stage_id uuid);
alter table public.tasks add column source_template_id uuid,add column source_stage_sort_order integer,add column metadata jsonb default '{}';
alter table public.process_run_stages add column metadata jsonb default '{}',add column template_stage_id uuid;
create table public.process_templates(id uuid primary key,org_id uuid);
create table public.process_template_stages(id uuid primary key,template_id uuid,sort_order integer,metadata jsonb);
alter table public.process_templates enable row level security;
alter table public.process_template_stages enable row level security;
create policy tenant_templates on public.process_templates for select to authenticated using(org_id=public.current_org_id());
create policy tenant_template_stages on public.process_template_stages for select to authenticated using(exists(select 1 from public.process_templates t where t.id=template_id and t.org_id=public.current_org_id()));
grant select on public.process_templates,public.process_template_stages to authenticated;
alter table public.tasks enable row level security;
alter table public.process_runs enable row level security;
alter table public.process_run_stages enable row level security;
create policy tenant_tasks on public.tasks for all to authenticated using(org_id=public.current_org_id()) with check(org_id=public.current_org_id());
create policy tenant_runs on public.process_runs for select to authenticated using(org_id=public.current_org_id());
create policy tenant_stages on public.process_run_stages for all to authenticated using(exists(select 1 from public.process_runs r where r.id=process_run_id and r.org_id=public.current_org_id())) with check(exists(select 1 from public.process_runs r where r.id=process_run_id and r.org_id=public.current_org_id()));
grant usage on schema public,auth to authenticated,service_role;
grant select,update on public.tasks,public.process_run_stages to authenticated;
grant select on public.process_runs to authenticated;
grant select on public.org_ai_usage_ledger to service_role;
insert into public.org_ai_usage_ledger
select md5(i::text)::uuid,'10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','model','record_chat','project_process','finalized',2,1,10,1,'{"total_tokens":50}' from generate_series(1,725)i;
insert into public.org_ai_usage_ledger values('90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',null,'other','record_chat',null,'finalized',20,10,0,0,'{}');
insert into public.org_ai_usage_ledger values('90000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',null,'model','record_chat',null,'failed',999,999,0,0,'{}');
alter table public.org_ai_usage_ledger add column created_at timestamptz default '2026-11-15T00:00:00Z';
update public.org_ai_usage_ledger set usage=jsonb_build_object('usage',usage);
insert into public.process_runs values('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into public.process_run_stages(id,process_run_id,status) values('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','todo');
insert into public.tasks(id,org_id,name,status,priority,recurrence_info,updated_at,process_run_id,process_run_stage_id) values
('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','فعالیت','todo','medium',
'{"process_task_custom_fields":[{"key":"report","requiredForStatus":"done"},{"key":"second"}],"process_task_custom_field_values":{"second":"preserved"},"process_links":{"projects":"keep"},"automation_rules":[{"type":"keep"}]}','2026-01-01T00:00:00Z','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001');
