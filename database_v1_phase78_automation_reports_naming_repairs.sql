-- =====================================================
-- KalamApp - Phase 78 Automation/Workflow Reports Naming Repairs
-- Date: 2026-04-10
-- Type: Non-breaking view refresh
-- Goal: distinguish workflow runs from automations and improve display names
-- =====================================================

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
      case when coalesce(w.trigger_type, '') = 'interval'
        then 'workflow_scheduled'
        else 'workflow_conditional'
      end
  end as report_category,
  case when l.run_type = 'process_automation' then 'automation' else 'workflow' end as source_type,
  coalesce(
    nullif(w.name, ''),
    nullif(l.details ->> 'process_automation_rule_name', ''),
    nullif(l.details ->> 'process_automation_rule_id', ''),
    case when l.run_type = 'process_automation' then 'اتوماسیون' else 'گردش کار' end
  ) as automation_name,
  coalesce(l.details ->> 'process_automation_trigger_type', w.trigger_type, '') as trigger_type,
  coalesce(l.details ->> 'execution_mode', w.execution_mode, '') as execution_mode,
  l.status,
  l.module_id,
  l.record_id,
  l.message,
  l.details,
  l.created_at,
  '[]'::jsonb as tags
from public.workflow_logs l
left join public.workflows w on w.id = l.workflow_id
left join public.tasks t on l.run_type = 'process_automation' and t.id::text = l.record_id
where l.run_type in ('event', 'process_automation');

grant select on public.automation_execution_reports to authenticated;

commit;
