-- TazeSystem V1 Phase 257
-- Additive multi-lane process graph, process activator workflow bindings,
-- stable node identities, and idempotent stage materialization.

begin;

alter table if exists public.process_template_stages
  add column if not exists process_node_key text,
  add column if not exists process_lane_key text;

alter table if exists public.process_run_stages
  add column if not exists process_node_key text,
  add column if not exists process_lane_key text;

alter table if exists public.tasks
  add column if not exists process_node_key text,
  add column if not exists process_lane_key text;

alter table if exists public.workflows
  add column if not exists module_ids text[] not null default '{}'::text[],
  add column if not exists scope_type text not null default 'standard',
  add column if not exists process_template_id uuid references public.process_templates(id) on delete cascade,
  add column if not exists process_trigger_key text,
  add column if not exists process_source_node_key text,
  add column if not exists process_target_lane_keys text[] not null default '{}'::text[],
  add column if not exists manual_enabled boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workflows_scope_type_check'
  ) then
    alter table public.workflows
      add constraint workflows_scope_type_check
      check (scope_type in ('standard', 'process_activator')) not valid;
  end if;
end
$$;

create index if not exists idx_process_template_stages_lane_sort
  on public.process_template_stages(template_id, process_lane_key, sort_order);

create unique index if not exists idx_process_template_stages_node_unique
  on public.process_template_stages(template_id, process_node_key)
  where process_node_key is not null and process_node_key <> '';

create index if not exists idx_process_run_stages_lane_sort
  on public.process_run_stages(process_run_id, process_lane_key, sort_order);

create unique index if not exists idx_process_run_stages_node_unique
  on public.process_run_stages(process_run_id, process_node_key)
  where process_node_key is not null and process_node_key <> '';

create index if not exists idx_tasks_process_run_lane_sort
  on public.tasks(process_run_id, process_lane_key, sort_order)
  where process_run_id is not null;

create index if not exists idx_tasks_process_run_node
  on public.tasks(process_run_id, process_node_key)
  where process_run_id is not null and process_node_key is not null;

create index if not exists idx_workflows_process_activator
  on public.workflows(org_id, process_template_id, process_trigger_key, is_active)
  where scope_type = 'process_activator';

create index if not exists idx_workflows_module_ids
  on public.workflows using gin(module_ids);

create or replace function public.current_org_has_plan_feature(
  p_feature_key text,
  p_default_enabled boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_plan_features jsonb := '{}'::jsonb;
  v_feature_overrides jsonb := '{}'::jsonb;
  v_raw_value text;
begin
  v_org_id := public.current_org_id();
  if auth.uid() is null or v_org_id is null then
    return false;
  end if;

  select
    coalesce(p.enabled_features, '{}'::jsonb),
    coalesce(s.feature_overrides, '{}'::jsonb)
  into v_plan_features, v_feature_overrides
  from public.saas_org_settings s
  left join public.saas_plans p on lower(p.code) = lower(coalesce(s.plan_code, ''))
  where s.org_id = v_org_id
  limit 1;

  v_raw_value := coalesce(
    v_feature_overrides ->> nullif(btrim(coalesce(p_feature_key, '')), ''),
    v_plan_features ->> nullif(btrim(coalesce(p_feature_key, '')), '')
  );
  if v_raw_value is null then
    return coalesce(p_default_enabled, false);
  end if;
  return lower(v_raw_value) in ('true', '1', 'yes', 'on');
end;
$$;

revoke all on function public.current_org_has_plan_feature(text, boolean) from public;
grant execute on function public.current_org_has_plan_feature(text, boolean) to authenticated;

create or replace function public.sync_process_graph_stage_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.process_node_key := coalesce(
    nullif(btrim(coalesce(new.process_node_key, '')), ''),
    nullif(btrim(coalesce(new.metadata ->> 'process_node_key', '')), ''),
    'stage_' || replace(new.id::text, '-', '')
  );
  new.process_lane_key := coalesce(
    nullif(btrim(coalesce(new.process_lane_key, '')), ''),
    nullif(btrim(coalesce(new.metadata ->> 'process_lane_key', '')), ''),
    'lane_1'
  );
  new.metadata := coalesce(new.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'process_node_key', new.process_node_key,
      'process_lane_key', new.process_lane_key
    );
  return new;
end;
$$;

drop trigger if exists trg_sync_process_template_stage_identity on public.process_template_stages;
create trigger trg_sync_process_template_stage_identity
before insert or update of process_node_key, process_lane_key, metadata
on public.process_template_stages
for each row execute function public.sync_process_graph_stage_identity();

drop trigger if exists trg_sync_process_run_stage_identity on public.process_run_stages;
create trigger trg_sync_process_run_stage_identity
before insert or update of process_node_key, process_lane_key, metadata
on public.process_run_stages
for each row execute function public.sync_process_graph_stage_identity();

create or replace function public.sync_process_graph_task_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.process_node_key := coalesce(
    nullif(btrim(coalesce(new.process_node_key, '')), ''),
    nullif(btrim(coalesce(new.recurrence_info ->> 'process_node_key', '')), '')
  );
  new.process_lane_key := coalesce(
    nullif(btrim(coalesce(new.process_lane_key, '')), ''),
    nullif(btrim(coalesce(new.recurrence_info ->> 'process_lane_key', '')), ''),
    case when new.process_run_id is not null then 'lane_1' else null end
  );
  if new.process_node_key is not null or new.process_lane_key is not null then
    new.recurrence_info := coalesce(new.recurrence_info, '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
        'process_node_key', new.process_node_key,
        'process_lane_key', new.process_lane_key
      ));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_process_graph_task_identity on public.tasks;
