-- =====================================================
-- KalamApp V1 - Phase 79
-- Interval Runner hardening:
-- 1) Atomic claim for scheduled workflow runs
-- 2) Supporting indexes for interval/process-automation logs
-- Date: 2026-04-15
-- =====================================================

begin;

create or replace function public.claim_workflow_interval_run(
  p_workflow_id uuid,
  p_expected_last_run_at timestamptz,
  p_claimed_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer := 0;
begin
  update public.workflows
  set
    last_run_at = coalesce(p_claimed_at, now()),
    updated_at = now()
  where id = p_workflow_id
    and is_active = true
    and trigger_type = 'interval'
    and last_run_at is not distinct from p_expected_last_run_at;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

grant execute on function public.claim_workflow_interval_run(uuid, timestamptz, timestamptz) to authenticated;

create index if not exists idx_workflow_logs_run_type_status_module_record_created
  on public.workflow_logs(run_type, status, module_id, record_id, created_at desc);

create index if not exists idx_workflow_logs_details_gin
  on public.workflow_logs using gin(details);

commit;
