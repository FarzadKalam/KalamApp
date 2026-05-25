-- Phase 207: Wire pg_cron to call workflow-interval-runner Edge Function via pg_net
-- Goal: interval workflows execute fully server-side — no browser dependency.
-- The Edge Function validates conditions, executes actions (SMS, note, record ops).
--
-- Setup required (run once manually in Supabase SQL Editor):
--   ALTER DATABASE postgres SET "app.supabase_url" = 'https://YOUR_PROJECT_REF.supabase.co';
--   ALTER DATABASE postgres SET "app.service_role_key" = 'YOUR_SERVICE_ROLE_KEY';
-- OR use SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars in the Edge Function (already set).
--
-- The cron job calls the Edge Function every 5 minutes.
-- pg_cron still marks server_queued_at first; the Edge Function reads and claims those.

-- ─── 1. Ensure pg_net is enabled ─────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─── 2. Helper function: invoke the Edge Function via pg_net ─────────────────
-- This function reads the Supabase URL and service role key from DB settings,
-- then fires an async HTTP POST to the Edge Function. pg_net returns immediately;
-- the Edge Function runs in the background.

CREATE OR REPLACE FUNCTION public.trigger_workflow_interval_runner()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supabase_url  text;
  v_service_key   text;
  v_function_url  text;
BEGIN
  -- Read project URL and service role key stored as DB settings.
  -- Set them once with:
  --   ALTER DATABASE postgres SET "app.supabase_url" = 'https://xxx.supabase.co';
  --   ALTER DATABASE postgres SET "app.service_role_key" = 'eyJ...';
  v_supabase_url := current_setting('app.supabase_url', true);
  v_service_key  := current_setting('app.service_role_key', true);

  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    RAISE WARNING 'trigger_workflow_interval_runner: app.supabase_url not configured';
    RETURN;
  END IF;
  IF v_service_key IS NULL OR v_service_key = '' THEN
    RAISE WARNING 'trigger_workflow_interval_runner: app.service_role_key not configured';
    RETURN;
  END IF;

  v_function_url := rtrim(v_supabase_url, '/') || '/functions/v1/workflow-interval-runner';

  PERFORM net.http_post(
    url     := v_function_url,
    headers := json_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    )::jsonb,
    body    := '{}'::jsonb
  );
END;
$$;

-- No direct access for authenticated users — only called by pg_cron
REVOKE ALL ON FUNCTION public.trigger_workflow_interval_runner() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_workflow_interval_runner() FROM authenticated;

-- ─── 3. Schedule: call Edge Function every 5 minutes ─────────────────────────

DO $$
BEGIN
  PERFORM cron.unschedule('run-workflow-interval-runner');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'run-workflow-interval-runner',
  '*/5 * * * *',
  'SELECT public.trigger_workflow_interval_runner()'
);

-- ─── 4. Keep the existing server_queued_at marker job ────────────────────────
-- queue_due_interval_workflows() marks workflows that are due.
-- The Edge Function reads server_queued_at to find them.
-- No change needed — phase 189/193 cron job continues to run every 5 minutes.
-- Both jobs run at */5 — queue_due marks, then Edge Function processes.

-- ─── 5. Grant: authenticated users can still read workflow_logs ──────────────
-- (already granted by existing RLS policies; no change needed)
