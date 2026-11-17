-- Isolated CI database only.
create extension if not exists pgcrypto;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
create function public.current_org_id() returns uuid language sql stable as $$select nullif(current_setting('test.org',true),'')::uuid$$;
create table public.user_organization_memberships(org_id uuid,user_id uuid,role_id uuid,is_active boolean);
create table public.communication_read_cursors(org_id uuid,user_id uuid,channel text check(channel in ('internal','bot','sms','voip')),
 conversation_key text,read_through_at timestamptz,read_through_id text,updated_at timestamptz default now(),primary key(org_id,user_id,channel,conversation_key));
create table public.ai_threads(id uuid primary key,org_id uuid,user_id uuid,title text,agent_key text,selected_agents jsonb,
 shared_user_ids uuid[] default '{}',shared_role_ids uuid[] default '{}',metadata jsonb default '{}',status text default 'active',archived_at timestamptz,context_key text,created_at timestamptz default now());
create table public.ai_messages(id uuid primary key default gen_random_uuid(),org_id uuid,thread_id uuid,role text,content text,metadata jsonb default '{}',created_at timestamptz default now());
create table public.notes(id uuid primary key default gen_random_uuid(),org_id uuid,author_id uuid,author_name text,content text,metadata jsonb default '{}',mention_user_ids uuid[] default '{}',mention_role_ids uuid[] default '{}',created_at timestamptz default now());
create table public.notification_read_states(org_id uuid,user_id uuid,section text,source_type text,source_id text,read_at timestamptz,dismissed_at timestamptz);
create table public.notification_inbox_items(org_id uuid,section text,source_type text,source_id text);
insert into public.user_organization_memberships values
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',true),
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',true),
 ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001',true);
insert into public.ai_threads(id,org_id,user_id,title,agent_key) values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','owned','sales_leads'),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','private other user','sales_leads'),
 ('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','other org','sales_leads');
-- Old complete history must never become a new notification upon rollout.
insert into public.ai_messages(org_id,thread_id,role,content,created_at)
 values('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','assistant','old response',now()-interval '1 day');
-- A response started before rollout but completed afterwards must still notify.
insert into public.ai_messages(id,org_id,thread_id,role,content,metadata,created_at)
 values('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','assistant','still producing','{"pending_status":true}',now()-interval '1 hour');
grant usage on schema public,auth to authenticated;
grant select on all tables in schema public to authenticated;
grant execute on all functions in schema public,auth to authenticated;
