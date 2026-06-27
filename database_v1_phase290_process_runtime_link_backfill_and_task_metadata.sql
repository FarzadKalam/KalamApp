-- Phase 290: Process V2 linked runtime repair and task metadata compatibility
-- Keeps process visibility consistent across all linked records and prevents
-- task runtime readers from failing on environments that predate task metadata.

begin;

alter table if exists public.tasks
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_tasks_org_process_links_gin
  on public.tasks using gin ((recurrence_info -> 'process_links'));

insert into public.process_run_links (org_id, process_run_id, module_id, record_id, is_primary)
select distinct
  t.org_id,
  t.process_run_id,
  link.key,
  link.value::uuid,
  false
from public.tasks t
cross join lateral jsonb_each_text(
  case
    when jsonb_typeof(t.recurrence_info -> 'process_links') = 'object'
      then t.recurrence_info -> 'process_links'
    else '{}'::jsonb
  end
) as link(key, value)
where t.org_id is not null
  and t.process_run_id is not null
  and link.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
on conflict (process_run_id, module_id, record_id)
do update set
  org_id = excluded.org_id,
  is_primary = public.process_run_links.is_primary or excluded.is_primary;

insert into public.process_run_links (org_id, process_run_id, module_id, record_id, is_primary)
select distinct
  r.org_id,
  s.process_run_id,
  link.key,
  link.value::uuid,
  false
from public.process_run_stages s
join public.process_runs r on r.id = s.process_run_id
cross join lateral jsonb_each_text(
  case
    when jsonb_typeof(s.metadata -> 'process_link_map') = 'object'
      then s.metadata -> 'process_link_map'
    when jsonb_typeof(s.metadata -> 'process_links') = 'object'
      then s.metadata -> 'process_links'
    else '{}'::jsonb
  end
) as link(key, value)
where r.org_id is not null
  and s.process_run_id is not null
  and link.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
on conflict (process_run_id, module_id, record_id)
do update set
  org_id = excluded.org_id,
  is_primary = public.process_run_links.is_primary or excluded.is_primary;

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
  with matching_runs as (
    select r.*
    from public.process_runs r
    where r.org_id = public.current_org_id()
      and (
        (r.module_id = p_module_id and r.record_id = p_record_id)
        or exists (
          select 1
          from public.process_run_links l
          where l.process_run_id = r.id
            and l.org_id = public.current_org_id()
            and l.module_id = p_module_id
            and l.record_id = p_record_id
        )
        or exists (
          select 1
          from public.tasks t
          where t.org_id = public.current_org_id()
            and t.process_run_id = r.id
            and coalesce(t.recurrence_info -> 'process_links' ->> p_module_id, '') = p_record_id::text
        )
        or exists (
          select 1
          from public.process_run_stages s
          where s.process_run_id = r.id
            and coalesce(
              s.metadata -> 'process_link_map' ->> p_module_id,
              s.metadata -> 'process_links' ->> p_module_id,
              ''
            ) = p_record_id::text
        )
      )
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
    'runs',
    coalesce((select jsonb_agg(to_jsonb(rr) order by rr.created_at desc) from run_rows rr), '[]'::jsonb),
    'stages',
    coalesce((select jsonb_agg(to_jsonb(sr) order by sr.process_run_id, sr.sort_order) from stage_rows sr), '[]'::jsonb)
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
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
begin
  if auth.uid() is null or v_org_id is null then
    return;
  end if;

  return query
  with requested_records as (
    select distinct unnest(coalesce(p_record_ids, '{}'::uuid[])) as record_id
  ),
  matching_runs as (
    select distinct
      rr.record_id as requested_record_id,
      r.*
    from requested_records rr
    join public.process_runs r
      on r.org_id = v_org_id
     and (
       (r.module_id = p_module_id and r.record_id = rr.record_id)
       or exists (
         select 1
         from public.process_run_links l
         where l.process_run_id = r.id
           and l.org_id = v_org_id
           and l.module_id = p_module_id
           and l.record_id = rr.record_id
       )
       or exists (
         select 1
         from public.tasks t
         where t.org_id = v_org_id
           and t.process_run_id = r.id
           and coalesce(t.recurrence_info -> 'process_links' ->> p_module_id, '') = rr.record_id::text
       )
       or exists (
         select 1
         from public.process_run_stages s
         where s.process_run_id = r.id
           and coalesce(
             s.metadata -> 'process_link_map' ->> p_module_id,
             s.metadata -> 'process_links' ->> p_module_id,
             ''
           ) = rr.record_id::text
       )
     )
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
      ) as row_json
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
      select jsonb_agg(row_json order by row_json ->> 'created_at' desc)
      from run_rows r
      where r.requested_record_id = rr.record_id
    ), '[]'::jsonb) as runs,
    coalesce((
      select jsonb_agg(row_json order by process_run_id, sort_order)
      from stage_rows s
      where s.requested_record_id = rr.record_id
    ), '[]'::jsonb) as stages
  from requested_records rr;
end;
$$;

revoke all on function public.get_process_runtime_batch_for_records(text, uuid[]) from public;
grant execute on function public.get_process_runtime_batch_for_records(text, uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
