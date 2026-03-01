-- Call Audit pg_cron Scheduling
-- Phase 14, Plan 01
-- Created: 2026-02-26
-- Applied: 2026-02-26
--
-- Schedules the call-audit Edge Function to run Mon-Fri at 5:00 PM Cyprus time.
-- pg_cron 1.6.4 on this Supabase instance does NOT support timezone column,
-- so we use UTC schedule: 15:00 UTC = 17:00 EET (winter) / 18:00 EEST (summer).
--
-- Service role key is stored in app_secrets table (not inline) to:
--   1. Avoid committing secrets to git
--   2. Avoid Cloudflare WAF blocking requests containing JWTs
--   3. Allow key rotation without redeploying the function
--
-- To update the service_role key:
--   UPDATE app_secrets SET value = '<NEW_KEY>' WHERE key = 'service_role_key';

-- =====================================================
-- 1. Enable required extensions (idempotent)
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- =====================================================
-- 2. Secrets table for service_role key storage
-- =====================================================

CREATE TABLE IF NOT EXISTS app_secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;

-- Only service_role can access secrets
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'app_secrets' AND policyname = 'Service role only') THEN
    CREATE POLICY "Service role only" ON app_secrets FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Insert service_role key (base64-encoded in migration, decoded at insert time)
-- NOTE: The actual key was inserted via execute_sql MCP. This is documentation only.
-- INSERT INTO app_secrets (key, value) VALUES ('service_role_key', '<SERVICE_ROLE_KEY>')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- =====================================================
-- 3. Execution log table
-- Tracks each cron invocation for debugging and monitoring
-- =====================================================

CREATE TABLE IF NOT EXISTS cron_execution_log (
  id SERIAL PRIMARY KEY,
  job_name TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled',
  http_status INTEGER,
  response_body TEXT,
  error_message TEXT,
  execution_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_cron_execution_log_job_scheduled
  ON cron_execution_log (job_name, scheduled_at DESC);

-- RLS: same pattern as call_audit_runs
ALTER TABLE cron_execution_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cron_execution_log' AND policyname = 'Service role full access') THEN
    CREATE POLICY "Service role full access" ON cron_execution_log FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- =====================================================
-- 4. Wrapper function for logged invocation
-- Reads service_role key from app_secrets table dynamically.
-- Logs the invocation attempt, fires the HTTP call, records outcome.
-- =====================================================

CREATE OR REPLACE FUNCTION invoke_call_audit()
RETURNS void
LANGUAGE plpgsql
AS $func$
DECLARE
  log_id INTEGER;
  start_ms BIGINT;
  auth_header TEXT;
BEGIN
  start_ms := EXTRACT(EPOCH FROM clock_timestamp()) * 1000;

  -- Read service_role key from app_secrets
  SELECT value INTO auth_header FROM app_secrets WHERE key = 'service_role_key';
  IF auth_header IS NULL THEN
    RAISE EXCEPTION 'service_role_key not found in app_secrets table';
  END IF;

  -- Insert running log entry
  INSERT INTO cron_execution_log (job_name, started_at, status)
  VALUES ('call-audit-daily', NOW(), 'running')
  RETURNING id INTO log_id;

  -- Fire the Edge Function via pg_net (async, fire-and-forget)
  PERFORM net.http_post(
    url := 'https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/call-audit',
    body := '{}'::jsonb,
    headers := format('{"Authorization": "Bearer %s", "Content-Type": "application/json", "x-cron": "true"}', auth_header)::jsonb
  );

  -- Mark as success (HTTP request dispatched -- actual result tracked by Edge Function in call_audit_runs)
  UPDATE cron_execution_log
  SET status = 'success',
      completed_at = NOW(),
      execution_ms = (EXTRACT(EPOCH FROM clock_timestamp()) * 1000 - start_ms)::INTEGER
  WHERE id = log_id;

EXCEPTION WHEN OTHERS THEN
  -- Record failure with error details
  UPDATE cron_execution_log
  SET status = 'failed',
      completed_at = NOW(),
      error_message = SQLERRM,
      execution_ms = (EXTRACT(EPOCH FROM clock_timestamp()) * 1000 - start_ms)::INTEGER
  WHERE id = log_id;
END;
$func$;

-- =====================================================
-- 5. Schedule the cron job: Mon-Fri at 3:00 PM UTC (= 5PM EET / 6PM EEST)
-- NOTE: pg_cron 1.6.4 on Supabase does not support timezone column.
-- Using UTC 15:00 which is 5PM Cyprus winter time (EET UTC+2).
-- In summer (EEST UTC+3) this runs at 6PM Cyprus time -- acceptable.
-- =====================================================

SELECT cron.schedule(
  'call-audit-daily',
  '0 15 * * 1-5',
  $$SELECT invoke_call_audit()$$
);

-- =====================================================
-- 6. Log cleanup job: weekly on Sunday at 3 AM UTC, retain 30 days
-- =====================================================

SELECT cron.schedule(
  'cron-log-cleanup',
  '0 3 * * 0',
  $$DELETE FROM cron_execution_log WHERE scheduled_at < NOW() - INTERVAL '30 days'$$
);
