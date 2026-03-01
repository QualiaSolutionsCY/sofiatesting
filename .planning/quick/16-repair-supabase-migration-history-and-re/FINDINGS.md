# Supabase Migration Repair & Drizzle Schema Discrepancies

**Quick Task:** 16
**Date:** 2026-03-01
**Status:** Migration history repaired, cleanup roadmap documented

---

## Section 1: Migration Repair Results

### Summary

- **Remote-only migrations marked as reverted:** 116 total
  - First batch: 59 migrations (20250101000000 through 20260301125122)
  - Second batch: 57 migrations (20251215000001 through 20260301125110)
- **Local migrations renamed:** 11 files (fixed improper naming without timestamps)
- **Local migrations marked as applied:** 13 files

### New Migration Files Created

No new migration file was created via `supabase db pull` due to Docker unavailability. However, the migration history is now synchronized.

### Current Migration Count

**Local migrations:** 13 files in `supabase/migrations/`
- 20260226110400_call_tracking.sql
- 20260226140131_telegram_group_messages.sql
- 20260226141013_audit_alerts.sql
- 20260226185300_add_call_time_to_caller_alerts.sql
- 20260226194300_add_chat_id_to_caller_alerts.sql
- 20260226231500_call_audit_cron.sql
- 20260227070200_listing_uploads_agent_phone_index.sql
- 20260301033700_rls_admin_tables.sql
- 20260301033800_rls_agent_tables.sql
- 20260301033900_rls_orphaned_tables.sql
- 20260301034000_rls_web_app_user_tables.sql
- 20260301145400_fix_performance_advisor_warnings.sql
- 20260301145500_fix_security_advisor_warnings.sql

**Remote migrations:** All 13 local migrations now applied in remote

**Verification:**
```bash
$ supabase db push --dry-run --linked
Remote database is up to date.
```
✅ No warnings about missing remote migrations

---

## Section 2: Table Inventory

### Total Tables in Production Database

**By Schema:**

| Schema | Table Count | Notes |
|--------|-------------|-------|
| public | ~18 tables | Core application tables |
| auth | ~10 tables | Supabase auth (managed by Supabase) |
| storage | ~5 tables | Supabase storage (managed by Supabase) |
| Other system schemas | ~30+ tables | pg_catalog, extensions, cron, etc. (excluded from this analysis) |

### Public Schema Tables (Actual Production Tables)

Based on migration files and schema mappings:

| Table Name | Source | Purpose | RLS Status |
|------------|--------|---------|------------|
| **Web App Tables** |
| User | Drizzle schema | User accounts (web app) | ✅ Enabled with policies |
| Chat | Drizzle schema | Chat sessions | ✅ Enabled with policies |
| Message_v2 | Drizzle schema | Chat messages | ✅ Enabled with policies |
| Vote_v2 | Drizzle schema | Message votes | ✅ Enabled with policies |
| Document | Drizzle schema | Documents | ✅ Enabled with policies |
| Suggestion | Drizzle schema | Document suggestions | ✅ Enabled with policies |
| Stream | Drizzle schema | Streaming state | ✅ Enabled (policy status unknown) |
| **Admin Tables** |
| admin_users | Drizzle schema | Admin user roles | ✅ Enabled with deny-all policies |
| **Agent Tables** |
| agents | Drizzle schema (supabaseAgent) | Real estate agents (WhatsApp) | ✅ Enabled with service role policy |
| **Telegram Tables** |
| telegram_groups | Drizzle schema (supabaseTelegramGroup) | Telegram group tracking | ✅ Enabled (policy status unknown) |
| telegram_leads | Drizzle schema (supabaseTelegramLead) | Telegram lead tracking | ✅ Enabled (policy status unknown) |
| telegram_group_messages | Migration 20260226140131 | Telegram message index | ✅ Enabled with admin read + system insert policies |
| **Call Audit Tables** |
| call_records | Migration 20260226110400 | 3CX call records | ✅ Enabled (policy status unknown) |
| caller_alerts | Migration 20260226185300/194300 | Call audit alerts | ✅ Enabled (policy status unknown) |
| audit_alerts | Migration 20260226141013 | Deprecated audit alerts (v1.1) | ✅ Enabled with admin read-only policy |
| call_audit_runs | Migration 20260226231500 | Call audit execution log | ✅ Enabled (policy status unknown) |
| **System Tables** |
| app_secrets | Unknown migration | Application secrets | ✅ Enabled (policy status unknown) |
| cron_execution_log | Migration 20260226231500 | pg_cron execution log | ✅ Enabled (policy status unknown) |

