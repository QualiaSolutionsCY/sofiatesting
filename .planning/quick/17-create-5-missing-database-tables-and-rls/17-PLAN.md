---
phase: quick-17
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260301120000_create_missing_tables.sql
autonomous: true

must_haves:
  truths:
    - "PropertyListing table exists in production database with all 60+ columns"
    - "LandListing table exists in production database with all 40+ columns"
    - "ListingUploadAttempt table exists with FK to PropertyListing"
    - "DocumentSend table exists with FK to User and Chat"
    - "All 4 tables have RLS enabled with appropriate policies"
    - "TypeScript compiles without errors after migration"
  artifacts:
    - path: "supabase/migrations/20260301120000_create_missing_tables.sql"
      provides: "SQL migration creating 4 tables with RLS"
      contains: "CREATE TABLE"
    - path: "production database"
      provides: "PropertyListing, LandListing, ListingUploadAttempt, DocumentSend tables"
      min_rows: 4
  key_links:
    - from: "lib/db/schema.ts"
      to: "production database"
      via: "SQL migration matches Drizzle schema"
      pattern: "PropertyListing.*LandListing.*ListingUploadAttempt.*DocumentSend"
---

<objective>
Create 4 missing database tables (PropertyListing, LandListing, ListingUploadAttempt, DocumentSend) via SQL migration with RLS policies, matching Drizzle schema definitions.

Purpose: Align production database to lib/db/schema.ts definitions, enabling web app property listing features (currently broken due to missing tables).
Output: Single SQL migration file applied via `supabase db push --linked`, all tables created with indexes and RLS.
</objective>

<execution_context>
@/home/qualia/.claude/get-shit-done/workflows/execute-plan.md
@/home/qualia/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@lib/db/schema.ts
@.planning/quick/16-repair-supabase-migration-history-and-re/16-FINDINGS.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create SQL migration for 4 tables with RLS</name>
  <files>supabase/migrations/20260301120000_create_missing_tables.sql</files>
  <action>
Create SQL migration file based on Drizzle schema definitions from lib/db/schema.ts:

**PropertyListing** (lines 165-264):
- 60+ columns including UUID id (PK), userId (FK to User), chatId (FK to Chat)
- Property fields: name, description, address (jsonb), price, currency, numberOfRooms, etc.
- Taxonomy UUIDs: propertyTypeId, locationId, indoorFeatureIds (array), outdoorFeatureIds (array), etc.
- Owner fields: ownerName, ownerPhone
- Review workflow: reviewStatus, firstReviewerId, secondReviewerId, submittedByAgentId
- Status tracking: status (default 'draft'), zyprusListingId, zyprusListingUrl
- Timestamps: createdAt, updatedAt, publishedAt, deletedAt, draftExpiresAt
- 10 indexes: userId, status, createdAt, deletedAt, chatId, locationId, propertyTypeId, userId+status composite, userId+createdAt composite, draftExpiresAt

**LandListing** (lines 297-381):
- 40+ columns including UUID id (PK), userId (FK to User), chatId (FK to Chat)
- Land fields: name, description, price, currency, landSize (sqm)
- Taxonomy UUIDs: landTypeId (required), locationId, listingTypeId (required), etc.
- Building permissions: buildingDensity, siteCoverage, maxFloors, maxHeight
- Arrays: infrastructureIds, viewIds
- Status tracking: status (default 'draft'), zyprusListingId, zyprusListingUrl
- Timestamps: createdAt, updatedAt, publishedAt, deletedAt, draftExpiresAt
- 10 indexes: userId, status, createdAt, deletedAt, chatId, locationId, landTypeId, userId+status composite, userId+createdAt composite, draftExpiresAt

**ListingUploadAttempt** (lines 268-290):
- FK to PropertyListing (listingId)
- Fields: attemptNumber, status, errorMessage, errorCode, apiResponse (jsonb), attemptedAt, completedAt, durationMs
- 2 indexes: listingId, attemptedAt

**DocumentSend** (lines 638-672):
- FK to User (userId), FK to Chat (chatId)
- Document fields: documentTitle, documentUrl, documentContent
- Recipient fields: recipientName, recipientEmail, recipientPhone
- Method fields: method, status (default 'pending'), message
- Tracking: errorMessage, sentAt, createdAt
- 4 indexes: userId, chatId, status, createdAt DESC

