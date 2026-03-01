---
phase: quick-19
plan: 01
type: execute
subsystem: database-schema
tags: [database, schema-migration, agent-identification, performance-optimization]
dependency_graph:
  requires: [quick-18-schema-cleanup]
  provides: [whatsapp-agent-identification, agent-web-auth, activity-tracking]
  affects: [agents-table, identifier-ts, user-mapping-ts, database-indexes]
tech_stack:
  added: []
  patterns: [partial-indexes, foreign-key-constraints, database-maintenance]
key_files:
  created:
    - supabase/migrations/20260301140000_add_agent_fields.sql
    - supabase/migrations/20260301140100_optimize_indexes.sql
  modified:
    - lib/db/schema.ts
decisions: []
metrics:
  duration: 236s (3.9 minutes)
  completed_date: 2026-03-01
  tasks_completed: 3/3
  commits: 2
---

# Quick Task 19: Add Missing Agents Table Fields and Database Maintenance

**One-liner:** Added 3 fields to agents table (whatsapp_phone_number, user_id, last_active_at) with partial indexes, dropped duplicate constraint, and updated query planner statistics

## What Was Done

### Task 1: Add 3 missing fields to agents table (Commit: 899cfa9)

**Migration created: `20260301140000_add_agent_fields.sql` (23 lines)**

Added 3 fields to production agents table:

1. **whatsapp_phone_number** VARCHAR(20)
   - Purpose: Enable WhatsApp agent identification (currently disabled in identifier.ts)
   - Index: `idx_agents_whatsapp_phone` (partial WHERE NOT NULL)
   - Format: E.164 international phone number format

2. **user_id** UUID
   - Purpose: Link agents to Supabase auth.users for web login
   - Foreign key: REFERENCES auth.users(id) ON DELETE SET NULL
   - Index: `idx_agents_user_id` (partial WHERE NOT NULL)
   - Use case: Future agent registration feature

3. **last_active_at** TIMESTAMP WITH TIME ZONE
   - Purpose: Track agent activity for metrics/analytics
   - Index: `idx_agents_last_active` (partial WHERE NOT NULL)
   - Use case: Agent engagement tracking, stale account detection

**Updated Drizzle schema:**
- Updated `supabaseAgent` definition in lib/db/schema.ts
- Added 3 new fields: whatsappPhoneNumber, userId, lastActiveAt
- All fields nullable (backward compatible with existing data)

**Verification:**
- `supabase db push --dry-run` shows "Remote database is up to date" ✓
- TypeScript compilation passes (exit code 0) ✓

### Task 2: Database maintenance (Commit: bdd2e9e)

**Migration created: `20260301140100_optimize_indexes.sql` (14 lines)**

**Constraint cleanup:**
- Dropped `processed_webhooks_message_key_key` constraint
- This was a duplicate unique constraint (table already has primary key)
- Reclaimed 264 kB of wasted index space (per quick-9 database advisor report)

**Query planner updates:**
- Ran `ANALYZE` on 4 key tables: agents, upload_locks, webhook_debug_logs, chat_history
- Updated statistics for query optimizer to improve query plans

**Note on VACUUM operations:**
- VACUUM FULL and REINDEX cannot run inside migration transactions
- Must be executed manually during low-traffic periods
- Deferred operations documented in "Next Steps" section below

**Also applied (bundled with push):**
- Migration `20260301160000_fix_rls_initplan_remaining.sql` (from quick-17)
- Fixed auth.uid() re-evaluation in RLS policies on PropertyListing, LandListing, ListingUploadAttempt, DocumentSend tables

### Task 3: Verify TypeScript compilation

**Results:**
- `npx tsc --noEmit` exit code: 0 ✓
- No type errors introduced by schema changes ✓
- All 3 new fields are nullable, ensuring backward compatibility ✓

