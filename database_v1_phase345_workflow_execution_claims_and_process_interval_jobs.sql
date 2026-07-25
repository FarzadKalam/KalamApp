-- اجرای سروری یکتای گردش‌کارهای رویدادی و اتوماسیون زمان‌دار فعالیت‌ها
-- همه بخش‌ها idempotent و tenant-safe هستند.

begin;

do $$
begin
  if to_regclass('public.workflow_interval_jobs') is not null then
    alter table public.workflow_interval_jobs
      drop constraint if exists workflow_interval_jobs_job_kind_check;
    alter table public.workflow_interval_jobs
      add constraint workflow_interval_jobs_job_kind_check
      check (job_kind in ('workflow_scan', 'workflow_action', 'process_automation_interval'));
  end if;
end;
$$;

create table if not exists public.workflow_event_execution_claims (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  execution_key text not null unique,
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  module_id text not null,
  record_id uuid not null,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workflow_event_execution_claims_org_created
  on public.workflow_event_execution_claims (org_id, created_at desc);

alter table public.workflow_event_execution_claims enable row level security;

drop policy if exists workflow_event_execution_claims_select_org on public.workflow_event_execution_claims;
create policy workflow_event_execution_claims_select_org
  on public.workflow_event_execution_claims
  for select to authenticated
  using (org_id = public.current_org_id());

revoke all on public.workflow_event_execution_claims from public, anon, authenticated;
grant select on public.workflow_event_execution_claims to authenticated;

create or replace function public.claim_workflow_event_first_match_execution(
  p_org_id uuid,
  p_workflow_id uuid,
  p_module_id text,
  p_record_id uuid,
  p_execution_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'دسترسی اجرای گردش‌کار وجود ندارد.' using errcode = '42501';
  end if;

  insert into public.workflow_event_execution_claims (
    org_id, execution_key, workflow_id, module_id, record_id, status, claimed_at, completed_at, last_error, updated_at
  ) values (
    p_org_id, p_execution_key, p_workflow_id, p_module_id, p_record_id, 'running', now(), null, null, now()
  )
  on conflict (execution_key) do update
    set status = 'running', claimed_at = now(), completed_at = null, last_error = null, updated_at = now()
    where public.workflow_event_execution_claims.status = 'failed'
       or (
         public.workflow_event_execution_claims.status = 'running'
         and public.workflow_event_execution_claims.claimed_at < now() - interval '10 minutes'
       );

  return found;
end;
$$;

create or replace function public.complete_workflow_event_first_match_execution(
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
    raise exception 'دسترسی اجرای گردش‌کار وجود ندارد.' using errcode = '42501';
  end if;
  if p_status not in ('succeeded', 'failed') then
    raise exception 'وضعیت اجرای گردش‌کار نامعتبر است.' using errcode = '22023';
  end if;

  update public.workflow_event_execution_claims
  set status = p_status,
      completed_at = now(),
      last_error = case when p_status = 'failed' then nullif(p_last_error, '') else null end,
      updated_at = now()
  where execution_key = p_execution_key
    and status = 'running';
  return found;
end;
$$;

revoke all on function public.claim_workflow_event_first_match_execution(uuid, uuid, text, uuid, text) from public, authenticated;
revoke all on function public.complete_workflow_event_first_match_execution(text, text, text) from public, authenticated;
grant execute on function public.claim_workflow_event_first_match_execution(uuid, uuid, text, uuid, text) to service_role;
grant execute on function public.complete_workflow_event_first_match_execution(text, text, text) to service_role;

commit;
