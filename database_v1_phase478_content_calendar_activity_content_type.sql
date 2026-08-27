begin;

alter table public.tasks
  add column if not exists content_type text;

create index if not exists idx_tasks_org_content_calendar_content_type
  on public.tasks (org_id, content_calendar_id, content_type)
  where content_calendar_id is not null;

commit;
