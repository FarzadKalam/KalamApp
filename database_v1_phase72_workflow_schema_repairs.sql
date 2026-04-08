-- KalamApp V1 - Phase 72
-- Repair workflow-related schema mismatches discovered in recent automation runs.

begin;

alter table if exists public.profiles
  add column if not exists bale_chat_id text;

alter table if exists public.products
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.tasks
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.billboards
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table if exists public.invoices
  add column if not exists tags jsonb not null default '[]'::jsonb;

create or replace view public.automation_execution_reports
with (security_invoker = true)
as
select
  l.id,
  coalesce(l.org_id, w.org_id, t.org_id) as org_id,
  case
    when l.run_type = 'process_automation' then
      case when coalesce(l.details ->> 'process_automation_trigger_type', '') = 'interval'
        then 'process_scheduled'
        else 'process_conditional'
      end
    else
      case when coalesce(w.trigger_type, '') = 'interval'
        then 'automation_scheduled'
        else 'automation_conditional'
      end
  end as report_category,
  case when l.run_type = 'process_automation' then 'process' else 'automation' end as source_type,
  coalesce(
    nullif(w.name, ''),
    nullif(l.details ->> 'process_automation_rule_id', ''),
    case when l.run_type = 'process_automation' then 'اتوماسیون فرآیند' else 'اتوماسیون' end
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

create or replace view public.sms_delivery_reports
with (security_invoker = true)
as
select
  m.id,
  m.org_id,
  coalesce(nullif(m.title, ''), nullif(m.recipient, ''), 'پیامک') as title,
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
  '[]'::jsonb as tags
from public.outbound_messages m
where m.channel_type = 'sms';

grant select on public.automation_execution_reports to authenticated;
grant select on public.sms_delivery_reports to authenticated;

commit;
