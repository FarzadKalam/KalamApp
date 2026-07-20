-- Phase 356: نگه‌داری ردیف‌های واقعی فرآیند در همهٔ projectionهای Runtime.
-- نمای ستونی از خلاصهٔ سبک استفاده می‌کند؛ بدون process_lane_key همهٔ مرحله‌ها
-- به‌اشتباه در lane پیش‌فرض ادغام می‌شدند. این migration فقط projection را
-- کامل می‌کند و هیچ فرآیند، مرحله یا فعالیتی را تغییر نمی‌دهد.

begin;

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
        'process_node_key', coalesce(to_jsonb(s) -> 'process_node_key', s.metadata -> 'process_node_key'),
        'process_lane_key', coalesce(to_jsonb(s) -> 'process_lane_key', s.metadata -> 'process_lane_key'),
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

create or replace function public.get_process_runtime_summary_batch_for_records(
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
        'updated_at', r.updated_at
      ) as row_json,
      r.created_at
    from matching_runs r
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
        'status', coalesce(task.status, s.status),
        'task_id', coalesce(s.task_id, task.id),
        'assignee_user_id', s.assignee_user_id,
        'assignee_role_id', s.assignee_role_id,
        'wage', s.wage,
        'process_node_key', coalesce(to_jsonb(s) -> 'process_node_key', s.metadata -> 'process_node_key'),
        'process_lane_key', coalesce(to_jsonb(s) -> 'process_lane_key', s.metadata -> 'process_lane_key'),
        'created_at', s.created_at,
        'updated_at', s.updated_at
      ) as row_json,
      s.process_run_id,
      s.sort_order
    from public.process_run_stages s
    join matching_runs r on r.id = s.process_run_id
    left join lateral (
      select t.id, t.status
      from public.tasks t
      where t.org_id = r.org_id
        and (t.id = s.task_id or t.process_run_stage_id = s.id)
      order by t.updated_at desc nulls last, t.id
      limit 1
    ) task on true
    where not exists (
      select 1
      from public.process_v2_deleted_stage_marks mark
      where mark.org_id = r.org_id
        and mark.process_run_stage_id = s.id
    )
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

revoke all on function public.get_process_runtime_summary_batch_for_records(text, uuid[]) from public;
grant execute on function public.get_process_runtime_summary_batch_for_records(text, uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
