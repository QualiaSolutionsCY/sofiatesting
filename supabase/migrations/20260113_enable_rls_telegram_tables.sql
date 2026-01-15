-- Migration: Enable RLS on Telegram tables
-- Fixes: rls_disabled_in_public errors for telegram_groups, telegram_leads,
--        lead_forwarding_rotation, telegram_registration_state
-- Also fixes: auth_rls_initplan warning for sophia_knowledge_base

-- =============================================================================
-- 1. Enable RLS on all affected tables
-- =============================================================================

ALTER TABLE IF EXISTS telegram_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS telegram_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lead_forwarding_rotation ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS telegram_registration_state ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 2. Create policies for service_role access only
--    These tables are ONLY accessed by Edge Functions (sophia-bot, telegram-webhook)
--    which use service_role key, so we block anon/authenticated access entirely
-- =============================================================================

-- telegram_groups policies
DROP POLICY IF EXISTS "Service role full access" ON telegram_groups;
CREATE POLICY "Service role full access" ON telegram_groups
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- telegram_leads policies
DROP POLICY IF EXISTS "Service role full access" ON telegram_leads;
CREATE POLICY "Service role full access" ON telegram_leads
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- lead_forwarding_rotation policies
DROP POLICY IF EXISTS "Service role full access" ON lead_forwarding_rotation;
CREATE POLICY "Service role full access" ON lead_forwarding_rotation
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- telegram_registration_state policies
DROP POLICY IF EXISTS "Service role full access" ON telegram_registration_state;
CREATE POLICY "Service role full access" ON telegram_registration_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 3. Fix sophia_knowledge_base RLS performance (auth_rls_initplan warning)
--    Wrap current_setting() and auth.role() in SELECT for better performance
-- =============================================================================

DROP POLICY IF EXISTS "Knowledge base access" ON sophia_knowledge_base;

CREATE POLICY "Knowledge base access" ON sophia_knowledge_base
  FOR ALL
  USING (
    ((SELECT auth.role()) = 'service_role'::text)
    OR ((SELECT current_setting('request.method'::text, true)) = 'GET'::text)
  );
