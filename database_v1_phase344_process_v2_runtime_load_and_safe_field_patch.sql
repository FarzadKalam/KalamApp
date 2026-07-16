-- Phase 344: Process V2 runtime load performance and atomic custom-field saves.
-- Keeps every lookup fail-closed per organization and replaces wide OR scans
-- with planner-friendly UNION branches that can use the existing indexes.

begin;

create index if not exists idx_process_runs_org_module_record_runtime
  on public.process_runs (org_id, module_id, record_id, created_at desc);

create index if not exists idx_process_run_links_org_module_record_runtime
  on public.process_run_links (org_id, module_id, record_id, process_run_id);

create index if not exists idx_tasks_org_process_links_runtime_gin
  on public.tasks using gin ((recurrence_info -> 'process_links'));

create index if not exists idx_process_run_stages_link_map_runtime_gin
  on public.process_run_stages using gin ((metadata -> 'process_link_map'));

create index if not exists idx_process_run_stages_links_runtime_gin
  on public.process_run_stages using gin ((metadata -> 'process_links'));

create or replace function public.get_process_runtime_for_record(
  p_module_id text,
  p_record_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with matching_run_ids as (
    select r.id as process_run_id
    from public.process_runs r
    where r.org_id = public.current_org_id()
      and r.module_id = p_module_id
      and r.record_id = p_record_id

    union

    select l.process_run_id
    from public.process_run_links l
    where l.org_id = public.current_org_id()
      and l.module_id = p_module_id
      and l.record_id = p_record_id

    union

    select t.process_run_id
    from public.tasks t
    where t.org_id = public.current_org_id()
      and t.process_run_id is not null
      and (t.recurrence_info -> 'process_links') @> jsonb_build_object(p_module_id, p_record_id::text)

    union

    select s.process_run_id
    from public.process_run_stages s
    join public.process_runs r
      on r.id = s.process_run_id
     and r.org_id = public.current_org_id()
    where (s.metadata -> 'process_link_map') @> jsonb_build_object(p_module_id, p_record_id::text)

    union

    select s.process_run_id
    from public.process_run_stages s
    join public.process_runs r
      on r.id = s.process_run_id
     and r.org_id = public.current_org_id()
    where (s.metadata -> 'process_links') @> jsonb_build_object(p_module_id, p_record_id::text)
  ),
  matching_runs as (
    select r.*
    from matching_run_ids matched
    join public.process_runs r
      on r.id = matched.process_run_id
     and r.org_id = public.current_org_id()
  ),
  run_rows as (
    select
      r.id,
      r.template_id,
      r.process_group_id,
      r.process_name,
      r.status,
      r.module_id,
      r.record_id,
      r.started_at,
      r.completed_at,
      r.created_at,
      r.updated_at,
      creator.full_name as created_by_name,
      updater.full_name as updated_by_name
    from matching_runs r
    left join public.profiles creator on creator.id = r.created_by and creator.org_id = r.org_id
    left join public.profiles updater on updater.id = r.updated_by and updater.org_id = r.org_id
  ),
  stage_rows as (
    select
      s.id,
      s.process_run_id,
      s.template_stage_id,
      s.stage_name,
      s.sort_order,
      s.status,
      s.task_id,
      s.assignee_user_id,
      s.assignee_role_id,
      s.wage,
      s.metadata,
      s.created_at,
      s.updated_at
    from public.process_run_stages s
    join matching_runs r on r.id = s.process_run_id
  )
  select jsonb_build_object(
    'runs', coalesce((select jsonb_agg(to_jsonb(rr) order by rr.created_at desc) from run_rows rr), '[]'::jsonb),
    'stages', coalesce((select jsonb_agg(to_jsonb(sr) order by sr.process_run_id, sr.sort_order) from stage_rows sr), '[]'::jsonb)
  );
$$;

revoke all on function public.get_process_runtime_for_record(text, uuid) from public;
grant execute on function public.get_process_runtime_for_record(text, uuid) to authenticated, service_role;

drop function if exists public.get_process_runtime_batch_for_records(text, uuid[]);

create or replace function public.get_process_runtime_batch_for_records(
  p_module_id text,
  p_record_ids uuid[]
)
returns table(record_id uuid, runs jsonb, stages jsonb)
language sql
stable
security invoker
set search_path = public
as $$
  with requested_records as (
    select distinct unnest(coalesce(p_record_ids, '{}'::uuid[])) as record_id
  ),
  matching_run_ids as (
    select rr.record_id, r.id as process_run_id
    from requested_records rr
    join public.process_runs r
      on r.org_id = public.current_org_id()
     and r.module_id = p_module_id
     and r.record_id = rr.record_id

    union

    select rr.record_id, l.process_run_id
    from requested_records rr
    join public.process_run_links l
      on l.org_id = public.current_org_id()
     and l.module_id = p_module_id
     and l.record_id = rr.record_id

    union

    select rr.record_id, t.process_run_id
    from requested_records rr
    join public.tasks t
      on t.org_id = public.current_org_id()
     and t.process_run_id is not null
     and (t.recurrence_info -> 'process_links') @> jsonb_build_object(p_module_id, rr.record_id::text)

    union

    select rr.record_id, s.process_run_id
    from requested_records rr
    join public.process_run_stages s
      on (s.metadata -> 'process_link_map') @> jsonb_build_object(p_module_id, rr.record_id::text)
    join public.process_runs r
      on r.id = s.process_run_id
     and r.org_id = public.current_org_id()

    union

    select rr.record_id, s.process_run_id
    from requested_records rr
    join public.process_run_stages s
      on (s.metadata -> 'process_links') @> jsonb_build_object(p_module_id, rr.record_id::text)
    join public.process_runs r
      on r.id = s.process_run_id
     and r.org_id = public.current_org_id()
  ),
  matching_runs as (
    select matched.record_id as requested_record_id, r.*
    from matching_run_ids matched
    join public.process_runs r
      on r.id = matched.process_run_id
     and r.org_id = public.current_org_id()
  ),
  run_rows as (
    select
      r.requested_record_id,
      jsonb_build_object(
        'id', r.id,
        'template_id', r.template_id,
        'process_group_id', r.process_group_id,
        'process_name', r.process_name,
        'status', r.status,
        'module_id', r.module_id,
        'record_id', r.record_id,
        'started_at', r.started_at,
        'completed_at', r.completed_at,
        'created_at', r.created_at,
        'updated_at', r.updated_at,
        'created_by_name', creator.full_name,
        'updated_by_name', updater.full_name
      ) as row_json,
      r.created_at
    from matching_runs r
    left join public.profiles creator on creator.id = r.created_by and creator.org_id = r.org_id
    left join public.profiles updater on updater.id = r.updated_by and updater.org_id = r.org_id
  ),
  stage_rows as (
    select
      r.requested_record_id,
      jsonb_build_object(
        'id', s.id,
        'process_run_id', s.process_run_id,
        'template_stage_id', s.template_stage_id,
        'stage_name', s.stage_name,
        'sort_order', s.sort_order,
        'status', s.status,
        'task_id', s.task_id,
        'assignee_user_id', s.assignee_user_id,
        'assignee_role_id', s.assignee_role_id,
        'wage', s.wage,
        'metadata', s.metadata,
        'created_at', s.created_at,
        'updated_at', s.updated_at
      ) as row_json,
      s.process_run_id,
      s.sort_order
    from public.process_run_stages s
    join matching_runs r on r.id = s.process_run_id
  )
  select
    rr.record_id,
    coalesce((
      select jsonb_agg(r.row_json order by r.created_at desc)
      from run_rows r
      where r.requested_record_id = rr.record_id
    ), '[]'::jsonb) as runs,
    coalesce((
      select jsonb_agg(s.row_json order by s.process_run_id, s.sort_order)
      from stage_rows s
      where s.requested_record_id = rr.record_id
    ), '[]'::jsonb) as stages
  from requested_records rr;
$$;

revoke all on function public.get_process_runtime_batch_for_records(text, uuid[]) from public;
grant execute on function public.get_process_runtime_batch_for_records(text, uuid[]) to authenticated, service_role;

create or replace function public.patch_process_task_v2_custom_field_values(
  p_task_id uuid,
  p_field_values jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_task public.tasks%rowtype;
begin
  if auth.uid() is null or v_org_id is null then
    raise exception using errcode = '42501', message = 'دسترسی سازمانی معتبر برای ذخیره فعالیت پیدا نشد.';
  end if;
  if p_task_id is null or p_field_values is null or jsonb_typeof(p_field_values) <> 'object' then
    raise exception using errcode = '22023', message = 'مقادیر فیلدهای اختصاصی معتبر نیست.';
  end if;

  update public.tasks t
  set
    recurrence_info = jsonb_set(
      case
        when jsonb_typeof(t.recurrence_info) = 'object' then t.recurrence_info
        else '{}'::jsonb
      end,
      '{process_task_custom_field_values}',
      case
        when jsonb_typeof(t.recurrence_info -> 'process_task_custom_field_values') = 'object'
          then t.recurrence_info -> 'process_task_custom_field_values'
        else '{}'::jsonb
      end || p_field_values,
      true
    ),
    updated_at = now()
  where t.id = p_task_id
    and t.org_id = v_org_id
  returning t.* into v_task;

  if not found then
    raise exception using errcode = 'P0002', message = 'فعالیت موردنظر برای ذخیره پیدا نشد یا دسترسی آن وجود ندارد.';
  end if;

  return jsonb_build_object(
    'id', v_task.id,
    'status', v_task.status,
    'recurrence_info', v_task.recurrence_info,
    'process_run_id', v_task.process_run_id,
    'process_run_stage_id', v_task.process_run_stage_id,
    'updated_at', v_task.updated_at
  );
end;
$$;

revoke all on function public.patch_process_task_v2_custom_field_values(uuid, jsonb) from public;
grant execute on function public.patch_process_task_v2_custom_field_values(uuid, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
