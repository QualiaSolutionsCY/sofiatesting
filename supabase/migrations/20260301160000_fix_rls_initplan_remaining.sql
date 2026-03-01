-- Fix remaining auth_rls_initplan warnings
-- Tables: PropertyListing (4), LandListing (4), ListingUploadAttempt (1), DocumentSend (4)
-- Issue: auth.uid() re-evaluated per-row instead of once per query
-- Fix: Wrap with (select auth.uid()) for single evaluation

-- ===================================================================
-- PropertyListing - 4 policies
-- ===================================================================

DROP POLICY IF EXISTS "Users can view own listings" ON "PropertyListing";
CREATE POLICY "Users can view own listings" ON "PropertyListing"
  FOR SELECT USING ((select auth.uid()) = "userId");

DROP POLICY IF EXISTS "Users can insert own listings" ON "PropertyListing";
CREATE POLICY "Users can insert own listings" ON "PropertyListing"
  FOR INSERT WITH CHECK ((select auth.uid()) = "userId");

DROP POLICY IF EXISTS "Users can update own listings" ON "PropertyListing";
CREATE POLICY "Users can update own listings" ON "PropertyListing"
  FOR UPDATE USING ((select auth.uid()) = "userId");

DROP POLICY IF EXISTS "Users can delete own listings" ON "PropertyListing";
CREATE POLICY "Users can delete own listings" ON "PropertyListing"
  FOR DELETE USING ((select auth.uid()) = "userId");

-- ===================================================================
-- LandListing - 4 policies
-- ===================================================================

DROP POLICY IF EXISTS "Users can view own land listings" ON "LandListing";
CREATE POLICY "Users can view own land listings" ON "LandListing"
  FOR SELECT USING ((select auth.uid()) = "userId");

DROP POLICY IF EXISTS "Users can insert own land listings" ON "LandListing";
CREATE POLICY "Users can insert own land listings" ON "LandListing"
  FOR INSERT WITH CHECK ((select auth.uid()) = "userId");

DROP POLICY IF EXISTS "Users can update own land listings" ON "LandListing";
CREATE POLICY "Users can update own land listings" ON "LandListing"
  FOR UPDATE USING ((select auth.uid()) = "userId");

DROP POLICY IF EXISTS "Users can delete own land listings" ON "LandListing";
CREATE POLICY "Users can delete own land listings" ON "LandListing"
  FOR DELETE USING ((select auth.uid()) = "userId");

-- ===================================================================
-- ListingUploadAttempt - 1 policy (subquery needs fix too)
-- ===================================================================

DROP POLICY IF EXISTS "Users can view upload attempts for own listings" ON "ListingUploadAttempt";
CREATE POLICY "Users can view upload attempts for own listings" ON "ListingUploadAttempt"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "PropertyListing"
      WHERE "PropertyListing".id = "ListingUploadAttempt"."listingId"
      AND "PropertyListing"."userId" = (select auth.uid())
    )
  );

-- ===================================================================
-- DocumentSend - 4 policies
-- ===================================================================

DROP POLICY IF EXISTS "Users can view own documents" ON "DocumentSend";
CREATE POLICY "Users can view own documents" ON "DocumentSend"
  FOR SELECT USING ((select auth.uid()) = "userId");

DROP POLICY IF EXISTS "Users can insert own documents" ON "DocumentSend";
CREATE POLICY "Users can insert own documents" ON "DocumentSend"
  FOR INSERT WITH CHECK ((select auth.uid()) = "userId");

DROP POLICY IF EXISTS "Users can update own documents" ON "DocumentSend";
CREATE POLICY "Users can update own documents" ON "DocumentSend"
  FOR UPDATE USING ((select auth.uid()) = "userId");

DROP POLICY IF EXISTS "Users can delete own documents" ON "DocumentSend";
CREATE POLICY "Users can delete own documents" ON "DocumentSend"
  FOR DELETE USING ((select auth.uid()) = "userId");
