-- Phase 419: اجرای یکتای اقدام‌ها، بازیابی رویدادها و گزارش اجرای زمان‌دار
-- هیچ اقدامِ دارای اثر بیرونی پس از قطع نامشخص دوباره ارسال نمی‌شود؛
-- در آن حالت اجرا با وضعیت نیازمند پیگیری ثبت می‌شود تا نه ارسال تکراری رخ دهد و نه اجرا پنهان بماند.

begin;

create table if not exists public.workflow_action_execution_claims (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  execution_key text not null unique,
  parent_execution_key text not null,
  action_type text not null,
  is_safe_to_reclaim boolean not null default false,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'needs_attention')),
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workflow_action_execution_claims_org_created
  on public.workflow_action_execution_claims (org_id, created_at desc);
create index if not exists idx_workflow_action_execution_claims_parent
  on public.workflow_action_execution_claims (parent_execution_key, created_at asc);

alter table public.workflow_action_execution_claims enable row level security;

drop policy if exists workflow_action_execution_claims_select_org on public.workflow_action_execution_claims;
create policy workflow_action_execution_claims_select_org
  on public.workflow_action_execution_claims
  for select to authenticated
  using (org_id = public.current_org_id());

revoke all on public.workflow_action_execution_claims from public, anon, authenticated;
grant select on public.workflow_action_execution_claims to authenticated;

