-- لینک عمومی تقویم محتوایی؛ فقط دادهٔ نمایشیِ تقویم فعال را با توکن غیرقابل حدس ارائه می‌کند.
begin;

alter table public.content_calendars
  add column if not exists is_public boolean not null default false,
  add column if not exists public_slug text,
  add column if not exists public_link text;

update public.content_calendars
set public_slug = public.generate_short_share_token(10)
where public_slug is null or btrim(public_slug) = '' or public_slug !~ '^[0-9A-Za-z]{8,64}$';

alter table public.content_calendars
  alter column public_slug set default public.generate_short_share_token(10),
  alter column public_slug set not null;

create unique index if not exists content_calendars_public_slug_uidx
  on public.content_calendars(public_slug);
create index if not exists content_calendars_public_active_idx
  on public.content_calendars(org_id, is_public) where is_public;

create or replace function public.sync_content_calendar_public_link()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' and (new.public_slug is null or btrim(new.public_slug) = '') then
    new.public_slug := public.generate_short_share_token(10);
  elsif tg_op = 'UPDATE' and new.public_slug is distinct from old.public_slug then
    new.public_slug := old.public_slug;
  end if;
  new.public_link := '/calendar/' || new.public_slug;
  return new;
end;
$$;

drop trigger if exists trg_content_calendars_zz_public_link on public.content_calendars;
create trigger trg_content_calendars_zz_public_link before insert or update of public_slug on public.content_calendars
for each row execute function public.sync_content_calendar_public_link();
update public.content_calendars set public_link = '/calendar/' || public_slug where public_link is distinct from '/calendar/' || public_slug;

create or replace function public.get_public_content_calendar(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_calendar public.content_calendars%rowtype; v_company jsonb; v_projects jsonb; v_tasks jsonb;
begin
  select * into v_calendar from public.content_calendars
  where public_slug = btrim(p_token) and is_public = true and status <> 'archived' limit 1;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  select jsonb_strip_nulls(jsonb_build_object('branding_settings', s.branding_settings, 'company_settings', s.company_settings)) into v_company
  from public.saas_org_settings s where s.org_id = v_calendar.org_id limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status, 'start_date', p.start_date, 'due_date', p.due_date) order by p.due_date), '[]'::jsonb) into v_projects
  from public.projects p where p.org_id = v_calendar.org_id and p.content_calendar_id = v_calendar.id;
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'status', t.status, 'priority', t.priority, 'start_date', t.start_date, 'due_date', t.due_date, 'completed_at', t.completed_at, 'project_id', t.project_id, 'content_type', t.content_type) order by t.due_date), '[]'::jsonb) into v_tasks
  from public.tasks t where t.org_id = v_calendar.org_id and (t.content_calendar_id = v_calendar.id or t.project_id in (select id from public.projects where org_id = v_calendar.org_id and content_calendar_id = v_calendar.id));
  return jsonb_build_object('calendar', jsonb_build_object('name', v_calendar.name, 'description', v_calendar.description, 'image_url', v_calendar.image_url, 'start_date', v_calendar.start_date, 'end_date', v_calendar.end_date, 'public_link', v_calendar.public_link), 'company', coalesce(v_company, '{}'::jsonb), 'projects', v_projects, 'tasks', v_tasks);
end;
$$;

revoke all on function public.get_public_content_calendar(text) from public, authenticated;
grant execute on function public.get_public_content_calendar(text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
