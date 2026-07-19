-- Phase 354: خلاصهٔ سبک Runtime فرآیند، سازگار با schemaهای قدیمی tasks.
-- Phase 353 به‌دلیل نبودن tasks.is_deleted در بعضی productionها rollback شد.
-- این migration به آن ستون وابسته نیست و هیچ دادهٔ پیش‌نویس یا فعالیتی را تغییر نمی‌دهد.

begin;

create index if not exists idx_tasks_process_links_runtime_gin
  on public.tasks using gin ((recurrence_info -> 'process_links'));

create index if not exists idx_tasks_org_process_run_runtime
  on public.tasks(org_id, process_run_id);

create index if not exists idx_process_run_links_org_module_record_run
  on public.process_run_links(org_id, module_id, record_id, process_run_id);

create index if not exists idx_process_v2_deleted_stage_marks_org_stage
  on public.process_v2_deleted_stage_marks(org_id, process_run_stage_id);

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
