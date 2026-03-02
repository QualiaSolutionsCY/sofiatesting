-- Fix SECURITY DEFINER views flagged by Supabase linter
-- Views should use SECURITY INVOKER so RLS policies of the querying user apply

ALTER VIEW agent_daily_token_usage SET (security_invoker = on);
ALTER VIEW agent_monthly_token_usage SET (security_invoker = on);
