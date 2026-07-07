-- Phase 318: Process runtime task batch RPC
-- Provides one org-scoped read path for process runtime tasks instead of
-- multiple large client-side task queries.

begin;

create or replace function public.get_process_runtime_tasks_for_context(
  p_task_ids uuid[] default '{}'::uuid[],
  p_process_run_ids uuid[] default '{}'::uuid[],
  p_process_run_stage_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(task_rows) order by task_rows.sort_order nulls last, task_rows.due_date nulls last, task_rows.id), '[]'::jsonb)
  from (
    select distinct on (t.id)
      t.id,
      t.name,
      t.status,
      t.task_type,
      t.assignee_id,
      t.assignee_role_id,
      t.assignee_type,
      t.sort_order,
      t.process_group_id,
      t.process_run_id,
      t.process_run_stage_id,
      t.recurrence_info,
      t.source_module_id,
      t.source_record_id,
      t.source_template_id,
      t.source_stage_sort_order,
      t.due_date
    from public.tasks t
    where t.org_id = public.current_org_id()
      and (
        t.id = any(coalesce(p_task_ids, '{}'::uuid[]))
        or t.process_run_id = any(coalesce(p_process_run_ids, '{}'::uuid[]))
        or t.process_run_stage_id = any(coalesce(p_process_run_stage_ids, '{}'::uuid[]))
      )
    order by t.id, t.sort_order nulls last, t.due_date nulls last
  ) task_rows;
$$;

revoke all on function public.get_process_runtime_tasks_for_context(uuid[], uuid[], uuid[]) from public;
grant execute on function public.get_process_runtime_tasks_for_context(uuid[], uuid[], uuid[]) to authenticated, service_role;

commit;
