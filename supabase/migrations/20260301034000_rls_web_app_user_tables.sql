-- Row Level Security for Web App User Tables
-- Phase 18, Plan 01
-- Applied: 2026-03-01
--
-- ACTUAL STATE: Most web app tables (Chat, Message_v2, Vote_v2, Document, Suggestion)
-- already had comprehensive RLS policies from initial schema setup.
-- Only the User table was missing INSERT/UPDATE/DELETE policies.
-- DocumentSend table does not exist in production database (defined in Drizzle schema
-- but never migrated).
--
-- This migration adds the missing User table write policies.
-- Edge Functions use service_role key which bypasses RLS (unchanged).

-- =====================================================
-- User Table - Fill Policy Gaps
-- Already had: users_read_own_profile (SELECT)
-- Adding: INSERT, UPDATE, DELETE
-- =====================================================

CREATE POLICY "Users can insert own profile"
  ON "User" FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON "User" FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can delete own profile"
  ON "User" FOR DELETE
  USING (id = auth.uid());

-- =====================================================
-- Pre-existing Policies (NOT applied by this migration)
-- Documented here for reference:
-- =====================================================
--
-- Chat (5 policies):
--   chats_public_read    SELECT  visibility = 'public'
--   chats_select         SELECT  "userId" = auth.uid() OR visibility = 'public'
--   chats_user_insert    INSERT  "userId" = auth.uid()
--   chats_user_update    UPDATE  "userId" = auth.uid()
--   chats_user_delete    DELETE  "userId" = auth.uid()
--
-- Message_v2 (5 policies):
--   messages_public_read SELECT  EXISTS(Chat WHERE visibility = 'public')
--   messages_select      SELECT  EXISTS(Chat WHERE "userId" = auth.uid() OR visibility = 'public')
--   messages_user_insert INSERT  EXISTS(Chat WHERE "userId" = auth.uid())
--   messages_user_update UPDATE  EXISTS(Chat WHERE "userId" = auth.uid())
--   messages_user_delete DELETE  EXISTS(Chat WHERE "userId" = auth.uid())
--
-- Vote_v2 (1 ALL policy):
--   votes_user_owns_chat ALL     EXISTS(Chat WHERE "userId" = auth.uid())
--
-- Document (1 ALL policy):
--   documents_user_owns  ALL     "userId" = auth.uid()
--
-- Suggestion (1 ALL policy):
--   suggestions_user_owns ALL    "userId" = auth.uid()
