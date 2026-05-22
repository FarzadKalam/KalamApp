-- Phase 189: Server-side interval workflow trigger via pg_cron
-- Goal: pg_cron marks due interval workflows with server_queued_at.
--       Client picks them up and executes with existing logic.
--       No execution logic is moved to the server.

-- ─── 1. Add server_queued_at column to workflows ────────────────────────────

ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS server_queued_at TIMESTAMPTZ NULL;

-- Index: client polls for queued workflows efficiently
CREATE INDEX IF NOT EXISTS idx_workflows_server_queued_at
  ON public.workflows (server_queued_at)
  WHERE server_queued_at IS NOT NULL AND is_active = true;

-- ─── 2. Update claim_workflow_interval_run to clear server_queued_at ─────────
--     (same function, same signature — just adds server_queued_at = NULL)

CREATE OR REPLACE FUNCTION public.claim_workflow_interval_run(
  p_workflow_id uuid,
  p_expected_last_run_at timestamptz,
  p_claimed_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer := 0;
BEGIN
  UPDATE public.workflows
  SET
    last_run_at     = COALESCE(p_claimed_at, now()),
    server_queued_at = NULL,
    updated_at      = now()
  WHERE id = p_workflow_id
    AND is_active = true
    AND trigger_type = 'interval'
    AND last_run_at IS NOT DISTINCT FROM p_expected_last_run_at;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_workflow_interval_run(uuid, timestamptz, timestamptz) TO authenticated;

-- ─── 3. SQL function: mark due interval workflows as server_queued_at ────────

CREATE OR REPLACE FUNCTION public.queue_due_interval_workflows()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now  timestamptz := now();
  -- Extract hour in Tehran time — user enters from/to hours in local time
  v_hour int         := EXTRACT(HOUR FROM (v_now AT TIME ZONE 'Asia/Tehran'))::int;
BEGIN
  UPDATE public.workflows
  SET server_queued_at = v_now
  WHERE is_active = true
    AND trigger_type = 'interval'
    AND server_queued_at IS NULL   -- not already queued (avoid duplicates)
    AND (
      -- Never ran before
      last_run_at IS NULL
      OR (
        -- Hour-based interval
        (interval_unit = 'hour'
          AND last_run_at + make_interval(hours => COALESCE(interval_value::int, 1)) <= v_now)
        OR
        -- Day-based interval
        (interval_unit = 'day'
          AND last_run_at + make_interval(days => COALESCE(interval_value::int, 1)) <= v_now)
        OR
        -- Month-based interval
        (interval_unit = 'month'
          AND last_run_at + make_interval(months => COALESCE(interval_value::int, 1)) <= v_now)
      )
    )
    -- Respect allowed hour window if configured (prevents queuing outside business hours)
    AND (
      (interval_allowed_from_hour IS NULL AND interval_allowed_to_hour IS NULL)
      OR (interval_allowed_from_hour IS NOT NULL AND interval_allowed_to_hour IS NOT NULL
          AND v_hour >= interval_allowed_from_hour AND v_hour <= interval_allowed_to_hour)
      OR (interval_allowed_from_hour IS NOT NULL AND interval_allowed_to_hour IS NULL
          AND v_hour >= interval_allowed_from_hour)
      OR (interval_allowed_from_hour IS NULL AND interval_allowed_to_hour IS NOT NULL
          AND v_hour <= interval_allowed_to_hour)
    );
END;
$$;

-- Only internal use — no grant needed for authenticated users

-- ─── 4. Enable pg_cron + pg_net extensions ───────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── 5. Schedule cron job: every 5 minutes ───────────────────────────────────

DO $$
BEGIN
  -- Remove existing schedule if present (idempotent)
  PERFORM cron.unschedule('queue-interval-workflows');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'queue-interval-workflows',
  '*/5 * * * *',
  'SELECT public.queue_due_interval_workflows()'
);