**SupabaseAgent type usage verified:**
- Found usage in 3 files: lib/agents/identifier.ts, lib/whatsapp/user-mapping.ts, lib/telegram/lead-router.ts
- **Critical finding:** lib/whatsapp/user-mapping.ts already has WhatsApp agent identification code written (lines 22-55) - it's just commented out waiting for whatsappPhoneNumber field
- identifier.ts has disabled code for identifyAgentByWhatsApp() and isZyprusAgent() (lines 75-88, 124-135)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Migration pushed unexpected 20260301160000 file**
- **Found during:** Task 2 migration push
- **Issue:** Supabase CLI pushed both 20260301140100 and 20260301160000 migrations together
- **Fix:** Verified 20260301160000 was a legitimate migration from quick-17 (RLS policy fixes), committed both
- **Files modified:** supabase/migrations/20260301160000_fix_rls_initplan_remaining.sql
- **Commit:** bdd2e9e (bundled with Task 2)

**2. [Rule 3 - Blocking Issue] VACUUM operations cannot run in migration transactions**
- **Found during:** Task 2 migration push
- **Issue:** `VACUUM FULL` failed with error "VACUUM cannot be executed within a pipeline (SQLSTATE 25001)"
- **Fix:** Removed VACUUM operations from migration file, documented as manual operations in "Next Steps"
- **Files modified:** supabase/migrations/20260301140100_optimize_indexes.sql
- **Commit:** bdd2e9e

**3. [Rule 3 - Blocking Issue] Index drop failed - actually a constraint**
- **Found during:** Task 2 migration push
- **Issue:** `DROP INDEX processed_webhooks_message_key_key` failed - it's backed by a constraint
- **Fix:** Changed to `ALTER TABLE processed_webhooks DROP CONSTRAINT processed_webhooks_message_key_key`
- **Files modified:** supabase/migrations/20260301140100_optimize_indexes.sql
- **Commit:** bdd2e9e

**4. [Rule 3 - Blocking Issue] Removed invalid index creation (unknown table schemas)**
- **Found during:** Task 2 migration attempt
- **Issue:** Plan called for composite indexes on upload_locks(agent_id, property_fingerprint) but actual columns are (fingerprint, agent_phone)
- **Fix:** Removed speculative index creation on tables where schema wasn't verified, kept only safe operations (DROP CONSTRAINT, ANALYZE)
- **Files modified:** supabase/migrations/20260301140100_optimize_indexes.sql
- **Commit:** bdd2e9e
- **Reason:** Deviation Rule 3 (blocking issue) - better to defer index optimization than apply wrong indexes

## Verification

**All success criteria met:**

- [x] agents table has 3 new fields in production (whatsapp_phone_number, user_id, last_active_at)
- [x] Drizzle schema.ts supabaseAgent definition includes 3 new fields
- [x] 3 partial indexes created on agents table for new fields
- [x] Duplicate constraint processed_webhooks_message_key_key dropped
- [x] ANALYZE updated query planner statistics
- [x] TypeScript compilation passes (exit code 0)
- [x] No breaking changes to existing code

**Partial completion (deferred to manual operations):**
- [ ] VACUUM FULL on high-bloat tables (requires manual execution outside transaction)
- [ ] REINDEX on sophia_memory_embedding_idx (requires manual execution outside transaction)
- [ ] Composite indexes on upload_locks/sophia_user_profiles (deferred due to unknown schemas)

## Production Impact

**Before:**
- WhatsApp agent identification disabled (agents table missing whatsappPhoneNumber field)
- Agent web authentication impossible (no link between agents and auth.users)
- No agent activity tracking capability
- 264 kB wasted on duplicate constraint index
- Stale query planner statistics

**After:**
- agents table ready for WhatsApp identification (field exists, indexed)
- agents table ready for web authentication (user_id foreign key, indexed)
- agents table ready for activity tracking (last_active_at field, indexed)
- 264 kB index space reclaimed (processed_webhooks_message_key_key dropped)
- Fresh query planner statistics (4 tables analyzed)

