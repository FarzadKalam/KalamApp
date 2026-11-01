-- Isolated CI database only. Never execute this fixture on an application DB.
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.viewer', true), '')::uuid;
$$;
grant usage on schema auth to authenticated;
create function public.kalam_try_uuid(value text) returns uuid language plpgsql immutable as $$
begin return value::uuid; exception when invalid_text_representation then return null; end $$;
alter table public.profiles add column role_id uuid;
create table public.notes (
  id uuid primary key, org_id uuid not null, source_type text, metadata jsonb,
  mention_user_ids uuid[], mention_role_ids uuid[]
);
create table public.notification_inbox_items (
  id uuid primary key, org_id uuid not null, section text, source_type text,
  source_id text, category text, target_user_ids uuid[], target_role_ids uuid[],
  last_event_at timestamptz default now(), created_at timestamptz default now()
);
alter table public.notes add column module_id text, add column record_id uuid,
  add column content text, add column author_id uuid, add column author_name text,
  add column created_at timestamptz default now(), add column reply_to uuid,
  add column is_edited boolean default false, add column edited_at timestamptz;
create table public.notification_read_states (
  org_id uuid, user_id uuid, section text, source_type text, source_id text,
  read_at timestamptz, dismissed_at timestamptz
);
create table public.communication_read_cursors (
  org_id uuid, user_id uuid, channel text, conversation_key text,
  read_through_at timestamptz, read_through_id text
);
create function public.kalam_cursor_value(timestamptz, text) returns text language sql as $$ select $1::text || '|' || $2 $$;
create function public.kalam_message_read_receipts_v1(uuid, text, text, uuid, timestamptz, uuid)
returns jsonb language sql as $$ select '{}'::jsonb $$;
create function public.kalam_can_access_internal_message_v2(boolean, uuid[], uuid[], uuid, uuid[], uuid[], text, jsonb, text, uuid, uuid)
returns boolean language sql immutable as $$
  select coalesce($10 = any(coalesce($2,'{}'::uuid[]) || coalesce($5,'{}'::uuid[])),false)
    or coalesce($11 = any(coalesce($3,'{}'::uuid[]) || coalesce($6,'{}'::uuid[])),false);
$$;
create function public.kalam_internal_message_is_system_v2(text, jsonb, text default null)
returns boolean language sql immutable as $$
  select coalesce($3, '') in ('system','assistant') or coalesce($1,'') in ('system','ai','assistant')
    or coalesce($2, '{}'::jsonb) ?| array['workflow_id','automation_rule_id','process_automation_rule_id','workflow_action_type','scheduled_report_id'];
$$;
grant select on public.notes to authenticated;
grant select on public.notification_inbox_items to authenticated;
create policy fixture_inbox_org_select on public.notification_inbox_items for select to authenticated using (org_id = public.current_org_id());
-- Deliberately broad within the organization: the restrictive guard must win.
create policy fixture_org_select on public.notes for select to authenticated using (org_id = public.current_org_id());
insert into public.profiles(id, org_id, role_id) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002');
insert into public.notes(id, org_id, source_type, mention_user_ids, mention_role_ids) values
 ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','system','{10000000-0000-0000-0000-000000000001}',null),
 ('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','system',null,'{30000000-0000-0000-0000-000000000001}'),
 ('40000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','system',null,null),
 ('40000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001','system','{10000000-0000-0000-0000-000000000002}',null),
 ('40000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000002','system','{10000000-0000-0000-0000-000000000001}',null),
 ('40000000-0000-0000-0000-000000000006','20000000-0000-0000-0000-000000000001','user',null,null),
 ('40000000-0000-0000-0000-000000000007','20000000-0000-0000-0000-000000000001','system',null,null);
insert into public.notification_inbox_items(id, org_id, section, source_type, source_id, category, target_user_ids) values
 ('50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','notes','note','40000000-0000-0000-0000-000000000007','system','{10000000-0000-0000-0000-000000000001}'),
 ('50000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','notes','note','40000000-0000-0000-0000-000000000004','system','{10000000-0000-0000-0000-000000000002}'),
 ('50000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','notes','note','40000000-0000-0000-0000-000000000003','system',null);
