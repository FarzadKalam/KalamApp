-- هم‌راستاسازی ساخت فعالیت خودکار با snapshot پیش‌نویس‌های فرآیند V2.
-- این تابع فقط مراحل و اجرای متعلق به سازمان جاری را می‌خواند و تغییر می‌دهد.

create or replace function public.activate_process_run_nodes(
  p_org_id uuid,
  p_process_run_id uuid,
  p_node_keys text[],
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_org_id uuid;
  v_run public.process_runs%rowtype;
  v_stage public.process_run_stages%rowtype;
  v_reference_stage public.process_run_stages%rowtype;
  v_task_id uuid;
  v_created_task_ids uuid[] := '{}'::uuid[];
  v_existing_task_ids uuid[] := '{}'::uuid[];
  v_metadata jsonb;
  v_graph jsonb;
  v_anchor_type text;
  v_anchor_node_key text;
  v_parent_trigger_key text;
  v_reference_node_key text;
  v_anchor_at timestamptz;
  v_due_at timestamptz;
  v_start_at timestamptz;
  v_duration_value numeric;
  v_duration_unit text;
  v_recurrence jsonb;
  v_actor_user_id uuid;
begin
  v_current_org_id := public.current_org_id();
  if coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is null
      or p_org_id is null
      or v_current_org_id is null
      or p_org_id <> v_current_org_id then
      raise exception 'دسترسی فعال‌سازی مراحل این فرآیند وجود ندارد.' using errcode = '42501';
    end if;
  end if;

  select * into v_run
  from public.process_runs r
  where r.id = p_process_run_id and r.org_id = p_org_id;
  if v_run.id is null then
    raise exception 'اجرای فرآیند برای سازمان جاری پیدا نشد.' using errcode = 'P0001';
  end if;

  v_actor_user_id := coalesce(p_actor_user_id, auth.uid());
  if v_actor_user_id is not null and not exists (
    select 1 from public.profiles p where p.id = v_actor_user_id and p.org_id = p_org_id
  ) then
    v_actor_user_id := null;
  end if;

  for v_stage in
    select s.*
    from public.process_run_stages s
    where s.process_run_id = p_process_run_id
      and coalesce(s.process_node_key, s.metadata ->> 'process_node_key') = any(coalesce(p_node_keys, '{}'::text[]))
    order by coalesce(s.process_lane_key, s.metadata ->> 'process_lane_key', 'lane_1'), s.sort_order, s.created_at
    for update
  loop
    if v_stage.task_id is not null then
      v_existing_task_ids := array_append(v_existing_task_ids, v_stage.task_id);
      continue;
    end if;

    v_metadata := coalesce(v_stage.metadata, '{}'::jsonb);
    v_graph := coalesce(v_metadata -> 'process_graph', '{}'::jsonb);
    v_anchor_type := coalesce(
      nullif(v_metadata ->> 'due_anchor_type', ''),
      case coalesce(v_metadata ->> 'duration_from', '')
        when 'project_start' then 'process_start'
        when 'previous_stage_end' then 'previous_stage_due'
        else null
      end,
      'process_start'
    );
    v_anchor_node_key := nullif(v_metadata ->> 'due_anchor_stage_node_key', '');
    v_reference_node_key := null;
    v_anchor_at := null;

    if v_anchor_type in ('specific_stage_due', 'specific_stage_completed') then
      v_reference_node_key := v_anchor_node_key;
    elsif v_anchor_type in ('previous_stage_due', 'previous_stage_completed') then
      select s.process_node_key into v_reference_node_key
      from public.process_run_stages s
      where s.process_run_id = p_process_run_id
        and coalesce(s.process_lane_key, s.metadata ->> 'process_lane_key', 'lane_1')
          = coalesce(v_stage.process_lane_key, v_stage.metadata ->> 'process_lane_key', 'lane_1')
        and s.sort_order < v_stage.sort_order
      order by s.sort_order desc, s.created_at desc limit 1;

      if v_reference_node_key is null and jsonb_typeof(v_graph -> 'lanes') = 'array' then
        select nullif(lane ->> 'parentTriggerKey', '') into v_parent_trigger_key
        from jsonb_array_elements(v_graph -> 'lanes') lane
        where lane ->> 'key' = coalesce(v_stage.process_lane_key, v_stage.metadata ->> 'process_lane_key', 'lane_1')
        limit 1;
        if v_parent_trigger_key is not null and jsonb_typeof(v_graph -> 'triggers') = 'array' then
          select nullif(trigger_row ->> 'sourceNodeKey', '') into v_reference_node_key
          from jsonb_array_elements(v_graph -> 'triggers') trigger_row
          where trigger_row ->> 'key' = v_parent_trigger_key
          limit 1;
        end if;
      end if;
    end if;

    if v_reference_node_key is not null then
      select s.* into v_reference_stage
      from public.process_run_stages s
      where s.process_run_id = p_process_run_id
        and coalesce(s.process_node_key, s.metadata ->> 'process_node_key') = v_reference_node_key
      limit 1;
      if v_anchor_type in ('previous_stage_due', 'specific_stage_due') then
        select coalesce(t.due_date, v_reference_stage.planned_due_at) into v_anchor_at
        from (select 1) seed left join public.tasks t on t.id = v_reference_stage.task_id;
      elsif v_anchor_type in ('previous_stage_completed', 'specific_stage_completed') then
        select coalesce(t.completed_at, t.actual_end_at, v_reference_stage.completed_at) into v_anchor_at
        from (select 1) seed left join public.tasks t on t.id = v_reference_stage.task_id;
      end if;
    elsif v_anchor_type = 'process_start' then
      v_anchor_at := coalesce(v_run.started_at, v_run.created_at, now());
    end if;

    v_duration_value := greatest(0, coalesce(nullif(v_metadata ->> 'duration_value', '')::numeric, 0));
    v_duration_unit := case when v_metadata ->> 'duration_unit' = 'hour' then 'hour' else 'day' end;
    v_due_at := case
      when v_anchor_at is null then null
      when v_duration_value <= 0 then v_anchor_at
      when v_duration_unit = 'hour' then v_anchor_at + make_interval(hours => v_duration_value::integer)
      else v_anchor_at + make_interval(days => v_duration_value::integer)
    end;
    v_start_at := nullif(v_metadata ->> 'start_date', '')::timestamptz;

    v_recurrence := coalesce(v_metadata -> 'recurrence_info', '{}'::jsonb)
      || jsonb_build_object(
        'task_type', nullif(v_metadata ->> 'task_type', ''),
        'process_automation_rules', coalesce(v_metadata -> 'automation_rules', '[]'::jsonb),
        'process_target_module_ids', coalesce(v_metadata -> 'process_target_module_ids', '[]'::jsonb),
        'process_links', coalesce(v_metadata -> 'process_link_map', jsonb_build_object(v_run.module_id, v_run.record_id)),
        'process_run_id', v_run.id,
        'process_run_stage_id', v_stage.id,
        'process_node_key', coalesce(v_stage.process_node_key, v_metadata ->> 'process_node_key'),
        'process_lane_key', coalesce(v_stage.process_lane_key, v_metadata ->> 'process_lane_key', 'lane_1'),
        'process_graph', coalesce(v_metadata -> 'process_graph', '{}'::jsonb),
        'process_task_custom_fields', coalesce(v_metadata -> 'process_task_custom_fields', '[]'::jsonb),
        'process_task_status_options', coalesce(v_metadata -> 'process_task_status_options', '[]'::jsonb),
        'process_task_custom_field_values', coalesce(v_metadata -> 'process_task_custom_field_values', '{}'::jsonb),
        'due_anchor_type', nullif(v_metadata ->> 'due_anchor_type', ''),
        'due_anchor_stage_node_key', nullif(v_metadata ->> 'due_anchor_stage_node_key', ''),
        'duration_value', coalesce(nullif(v_metadata ->> 'duration_value', '')::numeric, 0),
        'duration_unit', coalesce(nullif(v_metadata ->> 'duration_unit', ''), 'day'),
        'start_date', v_start_at,
        'start_duration_from', nullif(v_metadata ->> 'start_duration_from', ''),
        'start_duration_value', coalesce(nullif(v_metadata ->> 'start_duration_value', '')::numeric, 0),
        'start_duration_unit', coalesce(nullif(v_metadata ->> 'start_duration_unit', ''), 'day'),
        'start_anchor_stage_node_key', nullif(v_metadata ->> 'start_anchor_stage_node_key', ''),
        'process_group', jsonb_build_object('id', v_run.process_group_id, 'name', v_run.process_name, 'template_id', v_run.template_id)
      );

    insert into public.tasks (
      org_id, name, status, priority, description, task_type,
      assignee_id, assignee_role_id, assignee_type, wage, weight, tags,
      sort_order, due_date, start_date, source_template_id, source_stage_sort_order,
      process_group_id, process_run_id, process_run_stage_id, process_node_key, process_lane_key,
      source_module_id, source_record_id, related_to_module, project_id, marketing_lead_id,
      related_customer, related_invoice, purchase_invoice_id, related_production_order,
      recurrence_info, created_by, updated_by
    ) values (
      p_org_id, v_stage.stage_name, 'todo', coalesce(nullif(v_metadata ->> 'priority', ''), 'medium'),
      nullif(v_metadata ->> 'description', ''), nullif(v_metadata ->> 'task_type', ''),
      v_stage.assignee_user_id, v_stage.assignee_role_id,
      case when v_stage.assignee_role_id is not null then 'role' when v_stage.assignee_user_id is not null then 'user' else null end,
      coalesce(v_stage.wage, 0), coalesce(nullif(v_metadata ->> 'weight', '')::numeric, 0), coalesce(v_metadata -> 'tags', '[]'::jsonb),
      v_stage.sort_order, v_due_at, v_start_at, v_run.template_id, v_stage.sort_order,
      v_run.process_group_id, v_run.id, v_stage.id,
      coalesce(v_stage.process_node_key, v_metadata ->> 'process_node_key'), coalesce(v_stage.process_lane_key, v_metadata ->> 'process_lane_key', 'lane_1'),
      v_run.module_id, v_run.record_id, v_run.module_id,
      case when v_run.module_id = 'projects' then v_run.record_id else null end,
      case when v_run.module_id = 'marketing_leads' then v_run.record_id else null end,
      case when v_run.module_id = 'customers' then v_run.record_id else null end,
      case when v_run.module_id = 'invoices' then v_run.record_id else null end,
      case when v_run.module_id = 'purchase_invoices' then v_run.record_id else null end,
      case when v_run.module_id = 'production_orders' then v_run.record_id else null end,
      v_recurrence, v_actor_user_id, v_actor_user_id
    ) returning id into v_task_id;

    update public.process_run_stages
    set task_id = v_task_id, planned_due_at = v_due_at, updated_at = now()
    where id = v_stage.id;
    v_created_task_ids := array_append(v_created_task_ids, v_task_id);
  end loop;

  return jsonb_build_object(
    'process_run_id', p_process_run_id,
    'created_task_ids', to_jsonb(v_created_task_ids),
    'existing_task_ids', to_jsonb(v_existing_task_ids)
  );
end;
$$;

revoke all on function public.activate_process_run_nodes(uuid, uuid, text[], uuid) from public;
grant execute on function public.activate_process_run_nodes(uuid, uuid, text[], uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
