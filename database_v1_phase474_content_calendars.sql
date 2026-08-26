-- تقویم محتوایی: برنامه‌ریزی چندمنبعی پروژه‌ها و فعالیت‌ها در سطح هر سازمان.
-- داده‌ها تنها در سازمان جاری قابل دسترسی‌اند و استفاده از قابلیت به ویژگی پلن وابسته است.

begin;

create table if not exists public.content_calendars (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  system_code text,
  name text not null,
  customer_id uuid references public.customers(id) on delete set null,
  source_invoice_id uuid references public.invoices(id) on delete set null,
  start_date date,
  end_date date,
  status text not null default 'active' check (status in ('draft', 'active', 'completed', 'archived')),
  image_url text,
  description text,
  tags jsonb not null default '[]'::jsonb,
  assignee_id uuid references public.profiles(id) on delete set null,
  assignee_role_id uuid references public.org_roles(id) on delete set null,
  assignee_type text check (assignee_type in ('user', 'role')),
  process_template_id uuid references public.process_templates(id) on delete set null,
  execution_process_draft jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.content_calendars
  add column if not exists image_url text,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists process_template_id uuid references public.process_templates(id) on delete set null,
  add column if not exists execution_process_draft jsonb not null default '[]'::jsonb;

alter table public.projects add column if not exists content_calendar_id uuid references public.content_calendars(id) on delete set null;
alter table public.tasks add column if not exists content_calendar_id uuid references public.content_calendars(id) on delete set null;

create index if not exists idx_content_calendars_org_updated on public.content_calendars(org_id, updated_at desc, id desc);
create index if not exists idx_content_calendars_org_customer on public.content_calendars(org_id, customer_id, start_date, id);
create index if not exists idx_content_calendars_assignee on public.content_calendars(assignee_id, assignee_role_id);
create index if not exists idx_content_calendars_process_template on public.content_calendars(process_template_id) where process_template_id is not null;
create index if not exists idx_projects_org_content_calendar on public.projects(org_id, content_calendar_id, due_date, id) where content_calendar_id is not null;
create index if not exists idx_tasks_org_content_calendar on public.tasks(org_id, content_calendar_id, due_date, id) where content_calendar_id is not null;

create or replace function public.validate_content_calendar_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_calendar_org_id uuid;
begin
  if new.content_calendar_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.content_calendar_id is not distinct from old.content_calendar_id then
    return new;
  end if;

  if not public.org_has_plan_feature(new.org_id, 'content_calendar', false) then
    raise exception 'ویژگی تقویم محتوایی در پلن این سازمان فعال نیست.' using errcode = '42501';
  end if;

  select calendar_row.org_id into v_calendar_org_id
  from public.content_calendars calendar_row
  where calendar_row.id = new.content_calendar_id;

  if v_calendar_org_id is null or v_calendar_org_id <> new.org_id then
    raise exception 'تقویم محتوایی انتخاب‌شده در سازمان جاری قابل استفاده نیست.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_projects_validate_content_calendar_link on public.projects;
create trigger trg_projects_validate_content_calendar_link
before insert or update of content_calendar_id on public.projects
for each row execute function public.validate_content_calendar_link();

drop trigger if exists trg_tasks_validate_content_calendar_link on public.tasks;
create trigger trg_tasks_validate_content_calendar_link
before insert or update of content_calendar_id on public.tasks
for each row execute function public.validate_content_calendar_link();

drop trigger if exists trg_content_calendars_updated_at on public.content_calendars;
create trigger trg_content_calendars_updated_at
before update on public.content_calendars
for each row execute function public.set_updated_at();

-- تقویم محتوایی نیز مانند سایر رکوردهای ماژولی، منبع رویدادهای گردش‌کار است.
-- trigger عمومی phase 330 فقط جدول‌های موجود در زمان اجرای همان migration را پوشش داده است.
drop trigger if exists workflow_event_queue_row on public.content_calendars;
create trigger workflow_event_queue_row
after insert or update on public.content_calendars
for each row execute function public.enqueue_workflow_event_from_row();

-- تاریخچهٔ جزئی تغییرات برای جدول‌های ایجادشده پس از موتور مرکزی phase 437.
drop trigger if exists trg_kalam_record_audit_fields_before on public.content_calendars;
create trigger trg_kalam_record_audit_fields_before
before insert or update on public.content_calendars
for each row execute function public.kalam_record_audit_fields_before();

drop trigger if exists trg_kalam_record_activity_after on public.content_calendars;
create trigger trg_kalam_record_activity_after
after insert or update or delete on public.content_calendars
for each row execute function public.kalam_record_activity_after();

alter table public.content_calendars enable row level security;

drop policy if exists content_calendars_org_select on public.content_calendars;
create policy content_calendars_org_select on public.content_calendars
for select to authenticated
using (
  org_id = public.current_org_id()
  and public.current_org_has_plan_feature('content_calendar', false)
);

drop policy if exists content_calendars_org_insert on public.content_calendars;
create policy content_calendars_org_insert on public.content_calendars
for insert to authenticated
with check (
  org_id = public.current_org_id()
  and public.current_org_has_plan_feature('content_calendar', false)
);

drop policy if exists content_calendars_org_update on public.content_calendars;
create policy content_calendars_org_update on public.content_calendars
for update to authenticated
using (
  org_id = public.current_org_id()
  and public.current_org_has_plan_feature('content_calendar', false)
)
with check (
  org_id = public.current_org_id()
  and public.current_org_has_plan_feature('content_calendar', false)
);

drop policy if exists content_calendars_org_delete on public.content_calendars;
create policy content_calendars_org_delete on public.content_calendars
for delete to authenticated
using (
  org_id = public.current_org_id()
  and public.current_org_has_plan_feature('content_calendar', false)
);

revoke all on public.content_calendars from anon;
grant select, insert, update, delete on public.content_calendars to authenticated;
revoke all on function public.validate_content_calendar_link() from public, anon, authenticated;

-- سازمان داخلی تازه‌سیستم، مانند سایر قابلیت‌های SaaS، همواره دسترسی کامل دارد.
-- نقش همچنان در سطح کاربر/سازمان اعمال می‌شود؛ این بخش فقط مجوزهای صریحِ ماژول تازه را می‌افزاید.
update public.org_roles role_row
set permissions = jsonb_set(
  jsonb_set(
    jsonb_set(
      coalesce(role_row.permissions, '{}'::jsonb),
      '{content_calendars}',
      '{"view":true,"edit":true}'::jsonb,
      true
    ),
    '{projects,fields,content_calendar_id}',
    'true'::jsonb,
    true
  ),
  '{tasks,fields,content_calendar_id}',
  'true'::jsonb,
  true
)
where lower(coalesce(role_row.permissions -> '__saas_admin' ->> 'view', 'false')) = 'true'
   or lower(coalesce(role_row.permissions -> '__saas_admin' ->> 'edit', 'false')) = 'true';

notify pgrst, 'reload schema';
commit;
