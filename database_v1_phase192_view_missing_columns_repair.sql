-- =====================================================
-- KalamApp - Phase 192: View Missing Columns Repair
-- Date: 2026-05-24
-- Type: Schema repair / idempotent
-- Problem:
--   1. sms_delivery_reports VIEW references m.tags and m.process_template_id
--      from outbound_messages, but these columns may be missing from the
--      underlying table → VIEW query fails with "column does not exist".
--   2. automation_execution_reports VIEW is missing assignee_type,
--      assignee_id, assignee_role_id. Frontend always selects these via
--      MANAGED_SYSTEM_COLUMNS → query fails with "column does not exist".
--   3. process_templates.module_ids referenced in referenceData.ts startup
--      query but may be missing in some environments.
-- Fix:
--   1. Add tags + process_template_id to outbound_messages (idempotent)
--   2. Recreate sms_delivery_reports VIEW with all expected columns
--   3. Recreate automation_execution_reports VIEW with assignee columns
--   4. Add module_ids to process_templates (idempotent)
-- =====================================================

begin;

-- ─────────────────────────────────────────────
-- ۱. اضافه کردن ستون‌های جدید به outbound_messages
-- ─────────────────────────────────────────────
alter table if exists public.outbound_messages
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists process_template_id uuid references public.process_templates(id) on delete set null;

-- ─────────────────────────────────────────────
-- ۲. بازسازی sms_delivery_reports VIEW
-- ─────────────────────────────────────────────
drop view if exists public.sms_delivery_reports;
create view public.sms_delivery_reports
with (security_invoker = true)
as
select
  m.id,
  m.org_id,
  coalesce(nullif(m.title, ''), nullif(m.sender, ''), nullif(m.recipient, ''), 'پیامک') as title,
  m.channel_type,
  m.provider,
  m.module_id,
  m.record_id,
  m.customer_id,
  m.recipient,
  m.message_text,
  m.status,
  m.provider_message_id,
  m.error_message,
  m.metadata,
  m.sent_at,
  m.created_at,
  m.updated_at,
  m.tags,
  m.assignee_id,
  m.assignee_type,
  m.assignee_role_id,
  m.operator_report,
  m.related_task_id,
  m.process_template_id,
  m.direction,
  m.sender,
  case when m.direction = 'inbound' then m.sender else m.recipient end as phone_number,
  m.phone_number_id,
  m.phone_match_status,
  m.received_at,
  coalesce(m.received_at, m.sent_at, m.created_at) as message_at
from public.outbound_messages m
where m.channel_type = 'sms';

grant select, update on public.sms_delivery_reports to authenticated;

-- ─────────────────────────────────────────────
-- ۳. بازسازی automation_execution_reports VIEW
--    اضافه کردن assignee_type, assignee_id, assignee_role_id
--    که MODULE_LIST_BASE_SELECT_KEYS آن‌ها را برای همه ماژول‌ها select می‌کند
-- ─────────────────────────────────────────────
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
  '[]'::jsonb as tags,
  null::uuid    as assignee_id,
  null::text    as assignee_type,
  null::uuid    as assignee_role_id,
  null::uuid    as process_template_id
from public.workflow_logs l
left join public.workflows w on w.id = l.workflow_id
left join public.tasks t on l.run_type = 'process_automation' and t.id::text = l.record_id
where l.run_type in ('event', 'process_automation');

grant select on public.automation_execution_reports to authenticated;

-- ─────────────────────────────────────────────
-- ۴. اضافه کردن module_ids به process_templates
--    (برای startup query در referenceData.ts)
-- ─────────────────────────────────────────────
alter table if exists public.process_templates
  add column if not exists module_ids text[] not null default '{}'::text[];

update public.process_templates
set module_ids = array[module_id]
where (array_length(module_ids, 1) is null or array_length(module_ids, 1) = 0)
  and nullif(trim(coalesce(module_id, '')), '') is not null;

create index if not exists idx_process_templates_module_ids
  on public.process_templates using gin(module_ids);

-- ─────────────────────────────────────────────
-- ۵. بررسی نهایی
-- ─────────────────────────────────────────────
do $$
begin
  raise notice 'Phase 192: VIEW repairs complete.';
  raise notice '  - outbound_messages: tags + process_template_id added';
  raise notice '  - sms_delivery_reports: recreated with all expected columns';
  raise notice '  - automation_execution_reports: recreated with assignee columns';
  raise notice '  - process_templates.module_ids: added';
end
$$;

notify pgrst, 'reload schema';

commit;
