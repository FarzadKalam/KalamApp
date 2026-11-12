-- =====================================================
-- TazeSystem V1 - Phase 575: Background Agent Cron Tracking
-- & Modular AaaS Execution Audit Extensions
-- Date: 2026-11-12
-- Type: Additive / Idempotent / Fail-Closed Tenant Security
-- =====================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Background Cron Tracking Columns on Per-Org Agent Configs
-- ---------------------------------------------------------------------------
alter table if exists public.org_ai_agent_configs
  add column if not exists background_last_run_at timestamptz,
  add column if not exists background_last_status text,
  add column if not exists background_last_summary text,
  add column if not exists background_last_error text;

alter table if exists public.org_ai_agent_configs
  drop constraint if exists chk_org_ai_agent_configs_bg_status;

alter table if exists public.org_ai_agent_configs
  add constraint chk_org_ai_agent_configs_bg_status check (
    background_last_status is null
    or background_last_status in ('completed', 'skipped', 'failed', 'running')
  );

-- ---------------------------------------------------------------------------
-- 2. Agent Runs Runtime Completeness & Execution Indexes
-- ---------------------------------------------------------------------------
alter table if exists public.ai_agent_runs
  add column if not exists agent_key text,
  add column if not exists selected_agents jsonb not null default '[]'::jsonb,
  add column if not exists trigger_type text not null default 'interactive',
  add column if not exists cooldown_key text,
  add column if not exists channel text,
  add column if not exists estimated_cost_irt numeric,
  add column if not exists waiting_approval_payload jsonb,
  add column if not exists completed_at timestamptz;

alter table if exists public.ai_agent_runs
  drop constraint if exists ai_agent_runs_policy_check;

alter table if exists public.ai_agent_runs
  add constraint ai_agent_runs_policy_check
  check (execution_policy in (
    'interactive_chat',
    'customer_auto_reply',
    'staff_bot_chat',
    'workflow_automation',
    'background_agent',
    'onboarding_qa'
  ));

alter table if exists public.ai_agent_runs
  drop constraint if exists ai_agent_runs_status_check;

alter table if exists public.ai_agent_runs
  add constraint ai_agent_runs_status_check
  check (status in (
    'planned',
    'running',
    'waiting_confirmation',
    'waiting_approval',
    'completed',
    'skipped',
    'escalated',
    'failed',
    'cancelled'
  ));

create index if not exists idx_ai_agent_runs_org_agent_exec_created_at
  on public.ai_agent_runs(org_id, agent_key, execution_policy, created_at desc);

create index if not exists idx_ai_action_logs_org_agent_status_created_at
  on public.ai_action_logs(org_id, agent_key, status, created_at desc)
  where agent_key is not null;

notify pgrst, 'reload schema';

commit;
