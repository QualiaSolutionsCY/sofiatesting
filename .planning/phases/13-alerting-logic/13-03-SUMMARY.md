---
phase: 13
plan: 03
subsystem: call-audit-alerting
tags: [call-tracking, data-flow, gap-closure]
dependency_graph:
  requires: [13-01-pipeline-orchestration, 13-02-follow-up-reminders]
  provides: [call-time-extraction, call-time-storage, call-time-display]
  affects: [audit-pipeline, telegram-alerts, follow-up-system]
tech_stack:
  added: []
  patterns: [data-flow-completion, ISO-timestamp-formatting]
key_files:
  created:
    - supabase/migrations/20260226_add_call_time_to_caller_alerts.sql
  modified:
    - supabase/functions/call-audit/3cx/types.ts
    - supabase/functions/call-audit/3cx/call-log-extractor.ts
    - supabase/functions/_shared/call-tracking.ts
    - supabase/functions/call-audit/audit-pipeline.ts
    - supabase/functions/call-audit/follow-up.ts
key_decisions:
  - decision: Store call_time as nullable TIMESTAMPTZ in caller_alerts
    rationale: Allows NULL for historical alerts, supports timezone-aware queries
  - decision: Keep earliest call time per phone number when multiple calls exist
    rationale: Most relevant timestamp for alert context (first missed call)
  - decision: Format call times as HH:MM in Cyprus timezone for display
    rationale: Matches business hours context, easier to read than full ISO timestamp
  - decision: Fallback to current timestamp if call time unavailable
    rationale: Better than "Unknown" - provides approximate time context
  - decision: Duplicate formatCallTimeDisplay helper in both modules
    rationale: Keeps modules independent, helper is small (9 lines)
metrics:
  duration: 173s (~3min)
  completed: 2026-02-26T16:55:45Z
---

# Phase 13 Plan 03: Call Time Extraction and Propagation Summary

Call times now flow from 3CX entries through the entire audit pipeline to alerts and follow-up reminders, replacing all "Unknown"/"N/A" placeholders with actual timestamps.

## Performance

**Execution:** 2 tasks, 2 commits, ~3 minutes
**Gap Closure:** Fixed Gaps 1-2 from 13-VERIFICATION.md (call time extraction and follow-up display)

## What We Accomplished

### Data Flow Architecture

```
3CX Call Log Entries (callTime field)
  ↓
filterExternalCallers() builds callTimeMap (phone → ISO timestamp)
  ↓
CallAuditResult.callTimeMap
  ↓ (branches)
  ├─→ call_records.call_time (database storage)
  ├─→ MissingCallerInfo.callTime (formatted HH:MM display for initial alerts)
  └─→ caller_alerts.call_time (database storage for follow-ups)
      ↓
  Follow-up reminders read from caller_alerts.call_time
      ↓
  formatCallTimeDisplay() → "HH:MM" in Cyprus timezone
```

### Task Breakdown

**Task 1: Add call_time column and update extractor** (Commit `25faee0`)
- Created migration to add `call_time TIMESTAMPTZ` column to `caller_alerts` table
- Updated `CallAuditResult` type to include `callTimeMap: Record<string, string>`
- Modified `filterExternalCallers()` to build and return `callTimeMap` alongside phone list
- Extended `CallerAlert` type and `CreateCallerAlertParams` with `call_time` field
- Updated `createCallerAlert()` to accept and store `call_time` in database

**Task 2: Wire call times through pipeline and follow-ups** (Commit `631e9e3`)
- Extracted `callTimeMap` from audit result in pipeline orchestrator
- Replaced hardcoded `call_time: new Date().toISOString()` in `call_records` with actual times from map
- Added `formatCallTimeDisplay()` helper to format ISO timestamps as "HH:MM" in Cyprus timezone
- Replaced all 4 instances of `callTime: "Unknown"` in audit-pipeline with formatted actual times
- Updated `createCallerAlert()` call to pass `call_time` from `callTimeMap`
- Modified follow-up reminders to read `call_time` from alert record and format for display
- Removed all TODO comments about call time extraction (feature complete)

## Files Created/Modified

**Created:**
- `supabase/migrations/20260226_add_call_time_to_caller_alerts.sql` - Database schema update

**Modified:**
- `supabase/functions/call-audit/3cx/types.ts` - Added `callTimeMap` to `CallAuditResult`
- `supabase/functions/call-audit/3cx/call-log-extractor.ts` - Build and return `callTimeMap`
- `supabase/functions/_shared/call-tracking.ts` - Added `call_time` to types and database operations
- `supabase/functions/call-audit/audit-pipeline.ts` - Wire `callTimeMap` through pipeline, format for display, pass to alerts
- `supabase/functions/call-audit/follow-up.ts` - Read `call_time` from alerts, format for reminders

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Store call_time as nullable TIMESTAMPTZ | Historical alerts can remain NULL; new alerts get timestamps | DB schema flexibility |
| Keep earliest call time per phone | First missed call is most relevant context | Data accuracy |
| Format as HH:MM in Cyprus timezone | Business hours context, better readability | User experience |
| Fallback to current time if unavailable | Better than "Unknown" placeholder | Graceful degradation |
| Duplicate formatCallTimeDisplay helper | Modules stay independent, helper is tiny | Code organization |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Implementation was straightforward - the infrastructure from Plans 01-02 made this a clean data flow completion.

## Next Phase Readiness

**Phase 13 (Alerting Logic) Status:**
- ✅ Plan 01: Pipeline orchestration (complete)
- ✅ Plan 02: Follow-up reminders (complete)
- ✅ Plan 03: Call time extraction (complete)
- 🔲 Plan 04: Response verification (next)

**Blockers for Plan 04:** None - call tracking infrastructure and alert system fully operational.

**Migration Status:** Migration file created but NOT YET APPLIED. Must run:
```bash
# Apply via Supabase MCP or manual SQL execution
ALTER TABLE caller_alerts ADD COLUMN call_time TIMESTAMPTZ;
```

## Verification Results

All verification checks passed:

1. ✅ Zero hardcoded "Unknown" call time values (only in helper fallbacks)
2. ✅ Zero hardcoded "N/A" call time values (only in helper fallbacks)
3. ✅ `callTimeMap` used throughout pipeline (11 references)
4. ✅ `call_time` field in types and database operations (6 references)
5. ✅ Migration file exists and contains correct SQL

**Data Flow Verified:**
- `filterExternalCallers` → returns `callTimeMap`
- `audit-pipeline` → extracts `callTimeMap`, uses for `call_records`, `MissingCallerInfo`, and `caller_alerts`
- `follow-up` → reads `alert.call_time`, formats with helper

## Self-Check: PASSED

**Files created:**
```bash
✅ supabase/migrations/20260226_add_call_time_to_caller_alerts.sql exists
```

**Commits exist:**
```bash
✅ 25faee0: feat(13-03): add call time extraction and storage infrastructure
✅ 631e9e3: feat(13-03): wire call times through pipeline and follow-up reminders
```

**Code patterns verified:**
```bash
✅ callTimeMap declared and populated in call-log-extractor.ts
✅ callTimeMap extracted and used in audit-pipeline.ts (6 uses)
✅ call_time field in CallerAlert type and database insert
✅ alert.call_time read and formatted in follow-up.ts
✅ formatCallTimeDisplay helper exists in both modules
```

All claims verified. Summary accurate.
