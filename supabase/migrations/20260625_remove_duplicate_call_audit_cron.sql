-- Remove the duplicate call-audit cron job.
--
-- Two jobs both fired the audit at '0 15 * * 1-5':
--   * 'call-audit-daily'  — created by 20260226231500_call_audit_cron.sql (keep)
--   * 'daily-call-audit'  — added out-of-band via the dashboard, never in a
--                           migration; double-invoked the edge function every
--                           weekday. The UNIQUE(audit_date) claim made the second
--                           run a no-op, but it was redundant config drift.
--
-- Idempotent: only unschedules if the duplicate is present (no-op on a fresh
-- rebuild where it never existed, and on prod where it was already removed
-- 2026-06-25). Records the removal in the repo for parity.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-call-audit') THEN
    PERFORM cron.unschedule('daily-call-audit');
  END IF;
END $$;
