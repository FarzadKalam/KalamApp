-- Phase 365: بازیابی اجرای رویدادی و ثبت پایدار گزارش‌های زمان‌دار
-- این migration فقط رخدادهایی را بازصف می‌کند که دقیقاً با خطای شناخته‌شدهٔ
-- «record is not defined» متوقف شده‌اند؛ بنابراین هیچ اجرای موفقی تکرار نمی‌شود.

begin;

create or replace function public.reconcile_workflow_interval_execution_reports(
  p_limit integer default 500
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reconciled_count integer := 0;
begin
  with candidate_runs as (
    select
      j.workflow_id,
      j.org_id,
      j.module_id,
      j.record_id,
      j.scheduled_due_at,
      min(j.created_at) as created_at,
      max(j.completed_at) as completed_at
    from public.workflow_interval_jobs j
    where j.job_kind = 'workflow_action'
      and j.workflow_id is not null
      and j.module_id is not null
      and j.record_id is not null
      and j.report_logged_at is null
      and j.status in ('succeeded', 'failed', 'skipped')
      and exists (
        select 1
        from public.workflow_interval_jobs terminal_job
        where terminal_job.job_kind = 'workflow_action'
          and terminal_job.workflow_id = j.workflow_id
          and terminal_job.module_id = j.module_id
          and terminal_job.record_id = j.record_id
          and terminal_job.scheduled_due_at = j.scheduled_due_at
          and terminal_job.is_terminal_action = true
          and terminal_job.status in ('succeeded', 'failed', 'skipped')
      )
      and not exists (
        select 1
        from public.workflow_interval_jobs pending_job
        where pending_job.job_kind = 'workflow_action'
          and pending_job.workflow_id = j.workflow_id
          and pending_job.module_id = j.module_id
          and pending_job.record_id = j.record_id
          and pending_job.scheduled_due_at = j.scheduled_due_at
          and pending_job.status in ('pending', 'running')
      )
    group by j.workflow_id, j.org_id, j.module_id, j.record_id, j.scheduled_due_at
    order by max(j.completed_at) asc nulls last
    limit least(greatest(coalesce(p_limit, 500), 1), 5000)
  ), run_details as (
    select
      c.*,
      ('report|' || c.workflow_id::text || '|' || c.scheduled_due_at::text || '|' || c.module_id || '|' || c.record_id::text) as execution_run_key,
      coalesce(w.name, nullif(sample.payload #>> '{workflow,name}', ''), 'گردش کار') as workflow_name,
      coalesce(
        nullif(sample.payload #>> '{record,system_code}', ''),
        nullif(sample.payload #>> '{record,name}', ''),
        nullif(sample.payload #>> '{record,title}', ''),
        nullif(sample.payload #>> '{record,full_name}', ''),
        nullif(sample.payload #>> '{record,business_name}', ''),
        '[بدون عنوان]'
      ) as record_title,
      coalesce(nullif(sample.payload #>> '{workflow,execution_mode}', ''), 'first_match') as execution_mode,
      coalesce(jsonb_agg(
        jsonb_build_object(
          'type', coalesce(nullif(j.payload #>> '{action,type}', ''), ''),
          'status', coalesce(nullif(j.result #>> '{action_result,status}', ''), j.status),
          'message', coalesce(nullif(j.result #>> '{action_result,message}', ''), nullif(j.last_error, ''))
        ) order by j.action_index
      ) filter (where j.id is not null), '[]'::jsonb) as action_results,
      count(j.id)::integer as action_count,
      coalesce(bool_or(coalesce(nullif(j.result #>> '{action_result,status}', ''), j.status) = 'failed'), false) as has_failed_action,
      coalesce(bool_or(coalesce(nullif(j.result #>> '{action_result,status}', ''), j.status) = 'success'), false) as has_successful_action,
      string_agg(
        coalesce(nullif(j.result #>> '{action_result,message}', ''), nullif(j.last_error, '')),
        ' | ' order by j.action_index
      ) filter (where coalesce(nullif(j.result #>> '{action_result,status}', ''), j.status) = 'failed') as error_message,
      coalesce(max(j.payload ->> 'actor_user_id') filter (where j.payload ? 'actor_user_id'), null) as actor_id
    from candidate_runs c
    join public.workflow_interval_jobs j
      on j.job_kind = 'workflow_action'
     and j.workflow_id = c.workflow_id
     and j.module_id = c.module_id
     and j.record_id = c.record_id
     and j.scheduled_due_at = c.scheduled_due_at
    left join public.workflows w on w.id = c.workflow_id and w.org_id = c.org_id
    left join lateral (
      select first_job.payload
      from public.workflow_interval_jobs first_job
      where first_job.job_kind = 'workflow_action'
        and first_job.workflow_id = c.workflow_id
        and first_job.module_id = c.module_id
        and first_job.record_id = c.record_id
        and first_job.scheduled_due_at = c.scheduled_due_at
      order by first_job.action_index asc nulls last, first_job.created_at asc
      limit 1
    ) sample on true
    group by c.workflow_id, c.org_id, c.module_id, c.record_id, c.scheduled_due_at,
      c.created_at, c.completed_at, w.name, sample.payload
  ), inserted_logs as (
    insert into public.workflow_logs (
      workflow_id, org_id, module_id, record_id, run_type, status, message,
      details, execution_run_key, created_at
    )
    select
      d.workflow_id,
      d.org_id,
      d.module_id,
      d.record_id,
      'scheduled',
      case when d.has_failed_action then 'failed' when d.has_successful_action then 'success' else 'skipped' end,
      d.error_message,
      jsonb_build_object(
        'workflow_name', d.workflow_name,
        'record_title', d.record_title,
        'execution_mode', d.execution_mode,
        'scheduled_due_at', d.scheduled_due_at,
        'action_count', d.action_count,
        'action_results', d.action_results,
        'execution_run_key', d.execution_run_key,
        'execution_queue', 'v2',
        'queue_reconciled', true,
        'actor_id', d.actor_id,
        'runner_build', 'database-report-reconciliation'
      ),
      d.execution_run_key,
      coalesce(d.completed_at, d.created_at, now())
    from run_details d
    on conflict (execution_run_key) where execution_run_key is not null do nothing
    returning execution_run_key
  ), marked_jobs as (
    update public.workflow_interval_jobs j
    set report_logged_at = now(), updated_at = now()
    from run_details d
    where j.job_kind = 'workflow_action'
      and j.workflow_id = d.workflow_id
      and j.module_id = d.module_id
      and j.record_id = d.record_id
      and j.scheduled_due_at = d.scheduled_due_at
      and exists (
        select 1
        from public.workflow_logs l
        where l.execution_run_key = d.execution_run_key
      )
    returning j.id
  )
  select count(*) into v_reconciled_count from inserted_logs;

  return v_reconciled_count;
end;
$$;

revoke all on function public.reconcile_workflow_interval_execution_reports(integer) from public, authenticated;
grant execute on function public.reconcile_workflow_interval_execution_reports(integer) to service_role;

-- رخدادهای شکست‌خورده‌ای که هنوز هیچ اقدامی را اجرا نکرده‌اند، با snapshot همان
-- زمان دوباره در صف قرار می‌گیرند تا upsertهای از دست‌رفته بدون بازپخش کورِ همه رخدادها جبران شوند.
update public.workflow_event_queue
set
  status = 'pending',
  attempts = 0,
  available_at = now(),
  claimed_at = null,
  completed_at = null,
  last_error = null
where status = 'failed'
  and lower(coalesce(last_error, '')) like '%record is not defined%';

-- گزارش‌های اجرای زمان‌دار قبلی نیز همان لحظه یک‌بار بازسازی می‌شوند.
select public.reconcile_workflow_interval_execution_reports(5000);

commit;