create trigger trg_sync_process_graph_task_identity
before insert or update of process_node_key, process_lane_key, recurrence_info, process_run_id
on public.tasks
for each row execute function public.sync_process_graph_task_identity();

update public.process_template_stages
set process_node_key = coalesce(
      nullif(btrim(coalesce(process_node_key, '')), ''),
      nullif(btrim(coalesce(metadata ->> 'process_node_key', '')), ''),
      'stage_' || replace(id::text, '-', '')
    ),
    process_lane_key = coalesce(
      nullif(btrim(coalesce(process_lane_key, '')), ''),
      nullif(btrim(coalesce(metadata ->> 'process_lane_key', '')), ''),
      'lane_1'
    )
where process_node_key is null
   or btrim(process_node_key) = ''
   or process_lane_key is null
   or btrim(process_lane_key) = '';

update public.process_run_stages
set process_node_key = coalesce(
      nullif(btrim(coalesce(process_node_key, '')), ''),
      nullif(btrim(coalesce(metadata ->> 'process_node_key', '')), ''),
      'stage_' || replace(id::text, '-', '')
    ),
    process_lane_key = coalesce(
      nullif(btrim(coalesce(process_lane_key, '')), ''),
      nullif(btrim(coalesce(metadata ->> 'process_lane_key', '')), ''),
      'lane_1'
    )
where process_node_key is null
   or btrim(process_node_key) = ''
   or process_lane_key is null
   or btrim(process_lane_key) = '';

update public.tasks t
set process_node_key = coalesce(
      nullif(btrim(coalesce(t.process_node_key, '')), ''),
      nullif(btrim(coalesce(t.recurrence_info ->> 'process_node_key', '')), ''),
      s.process_node_key
    ),
    process_lane_key = coalesce(
      nullif(btrim(coalesce(t.process_lane_key, '')), ''),
      nullif(btrim(coalesce(t.recurrence_info ->> 'process_lane_key', '')), ''),
      s.process_lane_key,
      'lane_1'
    )
from public.process_run_stages s
where s.id = t.process_run_stage_id
  and (
    t.process_node_key is null
    or btrim(t.process_node_key) = ''
    or t.process_lane_key is null
    or btrim(t.process_lane_key) = ''
  );

update public.tasks
set process_lane_key = 'lane_1'
where process_run_id is not null
  and (process_lane_key is null or btrim(process_lane_key) = '');

