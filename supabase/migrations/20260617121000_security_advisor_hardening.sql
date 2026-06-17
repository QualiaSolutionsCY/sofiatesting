-- Supabase advisor hardening (vceeheaxcrhmpqueudqx). Three lint families:
--   0025 public_bucket_allows_listing (WARN/security)
--   0028/0029 anon|authenticated_security_definer_function_executable (WARN/security)
--   0003 auth_rls_initplan (WARN/performance)
--
-- All changes are non-destructive and preserve service_role behaviour
-- (service_role bypasses RLS and retains EXECUTE).

-- A) documents bucket is public=true, so objects are served via public URL
-- WITHOUT any storage.objects SELECT policy. The broad SELECT policy only adds
-- the ability for anon/authenticated to LIST every file in the bucket — drop it.
DROP POLICY IF EXISTS "Public read access for documents" ON storage.objects;

-- B) These SECURITY DEFINER functions are only ever called server-side by the
-- sophia-bot edge functions using the service-role key. EXECUTE is granted to
-- PUBLIC by default (which covers anon/authenticated), so revoke from PUBLIC and
-- re-grant only to service_role — leaving them uncallable via /rest/v1/rpc by
-- anon/authenticated while preserving server-side RPC calls. (postgres, the
-- owner, retains EXECUTE regardless and continues to run the trigger function.)
REVOKE EXECUTE ON FUNCTION public.cleanup_old_processed_webhooks() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cleanup_old_processed_webhooks() TO service_role;
REVOKE EXECUTE ON FUNCTION public.cleanup_upload_locks() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cleanup_upload_locks() TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_or_create_sophia_user(text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_or_create_sophia_user(text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_sophia_recent_context(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_sophia_recent_context(uuid, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.search_sophia_memory(uuid, vector, integer, double precision) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.search_sophia_memory(uuid, vector, integer, double precision) TO service_role;
REVOKE EXECUTE ON FUNCTION public.update_sophia_prompts_updated_at() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.update_sophia_prompts_updated_at() TO service_role;
REVOKE EXECUTE ON FUNCTION public.update_sophia_user_preferences(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.update_sophia_user_preferences(uuid, text, text, jsonb) TO service_role;

-- C) Wrap auth.role() in a scalar subselect so Postgres evaluates it once per
-- query (initplan) instead of once per row. Same semantics, faster at scale.
ALTER POLICY "Service role can manage invoice access users" ON public.invoice_access_users
  USING ((select auth.role()) = 'service_role') WITH CHECK ((select auth.role()) = 'service_role');
ALTER POLICY "Service role can manage invoice documents" ON public.invoice_documents
  USING ((select auth.role()) = 'service_role') WITH CHECK ((select auth.role()) = 'service_role');
ALTER POLICY "Service role can manage invoice document revisions" ON public.invoice_document_revisions
  USING ((select auth.role()) = 'service_role') WITH CHECK ((select auth.role()) = 'service_role');
ALTER POLICY "Service role can manage invoice approvals" ON public.invoice_approvals
  USING ((select auth.role()) = 'service_role') WITH CHECK ((select auth.role()) = 'service_role');
ALTER POLICY "Service role can manage invoice payments" ON public.invoice_payments
  USING ((select auth.role()) = 'service_role') WITH CHECK ((select auth.role()) = 'service_role');
ALTER POLICY "Service role can manage invoice storage objects" ON public.invoice_storage_objects
  USING ((select auth.role()) = 'service_role') WITH CHECK ((select auth.role()) = 'service_role');
ALTER POLICY "Service role can manage invoice message events" ON public.invoice_message_events
  USING ((select auth.role()) = 'service_role') WITH CHECK ((select auth.role()) = 'service_role');
