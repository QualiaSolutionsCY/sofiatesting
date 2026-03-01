-- Fix Supabase Security Advisor Warnings
-- Applied: 2026-03-01
-- Issues fixed:
--   1. invoke_call_audit: mutable search_path (search_path injection risk)
--   2. cleanup_old_whatsapp_chat_history: mutable search_path
--   3. telegram_group_messages: INSERT policy WITH CHECK (true) too permissive

-- FIX 1: invoke_call_audit - set search_path = public
CREATE OR REPLACE FUNCTION public.invoke_call_audit()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
DECLARE
  log_id INTEGER;
  start_ms BIGINT;
  auth_header TEXT;
BEGIN
  start_ms := EXTRACT(EPOCH FROM clock_timestamp()) * 1000;

  SELECT value INTO auth_header
  FROM app_secrets
  WHERE key = 'service_role_key';

  IF auth_header IS NULL THEN
    RAISE EXCEPTION 'service_role_key not found in app_secrets table';
  END IF;

  INSERT INTO cron_execution_log (job_name, started_at, status)
  VALUES ('call-audit-daily', NOW(), 'running')
  RETURNING id INTO log_id;

  PERFORM net.http_post(
    url := 'https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/call-audit',
    body := '{}'::jsonb,
    headers := format(
      '{"Authorization": "Bearer %s", "Content-Type": "application/json", "x-cron": "true"}',
      auth_header
    )::jsonb
  );

  UPDATE cron_execution_log
  SET status = 'success',
      completed_at = NOW(),
      execution_ms = (EXTRACT(EPOCH FROM clock_timestamp()) * 1000 - start_ms)::INTEGER
  WHERE id = log_id;

EXCEPTION WHEN OTHERS THEN
  UPDATE cron_execution_log
  SET status = 'failed',
      completed_at = NOW(),
      error_message = SQLERRM,
      execution_ms = (EXTRACT(EPOCH FROM clock_timestamp()) * 1000 - start_ms)::INTEGER
  WHERE id = log_id;
END;
$function$;

-- FIX 2: cleanup_old_whatsapp_chat_history - set search_path = public
CREATE OR REPLACE FUNCTION public.cleanup_old_whatsapp_chat_history()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM chat_history
  WHERE created_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count > 0 THEN
    INSERT INTO cleanup_logs (table_name, deleted_count, cleaned_at)
    VALUES ('chat_history', deleted_count, NOW());
  END IF;

  RETURN deleted_count;
END;
$function$;

-- FIX 3: Drop overly permissive INSERT policy on telegram_group_messages
-- WITH CHECK (true) for public role allows any user to insert.
-- Service_role (used by Edge Functions) bypasses RLS, so no policy needed.
DROP POLICY IF EXISTS "System can insert telegram messages" ON public.telegram_group_messages;
