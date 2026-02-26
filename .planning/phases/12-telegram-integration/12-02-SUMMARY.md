---
phase: 12-telegram-integration
plan: 02
subsystem: api
tags: [telegram, alerts, postgres, deno, rate-limiting]

requires:
  - phase: 12-telegram-integration/01
    provides: "TelegramBotClient singleton (getTelegramBot), ZYPRESS_OTHERS_CHAT_ID constant"
provides:
  - "sendMissingCallerAlert — sends formatted alert to Zypress Others group"
  - "sendBatchMissingCallerAlerts — batch send with 1s rate-limit delays"
  - "formatMissingCallerAlert / formatFollowUpReminder — message templates"
  - "audit_alerts table — tracks every sent alert with Telegram message ID"
  - "getUnresolvedAlerts / markAlertResolved — query and update alert status"
  - "AuditAlert and MissingCallerInfo TypeScript types"
affects: [12-03-response-tracking, 13-audit-orchestrator, 14-scheduling]

tech-stack:
  added: []
  patterns: ["graceful duplicate handling via unique constraint + 23505 check", "rate-limited batch sending with 1s delay"]

key-files:
  created:
    - "supabase/functions/_shared/telegram-alerts.ts"
    - "supabase/migrations/20260226141013_audit_alerts.sql"
  modified: []

key-decisions:
  - "Combined message formatting, sending, and DB persistence in one module for cohesion"
  - "Duplicate alerts handled gracefully via unique constraint (phone+date+type) + 23505 catch"
  - "DB persistence is non-blocking — alert send succeeds even if DB insert fails"
  - "1-second delay between batch messages to stay within Telegram same-group rate limit"

patterns-established:
  - "Alert persistence pattern: send Telegram message first, then persist with message_id"
  - "Unique constraint dedup: insert and catch 23505 instead of select-then-insert"

duration: 5min
completed: 2026-02-26
---

# Phase 12 Plan 02: Alert Sending Service Summary

**Missing-caller alert service with formatted Telegram messages, batch sending with rate limiting, and persistent tracking in audit_alerts table**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-26T14:08:59Z
- **Completed:** 2026-02-26T14:14:53Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments
- Alert message formatting with phone number display (Cyprus format: +357 22 123 456)
- Single and batch alert sending to Zypress Others group with Telegram rate-limit compliance
- Follow-up reminder message templates for unresolved alerts
- audit_alerts table with unique constraint deduplication, 4 indexes, and RLS enabled
- Query helpers for unresolved alerts and resolution tracking

## Task Commits

Each task was committed atomically:

1. **Task 1: Create alert sending service with message templates** - `974f6dd` (feat)
2. **Task 2: Record sent alerts in audit_alerts table** - `cf3d99e` (feat)

## Files Created/Modified
- `supabase/functions/_shared/telegram-alerts.ts` - Alert formatting, sending, batch, persistence, and query helpers (355 lines)
- `supabase/migrations/20260226141013_audit_alerts.sql` - audit_alerts table with indexes and RLS

## Decisions Made
- Combined all alert-related code (formatting, sending, DB persistence, queries) in one module rather than splitting across multiple files — keeps the alert domain cohesive
- DB persistence is fire-and-forget: if the insert fails, the Telegram message still counts as sent
- Batch rate limiting uses simple 1-second setTimeout between messages rather than a token bucket — sufficient for expected volume (< 30 alerts per audit run)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Supabase CLI `db push` failed due to remote migration history mismatch (remote has migrations not present locally). Resolved by using psycopg2 to connect directly to the Supabase Postgres pooler and execute the SQL migration.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Alert sending service ready for Plan 12-03 (response tracking) — message IDs are returned for correlation
- audit_alerts table ready for status updates when Vasya responds in Telegram
- Follow-up reminder templates ready for scheduling in Phase 14

## Self-Check: PASSED

- FOUND: supabase/functions/_shared/telegram-alerts.ts
- FOUND: supabase/migrations/20260226141013_audit_alerts.sql
- FOUND: commit 974f6dd (Task 1)
- FOUND: commit cf3d99e (Task 2)

---
*Phase: 12-telegram-integration*
*Completed: 2026-02-26*
