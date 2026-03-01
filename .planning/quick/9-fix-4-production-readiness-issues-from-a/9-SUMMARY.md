---
phase: quick-9
plan: 01
type: execute
subsystem: infrastructure
tags: [production-readiness, error-handling, security, database-health]
dependency_graph:
  requires: [audit-findings]
  provides: [error-resilience, timeout-protection, server-only-enforcement]
  affects: [sophia-bot, zyprus-client, admin-pages]
tech_stack:
  added: []
  patterns: [defensive-error-handling, timeout-protection, server-only-imports]
key_files:
  created: []
  modified:
    - supabase/functions/sophia-bot/handlers/webhook.ts
    - supabase/functions/sophia-bot/services/ai-chat.ts
    - lib/zyprus/client.ts
    - app/(admin)/admin/activity/page.tsx
    - app/(admin)/admin/page.tsx
    - app/(admin)/admin/agents-registry/regional-offices/page.tsx
    - app/(admin)/admin/agents-registry/page.tsx
    - app/(admin)/admin/agents-registry/[id]/page.tsx
    - app/(admin)/admin/prompts/page.tsx
    - app/(admin)/admin/prompts/[key]/page.tsx
    - app/(admin)/admin/prompts/[key]/history/page.tsx
decisions: []
metrics:
  duration: 198s (3.3 minutes)
  completed_date: 2026-03-01
  tasks_completed: 3/3
  commits: 2
---

# Quick Task 9: Fix Production Readiness Issues

**One-liner:** Added error handling to critical operations, 30s timeouts to image fetches, and explicit server-only imports to 8 admin pages

## What Was Done

### Task 1: Error Handling & Timeouts (Commit: a5746dd)

**Fixed 3 critical error handling gaps:**

1. **webhook.ts line 176** - Added `.catch(() => [])` handler to `getHistory()` call
   - Previously: Could crash Promise.all if history fetch failed
   - Now: Returns empty array on failure, continues gracefully

2. **ai-chat.ts lines 486 & 616** - Wrapped both `executeTool()` calls in try-catch blocks
   - Previously: Unhandled promise rejection would crash the webhook handler
   - Now: Logs error, returns error message to AI so it can inform user
   - Pattern: `{ success: false, message: "Error executing tool: ..." }`

3. **zyprus/client.ts lines 393 & 922** - Added 30-second timeout to image fetch calls
   - Previously: Could hang indefinitely on slow/stalled connections
   - Now: Aborts after 30s using `AbortSignal.timeout(30000)`
   - Applies to both property image uploads and land image uploads

### Task 2: Server-Only Enforcement (Commit: 42796db)

**Added `import "server-only";` to 8 admin page components:**
- app/(admin)/admin/activity/page.tsx
- app/(admin)/admin/page.tsx
- app/(admin)/admin/agents-registry/regional-offices/page.tsx
- app/(admin)/admin/agents-registry/page.tsx
- app/(admin)/admin/agents-registry/[id]/page.tsx
- app/(admin)/admin/prompts/page.tsx
- app/(admin)/admin/prompts/[key]/page.tsx
- app/(admin)/admin/prompts/[key]/history/page.tsx

**Impact:**
- Defense in depth: Even though `lib/supabase/admin.ts` already has server-only protection, explicit imports at usage site make constraint visible
- Build-time failure if component accidentally imported into client bundle
- Prevents service_role_key exposure

### Task 3: Database Health Check

**Ran Supabase database advisors on production (vceeheaxcrhmpqueudqx):**

**Findings:**

1. **Bloat Analysis:**
   - Highest bloat: `sophia_memory_embedding_idx` (384 kB waste, 2.0x bloat)
   - `webhook_debug_logs` table: 352 kB waste (2.0x bloat)
   - Several chat_history indexes: 10-13x bloat (544 kB total waste)
   - **Action needed:** VACUUM operations or REINDEX to reclaim space