create or replace function public.claim_workflow_action_execution(
  p_org_id uuid,
  p_execution_key text,
  p_parent_execution_key text,
  p_action_type text,
  p_is_safe_to_reclaim boolean default false
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'دسترسی اجرای اقدام خودکار وجود ندارد.' using errcode = '42501';
  end if;

  insert into public.workflow_action_execution_claims (
    org_id, execution_key, parent_execution_key, action_type, is_safe_to_reclaim,
    status, claimed_at, completed_at, last_error, updated_at
  ) values (
    p_org_id, p_execution_key, p_parent_execution_key, p_action_type,
    coalesce(p_is_safe_to_reclaim, false), 'running', now(), null, null, now()
  ) on conflict (execution_key) do nothing;

  if found then
    return 'claimed';
  end if;

  select status into v_status
  from public.workflow_action_execution_claims
  where execution_key = p_execution_key;

  if v_status = 'succeeded' then return 'succeeded'; end if;
  if v_status = 'needs_attention' then return 'needs_attention'; end if;

  if v_status = 'failed' then
    update public.workflow_action_execution_claims
    set status = 'running', claimed_at = now(), completed_at = null, last_error = null,
        is_safe_to_reclaim = coalesce(p_is_safe_to_reclaim, false), updated_at = now()
    where execution_key = p_execution_key and status = 'failed';
    if found then return 'claimed'; end if;
  end if;

  -- اگر worker پیشین پس از ده دقیقه هنوز running است، فقط اقدام‌های idempotent
  -- خودکار reclaim می‌شوند. برای ارسال/ایجاد رکورد، نتیجه نامشخص است و باید دیده شود.
  if v_status = 'running' then
    if coalesce(p_is_safe_to_reclaim, false) then
      update public.workflow_action_execution_claims
      set claimed_at = now(), updated_at = now()
      where execution_key = p_execution_key
        and status = 'running'
        and claimed_at < now() - interval '10 minutes';
      if found then return 'claimed'; end if;
    else
      update public.workflow_action_execution_claims
      set status = 'needs_attention', completed_at = now(),
          last_error = 'نتیجه اقدام قبلی نامشخص است؛ برای جلوگیری از اجرای تکراری نیازمند پیگیری است.',
          updated_at = now()
      where execution_key = p_execution_key
        and status = 'running'
        and claimed_at < now() - interval '10 minutes';
      if found then return 'needs_attention'; end if;
    end if;
  end if;

  if v_status = 'running' then return 'in_progress'; end if;
  return coalesce(v_status, 'needs_attention');
end;
$$;

create or replace function public.complete_workflow_action_execution(
  p_execution_key text,
  p_status text,
  p_last_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'دسترسی اجرای اقدام خودکار وجود ندارد.' using errcode = '42501';
  end if;
  if p_status not in ('succeeded', 'failed', 'needs_attention') then
    raise exception 'وضعیت اجرای اقدام نامعتبر است.' using errcode = '22023';
  end if;

  update public.workflow_action_execution_claims
  set status = p_status,
      completed_at = now(),
      last_error = case when p_status = 'succeeded' then null else nullif(p_last_error, '') end,
      updated_at = now()
  where execution_key = p_execution_key
    and status = 'running';
  return found;
end;
$$;

revoke all on function public.claim_workflow_action_execution(uuid, text, text, text, boolean) from public, authenticated;
revoke all on function public.complete_workflow_action_execution(text, text, text) from public, authenticated;
grant execute on function public.claim_workflow_action_execution(uuid, text, text, text, boolean) to service_role;
grant execute on function public.complete_workflow_action_execution(text, text, text) to service_role;

-- ارسال گزارش زمان‌دار نیز مانند سایر اجراهای زمان‌دار job مستقل و قابل بازیابی دارد.
do $$
begin
  if to_regclass('public.workflow_interval_jobs') is not null then
    alter table public.workflow_interval_jobs
      drop constraint if exists workflow_interval_jobs_job_kind_check;
    alter table public.workflow_interval_jobs
      add constraint workflow_interval_jobs_job_kind_check
      check (job_kind in ('workflow_scan', 'workflow_action', 'process_automation_interval', 'scheduled_report_delivery'));
  end if;
end;
$$;

-- گزارش‌های جدید، اجراهای گزارش دوره‌ای را نیز با نام و دستهٔ درست نشان می‌دهند.
create or replace view public.automation_execution_reports
with (security_invoker = true)
as
select
  l.id,
  coalesce(l.org_id, w.org_id) as org_id,
  case
    when l.run_type = 'process_automation' then
      case when coalesce(l.details ->> 'process_automation_trigger_type', '') = 'interval'
        then 'automation_scheduled' else 'automation_conditional' end
    when l.run_type = 'scheduled_report' then 'report_scheduled'
    when coalesce(w.trigger_type, case when l.run_type = 'scheduled' then 'interval' else '' end, '') = 'interval'
      or l.run_type = 'scheduled' then 'workflow_scheduled'
    else 'workflow_conditional'
  end as report_category,
  case
    when l.run_type = 'process_automation' then 'automation'
    when l.run_type = 'scheduled_report' then 'report'
    else 'workflow'
  end as source_type,
  coalesce(
    nullif(w.name, ''),
    nullif(l.details ->> 'report_name', ''),
    nullif(l.details ->> 'workflow_name', ''),
    nullif(l.details ->> 'process_automation_rule_name', ''),
    nullif(l.details ->> 'process_automation_rule_id', ''),
    case when l.run_type = 'scheduled_report' then 'گزارش زمان‌دار'
         when l.run_type = 'process_automation' then 'اتوماسیون' else 'گردش کار' end
  ) as automation_name,
  coalesce(
    l.details ->> 'process_automation_trigger_type',
    case when l.run_type = 'scheduled_report' then 'interval' else null end,
    w.trigger_type,
    case when l.run_type = 'scheduled' then 'interval' else '' end
  ) as trigger_type,
  coalesce(l.details ->> 'execution_mode', w.execution_mode, '') as execution_mode,
  case
    when l.status = 'failed'
      and coalesce(l.message, '') ilike '%نیازمند پیگیری%'
      then 'needs_attention'
    else l.status
  end as status,
  l.module_id, l.record_id, l.message, l.details, l.created_at,
  '[]'::jsonb as tags, null::uuid as assignee_id, null::text as assignee_type,
  null::uuid as assignee_role_id, null::uuid as process_template_id,
  l.created_at as updated_at,
  coalesce(nullif(l.details ->> 'record_title', ''), '[بدون عنوان]') as record_title
from public.workflow_logs l
left join public.workflows w on w.id = l.workflow_id and w.org_id = l.org_id;

grant select on public.automation_execution_reports to authenticated;
notify pgrst, 'reload schema';

commit;
