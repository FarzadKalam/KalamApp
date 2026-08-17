-- Phase 455: رفع timeout گزارش‌های فرآیند و اتوماسیون
-- این migration idempotent است و فقط نمای گزارش را سبک‌تر می‌کند.

begin;

create index if not exists idx_workflow_logs_org_created_at_id_desc
  on public.workflow_logs (org_id, created_at desc, id desc);

create index if not exists idx_workflow_logs_created_at_id_desc
  on public.workflow_logs (created_at desc, id desc);

-- نام و نوع اجرای هر گزارش از snapshot همان لاگ خوانده می‌شود. اتصال به
-- workflows برای هر ردیف، در شمارش و صفحه‌بندی سازمان‌های پرکار باعث timeout
-- می‌شد و برای نمایش گزارش لازم نیست.
create or replace view public.automation_execution_reports
with (security_invoker = true)
as
select
  l.id,
  l.org_id,
  case
    when l.run_type = 'process_automation' then
      case when coalesce(l.details ->> 'process_automation_trigger_type', '') = 'interval'
        then 'automation_scheduled' else 'automation_conditional' end
    when l.run_type = 'scheduled_report' then 'report_scheduled'
    when l.run_type = 'scheduled' then 'workflow_scheduled'
    else 'workflow_conditional'
  end as report_category,
  case
    when l.run_type = 'process_automation' then 'automation'
    when l.run_type = 'scheduled_report' then 'report'
    else 'workflow'
  end as source_type,
  coalesce(
    nullif(l.details ->> 'report_name', ''),
    nullif(l.details ->> 'workflow_name', ''),
    nullif(l.details ->> 'process_automation_rule_name', ''),
    nullif(l.details ->> 'process_automation_rule_id', ''),
    case when l.run_type = 'scheduled_report' then 'گزارش زمان‌دار'
         when l.run_type = 'process_automation' then 'اتوماسیون' else 'گردش کار' end
  ) as automation_name,
  coalesce(
    nullif(l.details ->> 'process_automation_trigger_type', ''),
    nullif(l.details ->> 'trigger_type', ''),
    nullif(l.details ->> 'event', ''),
    case when l.run_type in ('scheduled', 'scheduled_report') then 'interval' else '' end
  ) as trigger_type,
  coalesce(nullif(l.details ->> 'execution_mode', ''), '') as execution_mode,
  case
    when l.status = 'failed' and coalesce(l.message, '') ilike '%نیازمند پیگیری%'
      then 'needs_attention'
    else l.status
  end as status,
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
  l.created_at as updated_at,
  coalesce(nullif(l.details ->> 'record_title', ''), '[بدون عنوان]') as record_title
from public.workflow_logs l;

grant select on public.automation_execution_reports to authenticated;

notify pgrst, 'reload schema';

commit;