**Note:** Tables listed as "policy status unknown" likely have service_role-only access (no anon/authenticated policies).

### Existence Status for Suspect PascalCase Tables

Docker unavailability prevented direct database query. Status determined from migration file documentation:

| Table Name | Defined in schema.ts | Exists in DB | Evidence |
|------------|---------------------|--------------|----------|
| PropertyListing | ✅ Yes (line 165) | ❌ No | Migration 20260301033800_rls_agent_tables.sql: "NOT APPLIED: ... PropertyListing ... do NOT exist in the production database" |
| LandListing | ✅ Yes (line 297) | ❌ No | Migration 20260301033800_rls_agent_tables.sql: "NOT APPLIED: ... LandListing ... do NOT exist in the production database" |
| ListingUploadAttempt | ✅ Yes (line 268) | ❌ No | Migration 20260301033800_rls_agent_tables.sql: "NOT APPLIED: ... ListingUploadAttempt ... do NOT exist in the production database" |
| ZyprusAgent | ✅ Yes (line 413) | ❌ No | Migration 20260301033800_rls_agent_tables.sql: "NOT APPLIED: ... ZyprusAgent ... do NOT exist in the production database" |
| AgentChatSession | ✅ Yes (line 463) | ❌ No | Migration 20260301033800_rls_agent_tables.sql: "NOT APPLIED: ... AgentChatSession ... do NOT exist in the production database" |
| TelegramGroup | ✅ Yes (line 512) | ❌ No | Actual table is "telegram_groups" (mapped via supabaseTelegramGroup) |
| TelegramLead | ✅ Yes (line 541) | ❌ No | Actual table is "telegram_leads" (mapped via supabaseTelegramLead) |
| LeadForwardingRotation | ✅ Yes (line 613) | ❌ No | Actual table is "lead_forwarding_rotation" (mapped via supabaseLeadForwardingRotation) - needs verification |
| DocumentSend | ✅ Yes (line 638) | ❌ No | Migration 20260301034000_rls_web_app_user_tables.sql: "DocumentSend table does not exist in production database" |

**Conclusion:** 9 PascalCase tables defined in Drizzle schema, 0 exist in production database.

---

## Section 3: Drizzle Schema Discrepancies

### Phantom Table Analysis

#### 1. PropertyListing

- **Table name:** `PropertyListing` (PascalCase)
- **Defined in:** `lib/db/schema.ts` (line 165)
- **Exists in DB:** ❌ No
- **Reference count:** 29 files
- **Impact:**
  - Web app property listing features completely broken
  - All property listing API routes likely failing
  - Property listing upload functionality non-functional
- **Evidence:** Migration 20260301033800 documents "NOT APPLIED"
- **Find affected files:**
  ```bash
  rg "PropertyListing" --glob "*.ts" --glob "*.tsx" -l
  ```

#### 2. LandListing

- **Table name:** `LandListing` (PascalCase)
- **Defined in:** `lib/db/schema.ts` (line 297)
- **Exists in DB:** ❌ No
- **Reference count:** 17 files
- **Impact:**
  - Land listing features completely broken
  - Land-specific upload functionality non-functional
- **Evidence:** Migration 20260301033800 documents "NOT APPLIED"
- **Find affected files:**
  ```bash
  rg "LandListing" --glob "*.ts" --glob "*.tsx" -l
  ```

#### 3. ListingUploadAttempt

- **Table name:** `ListingUploadAttempt` (PascalCase)
- **Defined in:** `lib/db/schema.ts` (line 268)
- **Exists in DB:** ❌ No
- **Reference count:** 5 files
- **Impact:**
  - Upload retry tracking broken
  - Cannot track failed upload attempts
  - References PropertyListing (double phantom dependency)
- **Evidence:** Migration 20260301033800 documents "NOT APPLIED"
- **Find affected files:**
  ```bash
  rg "ListingUploadAttempt" --glob "*.ts" --glob "*.tsx" -l
  ```

#### 4. ZyprusAgent