**RLS Policies for each table:**
```sql
ALTER TABLE "PropertyListing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LandListing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ListingUploadAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentSend" ENABLE ROW LEVEL SECURITY;

-- PropertyListing policies
CREATE POLICY "Users can view own listings" ON "PropertyListing"
  FOR SELECT USING (auth.uid() = "userId");
CREATE POLICY "Users can insert own listings" ON "PropertyListing"
  FOR INSERT WITH CHECK (auth.uid() = "userId");
CREATE POLICY "Users can update own listings" ON "PropertyListing"
  FOR UPDATE USING (auth.uid() = "userId");
CREATE POLICY "Users can delete own listings" ON "PropertyListing"
  FOR DELETE USING (auth.uid() = "userId");

-- LandListing policies (same pattern)
CREATE POLICY "Users can view own land listings" ON "LandListing"
  FOR SELECT USING (auth.uid() = "userId");
CREATE POLICY "Users can insert own land listings" ON "LandListing"
  FOR INSERT WITH CHECK (auth.uid() = "userId");
CREATE POLICY "Users can update own land listings" ON "LandListing"
  FOR UPDATE USING (auth.uid() = "userId");
CREATE POLICY "Users can delete own land listings" ON "LandListing"
  FOR DELETE USING (auth.uid() = "userId");

-- ListingUploadAttempt policies (read-only for users via listing join, service_role writes)
CREATE POLICY "Users can view upload attempts for own listings" ON "ListingUploadAttempt"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "PropertyListing"
      WHERE "PropertyListing".id = "ListingUploadAttempt"."listingId"
      AND "PropertyListing"."userId" = auth.uid()
    )
  );

-- DocumentSend policies
CREATE POLICY "Users can view own documents" ON "DocumentSend"
  FOR SELECT USING (auth.uid() = "userId");
CREATE POLICY "Users can insert own documents" ON "DocumentSend"
  FOR INSERT WITH CHECK (auth.uid() = "userId");
CREATE POLICY "Users can update own documents" ON "DocumentSend"
  FOR UPDATE USING (auth.uid() = "userId");
CREATE POLICY "Users can delete own documents" ON "DocumentSend"
  FOR DELETE USING (auth.uid() = "userId");
```

**CRITICAL gotchas:**
- Use EXACT column names from schema.ts (camelCase like "userId", not snake_case)
- Drizzle uses numeric() for decimals, real() for floats → PostgreSQL NUMERIC and REAL
- Arrays: `uuid[] NOT NULL DEFAULT '{}'` for required arrays, `uuid[]` for optional
- JSONB columns: Use JSONB type, no default needed
- Timestamps: Use `timestamp with time zone` (Drizzle default), `DEFAULT NOW()` for defaultNow()
- FKs: `REFERENCES "User"(id)` (capital U - Drizzle table name), `REFERENCES "Chat"(id)`
- Indexes: Create AFTER table creation, use format `CREATE INDEX "PropertyListing_userId_idx" ON "PropertyListing"("userId");`
- Composite indexes: `CREATE INDEX "PropertyListing_userId_status_idx" ON "PropertyListing"("userId", "status");`
- DESC indexes: `CREATE INDEX "PropertyListing_userId_createdAt_idx" ON "PropertyListing"("userId", "createdAt" DESC);`

**Why NOT creating AgentChatSession:**
AgentChatSession (lines 463-503) has FK to zyprusAgent.id but ZyprusAgent table doesn't exist (phantom table). Skip for now — only 1 reference in codebase. Will be addressed in Phase 21 Drizzle Schema Migration.
  </action>
  <verify>
```bash
# Check migration file syntax
cat supabase/migrations/20260301120000_create_missing_tables.sql | wc -l
# Should be 200+ lines (4 tables × ~50 lines each)
```
  </verify>
  <done>SQL migration file exists with 4 CREATE TABLE statements, 24 CREATE INDEX statements, and 14 RLS policies (4 tables × ~3-4 policies each).</done>
</task>

<task type="auto">
  <name>Task 2: Apply migration to production database</name>
  <files>production database (vceeheaxcrhmpqueudqx)</files>
  <action>
Apply migration to production Supabase database:

```bash
# Verify connection first
supabase db push --linked --dry-run

# Apply migration (creates tables, indexes, RLS)
supabase db push --linked
```

**Verify tables created:**
```bash
# Check PropertyListing table exists with correct columns
supabase db execute --sql "SELECT column_name FROM information_schema.columns WHERE table_name = 'PropertyListing' ORDER BY ordinal_position;" --linked

# Check LandListing table exists
supabase db execute --sql "SELECT column_name FROM information_schema.columns WHERE table_name = 'LandListing' ORDER BY ordinal_position;" --linked

# Check ListingUploadAttempt table exists
supabase db execute --sql "SELECT table_name FROM information_schema.tables WHERE table_name IN ('PropertyListing', 'LandListing', 'ListingUploadAttempt', 'DocumentSend');" --linked

# Verify RLS enabled
supabase db execute --sql "SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('PropertyListing', 'LandListing', 'ListingUploadAttempt', 'DocumentSend');" --linked

# Count policies (should be 14 total)
supabase db execute --sql "SELECT COUNT(*) FROM pg_policies WHERE tablename IN ('PropertyListing', 'LandListing', 'ListingUploadAttempt', 'DocumentSend');" --linked
```

