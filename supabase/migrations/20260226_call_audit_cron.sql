-- Call Audit pg_cron Scheduling
-- Phase 14, Plan 01
-- Created: 2026-02-26
--
-- Schedules the call-audit Edge Function to run Mon-Fri at 5:00 PM Cyprus time.
-- Uses Europe/Nicosia timezone so PostgreSQL handles EET/EEST (DST) transitions automatically.
--
-- IMPORTANT: Replace <SERVICE_ROLE_KEY> with the actual service_role key before applying.
-- To find the key: Supabase Dashboard > Settings > API > service_role key
-- To update after applying:
--   SELECT cron.alter_job(
--     job_id := (SELECT jobid FROM cron.job WHERE jobname = 'call-audit-daily'),
--     command := $$SELECT net.http_post(
--       url := 'https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/call-audit',
--       body := '{}'::jsonb,
--       headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjZWVoZWF4Y3JobXBxdWV1ZHF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc1NDcyMywiZXhwIjoyMDgxMzMwNzIzfQ.qpg9o91cezpipuXujkLzbptuTyhfgDekpoDXSZToOQc", "Content-Type": "application/json", "x-cron": "true"}'::jsonb
--     )$$
--   );

-- =====================================================
-- 1. Enable required extensions (idempotent)
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- =====================================================
-- 2. Execution log table
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

CREATE INDEX idx_cron_execution_log_job_scheduled
  ON cron_execution_log (job_name, scheduled_at DESC);

-- RLS: same pattern as call_audit_runs
ALTER TABLE cron_execution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON cron_execution_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =====================================================
-- 3. Wrapper function for logged invocation
-- Logs the invocation attempt, fires the HTTP call, records outcome
-- =====================================================

CREATE OR REPLACE FUNCTION invoke_call_audit()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  log_id INTEGER;
  start_ms BIGINT;
BEGIN
  start_ms := EXTRACT(EPOCH FROM clock_timestamp()) * 1000;

  -- Insert running log entry
  INSERT INTO cron_execution_log (job_name, started_at, status)
  VALUES ('call-audit-daily', NOW(), 'running')
  RETURNING id INTO log_id;

  -- Fire the Edge Function via pg_net (async, fire-and-forget)
  PERFORM net.http_post(
    url := 'https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/call-audit',
    body := '{}'::jsonb,
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjZWVoZWF4Y3JobXBxdWV1ZHF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc1NDcyMywiZXhwIjoyMDgxMzMwNzIzfQ.qpg9o91cezpipuXujkLzbptuTyhfgDekpoDXSZToOQc", "Content-Type": "application/json", "x-cron": "true"}'::jsonb
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
$$;

-- =====================================================
-- 4. Schedule the cron job: Mon-Fri at 5:00 PM Cyprus time
-- Cron expression: minute=0, hour=17, any day-of-month, any month, day-of-week 1-5 (Mon-Fri)
-- =====================================================

SELECT cron.schedule(
  'call-audit-daily',
  '0 17 * * 1-5',
  $$SELECT invoke_call_audit()$$
);

-- Set timezone to Europe/Nicosia (handles EET UTC+2 and EEST UTC+3 transitions automatically)
UPDATE cron.job SET timezone = 'Europe/Nicosia' WHERE jobname = 'call-audit-daily';

-- =====================================================
-- 5. Log cleanup job: weekly on Sunday at 3 AM, retain 30 days
-- =====================================================

SELECT cron.schedule(
  'cron-log-cleanup',
  '0 3 * * 0',
  $$DELETE FROM cron_execution_log WHERE scheduled_at < NOW() - INTERVAL '30 days'$$
);