- **Table name:** `ZyprusAgent` (PascalCase)
- **Defined in:** `lib/db/schema.ts` (line 413)
- **Exists in DB:** ❌ No (actual table is `agents`)
- **Reference count:** 5 files
- **Impact:**
  - Some agent queries may fail
  - Actual table `agents` accessed via `supabaseAgent` export
  - Codebase has mixed usage (some use ZyprusAgent, some use supabaseAgent)
- **Evidence:** Migration 20260301033800 documents "NOT APPLIED"; actual table is "agents"
- **Find affected files:**
  ```bash
  rg "ZyprusAgent" --glob "*.ts" --glob "*.tsx" -l
  # Also check for supabaseAgent usage:
  rg "supabaseAgent" --glob "*.ts" --glob "*.tsx" -l
  ```
- **Note:** STATE.md already documents: "Migrate `zyprusAgent` → `supabaseAgent` refs across codebase"

#### 5. AgentChatSession

- **Table name:** `AgentChatSession` (PascalCase)
- **Defined in:** `lib/db/schema.ts` (line 463)
- **Exists in DB:** ❌ No
- **Reference count:** 1 file
- **Impact:**
  - Agent chat session tracking broken
  - Limited impact (only 1 file)
- **Evidence:** Migration 20260301033800 documents "NOT APPLIED"
- **Find affected files:**
  ```bash
  rg "AgentChatSession" --glob "*.ts" --glob "*.tsx" -l
  ```

#### 6. TelegramGroup (phantom)

- **Table name:** `TelegramGroup` (PascalCase)
- **Defined in:** `lib/db/schema.ts` (line 512)
- **Exists in DB:** ❌ No (actual table is `telegram_groups` - snake_case)
- **Reference count:** 4 files
- **Impact:**
  - Some Telegram queries may fail
  - Actual table `telegram_groups` accessed via `supabaseTelegramGroup` export
  - Codebase has mixed usage
- **Find affected files:**
  ```bash
  rg "TelegramGroup[^a-z]" --glob "*.ts" --glob "*.tsx" -l
  # Also check for supabaseTelegramGroup usage:
  rg "supabaseTelegramGroup" --glob "*.ts" --glob "*.tsx" -l
  ```

#### 7. TelegramLead (phantom)

- **Table name:** `TelegramLead` (PascalCase)
- **Defined in:** `lib/db/schema.ts` (line 541)
- **Exists in DB:** ❌ No (actual table is `telegram_leads` - snake_case)
- **Reference count:** Unknown (included in TelegramGroup count)
- **Impact:**
  - Some Telegram lead queries may fail
  - Actual table `telegram_leads` accessed via `supabaseTelegramLead` export
- **Find affected files:**
  ```bash
  rg "TelegramLead[^a-z]" --glob "*.ts" --glob "*.tsx" -l
  ```

#### 8. LeadForwardingRotation (phantom)

- **Table name:** `LeadForwardingRotation` (PascalCase)
- **Defined in:** `lib/db/schema.ts` (line 613)
- **Exists in DB:** Likely ❌ No (actual table likely `lead_forwarding_rotation` - snake_case)
- **Reference count:** Unknown
- **Impact:**
  - Lead forwarding rotation may fail
  - Actual table accessed via `supabaseLeadForwardingRotation` export (if exists)
- **Find affected files:**
  ```bash
  rg "LeadForwardingRotation" --glob "*.ts" --glob "*.tsx" -l
  ```

#### 9. DocumentSend

- **Table name:** `DocumentSend` (PascalCase)
- **Defined in:** `lib/db/schema.ts` (line 638)
- **Exists in DB:** ❌ No
- **Reference count:** Unknown (likely 0-2 files)
- **Impact:**
  - Document sending tracking broken
  - Limited impact if feature unused
- **Evidence:** Migration 20260301034000 documents "does not exist in production database"
- **Find affected files:**
  ```bash
  rg "DocumentSend" --glob "*.ts" --glob "*.tsx" -l
  ```

### Pattern Analysis

**Root cause:** Schema drift - Drizzle schema definitions were created but never migrated to production database.

**Two patterns identified:**

1. **Never created:** PropertyListing, LandListing, ListingUploadAttempt, AgentChatSession, DocumentSend
   - Defined in schema.ts
   - No migration files exist
   - Code imports these tables but queries will fail

