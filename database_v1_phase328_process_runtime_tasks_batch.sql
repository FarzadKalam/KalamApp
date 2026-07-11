-- Phase 328: batch task loading for Process V2 cards
-- Keeps list/dashboard reads org-scoped and restores runtime cards when the
-- durable task link is the only complete link to the parent record.

begin;

create index if not exists idx_tasks_org_process_run_sort
  on public.tasks(org_id, process_run_id, sort_order)
  where process_run_id is not null;

create index if not exists idx_tasks_org_process_run_stage
  on public.tasks(org_id, process_run_stage_id)
  where process_run_stage_id is not null;

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
  matched_tasks as (
    select distinct on (rr.record_id, t.id) rr.record_id as requested_record_id, t.*
    from requested_records rr
    join public.tasks t
      on t.org_id = public.current_org_id()
     and (
       (t.source_module_id = p_module_id and t.source_record_id = rr.record_id)
       or coalesce(t.recurrence_info -> 'process_links' ->> p_module_id, '') = rr.record_id::text
       or (p_module_id = 'process_runs' and t.process_run_id = rr.record_id)
       or (p_module_id = 'projects' and t.project_id = rr.record_id)
       or (p_module_id = 'marketing_leads' and t.marketing_lead_id = rr.record_id)
       or (p_module_id = 'products' and t.related_product = rr.record_id)
       or (p_module_id = 'customers' and t.related_customer = rr.record_id)
       or (p_module_id = 'suppliers' and t.related_supplier = rr.record_id)
       or (p_module_id = 'production_orders' and t.related_production_order = rr.record_id)
       or (p_module_id = 'invoices' and t.related_invoice = rr.record_id)
       or (p_module_id = 'purchase_invoices' and t.purchase_invoice_id = rr.record_id)
       or exists (
         select 1
         from public.process_runs r
         where r.id = t.process_run_id
           and r.org_id = public.current_org_id()
           and (
             (r.module_id = p_module_id and r.record_id = rr.record_id)
             or exists (
               select 1
               from public.process_run_links l
               where l.org_id = public.current_org_id()
                 and l.process_run_id = r.id
                 and l.module_id = p_module_id
                 and l.record_id = rr.record_id
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
       )
     )
    order by rr.record_id, t.id
  ),
  task_rows as (
    select
      mt.requested_record_id,
      mt.id,
      jsonb_build_object(
        'id', mt.id,
        'name', mt.name,
        'status', mt.status,
        'task_type', mt.task_type,
        'assignee_id', mt.assignee_id,
        'assignee_role_id', mt.assignee_role_id,
        'assignee_type', mt.assignee_type,
        'sort_order', mt.sort_order,
        'process_group_id', mt.process_group_id,
        'process_run_id', mt.process_run_id,
        'process_run_stage_id', mt.process_run_stage_id,
        'recurrence_info', mt.recurrence_info,
        'source_module_id', mt.source_module_id,
        'source_record_id', mt.source_record_id,
        'source_template_id', mt.source_template_id,
        'source_stage_sort_order', mt.source_stage_sort_order,
        'process_node_key', mt.process_node_key,
        'process_lane_key', mt.process_lane_key,
        'due_date', mt.due_date,
        'created_at', mt.created_at,
        'updated_at', mt.updated_at
      ) as row_json,
      mt.sort_order,
      mt.source_stage_sort_order,
      mt.due_date
    from matched_tasks mt
  )
  select
    rr.record_id,
    coalesce((
      select jsonb_agg(tr.row_json order by tr.sort_order nulls last, tr.source_stage_sort_order nulls last, tr.due_date nulls last, tr.id)
      from task_rows tr
      where tr.requested_record_id = rr.record_id
    ), '[]'::jsonb) as tasks
  from requested_records rr;
$$;

revoke all on function public.get_process_runtime_tasks_batch_for_records(text, uuid[]) from public;
grant execute on function public.get_process_runtime_tasks_batch_for_records(text, uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
