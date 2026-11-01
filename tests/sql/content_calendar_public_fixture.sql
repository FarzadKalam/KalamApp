-- Isolated database only; no production tables or credentials.
create table public.content_calendars (
  id uuid primary key, org_id uuid not null, public_slug text, is_public boolean, status text,
  name text, description text, image_url text, start_date timestamptz, end_date timestamptz, public_link text
);
create table public.company_settings (org_id uuid not null, trade_name text);
create table public.projects (
  id uuid primary key, org_id uuid not null, content_calendar_id uuid,
  name text, status text, start_date timestamptz, due_date timestamptz
);
create table public.tasks (
  id uuid primary key, org_id uuid not null, content_calendar_id uuid, project_id uuid,
  name text, status text, priority text, start_date timestamptz, due_date timestamptz,
  completed_at timestamptz, content_type text, recurrence_info jsonb
);
alter table public.content_calendars enable row level security;
alter table public.company_settings enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
insert into public.content_calendars(id, org_id, public_slug, is_public, status, name) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','active-link',true,'active','Public calendar'),
 ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','private-link',false,'active','Private calendar'),
 ('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002','archived-link',true,'archived','Archived calendar');
insert into public.projects(id,org_id,content_calendar_id,name,status) values
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Visible project','planning'),
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Other org project','planning');
insert into public.tasks(id,org_id,content_calendar_id,name,status,recurrence_info) values
 ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Visible task','custom_ready',
 '{"private_secret":"do-not-publish","process_task_status_options":[{"value":"custom_ready","label":"آمادهٔ انتشار","color":"purple","private_secret":"status-secret"}],"process_task_custom_fields":[{"key":"private","labels":{"fa":"خصوصی"}},{"key":"allowed","labels":{"fa":"عمومی"},"show_in_content_calendar":true}],"process_task_custom_field_values":{"private":"private-value","allowed":"public-value"}}'),
 ('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Other org task','custom_ready','{}');
