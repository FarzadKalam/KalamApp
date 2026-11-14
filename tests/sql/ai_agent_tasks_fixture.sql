create extension if not exists pgcrypto;
do $$ begin
  if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema if not exists auth;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role',true),'');
$$;
create or replace function public.current_org_id() returns uuid language sql stable as $$
  select nullif(current_setting('test.org_id',true),'')::uuid;
$$;
create table public.workflows (
  id uuid primary key, org_id uuid not null, agent_key text, name text, description text,
  module_id text, created_by uuid, updated_by uuid, created_at timestamptz default now(), updated_at timestamptz default now(),
  is_active boolean default true, trigger_type text, last_run_at timestamptz, server_queued_at timestamptz
);
create table public.workflow_interval_jobs (
  id uuid primary key default gen_random_uuid(), org_id uuid not null,
  job_kind text, dedupe_key text unique, workflow_id uuid, module_id text, record_id uuid,
  scheduled_due_at timestamptz, action_index integer, is_terminal_action boolean, max_attempts integer, payload jsonb
);
alter table public.workflows enable row level security;
create policy workflow_org_access on public.workflows to authenticated
using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
grant usage on schema public,auth to authenticated,service_role;
grant select,insert,update on public.workflows to authenticated;
