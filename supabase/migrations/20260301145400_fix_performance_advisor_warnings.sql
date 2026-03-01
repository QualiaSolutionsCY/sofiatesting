-- Fix Supabase Performance Advisor Warnings
-- Applied: 2026-03-01
-- Issue: auth.uid() in RLS policies re-evaluated per-row instead of once
-- Fix: Wrap auth.uid() with (select auth.uid()) for single evaluation
-- See: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- FIX 1: User table - 3 policies

DROP POLICY IF EXISTS "Users can insert own profile" ON public."User";
CREATE POLICY "Users can insert own profile" ON public."User"
  FOR INSERT
  TO public
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON public."User";
CREATE POLICY "Users can update own profile" ON public."User"
  FOR UPDATE
  TO public
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own profile" ON public."User";
CREATE POLICY "Users can delete own profile" ON public."User"
  FOR DELETE
  TO public
  USING (id = (select auth.uid()));

-- FIX 2: telegram_group_messages SELECT policy

DROP POLICY IF EXISTS "Admin users can view telegram messages" ON public.telegram_group_messages;
CREATE POLICY "Admin users can view telegram messages" ON public.telegram_group_messages
  FOR SELECT
  TO public
  USING (
    (select auth.uid()) IN (
      SELECT "User".id
      FROM "User"
      WHERE ("User".email)::text IN (
        SELECT admin_users.email
        FROM admin_users
        WHERE admin_users.is_active = true
      )
    )
  );

-- FIX 3: audit_alerts SELECT policy

DROP POLICY IF EXISTS "Admin users can view historical audit alerts" ON public.audit_alerts;
CREATE POLICY "Admin users can view historical audit alerts" ON public.audit_alerts
  FOR SELECT
  TO public
  USING (
    (select auth.uid()) IN (
      SELECT "User".id
      FROM "User"
      WHERE ("User".email)::text IN (
        SELECT admin_users.email
        FROM admin_users
        WHERE admin_users.is_active = true
      )
    )
  );