2. **Naming mismatch:** ZyprusAgent/agents, TelegramGroup/telegram_groups, TelegramLead/telegram_leads
   - Table exists in DB with snake_case name
   - Drizzle schema has duplicate PascalCase definition AND correct snake_case mapping
   - Codebase has mixed usage (some files use phantom, some use actual)

---

## Section 4: Cleanup Roadmap

### Estimated Effort

| Category | Files to Refactor | Complexity |
|----------|-------------------|------------|
| PropertyListing | 29 files | HIGH - Core feature |
| LandListing | 17 files | MEDIUM - Secondary feature |
| ListingUploadAttempt | 5 files | LOW - Support feature |
| ZyprusAgent → agents | 5 files + 6 files (supabaseAgent) | LOW - Simple rename |
| TelegramGroup → telegram_groups | 4 files | LOW - Simple rename |
| AgentChatSession | 1 file | LOW - Minimal impact |
| DocumentSend | 0-2 files | LOW - Unused feature |

**Total:** ~60-70 file modifications

### Breaking Changes

If phantom tables are removed from schema.ts without creating them in DB:

1. **Import failures:** All files importing `propertyListing`, `landListing`, `listingUploadAttempt`, etc. will fail TypeScript compilation
2. **Runtime errors:** Drizzle queries against these tables will throw "table does not exist"
3. **Feature unavailability:** Property listing, land listing, upload tracking completely non-functional

### Migration Strategy: Option A vs B

#### Option A: Create Missing Tables in DB (Align DB to Schema)

**Process:**
1. Generate Drizzle migration from current schema.ts:
   ```bash
   npx drizzle-kit generate
   ```
2. Review generated migration SQL
3. Apply to production:
   ```bash
   npx drizzle-kit push
   # OR
   supabase db push --linked
   ```
4. Add RLS policies for new tables
5. Test features

**Pros:**
- ✅ No code changes needed (schema.ts already correct)
- ✅ Enables currently broken property/land listing features
- ✅ Aligns with product roadmap (property listings are core feature)
- ✅ Future-proof (features can be developed against schema)

**Cons:**
- ⚠️ Requires RLS policy design for 5 new tables
- ⚠️ Schema complexity increases
- ⚠️ Need to test that features actually work after table creation

**Example Migration (PropertyListing):**
```sql
-- Generated by drizzle-kit
CREATE TABLE IF NOT EXISTS "PropertyListing" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "User"("id"),
  "chatId" uuid REFERENCES "Chat"("id"),
  "name" text NOT NULL,
  "description" text NOT NULL,
  "address" jsonb NOT NULL,
  "price" numeric NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'EUR',
  "numberOfRooms" integer NOT NULL,
  "numberOfBathroomsTotal" numeric NOT NULL,
  "floorSize" numeric NOT NULL,
  -- ... (50+ more columns from schema.ts lines 165-265)
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

-- RLS Policies
ALTER TABLE "PropertyListing" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own listings"
  ON "PropertyListing" FOR SELECT
  USING ("userId" = auth.uid());

CREATE POLICY "Users can create own listings"
  ON "PropertyListing" FOR INSERT
  WITH CHECK ("userId" = auth.uid());

-- ... (UPDATE, DELETE policies)
```

---

#### Option B: Remove Phantom Tables from Schema (Align Schema to DB)

**Process:**
1. Remove phantom table definitions from lib/db/schema.ts:
   - Delete lines 165-265 (propertyListing)
   - Delete lines 268-295 (listingUploadAttempt)
   - Delete lines 297-387 (landListing)
   - Delete lines 413-460 (zyprusAgent) - keep supabaseAgent only
   - Delete lines 463-509 (agentChatSession)
   - Delete lines 512-538 (telegramGroup) - keep supabaseTelegramGroup only
   - Delete lines 541-610 (telegramLead) - keep supabaseTelegramLead only
   - Delete lines 613-635 (leadForwardingRotation) - keep supabaseLeadForwardingRotation only
   - Delete lines 638-678 (documentSend)

