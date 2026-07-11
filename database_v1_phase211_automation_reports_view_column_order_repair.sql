-- KalamApp - Phase 211: Automation reports view column-order repair
-- PostgreSQL requires existing view columns to keep their original positions.

begin;

create or replace view public.automation_execution_reports
with (security_invoker = true)
as
select
  l.id,
  coalesce(l.org_id, w.org_id, t.org_id) as org_id,
  case
    when l.run_type = 'process_automation' then
      case when coalesce(l.details ->> 'process_automation_trigger_type', '') = 'interval'
        then 'automation_scheduled'
        else 'automation_conditional'
      end
    else
      case when coalesce(w.trigger_type, case when l.run_type = 'scheduled' then 'interval' else '' end, '') = 'interval'
        or l.run_type = 'scheduled'
        then 'workflow_scheduled'
        else 'workflow_conditional'
      end
  end as report_category,
  case when l.run_type = 'process_automation' then 'automation' else 'workflow' end as source_type,
  coalesce(
    nullif(w.name, ''),
    nullif(l.details ->> 'workflow_name', ''),
    nullif(l.details ->> 'process_automation_rule_name', ''),
    nullif(l.details ->> 'process_automation_rule_id', ''),
    case when l.run_type = 'process_automation' then 'اتوماسیون' else 'گردش کار' end
  ) as automation_name,
  coalesce(
    l.details ->> 'process_automation_trigger_type',
    w.trigger_type,
    case when l.run_type = 'scheduled' then 'interval' else '' end
  ) as trigger_type,
  coalesce(l.details ->> 'execution_mode', w.execution_mode, '') as execution_mode,
  l.status,
  l.module_id,
  l.record_id,
  l.message,
  l.details,
  l.created_at,
  '[]'::jsonb as tags,
  null::uuid as assignee_id,
  null::text as assignee_type,
  null::uuid as assignee_role_id,
  null::uuid as process_template_id,
  l.created_at as updated_at
from public.workflow_logs l
left join public.workflows w on w.id = l.workflow_id
left join public.tasks t on l.run_type = 'process_automation' and t.id::text = l.record_id;

create index if not exists idx_workflow_logs_org_created_at
  on public.workflow_logs(org_id, created_at desc);

grant select on public.automation_execution_reports to authenticated;

notify pgrst, 'reload schema';

commit;
