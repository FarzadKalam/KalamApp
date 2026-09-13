-- سازگاری تابع تقویم عمومی با ساختار واقعی تنظیمات برند هر سازمان.
begin;

create or replace function public.get_public_content_calendar(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_calendar public.content_calendars%rowtype; v_company jsonb; v_projects jsonb; v_tasks jsonb;
begin
  select * into v_calendar from public.content_calendars where public_slug = btrim(p_token) and is_public = true and status <> 'archived' limit 1;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  select to_jsonb(cs) into v_company from public.company_settings cs where cs.org_id = v_calendar.org_id limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status, 'start_date', p.start_date, 'due_date', p.due_date) order by p.due_date), '[]'::jsonb) into v_projects from public.projects p where p.org_id = v_calendar.org_id and p.content_calendar_id = v_calendar.id;
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'status', t.status, 'priority', t.priority, 'start_date', t.start_date, 'due_date', t.due_date, 'completed_at', t.completed_at, 'project_id', t.project_id, 'content_type', t.content_type) order by t.due_date), '[]'::jsonb) into v_tasks from public.tasks t where t.org_id = v_calendar.org_id and (t.content_calendar_id = v_calendar.id or t.project_id in (select id from public.projects where org_id = v_calendar.org_id and content_calendar_id = v_calendar.id));
  return jsonb_build_object('calendar', jsonb_build_object('name', v_calendar.name, 'description', v_calendar.description, 'image_url', v_calendar.image_url, 'start_date', v_calendar.start_date, 'end_date', v_calendar.end_date, 'public_link', v_calendar.public_link), 'company', jsonb_build_object('company_settings', coalesce(v_company, '{}'::jsonb)), 'projects', v_projects, 'tasks', v_tasks);
end; $$;
revoke all on function public.get_public_content_calendar(text) from public, authenticated;
grant execute on function public.get_public_content_calendar(text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