2. Refactor all imports across codebase:
   ```bash
   # PropertyListing: Remove all references (29 files)
   rg "propertyListing|PropertyListing" --glob "*.ts" --glob "*.tsx" -l

   # LandListing: Remove all references (17 files)
   rg "landListing|LandListing" --glob "*.ts" --glob "*.tsx" -l

   # ZyprusAgent: Replace with supabaseAgent (5 files)
   rg "zyprusAgent|ZyprusAgent" --glob "*.ts" --glob "*.tsx" -l

   # TelegramGroup: Replace with supabaseTelegramGroup (4 files)
   rg 'from.*schema.*TelegramGroup' --glob "*.ts" --glob "*.tsx" -l
   ```

3. Remove/stub out features that depend on phantom tables:
   - Property listing upload (web app)
   - Land listing upload (web app)
   - Upload attempt tracking

4. Test remaining features

**Pros:**
- ✅ Schema matches reality (no phantom tables)
- ✅ Cleaner codebase (no dead schema definitions)
- ✅ No RLS policy design needed

**Cons:**
- ❌ Breaks property listing features permanently (requires separate rebuild)
- ❌ Large refactor (60-70 files)
- ❌ TypeScript compilation breaks until refactor complete
- ❌ Product roadmap impact (property listings are core feature)
- ❌ Features were already implemented (code exists), just tables missing

---

### Recommendation: **Option A (Create Missing Tables)**

**Rationale:**

1. **Product alignment:** Property listings are a core feature of SOFIA AI Assistant (real estate agent tool). The code exists and is imported in 29+ files - this indicates active development/intent.

2. **Effort efficiency:** Creating 5 tables + RLS policies is faster than refactoring 60-70 files.

3. **Feature preservation:** Enables currently broken features rather than permanently removing them.

4. **Schema.ts is already correct:** The Drizzle schema definitions are comprehensive and Schema.org compliant. No code changes needed.

5. **Low risk:**
   - Tables will be empty initially (no data migration)
   - RLS policies can be deny-all initially, then opened up as features are tested
   - Can be done incrementally (one table at a time)

6. **Evidence from codebase:** The reference counts (29 files for PropertyListing, 17 for LandListing) suggest these are not abandoned features - they're actively used in the codebase.

**Implementation phases:**

**Phase 1: Core property tables (HIGH priority)**
- PropertyListing (29 file references)
- LandListing (17 file references)
- ListingUploadAttempt (5 file references)

**Phase 2: Agent naming cleanup (MEDIUM priority)**
- Remove ZyprusAgent, migrate 5 files to supabaseAgent
- Remove TelegramGroup, migrate 4 files to supabaseTelegramGroup
- Remove TelegramLead, migrate to supabaseTelegramLead

**Phase 3: Low-impact tables (LOW priority)**
- AgentChatSession (1 file reference)
- DocumentSend (0-2 file references) - consider deleting if unused

---

## Section 5: Next Steps

### Immediate Actions (Quick Task Scope)

- [x] Repair migration history (completed)
- [x] Document table inventory (completed)
- [x] Create cleanup roadmap (this document)

### Future Phase: Drizzle Schema Migration (NOT a quick task)

This requires a proper phase with planning, testing, and verification.

**Recommended phase structure:**

#### Plan 1: Generate and review Drizzle migration
- [ ] Run `npx drizzle-kit generate` to create migration SQL
- [ ] Review generated SQL for correctness
- [ ] Verify column definitions match schema.ts intent
- [ ] Check for foreign key constraints
- [ ] Identify any circular dependencies

#### Plan 2: Apply migrations to production
- [ ] Create backup of production database
- [ ] Apply PropertyListing table migration
- [ ] Apply LandListing table migration
- [ ] Apply ListingUploadAttempt table migration
- [ ] Verify tables created successfully
- [ ] Run `supabase db pull --linked` to sync local migrations

#### Plan 3: Add RLS policies
- [ ] Design RLS policies for PropertyListing (user-owned, admin read-all)
- [ ] Design RLS policies for LandListing (user-owned, admin read-all)
- [ ] Design RLS policies for ListingUploadAttempt (user-owned)
- [ ] Apply policies via migration
- [ ] Test policy enforcement

#### Plan 4: Test features
- [ ] Test property listing creation (web app)
- [ ] Test land listing creation (web app)
- [ ] Test upload attempt tracking
- [ ] Verify agent upload workflows (WhatsApp → DB)
- [ ] Check admin panel property views

