begin;

alter table public.workflow_logs
  add column if not exists execution_run_key text null;

create unique index if not exists uq_workflow_logs_execution_run_key
  on public.workflow_logs (execution_run_key)
  where execution_run_key is not null;

create table if not exists public.workflow_interval_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  job_kind text not null check (job_kind in ('workflow_scan', 'workflow_action')),
  dedupe_key text not null unique,
  workflow_id uuid null,
  module_id text null,
  record_id uuid null,
  scheduled_due_at timestamptz not null,
  page_offset integer not null default 0 check (page_offset >= 0),
  action_index integer null check (action_index is null or action_index >= 0),
  is_terminal_action boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  available_at timestamptz not null default now(),
  locked_at timestamptz null,
  completed_at timestamptz null,
  report_logged_at timestamptz null,
  result jsonb null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workflow_interval_jobs_claim
  on public.workflow_interval_jobs (status, available_at, created_at)
  where status = 'pending';

create index if not exists idx_workflow_interval_jobs_record_sequence
  on public.workflow_interval_jobs (workflow_id, scheduled_due_at, module_id, record_id, action_index)
  where job_kind = 'workflow_action';

create index if not exists idx_workflow_interval_jobs_org_created
  on public.workflow_interval_jobs (org_id, created_at desc);

create index if not exists idx_workflow_interval_jobs_report_reconcile
  on public.workflow_interval_jobs (completed_at desc)
  where job_kind = 'workflow_action' and is_terminal_action and report_logged_at is null and status in ('succeeded', 'failed', 'skipped');

alter table public.workflow_interval_jobs enable row level security;

drop policy if exists workflow_interval_jobs_org_select on public.workflow_interval_jobs;
create policy workflow_interval_jobs_org_select
  on public.workflow_interval_jobs
  for select
  to authenticated
  using (org_id = public.current_org_id());

revoke all on public.workflow_interval_jobs from public, authenticated;
grant select on public.workflow_interval_jobs to authenticated;

create or replace function public.claim_workflow_interval_jobs(p_limit integer default 20)
returns setof public.workflow_interval_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'دسترسی پردازش صف اجرا وجود ندارد.' using errcode = '42501';
  end if;

  return query
  with candidates as (
    select j.id
    from public.workflow_interval_jobs j
    where j.status = 'pending'
      and j.available_at <= now()
      and (
        j.job_kind <> 'workflow_action'
        or not exists (
          select 1
          from public.workflow_interval_jobs previous_job
          where previous_job.job_kind = 'workflow_action'
            and previous_job.workflow_id = j.workflow_id
            and previous_job.scheduled_due_at = j.scheduled_due_at
            and previous_job.module_id = j.module_id
            and previous_job.record_id = j.record_id
            and previous_job.action_index < j.action_index
            and previous_job.status in ('pending', 'running')
        )
      )
    order by j.available_at, j.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
  )
  update public.workflow_interval_jobs j
  set status = 'running',
      attempts = j.attempts + 1,
      locked_at = now(),
      updated_at = now()
  from candidates c
  where j.id = c.id
  returning j.*;
end;
$$;

create or replace function public.requeue_stale_workflow_interval_jobs(p_stale_after interval default interval '5 minutes')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'دسترسی بازیابی صف اجرا وجود ندارد.' using errcode = '42501';
  end if;

  update public.workflow_interval_jobs
  set status = case when attempts >= max_attempts then 'failed' else 'pending' end,
      available_at = case when attempts >= max_attempts then available_at else now() end,
      completed_at = case when attempts >= max_attempts then now() else null end,
      locked_at = null,
      last_error = coalesce(last_error, 'اجرای قبلی ناتمام ماند و بازیابی شد.'),
      updated_at = now()
  where status = 'running'
    and locked_at < now() - coalesce(p_stale_after, interval '5 minutes');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.claim_workflow_interval_jobs(integer) from public, authenticated;
revoke all on function public.requeue_stale_workflow_interval_jobs(interval) from public, authenticated;
grant execute on function public.claim_workflow_interval_jobs(integer) to service_role;
grant execute on function public.requeue_stale_workflow_interval_jobs(interval) to service_role;

commit;