drop index if exists public.idx_process_template_stages_unique;
create unique index if not exists idx_process_template_stages_lane_unique
  on public.process_template_stages(
    template_id,
    coalesce(process_lane_key, 'lane_1'),
    sort_order,
    stage_name
  );

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

  select *
  into v_run
  from public.process_runs r
  where r.id = p_process_run_id
    and r.org_id = p_org_id;

  if v_run.id is null then
    raise exception 'اجرای فرآیند برای سازمان جاری پیدا نشد.' using errcode = 'P0001';
  end if;

  v_actor_user_id := coalesce(p_actor_user_id, auth.uid());
  if v_actor_user_id is not null and not exists (
    select 1
    from public.profiles p
    where p.id = v_actor_user_id
      and p.org_id = p_org_id
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
      select s.process_node_key
      into v_reference_node_key
      from public.process_run_stages s
      where s.process_run_id = p_process_run_id
        and coalesce(s.process_lane_key, s.metadata ->> 'process_lane_key', 'lane_1')
          = coalesce(v_stage.process_lane_key, v_stage.metadata ->> 'process_lane_key', 'lane_1')
        and s.sort_order < v_stage.sort_order
      order by s.sort_order desc, s.created_at desc
      limit 1;

      if v_reference_node_key is null and jsonb_typeof(v_graph -> 'lanes') = 'array' then
        select nullif(lane ->> 'parentTriggerKey', '')
        into v_parent_trigger_key
        from jsonb_array_elements(v_graph -> 'lanes') lane
        where lane ->> 'key' = coalesce(v_stage.process_lane_key, v_stage.metadata ->> 'process_lane_key', 'lane_1')
        limit 1;

        if v_parent_trigger_key is not null and jsonb_typeof(v_graph -> 'triggers') = 'array' then
          select nullif(trigger_row ->> 'sourceNodeKey', '')
          into v_reference_node_key
          from jsonb_array_elements(v_graph -> 'triggers') trigger_row
          where trigger_row ->> 'key' = v_parent_trigger_key
          limit 1;
        end if;
      end if;
    end if;

    if v_reference_node_key is not null then
      select s.*
      into v_reference_stage
      from public.process_run_stages s
      where s.process_run_id = p_process_run_id
        and coalesce(s.process_node_key, s.metadata ->> 'process_node_key') = v_reference_node_key
      limit 1;

      if v_anchor_type in ('previous_stage_due', 'specific_stage_due') then
        select coalesce(t.due_date, v_reference_stage.planned_due_at)
        into v_anchor_at
        from (select 1) seed
        left join public.tasks t on t.id = v_reference_stage.task_id;
      elsif v_anchor_type in ('previous_stage_completed', 'specific_stage_completed') then
        select coalesce(t.completed_at, t.actual_end_at, v_reference_stage.completed_at)
        into v_anchor_at
        from (select 1) seed
        left join public.tasks t on t.id = v_reference_stage.task_id;
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
        'process_group', jsonb_build_object(
          'id', v_run.process_group_id,
          'name', v_run.process_name,
          'template_id', v_run.template_id
        )
      );

    insert into public.tasks (
      org_id,
      name,
      status,
      priority,
      description,
      task_type,
      assignee_id,
      assignee_role_id,
      assignee_type,
      wage,
      weight,
      sort_order,
      due_date,
      source_template_id,
      source_stage_sort_order,
      process_group_id,
      process_run_id,
      process_run_stage_id,
      process_node_key,
      process_lane_key,
      source_module_id,
      source_record_id,
      related_to_module,
      project_id,
      marketing_lead_id,
      related_customer,
      related_invoice,
      purchase_invoice_id,
      related_production_order,
      recurrence_info,
      created_by,
      updated_by
    )
    values (
      p_org_id,
      v_stage.stage_name,
      'todo',
      coalesce(nullif(v_metadata ->> 'priority', ''), 'medium'),
      nullif(v_metadata ->> 'description', ''),
      nullif(v_metadata ->> 'task_type', ''),
      v_stage.assignee_user_id,
      v_stage.assignee_role_id,
      case
        when v_stage.assignee_role_id is not null then 'role'
        when v_stage.assignee_user_id is not null then 'user'
        else null
      end,
      coalesce(v_stage.wage, 0),
      coalesce(nullif(v_metadata ->> 'weight', '')::numeric, 0),
      v_stage.sort_order,
      v_due_at,
      v_run.template_id,
      v_stage.sort_order,
      v_run.process_group_id,
      v_run.id,
      v_stage.id,
      coalesce(v_stage.process_node_key, v_metadata ->> 'process_node_key'),
      coalesce(v_stage.process_lane_key, v_metadata ->> 'process_lane_key', 'lane_1'),
      v_run.module_id,
      v_run.record_id,
      v_run.module_id,
      case when v_run.module_id = 'projects' then v_run.record_id else null end,
      case when v_run.module_id = 'marketing_leads' then v_run.record_id else null end,
      case when v_run.module_id = 'customers' then v_run.record_id else null end,
      case when v_run.module_id = 'invoices' then v_run.record_id else null end,
      case when v_run.module_id = 'purchase_invoices' then v_run.record_id else null end,
      case when v_run.module_id = 'production_orders' then v_run.record_id else null end,
      v_recurrence,
      v_actor_user_id,
      v_actor_user_id
    )
    returning id into v_task_id;

    update public.process_run_stages
    set task_id = v_task_id,
        planned_due_at = v_due_at,
        updated_at = now()
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