2. **Unused Indexes:**
   - `sophia_memory_embedding_idx` (776 kB) - 0 scans, 0% used
   - `processed_webhooks_message_key_key` (264 kB) - duplicate index, unused
   - `whatsapp_analytics_pkey` (168 kB) - unused primary key (potential issue)
   - `sophia_conversation_memory_pkey` (56 kB) - unused
   - `lead_forwarding_rotation_pkey` (16 kB) - unused
   - `listing_uploads_pkey` (16 kB) - unused
   - **Total wasted space:** ~1.3 MB
   - **Action needed:** Investigate why PKs are unused, consider dropping duplicate indexes

3. **Performance Observations:**
   - No long-running queries (good)
   - No blocking queries (good)
   - High seq scan count on `sophia_prompts` (5001) but table is small (288 kB)
   - High seq scan count on `sophia_user_profiles` (11960) and `upload_locks` (17557) - may need index optimization

4. **Table Stats:**
   - Largest table: `webhook_debug_logs` (3.2 MB total)
   - Most indexes: `chat_history` (1.2 MB indexes vs 136 kB data - consider cleanup)
   - Empty tables taking space: Multiple tables with 0 rows but allocated pages

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- [x] Both executeTool() calls have try-catch error handling
- [x] Both image fetch calls have 30-second timeout protection
- [x] All 8 admin components have explicit server-only imports
- [x] TypeScript compilation passes with no errors
- [x] Database advisors checked via Supabase CLI

## Production Impact

**Before:**
- Tool execution failures could crash webhook handler
- Image downloads could hang indefinitely
- Admin pages relied solely on lib/supabase/admin.ts for server-only protection
- Unknown database health status

**After:**
- Tool failures logged and gracefully returned to AI
- Image downloads timeout after 30s (prevents indefinite hangs)
- Admin pages have explicit build-time protection against client bundling
- Database health documented with actionable findings

**Risk reduction:**
- Eliminated 3 potential silent failure points
- Added timeout protection to prevent resource exhaustion
- Hardened admin panel security posture
- Identified 1.3 MB of wasted index space for future cleanup

## Next Steps

**Recommended follow-ups (not in this plan):**

1. **Database maintenance:**
   - Investigate unused primary keys (whatsapp_analytics, listing_uploads, etc.)
   - Drop duplicate index: `processed_webhooks_message_key_key`
   - Run VACUUM FULL on `webhook_debug_logs` and `chat_history` indexes
   - Consider REINDEX on high-bloat indexes (13x bloat ratio)

2. **Index optimization:**
   - Analyze high seq scan tables: `upload_locks` (17k scans), `sophia_user_profiles` (12k scans)
   - Consider composite indexes if queries frequently filter on multiple columns

3. **Monitoring:**
   - Add alerting for long-running queries (5min threshold)
   - Monitor bloat ratio weekly
   - Track unused index list for drift

## Self-Check: PASSED

**Created files:** (none - only modifications)

**Modified files verified:**
- [x] supabase/functions/sophia-bot/handlers/webhook.ts - exists
- [x] supabase/functions/sophia-bot/services/ai-chat.ts - exists
- [x] lib/zyprus/client.ts - exists
- [x] app/(admin)/admin/activity/page.tsx - exists
- [x] app/(admin)/admin/page.tsx - exists
- [x] app/(admin)/admin/agents-registry/regional-offices/page.tsx - exists
- [x] app/(admin)/admin/agents-registry/page.tsx - exists
- [x] app/(admin)/admin/agents-registry/[id]/page.tsx - exists
- [x] app/(admin)/admin/prompts/page.tsx - exists
- [x] app/(admin)/admin/prompts/[key]/page.tsx - exists
- [x] app/(admin)/admin/prompts/[key]/history/page.tsx - exists

**Commits verified:**
- [x] a5746dd - fix(quick-9): add error handling and timeouts to critical operations
- [x] 42796db - feat(quick-9): add explicit server-only imports to admin pages

All files exist, all commits present in git history.
