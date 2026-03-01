-- RLS Policies for Orphaned Tables
-- Phase 18, Plan 04
-- Applied: 2026-03-01
--
-- These tables had RLS enabled but NO policies, making them completely
-- inaccessible (even to authenticated users). Edge Functions using
-- service_role bypass RLS and continued working.

-- =====================================================
-- telegram_group_messages - Active Telegram message index
-- Used by sophia-bot Edge Function (service_role bypasses RLS)
-- Admin users need read access for phone number searches
-- =====================================================

CREATE POLICY "Admin users can view telegram messages"
  ON telegram_group_messages FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM "User"
      WHERE email IN (
        SELECT email FROM admin_users WHERE is_active = true
      )
    )
  );

CREATE POLICY "System can insert telegram messages"
  ON telegram_group_messages FOR INSERT
  WITH CHECK (true);

-- =====================================================
-- audit_alerts - Deprecated (replaced by caller_alerts in v1.2)
-- Admin read-only for historical data access
-- =====================================================

CREATE POLICY "Admin users can view historical audit alerts"
  ON audit_alerts FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM "User"
      WHERE email IN (
        SELECT email FROM admin_users WHERE is_active = true
      )
    )
  );
