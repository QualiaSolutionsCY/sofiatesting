---
phase: 10-call-tracking-infrastructure
plan: 01
subsystem: database
tags: [postgresql, supabase, typescript, deno, call-tracking, 3cx-audit]

# Dependency graph
requires:
  - phase: foundation
    provides: Supabase PostgreSQL database and TypeScript patterns
provides:
  - Three PostgreSQL tables for call tracking (call_audit_runs, call_records, caller_alerts)
  - TypeScript service module with 11 CRUD operations and 8 types
  - Atomic duplicate-prevention using unique constraints
  - Audit run claiming mechanism prevents concurrent execution
affects: [11-3cx-integration, 12-telegram-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Atomic claiming via INSERT with 23505 duplicate handling
    - Timestamp logic based on alert status transitions
    - Bulk insert for call records with retry

key-files:
  created:
    - supabase/migrations/20260226_call_tracking.sql
    - supabase/functions/_shared/call-tracking.ts
  modified: []

key-decisions:
  - "Use unique constraint on audit_date to prevent duplicate daily runs"
  - "Use unique constraint on (caller_phone, audit_run_id) to prevent duplicate alerts"
  - "Store all timestamps as ISO strings for consistency with existing codebase"
  - "Default target_number to 22032770 (main Zyprus line)"
  - "Return null from claim functions on 23505 (duplicate), not error"

patterns-established:
  - "Atomic claiming pattern: INSERT + SELECT single, handle 23505 → return null"
  - "Status-based timestamp logic: alerted_at set when status=alerted, resolved_at when status=resolved/ignored"
  - "Audit run lifecycle: running → completed/failed with total counts"

# Metrics
duration: 5min
completed: 2026-02-26
---

# Phase 10 Plan 01: Call Tracking Infrastructure Summary

**PostgreSQL tables and TypeScript service layer for 3CX Call Log Audit with atomic duplicate prevention**

## Performance

- **Duration:** 5m 13s
- **Started:** 2026-02-26T01:51:18Z
- **Completed:** 2026-02-26T01:56:31Z
- **Tasks:** 2
- **Files modified:** 2 created

## Accomplishments

- Three PostgreSQL tables with indexes, unique constraints, and RLS policies
- TypeScript service module with 11 functions following db.ts patterns
- Atomic duplicate prevention using unique constraints (prevents race conditions)
- Migration file ready to apply via Supabase Dashboard

## Task Commits

Each task was committed atomically:

1. **Task 1: Create call tracking database migration** - `fbc7596` (feat)
2. **Task 2: Create call tracking TypeScript service module** - `54f485a` (feat)

## Files Created/Modified

- `supabase/migrations/20260226_call_tracking.sql` - Three tables for call tracking with indexes and RLS
- `supabase/functions/_shared/call-tracking.ts` - 11 CRUD operations, 8 types, atomic claiming pattern

## Decisions Made

**1. Atomic claiming via unique constraints**
- Use INSERT with unique constraint + 23505 error handling instead of SELECT + INSERT
- Prevents race conditions when multiple processes try to claim same audit date
- Pattern: `claimAuditRun()` and `createCallerAlert()` return null on duplicate (23505), not error

**2. Timestamp logic based on status transitions**
- `alerted_at` set when status changes to "alerted"
- `follow_up_at` set when status changes to "follow_up_sent"
- `resolved_at` set when status changes to "resolved" or "ignored"
- Allows querying "alerted > 24h ago with no follow-up" efficiently

**3. Default target number**
- Default target_number to "22032770" (main Zyprus reception line)
- Allows future support for multiple tracked numbers

**4. Bulk insert with retry for call records**
- Use `withRetry` for bulk inserts (saveCallRecords) to handle transient failures
- Use simple await for single-record operations (create/update alerts)

## Deviations from Plan

**User Setup Required: Migration Application**

The migration SQL file has been created but requires manual application via the Supabase Dashboard SQL Editor:

1. Open: https://supabase.com/dashboard/project/vceeheaxcrhmpqueudqx/sql/new
2. Copy contents of: `supabase/migrations/20260226_call_tracking.sql`
3. Paste and click "Run"

**Reason:** Supabase CLI `db push` requires local migrations to be in sync with remote (50+ historical migrations would need repair). Dashboard SQL Editor is the recommended approach for one-off migrations.

**Verification after applying:**
```sql
-- Verify tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('call_audit_runs', 'call_records', 'caller_alerts');

-- Verify unique constraints
SELECT conname FROM pg_constraint
WHERE conrelid IN (
  'call_audit_runs'::regclass,
  'caller_alerts'::regclass
);
```

---

**Total deviations:** 0 auto-fixed
**Impact on plan:** Migration application deferred to user (standard Supabase practice). TypeScript module complete and ready to use once tables are created.

## Issues Encountered

**Migration Application Tooling**
- **Issue:** `supabase db push` requires local/remote migration history sync
- **Solution:** Created migration file, documented manual application steps
- **Outcome:** Standard Supabase practice, no impact on downstream phases

## User Setup Required

**Manual Migration Application Required**

See "Deviations from Plan" section above for steps to apply the migration via Supabase Dashboard SQL Editor.

**Estimated time:** 2 minutes

## Next Phase Readiness

**Ready for Phase 11 (3CX Integration):**
- Database schema defined and ready
- TypeScript service module complete with all CRUD operations
- Atomic claiming prevents duplicate audit runs
- Alert state machine ready for Telegram integration

**Blockers before Phase 11:**
1. Migration must be applied manually (2-minute task)
2. Need 3CX web interface credentials from Fawzi
3. Need list of internal extensions to filter

**Blockers before Phase 12 (Telegram Integration):**
1. Need Telegram group chat IDs (4 regional groups + "Zypress Others")
2. Need Vasya's Telegram user ID for response tracking

## Self-Check: PASSED

**Files verified:**
- ✓ supabase/migrations/20260226_call_tracking.sql exists
- ✓ supabase/functions/_shared/call-tracking.ts exists

**Commits verified:**
- ✓ fbc7596 (Task 1: database migration)
- ✓ 54f485a (Task 2: TypeScript service module)

**Content verified:**
- ✓ Migration contains all three tables (call_audit_runs, call_records, caller_alerts)
- ✓ TypeScript exports claimAuditRun and other expected functions
- ✓ TypeScript handles 23505 error code for duplicate prevention

---
*Phase: 10-call-tracking-infrastructure*
*Completed: 2026-02-26*