**Unblocked features:**
- WhatsApp agent identification (lib/whatsapp/user-mapping.ts lines 22-55) - ready to uncomment
- Web agent authentication via user_id lookup (lib/agents/identifier.ts lines 124-135) - ready to uncomment
- Agent activity tracking/analytics (update agent.last_active_at on each interaction)

## Next Steps

**Recommended follow-ups (not in this plan):**

### 1. Enable WhatsApp Agent Identification
**File:** lib/whatsapp/user-mapping.ts
**Action:** Uncomment lines 22-55 in getOrCreateWhatsAppUser() function
**Impact:** Registered agents will be identified by their WhatsApp phone number instead of treated as guests
**Prerequisites:** Populate agents.whatsapp_phone_number for active agents

### 2. Enable Agent Web Authentication
**File:** lib/agents/identifier.ts
**Action:** Replace placeholder code in isZyprusAgent() (lines 124-135) with actual user_id lookup
**Impact:** Web app can identify logged-in users as Zyprus agents
**Prerequisites:** Link agent records to Supabase auth users (populate agents.user_id)

### 3. Implement Activity Tracking
**Files:** lib/whatsapp/user-mapping.ts (line 158), lib/agents/identifier.ts
**Action:** Implement updateAgentLastActive() to update agents.last_active_at on each interaction
**Impact:** Enable agent engagement metrics, stale account detection
**Query:** `UPDATE agents SET last_active_at = NOW() WHERE id = $1`

### 4. Database Maintenance (Manual - Low Traffic Period)
Run these operations manually via Supabase dashboard SQL editor during low-traffic hours:

```sql
-- VACUUM FULL to reclaim space (requires exclusive lock)
VACUUM FULL webhook_debug_logs;  -- 352 kB bloat (2.0x)

-- VACUUM ANALYZE (lighter, can run anytime)
VACUUM ANALYZE chat_history;

-- REINDEX to rebuild bloated index
REINDEX INDEX sophia_memory_embedding_idx;  -- 384 kB bloat (2.0x)
```

**Expected reclaimed space:** ~736 kB (352 + 384)
**Downtime:** VACUUM FULL requires exclusive table lock (1-5 seconds for small tables)

### 5. Index Optimization (Requires Schema Investigation)
**Tables:** upload_locks (17,557 seq scans), sophia_user_profiles (11,960 seq scans)
**Action:**
1. Investigate actual table schemas (not in Drizzle schema)
2. Analyze query patterns (what columns are filtered)
3. Create composite indexes based on actual usage
**Priority:** Medium (high seq scan count but small tables)

### 6. Populate Agent Data
**Action:** Add WhatsApp phone numbers to existing agent records
**Query example:**
```sql
UPDATE agents SET whatsapp_phone_number = '+35799123456' WHERE full_name = 'Agent Name';
```
**Priority:** High - required before enabling WhatsApp agent identification

## Self-Check: PASSED

**Created files:**
- [x] supabase/migrations/20260301140000_add_agent_fields.sql - exists (23 lines)
- [x] supabase/migrations/20260301140100_optimize_indexes.sql - exists (14 lines)

**Modified files:**
- [x] lib/db/schema.ts - exists (supabaseAgent definition updated)

**Commits verified:**
- [x] 899cfa9 - feat(quick-19): add 3 fields to agents table
- [x] bdd2e9e - chore(quick-19): database maintenance - drop duplicate constraint and update statistics

**Database verification:**
- [x] Migration 20260301140000 applied (agents table altered)
- [x] Migration 20260301140100 applied (constraint dropped, ANALYZE run)
- [x] Migration 20260301160000 applied (RLS policies fixed - bundled)
- [x] `supabase db push --dry-run` shows "Remote database is up to date"

All files exist, all commits present in git history, all migrations applied to production.
