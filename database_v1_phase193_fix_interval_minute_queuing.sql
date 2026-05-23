-- Phase 193: Fix queue_due_interval_workflows to respect interval_minute
-- Problem: The DB function queues hour-based workflows as soon as N hours have passed,
--          ignoring interval_minute. This causes execution at wrong minutes (e.g. 1:00
--          instead of 1:10). Also adds interval_minute check so the workflow is only
--          marked due when the current Tehran minute >= interval_minute.

CREATE OR REPLACE FUNCTION public.queue_due_interval_workflows()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now    timestamptz := now();
  v_tehran timestamptz := v_now AT TIME ZONE 'Asia/Tehran';
  v_hour   int         := EXTRACT(HOUR   FROM v_tehran)::int;
  v_minute int         := EXTRACT(MINUTE FROM v_tehran)::int;
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
          AND last_run_at + make_interval(hours => COALESCE(interval_value::int, 1)) <= v_now
          -- Respect interval_minute: only queue when current minute >= configured minute
          -- This prevents early queueing (e.g. at 1:03 when user wants 1:10)
          AND (interval_minute IS NULL OR v_minute >= interval_minute)
        )
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

-- No grant needed — only called by pg_cron internally
