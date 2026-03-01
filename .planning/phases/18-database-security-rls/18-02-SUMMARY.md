---
phase: 18-database-security-rls
plan: 02
subsystem: database-security
tags: [rls, security, access-control, agents]
dependency_graph:
  requires: []
  provides: [agent-table-rls]
  affects: [web-app, admin-panel]
tech_stack:
  added: []
  patterns: [row-level-security, agent-scoped-access, reviewer-assignment]
key_files:
  created:
    - supabase/migrations/20260301_rls_agent_tables.sql
  modified: []
decisions:
  - decision: "Protect 5 agent tables with RLS (not 6 - WhatsAppConversation doesn't exist)"
    rationale: "Schema analysis revealed WhatsAppConversation table not present. Actual agent tables: ZyprusAgent, AgentChatSession, PropertyListing, LandListing, ListingUploadAttempt"
    alternatives: []
    impact: "No impact - plan adapted to actual schema"
  - decision: "ZyprusAgent has only SELECT/UPDATE policies (no INSERT/DELETE)"
    rationale: "Agent creation/deletion reserved for admin operations. Agents can only view and update their own profile."
    alternatives: []
    impact: "Agent registration must use service_role key or admin role (Phase 19)"
  - decision: "PropertyListing uses complex multi-path access (submitter + reviewers + owner)"
    rationale: "Agents need access to listings they submitted, are reviewing, or own via web app"
    alternatives: []
    impact: "Three separate access paths ensure reviewers can access assigned listings"
  - decision: "LandListing uses simple userId-only access"
    rationale: "LandListing table has no agent-specific columns (submittedByAgentId, reviewers)"
    alternatives: []
    impact: "Simpler policies for land listings - only owner can access"
metrics:
  duration: "1m 33s"
  tasks_completed: 1
  completed_date: "2026-02-28"
---

# Phase 18 Plan 02: Agent Table RLS Policies Summary

**One-liner:** Row Level Security enabled on 5 agent tables with agent-scoped access and reviewer assignment policies

## What Was Built

Created RLS policies for 5 agent-related tables to protect agent data from cross-agent access when accessed via web app (admin panel or future agent portal). Edge Functions continue to bypass all policies using service_role key.

### Tables Protected

1. **ZyprusAgent** - Agents can SELECT/UPDATE own record via userId (no INSERT/DELETE)
2. **AgentChatSession** - Agents access own sessions via agentId → ZyprusAgent.userId join
3. **PropertyListing** - Complex access: submittedByAgentId, firstReviewerId, secondReviewerId, userId
4. **LandListing** - Simple userId-based access (no agent columns)
5. **ListingUploadAttempt** - Access via PropertyListing ownership chain

### Policy Patterns

**ZyprusAgent (2 policies):**
- SELECT: `userId = auth.uid()`
- UPDATE: `userId = auth.uid()`

**AgentChatSession (4 policies):**
- All operations (SELECT/INSERT/UPDATE/DELETE) via:
  ```sql
  agentId IN (SELECT id FROM "ZyprusAgent" WHERE userId = auth.uid())
  ```

**PropertyListing (4 policies):**
- SELECT/UPDATE: Four access paths
  - Direct owner: `userId = auth.uid()`
  - Submitter: `submittedByAgentId IN (SELECT id FROM "ZyprusAgent" WHERE userId = auth.uid())`
  - First reviewer: `firstReviewerId IN (...)`
  - Second reviewer: `secondReviewerId IN (...)`
- INSERT: `userId = auth.uid()`
- DELETE: `userId = auth.uid()` only

**LandListing (4 policies):**
- All operations (SELECT/INSERT/UPDATE/DELETE): `userId = auth.uid()`

**ListingUploadAttempt (4 policies):**
- All operations via PropertyListing ownership:
  ```sql
  listingId IN (
    SELECT id FROM "PropertyListing"
    WHERE userId = auth.uid()
      OR submittedByAgentId IN (...)
      OR firstReviewerId IN (...)
      OR secondReviewerId IN (...)
  )
  ```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adjusted table count from 6 to 5**
- **Found during:** Plan review
- **Issue:** Plan referenced WhatsAppConversation table (from migration 0013) which doesn't exist in actual schema
- **Fix:** Analyzed lib/db/schema.ts, confirmed actual agent tables are: ZyprusAgent, AgentChatSession, PropertyListing, LandListing, ListingUploadAttempt
- **Files modified:** supabase/migrations/20260301_rls_agent_tables.sql
- **Commit:** 79f654b

## Verification Results

- [x] All 5 tables have RLS enabled
- [x] ZyprusAgent has SELECT/UPDATE only (no INSERT/DELETE)
- [x] AgentChatSession joins through ZyprusAgent.userId
- [x] PropertyListing includes reviewer access (firstReviewerId, secondReviewerId)
- [x] LandListing uses userId = auth.uid() directly
- [x] ListingUploadAttempt joins through PropertyListing ownership
- [x] Edge Functions bypass all policies (service_role key usage)

## Success Criteria

1. [x] All 5 agent tables have RLS enabled
2. [x] Agents can only access their own data
3. [x] Reviewers can access assigned listings
4. [x] Edge Functions bypass all policies

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create RLS policies for agent tables | 79f654b | supabase/migrations/20260301_rls_agent_tables.sql |

## Next Phase Readiness

**Blockers:** None

**Prerequisites for Phase 19 (Authentication Hardening):**
- [x] Agent table RLS policies in place
- [ ] Admin role definition (Phase 19)
- [ ] Service account policies (Phase 19)

**Technical Debt:** None

## Self-Check

Verifying claims from this summary:

```bash
# Check migration file exists
[ -f "supabase/migrations/20260301_rls_agent_tables.sql" ] && echo "FOUND: migration file" || echo "MISSING: migration file"

# Check commit exists
git log --oneline --all | grep -q "79f654b" && echo "FOUND: commit 79f654b" || echo "MISSING: commit 79f654b"

# Check RLS enable count (should be 5)
grep -c "ENABLE ROW LEVEL SECURITY" supabase/migrations/20260301_rls_agent_tables.sql

# Check policy count (should be 18)
grep -c "CREATE POLICY" supabase/migrations/20260301_rls_agent_tables.sql
```

**Result:**
FOUND: migration file
FOUND: commit 79f654b
5 tables with RLS enabled
18 policies created

## Self-Check: PASSED
