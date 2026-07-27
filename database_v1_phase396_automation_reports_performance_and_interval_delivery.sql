-- Phase 396: پایداری اجرای زمان‌دار و نمایش سریع گزارش‌های اتوماسیون
-- این migration فقط ساختار خواندن گزارش‌ها را بهینه می‌کند و داده‌ای را حذف یا بازپخش نمی‌کند.

-- گزارش‌ها در صفحهٔ فهرست بر اساس زمان اجرا و شناسه مرتب می‌شوند. این index
-- هم برای درخواست عمومی و هم برای RLS هر سازمان مسیر سریع و مستقلی فراهم می‌کند.
create index if not exists idx_workflow_logs_created_at_id_desc
  on public.workflow_logs (created_at desc, id desc);

create index if not exists idx_workflow_logs_org_created_at_id_desc
  on public.workflow_logs (org_id, created_at desc, id desc);

-- اتصال قبلی به tasks با تبدیل id به text انجام می‌شد و برنامه‌ریز را وادار
-- می‌کرد برای ساخت گزارش‌ها تعداد زیادی فعالیت را اسکن کند. عنوان رکوردهای
-- جدید از snapshot لاگ خوانده می‌شود و برای لاگ‌های قدیمی مقدار امن نشان داده می‌شود.
create or replace view public.automation_execution_reports
with (security_invoker = true)
as
select
  l.id,
  coalesce(l.org_id, w.org_id) as org_id,
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
  l.created_at as updated_at,
  coalesce(nullif(l.details ->> 'record_title', ''), '[بدون عنوان]') as record_title
from public.workflow_logs l
left join public.workflows w on w.id = l.workflow_id;

grant select on public.automation_execution_reports to authenticated;

notify pgrst, 'reload schema';