create or replace function public.move_process_run_stage(
  p_process_run_stage_id uuid,
  p_lane_key text,
  p_sort_order integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_task_id uuid;
  v_lane_key text;
  v_sort_order integer;
begin
  select r.org_id, s.task_id
  into v_org_id, v_task_id
  from public.process_run_stages s
  join public.process_runs r on r.id = s.process_run_id
  where s.id = p_process_run_stage_id;

  if auth.uid() is null
    or v_org_id is null
    or public.current_org_id() is null
    or v_org_id <> public.current_org_id() then
    raise exception 'دسترسی جابه‌جایی مرحله فرآیند وجود ندارد.' using errcode = '42501';
  end if;

  v_lane_key := coalesce(nullif(btrim(coalesce(p_lane_key, '')), ''), 'lane_1');
  v_sort_order := greatest(1, coalesce(p_sort_order, 10));

  update public.process_run_stages
  set process_lane_key = v_lane_key,
      sort_order = v_sort_order,
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('process_lane_key', v_lane_key),
      updated_at = now()
  where id = p_process_run_stage_id;

  if v_task_id is not null then
    update public.tasks
    set process_lane_key = v_lane_key,
        sort_order = v_sort_order,
        source_stage_sort_order = v_sort_order,
        recurrence_info = coalesce(recurrence_info, '{}'::jsonb)
          || jsonb_build_object('process_lane_key', v_lane_key),
        updated_by = auth.uid(),
        updated_at = now()
    where id = v_task_id
      and org_id = v_org_id;
  end if;
end;
$$;

revoke all on function public.move_process_run_stage(uuid, text, integer) from public;
grant execute on function public.move_process_run_stage(uuid, text, integer) to authenticated;

create or replace function public.copy_process_run_stage(
  p_process_run_stage_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.process_run_stages%rowtype;
  v_org_id uuid;
  v_new_stage_id uuid;
  v_node_key text;
begin
  select s.*
  into v_source
  from public.process_run_stages s
  where s.id = p_process_run_stage_id;

  select r.org_id
  into v_org_id
  from public.process_runs r
  where r.id = v_source.process_run_id;

  if auth.uid() is null
    or v_org_id is null
    or public.current_org_id() is null
    or v_org_id <> public.current_org_id() then
    raise exception 'دسترسی کپی مرحله فرآیند وجود ندارد.' using errcode = '42501';
  end if;

  update public.process_run_stages
  set sort_order = sort_order + 10,
      updated_at = now()
  where process_run_id = v_source.process_run_id
    and coalesce(process_lane_key, metadata ->> 'process_lane_key', 'lane_1')
      = coalesce(v_source.process_lane_key, v_source.metadata ->> 'process_lane_key', 'lane_1')
    and sort_order > v_source.sort_order;

  update public.tasks t
  set sort_order = s.sort_order,
      source_stage_sort_order = s.sort_order,
      updated_by = auth.uid(),
      updated_at = now()
  from public.process_run_stages s
  where s.process_run_id = v_source.process_run_id
    and s.task_id = t.id
    and t.org_id = v_org_id;

  v_node_key := 'stage_' || replace(gen_random_uuid()::text, '-', '');

  insert into public.process_run_stages (
    process_run_id,
    template_stage_id,
    stage_name,
    sort_order,
    status,
    assignee_user_id,
    assignee_role_id,
    wage,
    planned_due_at,
    started_at,
    completed_at,
    task_id,
    process_node_key,
    process_lane_key,
    metadata
  )
  values (
    v_source.process_run_id,
    null,
    coalesce(nullif(btrim(v_source.stage_name), ''), 'مرحله') || ' - کپی',
    v_source.sort_order + 10,
    'todo',
    v_source.assignee_user_id,
    v_source.assignee_role_id,
    v_source.wage,
    null,
    null,
    null,
    null,
    v_node_key,
    coalesce(v_source.process_lane_key, v_source.metadata ->> 'process_lane_key', 'lane_1'),
    (coalesce(v_source.metadata, '{}'::jsonb) - 'draft_stage_id')
      || jsonb_build_object(
        'process_node_key', v_node_key,
        'process_lane_key', coalesce(v_source.process_lane_key, v_source.metadata ->> 'process_lane_key', 'lane_1')
      )
  )
  returning id into v_new_stage_id;

  return v_new_stage_id;
end;
$$;

revoke all on function public.copy_process_run_stage(uuid) from public;
grant execute on function public.copy_process_run_stage(uuid) to authenticated;

create or replace function public.create_process_run_from_template(
  p_org_id uuid,
  p_template_id uuid,
  p_module_id text,
  p_record_id uuid,
  p_process_name text default null,
  p_copied_mode text default 'manual'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
  v_template_name text;
  v_current_org_id uuid;
begin
  if p_org_id is null then
    raise exception 'سازمان اجرای فرآیند مشخص نیست.' using errcode = '42501';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' then
    v_current_org_id := public.current_org_id();
    if auth.uid() is null
      or v_current_org_id is null
      or p_org_id <> v_current_org_id then
      raise exception 'دسترسی ایجاد فرآیند برای این سازمان وجود ندارد.' using errcode = '42501';
    end if;
  end if;

  select t.name
  into v_template_name
  from public.process_templates t
  where t.id = p_template_id
    and t.org_id = p_org_id;

  if v_template_name is null then
    raise exception 'الگوی فرآیند برای این سازمان پیدا نشد.' using errcode = 'P0001';
  end if;

  insert into public.process_runs (
    org_id,
    template_id,
    module_id,
    record_id,
    process_name,
    status,
    copied_mode,
    started_at,
    created_by,
    updated_by
  )
  values (
    p_org_id,
    p_template_id,
    p_module_id,
    p_record_id,
    coalesce(nullif(btrim(coalesce(p_process_name, '')), ''), v_template_name),
    'active',
    case when p_copied_mode in ('manual', 'auto') then p_copied_mode else 'manual' end,
    now(),
    auth.uid(),
    auth.uid()
  )
  returning id into v_run_id;

  if p_record_id is not null
    and nullif(btrim(coalesce(p_module_id, '')), '') is not null then
    insert into public.process_run_links (
      org_id,
      process_run_id,
      module_id,
      record_id,
      is_primary
    )
    values (
      p_org_id,
      v_run_id,
      p_module_id,
      p_record_id,
      true
    )
    on conflict (process_run_id, module_id, record_id) do update
    set org_id = excluded.org_id,
        is_primary = true;
  end if;

  insert into public.process_run_stages (
    process_run_id,
    template_stage_id,
    stage_name,
    sort_order,
    status,
    assignee_user_id,
    assignee_role_id,
    wage,
    process_node_key,
    process_lane_key,
    metadata
  )
  select
    v_run_id,
    s.id,
    s.stage_name,
    s.sort_order,
    s.default_status,
    s.default_assignee_id,
    s.default_assignee_role_id,
    s.wage,
    coalesce(nullif(s.process_node_key, ''), nullif(s.metadata ->> 'process_node_key', '')),
    coalesce(nullif(s.process_lane_key, ''), nullif(s.metadata ->> 'process_lane_key', ''), 'lane_1'),
    s.metadata
  from public.process_template_stages s
  where s.template_id = p_template_id
  order by
    coalesce(nullif(s.process_lane_key, ''), nullif(s.metadata ->> 'process_lane_key', ''), 'lane_1'),
    s.sort_order,
    s.created_at;

  return v_run_id;
end;
$$;

revoke all on function public.create_process_run_from_template(
  uuid,
  uuid,
  text,
  uuid,
  text,
  text
) from public;

grant execute on function public.create_process_run_from_template(
  uuid,
  uuid,
  text,
  uuid,
  text,
  text
) to authenticated, service_role;

update public.saas_plans
set enabled_features = coalesce(enabled_features, '{}'::jsonb)
  || jsonb_build_object('multi_lane_processes', true),
    updated_at = now()
where coalesce(enabled_features ->> 'multi_lane_processes', '') = '';

notify pgrst, 'reload schema';

commit;
