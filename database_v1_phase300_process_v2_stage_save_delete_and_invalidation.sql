-- Phase 300: Process V2 stage save/delete hardening
-- Fixes UUID-empty casts in process realtime invalidation and routes draft-save
-- and task-stage delete actions through dedicated org-scoped RPCs.

begin;

create or replace function public.kalam_try_uuid(p_value text)
returns uuid
language plpgsql
immutable
as $$
declare
  v_value text := nullif(btrim(coalesce(p_value, '')), '');
begin
  if v_value is null then
    return null;
  end if;

  v_value := regexp_replace(
    v_value,
    '^(process_run_stage|process_run|process_template_stage|process_template|task|user|role)[_:]',
    '',
    'i'
  );

  if v_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$' then
    return null;
  end if;

  return v_value::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.kalam_emit_process_parent_module_list_invalidation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_action text := lower(tg_op);
  v_updated_at timestamptz;
  v_org_id uuid;
  v_module_id text;
  v_record_id text;
  v_process_run_id text;
  v_process_run_stage_id text;
  v_task_id text;
  v_scope_hint jsonb;
begin
  v_row := case
    when tg_op = 'DELETE' then to_jsonb(old)
    else to_jsonb(new)
  end;

  v_updated_at := coalesce(
    nullif(v_row ->> 'updated_at', '')::timestamptz,
    nullif(v_row ->> 'created_at', '')::timestamptz,
    now()
  );

  if tg_table_name = 'process_runs' then
    v_org_id := public.kalam_try_uuid(v_row ->> 'org_id');
    v_module_id := nullif(btrim(coalesce(v_row ->> 'module_id', '')), '');
    v_record_id := nullif(btrim(coalesce(v_row ->> 'record_id', '')), '');
    v_process_run_id := nullif(btrim(coalesce(v_row ->> 'id', '')), '');
  elsif tg_table_name = 'process_run_stages' then
    v_process_run_stage_id := nullif(btrim(coalesce(v_row ->> 'id', '')), '');
    v_process_run_id := nullif(btrim(coalesce(v_row ->> 'process_run_id', '')), '');
    if public.kalam_try_uuid(v_process_run_id) is not null then
      select pr.org_id,
             nullif(btrim(coalesce(pr.module_id, '')), ''),
             pr.record_id::text
      into v_org_id, v_module_id, v_record_id
      from public.process_runs pr
      where pr.id = public.kalam_try_uuid(v_process_run_id)
      limit 1;
    end if;
  elsif tg_table_name = 'tasks' then
    v_task_id := nullif(btrim(coalesce(v_row ->> 'id', '')), '');
    v_process_run_id := nullif(btrim(coalesce(v_row ->> 'process_run_id', '')), '');
    v_process_run_stage_id := nullif(btrim(coalesce(v_row ->> 'process_run_stage_id', '')), '');
    if public.kalam_try_uuid(v_process_run_id) is null and public.kalam_try_uuid(v_process_run_stage_id) is not null then
      select prs.process_run_id::text
      into v_process_run_id
      from public.process_run_stages prs
      where prs.id = public.kalam_try_uuid(v_process_run_stage_id)
      limit 1;
    end if;
    if public.kalam_try_uuid(v_process_run_id) is not null then
      select pr.org_id,
             nullif(btrim(coalesce(pr.module_id, '')), ''),
             pr.record_id::text
      into v_org_id, v_module_id, v_record_id
      from public.process_runs pr
      where pr.id = public.kalam_try_uuid(v_process_run_id)
      limit 1;
    end if;
  end if;

  v_scope_hint := jsonb_strip_nulls(jsonb_build_object(
    'source', 'process_v2',
    'process_run_id', nullif(btrim(coalesce(v_process_run_id, '')), ''),
    'process_run_stage_id', nullif(btrim(coalesce(v_process_run_stage_id, '')), ''),
    'task_id', nullif(btrim(coalesce(v_task_id, '')), ''),
    'assignee_user_id', nullif(btrim(coalesce(v_row ->> 'assignee_id', '')), ''),
    'assignee_role_id', nullif(btrim(coalesce(v_row ->> 'assignee_role_id', '')), '')
  ));

  if v_org_id is not null and v_module_id is not null and v_record_id is not null then
    perform public.kalam_broadcast_module_list_invalidation(
      v_org_id,
      v_module_id,
      v_record_id,
      v_action,
      v_updated_at,
      coalesce(v_scope_hint, '{}'::jsonb)
    );
  end if;

  if v_org_id is not null and v_process_run_id is not null then
    perform public.kalam_broadcast_module_list_invalidation(
      v_org_id,
      'process_runs',
      v_process_run_id,
      v_action,
      v_updated_at,
      coalesce(v_scope_hint, '{}'::jsonb)
    );
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.process_v2_save_draft_stage(
  p_org_id uuid,
  p_stage_id uuid,
  p_stage_name text,
  p_assignee_user_id uuid default null,
  p_assignee_role_id uuid default null,
  p_wage numeric default null,
  p_planned_start_at timestamptz default null,
  p_planned_due_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_org_id uuid := public.current_org_id();
  v_stage public.process_run_stages%rowtype;
  v_next_name text := coalesce(nullif(btrim(coalesce(p_stage_name, '')), ''), 'مرحله');
  v_next_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if auth.uid() is null
    or p_org_id is null
    or p_stage_id is null
    or v_current_org_id is null
    or p_org_id <> v_current_org_id then
    raise exception 'دسترسی ذخیره پیش‌نویس مرحله فرآیند وجود ندارد.' using errcode = '42501';
  end if;

  perform public.assert_process_assignee_org(
    p_org_id,
    case when p_assignee_role_id is not null then null else p_assignee_user_id end,
    p_assignee_role_id
  );

  update public.process_run_stages s
  set stage_name = v_next_name,
      assignee_user_id = case when p_assignee_role_id is not null then null else p_assignee_user_id end,
      assignee_role_id = p_assignee_role_id,
      wage = coalesce(p_wage, s.wage, 0),
      planned_start_at = p_planned_start_at,
      planned_due_at = p_planned_due_at,
      metadata = coalesce(s.metadata, '{}'::jsonb)
        || v_next_metadata
        || jsonb_build_object(
          'name', v_next_name,
          'stage_name', v_next_name,
          'assignee_user_id', case when p_assignee_role_id is not null then null else p_assignee_user_id end,
          'assignee_role_id', p_assignee_role_id,
          'wage', coalesce(p_wage, s.wage, 0),
          'planned_start_at', p_planned_start_at,
          'planned_due_at', p_planned_due_at
        ),
      updated_at = now()
  from public.process_runs r
  where s.id = p_stage_id
    and r.id = s.process_run_id
    and r.org_id = p_org_id
  returning s.* into v_stage;

  if v_stage.id is null then
    raise exception 'مرحله پیش‌نویس فرآیند پیدا نشد.' using errcode = 'P0001';
  end if;

  return jsonb_build_object('stage', to_jsonb(v_stage));
end;
$$;

create or replace function public.process_v2_delete_task_stage(
  p_org_id uuid,
  p_task_id uuid,
  p_stage_id uuid,
  p_mode text,
  p_deleted_by uuid default auth.uid(),
  p_deleted_by_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_org_id uuid := public.current_org_id();
  v_mode text := lower(btrim(coalesce(p_mode, '')));
  v_task public.tasks%rowtype;
  v_stage public.process_run_stages%rowtype;
  v_run public.process_runs%rowtype;
  v_task_snapshot jsonb;
  v_deleted_task boolean := false;
  v_unlinked_task boolean := false;
  v_stage_tombstoned boolean := false;
begin
  if auth.uid() is null
    or p_org_id is null
    or v_current_org_id is null
    or p_org_id <> v_current_org_id then
    raise exception 'دسترسی حذف فعالیت فرآیند برای این سازمان وجود ندارد.' using errcode = '42501';
  end if;

  if v_mode not in ('unlink', 'delete_task_keep_draft', 'delete_all') then
    raise exception 'نوع حذف فعالیت فرآیند معتبر نیست.' using errcode = '22023';
  end if;

  if p_task_id is not null then
    select *
    into v_task
    from public.tasks
    where id = p_task_id
      and org_id = p_org_id
    for update;
  end if;

  if p_stage_id is not null then
    select s.*
    into v_stage
    from public.process_run_stages s
    join public.process_runs r on r.id = s.process_run_id
    where s.id = p_stage_id
      and r.org_id = p_org_id
    for update;
  end if;

  if v_stage.id is null and v_task.process_run_stage_id is not null then
    select s.*
    into v_stage
    from public.process_run_stages s
    join public.process_runs r on r.id = s.process_run_id
    where s.id = v_task.process_run_stage_id
      and r.org_id = p_org_id
    for update;
  end if;

  if v_task.id is null and v_stage.task_id is not null then
    select *
    into v_task
    from public.tasks
    where id = v_stage.task_id
      and org_id = p_org_id
    for update;
  end if;

  if v_stage.id is not null then
    select *
    into v_run
    from public.process_runs
    where id = v_stage.process_run_id
      and org_id = p_org_id;
  end if;

  if v_task.id is null and v_mode in ('unlink', 'delete_task_keep_draft') then
    raise exception 'فعالیت مرتبط پیدا نشد.' using errcode = 'P0001';
  end if;

  if v_mode = 'unlink' and v_task.id is not null then
    update public.tasks
    set related_to_module = null,
        source_module_id = null,
        source_record_id = null,
        source_template_id = null,
        process_group_id = null,
        process_run_id = null,
        process_run_stage_id = null,
        process_node_key = null,
        process_lane_key = null,
        recurrence_info = coalesce(recurrence_info, '{}'::jsonb)
          - 'process_group'
          - 'process_links'
          - 'process_graph'
          - 'process_run_id'
          - 'process_run_stage_id'
          - 'process_node_key'
          - 'process_lane_key',
        updated_at = now()
    where id = v_task.id
      and org_id = p_org_id;
    v_unlinked_task := true;
  elsif v_task.id is not null then
    v_task_snapshot := to_jsonb(v_task);

    delete from public.recycle_bin_records
    where source_table = 'tasks'
      and source_record_id = v_task.id;

    insert into public.recycle_bin_records (
      org_id,
      module_id,
      source_table,
      source_record_id,
      record_title,
      snapshot,
      deleted_by,
      deleted_by_name
    )
    values (
      p_org_id,
      'tasks',
      'tasks',
      v_task.id,
      public.recycle_bin_record_title(v_task_snapshot),
      v_task_snapshot,
      p_deleted_by,
      nullif(btrim(coalesce(p_deleted_by_name, '')), '')
    );

    delete from public.tasks
    where id = v_task.id
      and org_id = p_org_id;
    v_deleted_task := true;
  end if;

  if v_stage.id is not null then
    if v_mode = 'delete_all' then
      insert into public.process_v2_deleted_stage_marks (
        org_id,
        process_run_stage_id,
        process_run_id,
        process_group_id,
        template_stage_id,
        draft_stage_key,
        process_node_key,
        process_lane_key,
        deleted_by,
        deleted_by_name,
        deleted_at
      )
      values (
        p_org_id,
        v_stage.id,
        v_stage.process_run_id,
        nullif(btrim(coalesce(v_run.process_group_id, '')), ''),
        v_stage.template_stage_id,
        coalesce(
          nullif(btrim(coalesce(v_stage.metadata ->> 'draft_stage_key', '')), ''),
          nullif(btrim(coalesce(v_stage.metadata ->> 'draft_stage_id', '')), '')
        ),
        coalesce(
          nullif(btrim(coalesce(v_stage.process_node_key, '')), ''),
          nullif(btrim(coalesce(v_stage.metadata ->> 'process_node_key', '')), '')
        ),
        coalesce(
          nullif(btrim(coalesce(v_stage.process_lane_key, '')), ''),
          nullif(btrim(coalesce(v_stage.metadata ->> 'process_lane_key', '')), '')
        ),
        p_deleted_by,
        nullif(btrim(coalesce(p_deleted_by_name, '')), ''),
        now()
      )
      on conflict (org_id, process_run_stage_id) do update
      set process_run_id = excluded.process_run_id,
          process_group_id = excluded.process_group_id,
          template_stage_id = excluded.template_stage_id,
          draft_stage_key = excluded.draft_stage_key,
          process_node_key = excluded.process_node_key,
          process_lane_key = excluded.process_lane_key,
          deleted_by = excluded.deleted_by,
          deleted_by_name = excluded.deleted_by_name,
          deleted_at = excluded.deleted_at;
      v_stage_tombstoned := true;
    else
      update public.process_run_stages
      set task_id = null,
          status = 'todo',
          started_at = null,
          completed_at = null,
          updated_at = now()
      where id = v_stage.id;
    end if;
  end if;

  return jsonb_build_object(
    'deleted_task', v_deleted_task,
    'unlinked_task', v_unlinked_task,
    'stage_tombstoned', v_stage_tombstoned,
    'task_id', case when v_task.id is null then null else v_task.id end,
    'stage_id', case when v_stage.id is null then null else v_stage.id end
  );
end;
$$;

revoke all on function public.kalam_emit_process_parent_module_list_invalidation() from public, anon, authenticated;
revoke all on function public.process_v2_save_draft_stage(uuid, uuid, text, uuid, uuid, numeric, timestamptz, timestamptz, jsonb) from public, anon;
revoke all on function public.process_v2_delete_task_stage(uuid, uuid, uuid, text, uuid, text) from public, anon;

grant execute on function public.process_v2_save_draft_stage(uuid, uuid, text, uuid, uuid, numeric, timestamptz, timestamptz, jsonb) to authenticated, service_role;
grant execute on function public.process_v2_delete_task_stage(uuid, uuid, uuid, text, uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
