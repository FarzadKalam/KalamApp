-- Phase 299: Process V2 task-stage delete RPC
-- Deletes or unlinks process V2 tasks without routing through legacy recycle cascades.

begin;

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

    if v_stage.id is not null then
      select *
      into v_run
      from public.process_runs
      where id = v_stage.process_run_id
        and org_id = p_org_id;
    end if;
  end if;

  if v_task.id is null and v_stage.task_id is not null then
    select *
    into v_task
    from public.tasks
    where id = v_stage.task_id
      and org_id = p_org_id
    for update;
  end if;

  if v_task.id is null and v_mode in ('unlink', 'delete_task_keep_draft') then
    raise exception 'فعالیت مرتبط پیدا نشد.' using errcode = 'P0001';
  end if;

  if v_mode = 'unlink' then
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
          assignee_user_id = null,
          assignee_role_id = null,
          planned_due_at = null,
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

revoke all on function public.process_v2_delete_task_stage(uuid, uuid, uuid, text, uuid, text) from public, anon;
grant execute on function public.process_v2_delete_task_stage(uuid, uuid, uuid, text, uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
