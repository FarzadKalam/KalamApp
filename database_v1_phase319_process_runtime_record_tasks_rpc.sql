-- Phase 319: Process runtime tasks by record
-- Reads real process tasks for one module record using stable process keys and
-- org-scoped filters, so ModuleList and ModuleShow can render runtime state
-- without falling back to draft-only process cards.

begin;

create or replace function public.get_process_runtime_tasks_for_record(
  p_module_id text,
  p_record_id uuid,
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
  select coalesce(jsonb_agg(to_jsonb(task_rows) order by task_rows.sort_order nulls last, task_rows.source_stage_sort_order nulls last, task_rows.due_date nulls last, task_rows.id), '[]'::jsonb)
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
      t.process_node_key,
      t.process_lane_key,
      t.due_date,
      t.created_at,
      t.updated_at
    from public.tasks t
    where t.org_id = public.current_org_id()
      and (
        t.id = any(coalesce(p_task_ids, '{}'::uuid[]))
        or t.process_run_id = any(coalesce(p_process_run_ids, '{}'::uuid[]))
        or t.process_run_stage_id = any(coalesce(p_process_run_stage_ids, '{}'::uuid[]))
        or (t.source_module_id = p_module_id and t.source_record_id = p_record_id)
        or coalesce(t.recurrence_info -> 'process_links' ->> p_module_id, '') = p_record_id::text
        or (
          p_module_id = 'projects'
          and t.project_id = p_record_id
        )
        or (
          p_module_id = 'marketing_leads'
          and t.marketing_lead_id = p_record_id
        )
        or (
          p_module_id = 'products'
          and t.related_product = p_record_id
        )
        or (
          p_module_id = 'customers'
          and t.related_customer = p_record_id
        )
        or (
          p_module_id = 'suppliers'
          and t.related_supplier = p_record_id
        )
        or (
          p_module_id = 'production_orders'
          and t.related_production_order = p_record_id
        )
        or (
          p_module_id = 'invoices'
          and t.related_invoice = p_record_id
        )
        or (
          p_module_id = 'purchase_invoices'
          and t.purchase_invoice_id = p_record_id
        )
      )
    order by t.id, t.sort_order nulls last, t.source_stage_sort_order nulls last, t.due_date nulls last
  ) task_rows;
$$;

revoke all on function public.get_process_runtime_tasks_for_record(text, uuid, uuid[], uuid[], uuid[]) from public;
grant execute on function public.get_process_runtime_tasks_for_record(text, uuid, uuid[], uuid[], uuid[]) to authenticated, service_role;

commit;
