---
phase: 14-scheduling-orchestration
plan: 01
subsystem: infra
tags: [pg_cron, pg_net, scheduling, postgresql, edge-functions]

requires:
  - phase: 13-alerting-logic
    provides: "call-audit Edge Function with full audit pipeline"
  - phase: 10-call-tracking-infra
    provides: "call_audit_runs table for audit result tracking"
provides:
  - "pg_cron job 'call-audit-daily' running Mon-Fri 5PM Europe/Nicosia"
  - "cron_execution_log table for invocation tracking"
  - "invoke_call_audit() wrapper function with error handling"
  - "Cron vs manual trigger detection in Edge Function"
affects: [14-02-PLAN, deployment, monitoring]

tech-stack:
  added: [pg_cron, pg_net]
  patterns: [cron-wrapper-function, fire-and-forget-http, execution-logging]

key-files:
  created:
    - supabase/migrations/20260226_call_audit_cron.sql
  modified:
    - supabase/functions/call-audit/index.ts

key-decisions:
  - "Use invoke_call_audit() wrapper instead of inline SQL for execution logging"
  - "pg_net is fire-and-forget; actual result tracking stays in call_audit_runs"
  - "3-arg cron.schedule + UPDATE timezone (safest cross-version approach)"
  - "30-day log retention with weekly cleanup job"

patterns-established:
  - "Cron wrapper pattern: log entry -> http_post -> update log (with EXCEPTION handler)"
  - "x-cron header convention for distinguishing automated vs manual invocations"

duration: 1min
completed: 2026-02-26
---

# Phase 14 Plan 01: Cron Scheduling Summary

**pg_cron job scheduling call-audit Edge Function Mon-Fri at 5PM Cyprus time with execution logging and error recovery**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-26T18:11:33Z
- **Completed:** 2026-02-26T18:12:50Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- pg_cron job `call-audit-daily` scheduled at `0 17 * * 1-5` with Europe/Nicosia timezone (auto DST handling)
- `cron_execution_log` table with RLS for tracking invocation attempts, durations, and errors
- `invoke_call_audit()` PL/pgSQL wrapper that logs before/after pg_net HTTP dispatch
- Edge Function detects cron vs manual trigger via `x-cron` header, includes in logs and response

## Task Commits

Each task was committed atomically:

1. **Task 1: Create pg_cron migration with execution logging** - `82b90cf` (feat)
2. **Task 2: Add cron-aware logging to Edge Function** - `082189b` (feat)

## Files Created/Modified
- `supabase/migrations/20260226_call_audit_cron.sql` - pg_cron job definition, execution log table, wrapper function, cleanup job
- `supabase/functions/call-audit/index.ts` - Added x-cron header detection and trigger field in logs/response

## Decisions Made
- Used `invoke_call_audit()` wrapper function instead of inline net.http_post in cron.schedule, enabling execution logging with error recovery
- pg_net is fire-and-forget (async), so cron log tracks "dispatch success/fail" while call_audit_runs tracks actual audit results
- Used 3-argument `cron.schedule()` + separate `UPDATE cron.job SET timezone` for maximum pg_cron version compatibility
- 30-day retention for cron_execution_log with weekly Sunday 3AM cleanup
- SERVICE_ROLE_KEY as placeholder in migration (must be replaced before applying)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

**Before applying the migration**, replace `<SERVICE_ROLE_KEY>` in the SQL with the actual Supabase service_role key:
- Find key: Supabase Dashboard > Settings > API > service_role key
- Replace in: `invoke_call_audit()` function body
- Apply via: Supabase SQL Editor or `supabase db push`

## Next Phase Readiness
- Cron scheduling infrastructure is ready
- Plan 14-02 (health monitoring / operational dashboard) can proceed
- Migration must be applied to Supabase before cron job activates

---
*Phase: 14-scheduling-orchestration*
*Completed: 2026-02-26*
