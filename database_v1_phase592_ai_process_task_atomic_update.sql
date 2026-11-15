-- AI task changes use the actor's JWT/RLS and one transaction for fields,
-- custom values, completion timestamps and the matching runtime stage.
begin;
create or replace function public.apply_ai_process_task_change(
  p_task_id uuid, p_patch jsonb, p_custom_values jsonb default '{}'::jsonb,
  p_expected_updated_at timestamptz default null
)
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_task public.tasks%rowtype;
  v_next public.tasks%rowtype;
  v_field jsonb; v_key text; v_required text; v_value jsonb;
  v_recurrence jsonb; v_values jsonb; v_count integer;
  v_run_metadata jsonb := '{}'::jsonb; v_template_metadata jsonb := '{}'::jsonb;
  v_task_metadata jsonb; v_template_stage_id uuid; v_candidates jsonb;
begin
  if v_org is null or auth.uid() is null
    or not public.current_user_has_role_permission_entry('tasks','view',null,false)
    or not public.current_user_has_role_permission_entry('tasks','edit',null,false) then
    raise exception 'دسترسی ویرایش فعالیت تأیید نشد.' using errcode='42501';
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' or jsonb_typeof(p_custom_values) is distinct from 'object' then
    raise exception 'اطلاعات تغییر فعالیت معتبر نیست.' using errcode='22023';
  end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key <> all(array['name','description','status','priority','start_date','due_date','assignee_id','assignee_role_id','assignee_type'])
      or not public.current_user_has_role_permission_entry('tasks','edit',v_key,true) then
      raise exception 'فیلد فعالیت برای تغییر مجاز نیست.' using errcode='42501';
    end if;
  end loop;
  select * into v_task from public.tasks where id=p_task_id and org_id=v_org for update;
  if not found then raise exception 'فعالیت پیدا نشد یا مجاز نیست.' using errcode='P0002'; end if;
  if p_expected_updated_at is distinct from v_task.updated_at then
    raise exception 'فعالیت پس از بررسی تغییر کرده است؛ دوباره اطلاعات را دریافت کنید.' using errcode='40001';
  end if;
  v_recurrence := case when jsonb_typeof(v_task.recurrence_info)='object' then v_task.recurrence_info else '{}'::jsonb end;
  v_task_metadata := coalesce(to_jsonb(v_task)->'metadata','{}'::jsonb);
  -- Match the V2 modal's legacy fallback, while a task snapshot always wins.
  -- Parent RLS and explicit source-field permissions apply to fallback reads.
  if v_task.process_run_stage_id is not null
    and public.current_user_has_role_permission_entry('process_runs','view',null,false)
    and public.current_user_has_role_permission_entry('process_runs','view','metadata',true) then
    select s.metadata,s.template_stage_id into v_run_metadata,v_template_stage_id
      from public.process_run_stages s join public.process_runs r on r.id=s.process_run_id
      where s.id=v_task.process_run_stage_id and r.id=v_task.process_run_id and r.org_id=v_org;
  end if;
  if public.current_user_has_role_permission_entry('process_templates','view',null,false)
    and public.current_user_has_role_permission_entry('process_templates','view','metadata',true) then
    select s.metadata into v_template_metadata from public.process_template_stages s
      join public.process_templates t on t.id=s.template_id and t.org_id=v_org
      where (s.id=v_template_stage_id or v_template_stage_id is null
        and s.template_id=v_task.source_template_id and s.sort_order=v_task.source_stage_sort_order)
      order by s.id limit 1;
  end if;
  foreach v_key in array array['process_task_custom_fields','process_task_status_options'] loop
    foreach v_candidates in array array[v_recurrence->v_key,v_task_metadata->v_key,v_run_metadata->v_key,v_template_metadata->v_key] loop
      if jsonb_typeof(v_candidates)='array' and jsonb_array_length(v_candidates)>0 then
        v_recurrence:=jsonb_set(v_recurrence,array[v_key],v_candidates,true); exit;
      end if;
    end loop;
  end loop;
  v_values := coalesce(v_template_metadata->'process_task_custom_field_values','{}'::jsonb)
    || coalesce(v_run_metadata->'process_task_custom_field_values','{}'::jsonb)
    || coalesce(v_task_metadata->'process_task_custom_field_values','{}'::jsonb)
    || coalesce(v_recurrence->'process_task_custom_field_values','{}'::jsonb) || p_custom_values;
  for v_key in select jsonb_object_keys(p_custom_values) loop
    if not public.current_user_has_role_permission_entry('tasks','edit','recurrence_info',true)
      or not public.current_user_has_role_permission_entry('tasks','edit',v_key,true)
      or not exists (select 1 from jsonb_array_elements(coalesce(v_recurrence->'process_task_custom_fields','[]'::jsonb)) f where f->>'key'=v_key and coalesce(f->>'readonly','false')<>'true') then
      raise exception 'فیلد اختصاصی برای تغییر مجاز نیست.' using errcode='42501';
    end if;
  end loop;
  v_next := jsonb_populate_record(v_task,p_patch);
  if p_patch ? 'status' and v_next.status is distinct from v_task.status then
    if v_next.status <> all(array['todo','planned','in_progress','review','done','completed','blocked','canceled','cancelled'])
      and not exists(select 1 from jsonb_array_elements(coalesce(v_recurrence->'process_task_status_options','[]'::jsonb)) o where o->>'value'=v_next.status) then
      raise exception 'وضعیت فعالیت معتبر نیست.' using errcode='22023';
    end if;
    for v_field in select * from jsonb_array_elements(coalesce(v_recurrence->'process_task_custom_fields','[]'::jsonb)) loop
      v_required := coalesce(v_field->>'requiredForStatus',v_field->>'required_for_status','');
      v_key := v_field->>'key'; v_value := coalesce(v_values->v_key,to_jsonb(v_next)->v_key);
      if (v_required=v_next.status or v_required in ('done','completed') and v_next.status in ('done','completed'))
        and (v_value is null or v_value in ('null'::jsonb,'""'::jsonb,'[]'::jsonb)) then
        raise exception 'فیلد اختصاصی لازم برای وضعیت مقصد تکمیل نشده است.' using errcode='23514';
      end if;
    end loop;
    if v_next.status in ('in_progress','review','done','completed') then
      v_next.start_date := coalesce(v_next.start_date,now());
      v_next.actual_start_at := coalesce(v_next.actual_start_at,v_next.start_date,now());
    end if;
    v_next.completed_at := case when v_next.status in ('done','completed') then coalesce(v_next.completed_at,now()) else null end;
    v_next.actual_end_at := case when v_next.status in ('done','completed') then coalesce(v_next.actual_end_at,v_next.completed_at,now()) else null end;
  end if;
  if v_values <> '{}'::jsonb then v_recurrence := jsonb_set(v_recurrence,'{process_task_custom_field_values}',v_values,true); end if;
  -- Existing task triggers enforce record locks, assignee organization and
  -- enqueue workflow events. An error rolls back both task and stage changes.
  update public.tasks set name=v_next.name, description=v_next.description,status=v_next.status,
    priority=v_next.priority,start_date=v_next.start_date,due_date=v_next.due_date,
    assignee_id=v_next.assignee_id,assignee_role_id=v_next.assignee_role_id,assignee_type=v_next.assignee_type,
    completed_at=v_next.completed_at,actual_start_at=v_next.actual_start_at,actual_end_at=v_next.actual_end_at,
    recurrence_info=v_recurrence,updated_at=now(),updated_by=auth.uid()
  where id=p_task_id and org_id=v_org returning * into v_next;
  if not found then raise exception 'ذخیره فعالیت تأیید نشد.' using errcode='P0002'; end if;
  if v_next.process_run_stage_id is not null then
    update public.process_run_stages s set
      status=case when v_next.status in ('done','completed') then 'done'
        when v_next.status in ('canceled','cancelled') then 'canceled'
        when v_next.status in ('in_progress','review') then 'in_progress'
        when v_next.status='blocked' then 'blocked' else 'todo' end,
      task_id=v_next.id,assignee_user_id=case when v_next.assignee_type='user' then v_next.assignee_id else null end,
      assignee_role_id=v_next.assignee_role_id,planned_due_at=v_next.due_date,
      started_at=v_next.actual_start_at,completed_at=v_next.completed_at,updated_at=now()
    where s.id=v_next.process_run_stage_id and s.process_run_id=v_next.process_run_id
      and exists(select 1 from public.process_runs r where r.id=s.process_run_id and r.org_id=v_org);
    get diagnostics v_count=row_count;
    if v_count<>1 then raise exception 'ذخیره مرحله اجرای فرآیند تأیید نشد.' using errcode='P0002'; end if;
  end if;
  return jsonb_build_object('id',v_next.id,'name',v_next.name,'status',v_next.status,'updated_at',v_next.updated_at);
end;
$$;
revoke all on function public.apply_ai_process_task_change(uuid,jsonb,jsonb,timestamptz) from public,anon;
grant execute on function public.apply_ai_process_task_change(uuid,jsonb,jsonb,timestamptz) to authenticated;
notify pgrst, 'reload schema';
commit;
