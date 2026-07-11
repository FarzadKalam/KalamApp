-- Phase 329: make Process V2 task batching planner-friendly.
-- Phase 328 used one wide OR predicate; this version keeps each link path
-- separate so PostgreSQL can use the existing per-org and relation indexes.

begin;

create index if not exists idx_process_run_stages_process_link_map_gin
  on public.process_run_stages using gin ((metadata -> 'process_link_map'));

create index if not exists idx_process_run_stages_process_links_gin
  on public.process_run_stages using gin ((metadata -> 'process_links'));

create or replace function public.get_process_runtime_tasks_batch_for_records(
  p_module_id text,
  p_record_ids uuid[]
)
returns table(record_id uuid, tasks jsonb)
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
  matched_task_ids as (
    select rr.record_id, t.id as task_id
    from requested_records rr
    join public.tasks t
      on t.org_id = public.current_org_id()
     and t.source_module_id = p_module_id
     and t.source_record_id = rr.record_id

    union

    select rr.record_id, t.id
    from requested_records rr
    join public.tasks t
      on t.org_id = public.current_org_id()
     and (t.recurrence_info -> 'process_links') @> jsonb_build_object(p_module_id, rr.record_id::text)

    union

    select rr.record_id, t.id
    from requested_records rr
    join public.tasks t
      on p_module_id = 'process_runs'
     and t.org_id = public.current_org_id()
     and t.process_run_id = rr.record_id

    union

    select rr.record_id, t.id
    from requested_records rr
    join public.tasks t
      on p_module_id = 'projects'
     and t.org_id = public.current_org_id()
     and t.project_id = rr.record_id

    union

    select rr.record_id, t.id
    from requested_records rr
    join public.tasks t
      on p_module_id = 'marketing_leads'
     and t.org_id = public.current_org_id()
     and t.marketing_lead_id = rr.record_id

    union

    select rr.record_id, t.id
    from requested_records rr
    join public.tasks t
      on p_module_id = 'products'
     and t.org_id = public.current_org_id()
     and t.related_product = rr.record_id

    union

    select rr.record_id, t.id
    from requested_records rr
    join public.tasks t
      on p_module_id = 'customers'
     and t.org_id = public.current_org_id()
     and t.related_customer = rr.record_id

    union

    select rr.record_id, t.id
    from requested_records rr
    join public.tasks t
      on p_module_id = 'suppliers'
     and t.org_id = public.current_org_id()
     and t.related_supplier = rr.record_id

    union

    select rr.record_id, t.id
    from requested_records rr
    join public.tasks t
      on p_module_id = 'production_orders'
     and t.org_id = public.current_org_id()
     and t.related_production_order = rr.record_id

    union

    select rr.record_id, t.id
    from requested_records rr
    join public.tasks t
      on p_module_id = 'invoices'
     and t.org_id = public.current_org_id()
     and t.related_invoice = rr.record_id

    union

    select rr.record_id, t.id
    from requested_records rr
    join public.tasks t
      on p_module_id = 'purchase_invoices'
     and t.org_id = public.current_org_id()
     and t.purchase_invoice_id = rr.record_id

    union

    select mr.record_id, t.id
    from matching_run_ids mr
    join public.tasks t
      on t.org_id = public.current_org_id()
     and t.process_run_id = mr.process_run_id

    union

    select mr.record_id, t.id
    from matching_run_ids mr
    join public.process_run_stages s
      on s.process_run_id = mr.process_run_id
    join public.tasks t
      on t.org_id = public.current_org_id()
     and (t.id = s.task_id or t.process_run_stage_id = s.id)
  ),
  task_rows as (
    select
      matched.record_id,
      t.id,
      t.sort_order,
      t.source_stage_sort_order,
      t.due_date,
      jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'status', t.status,
        'task_type', t.task_type,
        'assignee_id', t.assignee_id,
        'assignee_role_id', t.assignee_role_id,
        'assignee_type', t.assignee_type,
        'sort_order', t.sort_order,
        'process_group_id', t.process_group_id,
        'process_run_id', t.process_run_id,
        'process_run_stage_id', t.process_run_stage_id,
        'recurrence_info', t.recurrence_info,
        'source_module_id', t.source_module_id,
        'source_record_id', t.source_record_id,
        'source_template_id', t.source_template_id,
        'source_stage_sort_order', t.source_stage_sort_order,
        'process_node_key', t.process_node_key,
        'process_lane_key', t.process_lane_key,
        'due_date', t.due_date,
        'created_at', t.created_at,
        'updated_at', t.updated_at
      ) as row_json
    from matched_task_ids matched
    join public.tasks t
      on t.id = matched.task_id
     and t.org_id = public.current_org_id()
  )
  select
    rr.record_id,
    coalesce((
      select jsonb_agg(tr.row_json order by tr.sort_order nulls last, tr.source_stage_sort_order nulls last, tr.due_date nulls last, tr.id)
      from task_rows tr
      where tr.record_id = rr.record_id
    ), '[]'::jsonb) as tasks
  from requested_records rr;
$$;

revoke all on function public.get_process_runtime_tasks_batch_for_records(text, uuid[]) from public;
grant execute on function public.get_process_runtime_tasks_batch_for_records(text, uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
