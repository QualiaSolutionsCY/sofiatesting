-- Enable RLS on pending_email_forwards (Supabase advisor lint 0013, CRITICAL).
--
-- The original table migration (20260528_pending_email_forwards.sql) left RLS
-- OFF on the assumption that only the service-role-keyed email-router touches
-- it. But the table lives in the public schema, which PostgREST exposes — so the
-- public anon key could read/write queued lead data, including PII (sender
-- email/name and full email bodies). That is the hole the advisor flags.
--
-- service_role bypasses RLS, so enabling RLS with NO permissive policies leaves
-- the email-router unaffected while denying all anon/authenticated access. This
-- is the correct posture for a server-only queue table.

ALTER TABLE public.pending_email_forwards ENABLE ROW LEVEL SECURITY;