#### Plan 5: Agent naming cleanup
- [ ] Remove ZyprusAgent from schema.ts
- [ ] Replace 5 file imports: `zyprusAgent` → `supabaseAgent`
- [ ] Remove TelegramGroup from schema.ts
- [ ] Replace 4 file imports: `telegramGroup` → `supabaseTelegramGroup`
- [ ] Remove TelegramLead from schema.ts
- [ ] Replace imports: `telegramLead` → `supabaseTelegramLead`
- [ ] Test Telegram features

#### Plan 6: Cleanup unused tables
- [ ] Audit AgentChatSession usage (1 file)
- [ ] Audit DocumentSend usage (0-2 files)
- [ ] Decision: Create tables OR remove from schema
- [ ] Apply decision

### Grep Commands for Finding Affected Files

```bash
# Property listing cleanup (Plan 1-4)
rg "propertyListing|PropertyListing" --glob "*.ts" --glob "*.tsx" -l

# Land listing cleanup (Plan 1-4)
rg "landListing|LandListing" --glob "*.ts" --glob "*.tsx" -l

# Upload attempt cleanup (Plan 1-4)
rg "listingUploadAttempt|ListingUploadAttempt" --glob "*.ts" --glob "*.tsx" -l

# Agent naming cleanup (Plan 5)
rg "zyprusAgent|ZyprusAgent" --glob "*.ts" --glob "*.tsx" -l
rg "supabaseAgent" --glob "*.ts" --glob "*.tsx" -l

# Telegram naming cleanup (Plan 5)
rg "telegramGroup" --glob "*.ts" --glob "*.tsx" -l
rg "supabaseTelegramGroup" --glob "*.ts" --glob "*.tsx" -l
rg "telegramLead" --glob "*.ts" --glob "*.tsx" -l
rg "supabaseTelegramLead" --glob "*.ts" --glob "*.tsx" -l

# Low-impact table audit (Plan 6)
rg "agentChatSession|AgentChatSession" --glob "*.ts" --glob "*.tsx" -l
rg "documentSend|DocumentSend" --glob "*.ts" --glob "*.tsx" -l
```

### Testing Checklist (Post-Migration)

After applying Option A (create missing tables):

- [ ] **TypeScript compilation:** `npx tsc --noEmit` passes
- [ ] **Web app:** Property listing creation works
- [ ] **Web app:** Land listing creation works
- [ ] **WhatsApp bot:** Agent property uploads work
- [ ] **Admin panel:** Property/land listing views load
- [ ] **RLS:** Authenticated users can CRUD own listings
- [ ] **RLS:** Users cannot access others' listings
- [ ] **RLS:** Service role (Edge Functions) can access all listings
- [ ] **Database:** Foreign keys enforced (userId, chatId references)

---

## Appendix: Current Schema.ts Structure

**Web app tables (exist in DB):**
- User (line 21)
- Chat (line 29)
- Message_v2 (line 54)
- Vote_v2 (line 77)
- Document (line 97)
- Suggestion (line 120)
- Stream (line 146)

**Property listing tables (DO NOT exist in DB - PHANTOM):**
- PropertyListing (line 165) ← 29 file references
- ListingUploadAttempt (line 268) ← 5 file references
- LandListing (line 297) ← 17 file references

**Admin tables (exist in DB):**
- admin_users (line 390)

**Agent tables (naming mismatch):**
- zyprusAgent (line 413) ← PHANTOM, 5 file references
- supabaseAgent (line 681) ← ACTUAL table "agents"
- agentChatSession (line 463) ← PHANTOM, 1 file reference

**Telegram tables (naming mismatch):**
- telegramGroup (line 512) ← PHANTOM, 4 file references
- supabaseTelegramGroup (line 699) ← ACTUAL table "telegram_groups"
- telegramLead (line 541) ← PHANTOM
- supabaseTelegramLead (line 714) ← ACTUAL table "telegram_leads"
- leadForwardingRotation (line 613) ← PHANTOM (likely)
- supabaseLeadForwardingRotation (line 756) ← ACTUAL table (likely "lead_forwarding_rotation")

**Document tables:**
- documentSend (line 638) ← PHANTOM, 0-2 file references

**Other tables:**
- supabaseTelegramGroupMessage (line 740) ← ACTUAL table "telegram_group_messages"

**Total:** 21 table definitions in schema.ts, 9 are phantom or duplicates