**Expected output:**
- PropertyListing: 60+ columns
- LandListing: 40+ columns
- ListingUploadAttempt: 9 columns
- DocumentSend: 13 columns
- All 4 tables: rowsecurity = true
- Total policies: 14
  </action>
  <verify>
```bash
# Single verification command - all tables exist with RLS
supabase db execute --sql "
  SELECT
    t.tablename,
    t.rowsecurity as rls_enabled,
    COUNT(DISTINCT c.column_name) as column_count,
    COUNT(DISTINCT p.policyname) as policy_count
  FROM pg_tables t
  LEFT JOIN information_schema.columns c ON c.table_name = t.tablename
  LEFT JOIN pg_policies p ON p.tablename = t.tablename
  WHERE t.tablename IN ('PropertyListing', 'LandListing', 'ListingUploadAttempt', 'DocumentSend')
  GROUP BY t.tablename, t.rowsecurity
  ORDER BY t.tablename;
" --linked
```

Expected output:
- PropertyListing: rls_enabled=t, column_count=60+, policy_count=4
- LandListing: rls_enabled=t, column_count=40+, policy_count=4
- ListingUploadAttempt: rls_enabled=t, column_count=9, policy_count=1
- DocumentSend: rls_enabled=t, column_count=13, policy_count=4
  </verify>
  <done>All 4 tables exist in production database with RLS enabled, correct column counts, and policies applied.</done>
</task>

<task type="auto">
  <name>Task 3: Verify TypeScript compilation</name>
  <files>N/A (verification only)</files>
  <action>
Verify TypeScript still compiles without errors after database migration:

```bash
npx tsc --noEmit
```

**Why this matters:**
Migration adds tables to DB but doesn't change TypeScript code. Drizzle schema in lib/db/schema.ts already defines these tables. TypeScript should compile cleanly.

**If errors occur:**
Likely unrelated to migration (pre-existing issues). Check error output and fix if blocking.
  </action>
  <verify>
```bash
npx tsc --noEmit
echo $?
# Exit code 0 = success
```
  </verify>
  <done>TypeScript compilation succeeds (exit code 0) with no errors related to database schema.</done>
</task>

</tasks>

<verification>
After all tasks complete:

**Database verification:**
```bash
# Verify all 4 tables exist with correct structure
supabase db execute --sql "
  SELECT
    t.table_name,
    COUNT(DISTINCT c.column_name) as columns,
    COUNT(DISTINCT i.indexname) as indexes,
    t2.rowsecurity as rls
  FROM information_schema.tables t
  LEFT JOIN information_schema.columns c ON c.table_name = t.table_name
  LEFT JOIN pg_indexes i ON i.tablename = t.table_name
  LEFT JOIN pg_tables t2 ON t2.tablename = t.table_name
  WHERE t.table_name IN ('PropertyListing', 'LandListing', 'ListingUploadAttempt', 'DocumentSend')
  GROUP BY t.table_name, t2.rowsecurity
  ORDER BY t.table_name;
" --linked
```

**Schema alignment check:**
```bash
# Verify Drizzle schema matches database
# (Manual check - compare schema.ts definitions to SQL migration)
diff -u <(grep -A 100 'export const propertyListing' lib/db/schema.ts | head -50) supabase/migrations/20260301120000_create_missing_tables.sql
```

**Web app smoke test:**
```bash
# Start dev server and check for errors
npm run dev &
sleep 5
curl -s http://localhost:3000 | grep -i "error"
# Should return nothing (no errors)
```
</verification>

<success_criteria>
**Must achieve:**
- [ ] SQL migration file created with 4 tables, 24 indexes, 14 RLS policies
- [ ] Migration applied successfully via `supabase db push --linked`
- [ ] All 4 tables exist in production database (vceeheaxcrhmpqueudqx)
- [ ] RLS enabled on all 4 tables with correct policy counts
- [ ] TypeScript compiles without errors (`npx tsc --noEmit`)
- [ ] Web app starts without schema-related errors

**Measurable outcomes:**
- PropertyListing: 60+ columns, 10 indexes, 4 RLS policies
- LandListing: 40+ columns, 10 indexes, 4 RLS policies
- ListingUploadAttempt: 9 columns, 2 indexes, 1 RLS policy
- DocumentSend: 13 columns, 4 indexes, 4 RLS policies
- TypeScript exit code: 0
</success_criteria>

<output>
After completion, create `.planning/quick/17-create-5-missing-database-tables-and-rls/17-SUMMARY.md` documenting:
- Tables created (names, column counts, index counts)
- RLS policies applied (counts per table)
- Migration file location
- Verification results
- Next steps (if any)
</output>
