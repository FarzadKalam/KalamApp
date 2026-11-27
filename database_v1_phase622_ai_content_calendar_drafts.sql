begin;

create or replace function public.append_ai_content_calendar_draft(
  p_calendar_id uuid, p_draft jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_drafts jsonb;
begin
  if v_org_id is null or auth.uid() is null
     or coalesce(jsonb_typeof(p_draft), '') <> 'object'
     or nullif(p_draft ->> 'id', '') is null then
    raise exception 'پیش‌نویس تقویم معتبر نیست.';
  end if;
  select execution_process_draft into v_drafts from public.content_calendars
  where id = p_calendar_id and org_id = v_org_id
  for update;
  if not found then raise exception 'تقویم در دسترس نیست.'; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(v_drafts, '[]'::jsonb)) as draft
    where draft ->> 'id' = p_draft ->> 'id'
  ) then
    return p_calendar_id;
  end if;
  update public.content_calendars
  set execution_process_draft = coalesce(v_drafts, '[]'::jsonb) || jsonb_build_array(p_draft)
  where id = p_calendar_id and org_id = v_org_id;
  if not found then raise exception 'ذخیرهٔ پیش‌نویس تقویم مجاز نیست.'; end if;
  return p_calendar_id;
end;
$$;

create or replace function public.create_ai_content_calendar_template(
  p_template_id uuid, p_name text, p_description text, p_stages jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_user_id uuid := auth.uid();
begin
  if v_org_id is null or v_user_id is null or p_template_id is null
     or nullif(btrim(p_name), '') is null or coalesce(jsonb_typeof(p_stages), '') <> 'array' then
    raise exception 'مشخصات الگوی تقویم معتبر نیست.';
  end if;
  if jsonb_array_length(p_stages) not between 1 and 20 then
    raise exception 'تعداد مراحل الگو معتبر نیست.';
  end if;
  insert into public.process_templates (id, org_id, name, description, module_id, module_ids, is_active, created_by, updated_by)
  values (p_template_id, v_org_id, p_name, p_description, 'content_calendars', array['content_calendars'], true, v_user_id, v_user_id)
  on conflict (id) do nothing;
  if found then
    insert into public.process_template_stages (template_id, stage_name, sort_order, default_status, auto_create_task, metadata)
    select p_template_id, stage ->> 'stage_name', ord::integer * 10, 'todo', true,
           jsonb_build_object('description', coalesce(stage ->> 'description', ''))
    from jsonb_array_elements(p_stages) with ordinality as stages(stage, ord);
  elsif not exists (select 1 from public.process_templates where id = p_template_id and org_id = v_org_id and created_by = v_user_id and module_id = 'content_calendars') then
    raise exception 'الگوی تقویم در دسترس نیست.';
  end if;
  return p_template_id;
end;
$$;

revoke all on function public.append_ai_content_calendar_draft(uuid, jsonb) from public, anon;
revoke all on function public.create_ai_content_calendar_template(uuid, text, text, jsonb) from public, anon;
grant execute on function public.append_ai_content_calendar_draft(uuid, jsonb) to authenticated;
grant execute on function public.create_ai_content_calendar_template(uuid, text, text, jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
