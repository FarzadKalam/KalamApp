-- KalamApp V1 Phase 366
-- Auditable, tenant-safe runtime state for the modular AI agent kernel.

create table if not exists public.ai_agent_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  thread_id uuid references public.ai_threads(id) on delete set null,
  initiated_by uuid references auth.users(id) on delete set null,
  execution_policy text not null,
  status text not null default 'planned',
  confidence text not null default 'low',
  risk text not null default 'medium',
  agent_plan jsonb not null default '{}'::jsonb,
  source_metadata jsonb not null default '{}'::jsonb,
  result_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_agent_runs_policy_check check (execution_policy in ('interactive_chat', 'customer_auto_reply', 'workflow_automation')),
  constraint ai_agent_runs_status_check check (status in ('planned', 'running', 'waiting_confirmation', 'completed', 'escalated', 'failed', 'cancelled')),
  constraint ai_agent_runs_confidence_check check (confidence in ('low', 'medium', 'high')),
  constraint ai_agent_runs_risk_check check (risk in ('low', 'medium', 'high'))
);

create table if not exists public.ai_agent_steps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.ai_agent_runs(id) on delete cascade,
  step_key text not null,
  operator_key text not null,
  status text not null default 'planned',
  status_message text not null default '',
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_agent_steps_status_check check (status in ('planned', 'running', 'waiting_confirmation', 'completed', 'skipped', 'failed')),
  constraint ai_agent_steps_run_key_unique unique (run_id, step_key)
);

create table if not exists public.ai_agent_confirmation_grants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  thread_id uuid not null references public.ai_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  operator_key text not null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint ai_agent_confirmation_grants_unique unique (org_id, thread_id, user_id, operator_key)
);

create index if not exists idx_ai_agent_runs_org_thread_created_at
  on public.ai_agent_runs(org_id, thread_id, created_at desc);
create index if not exists idx_ai_agent_runs_org_status_created_at
  on public.ai_agent_runs(org_id, status, created_at desc);
create index if not exists idx_ai_agent_steps_org_run_created_at
  on public.ai_agent_steps(org_id, run_id, created_at asc);
create index if not exists idx_ai_agent_confirmation_grants_org_thread_user
  on public.ai_agent_confirmation_grants(org_id, thread_id, user_id, operator_key);

do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at' and pronamespace = 'public'::regnamespace) then
    drop trigger if exists trg_ai_agent_runs_updated_at on public.ai_agent_runs;
    create trigger trg_ai_agent_runs_updated_at before update on public.ai_agent_runs
      for each row execute function public.set_updated_at();
    drop trigger if exists trg_ai_agent_steps_updated_at on public.ai_agent_steps;
    create trigger trg_ai_agent_steps_updated_at before update on public.ai_agent_steps
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.ai_agent_runs enable row level security;
alter table public.ai_agent_steps enable row level security;
alter table public.ai_agent_confirmation_grants enable row level security;

drop policy if exists p_ai_agent_runs_org_read on public.ai_agent_runs;
create policy p_ai_agent_runs_org_read on public.ai_agent_runs
  for select to authenticated
  using (org_id = public.current_org_id());

drop policy if exists p_ai_agent_steps_org_read on public.ai_agent_steps;
create policy p_ai_agent_steps_org_read on public.ai_agent_steps
  for select to authenticated
  using (org_id = public.current_org_id());

drop policy if exists p_ai_agent_confirmation_grants_org_read on public.ai_agent_confirmation_grants;
create policy p_ai_agent_confirmation_grants_org_read on public.ai_agent_confirmation_grants
  for select to authenticated
  using (org_id = public.current_org_id() and user_id = auth.uid());

revoke all on public.ai_agent_runs, public.ai_agent_steps, public.ai_agent_confirmation_grants from anon;
grant select on public.ai_agent_runs, public.ai_agent_steps, public.ai_agent_confirmation_grants to authenticated;
grant all on public.ai_agent_runs, public.ai_agent_steps, public.ai_agent_confirmation_grants to service_role;
