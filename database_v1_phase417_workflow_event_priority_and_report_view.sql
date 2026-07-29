-- Phase 417: اولویت اجرای رویدادهای فوری و سبک‌سازی گزارش‌های اتوماسیون
-- این migration idempotent است و هیچ گزارش یا رویداد موجودی را حذف نمی‌کند.

begin;

-- این indexها در نصب‌هایی که بهینه‌سازی گزارش نسخه‌های قبل را نگرفته‌اند نیز
-- مسیر صفحه‌بندی و شمارش را بر پایهٔ سازمان و زمان اجرا نگه می‌دارند.
create index if not exists idx_workflow_logs_org_created_at_id_desc
  on public.workflow_logs (org_id, created_at desc, id desc);

create index if not exists idx_workflow_logs_created_at_id_desc
  on public.workflow_logs (created_at desc, id desc);

-- گزارش فقط به logهای همان سازمان وابسته است. اتصال به جدول گردش‌کار برای هر
-- ردیف، به‌خصوص هنگام شمارش صفحهٔ گزارش، هزینهٔ غیرضروری و timeout ایجاد می‌کرد.
create or replace view public.automation_execution_reports
with (security_invoker = true)
as
select
  l.id,
  l.org_id,
  case
    when l.run_type = 'process_automation' then
      case when coalesce(l.details ->> 'process_automation_trigger_type', '') = 'interval'
        then 'automation_scheduled'
        else 'automation_conditional'
      end
    when l.run_type = 'scheduled' then 'workflow_scheduled'
    else 'workflow_conditional'
  end as report_category,
  case when l.run_type = 'process_automation' then 'automation' else 'workflow' end as source_type,
  coalesce(
    nullif(l.details ->> 'workflow_name', ''),
    nullif(l.details ->> 'process_automation_rule_name', ''),
    case when l.run_type = 'process_automation' then 'اتوماسیون' else 'گردش کار' end
  ) as automation_name,
  coalesce(
    nullif(l.details ->> 'process_automation_trigger_type', ''),
    nullif(l.details ->> 'trigger_type', ''),
    nullif(l.details ->> 'event', ''),
    case when l.run_type = 'scheduled' then 'interval' else '' end
  ) as trigger_type,
  coalesce(nullif(l.details ->> 'execution_mode', ''), '') as execution_mode,
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
from public.workflow_logs l;

grant select on public.automation_execution_reports to authenticated;

-- اجرای رویدادهای ایجاد/ویرایش از اجرای زمان‌دار جداست. این مسیر بر مبنای
-- claim اتمیک هر رویداد کار می‌کند و نباید با lease سراسری اسکن‌های طولانی
-- متوقف شود.
create or replace function public.trigger_workflow_event_runner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supabase_url text;
  v_service_key text;
  v_should_dispatch boolean := false;
begin
  v_supabase_url := current_setting('app.supabase_url', true);
  v_service_key := current_setting('app.service_role_key', true);
  if coalesce(v_supabase_url, '') = '' or coalesce(v_service_key, '') = '' then
    return null;
  end if;

  update public.workflow_runner_dispatch_state
  set
    last_dispatched_at = now(),
    updated_at = now()
  where dispatch_key = 'workflow-event-queue'
    and last_dispatched_at <= now() - interval '15 seconds'
  returning true into v_should_dispatch;

  if coalesce(v_should_dispatch, false) then
    perform net.http_post(
      url := rtrim(v_supabase_url, '/') || '/functions/v1/workflow-interval-runner',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
      body := jsonb_build_object('action', 'drain_events')
    );
  end if;

  return null;
end;
$$;

revoke all on function public.trigger_workflow_event_runner() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
