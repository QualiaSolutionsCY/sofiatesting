---
phase: 12-telegram-integration
plan: 03
subsystem: api
tags: [telegram, audit, response-tracking, supabase, deno]

requires:
  - phase: 12-01
    provides: "Telegram Bot API client, telegram-search.ts with VASYA_TELEGRAM_USER_ID constant"
  - phase: 12-02
    provides: "audit_alerts table, AuditAlert type, markAlertResolved helper"
provides:
  - "Deno response tracker (parseVasyaResponse, processAlertResponse, handleAuditAlertResponse)"
  - "Node.js audit-response-handler for Next.js webhook"
  - "reply_to_message field on TelegramMessage type"
  - "Alert response detection integrated into lead-router.ts"
affects: [13-orchestration, 14-scheduling]

tech-stack:
  added: []
  patterns: ["Dual-runtime pattern: Deno service + Node.js mirror for same logic"]

key-files:
  created:
    - supabase/functions/_shared/telegram-response-tracker.ts
    - lib/telegram/audit-response-handler.ts
  modified:
    - lib/telegram/types.ts
    - lib/telegram/lead-router.ts

key-decisions:
  - "Phone number detection takes priority over keyword matching (alternative_number > found > not_found)"
  - "not_found keeps alert as 'pending' for follow-up rather than a separate status"
  - "unknown responses stored for manual review without changing alert status"
  - "Dual implementation: Deno for Edge Functions, Node.js for Next.js webhook"

patterns-established:
  - "Response parsing priority: phone > positive > negative > unknown"
  - "Graceful skip on unconfigured user ID (VASYA_TELEGRAM_USER_ID === 0 -> return false)"
  - "Alert response check runs before lead routing in handleGroupMessage"

duration: 2min
completed: 2026-02-26
---

# Phase 12 Plan 03: Response Tracking Summary

**Alert response tracker parsing Vasya's replies (found/not-found/alt-number) with dual Deno + Node.js implementations and lead-router integration**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-26T15:43:30Z
- **Completed:** 2026-02-26T15:45:24Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Response parser with four categories: found, not_found, alternative_number, unknown
- Deno-compatible service for Edge Function context (telegram-response-tracker.ts)
- Node.js-compatible handler for Next.js webhook (audit-response-handler.ts)
- Integrated into lead-router.ts -- alert responses intercepted before lead routing

## Task Commits

Each task was committed atomically:

1. **Task 1: Create response parsing and alert state management service** - `dd784c7` (feat)
2. **Task 2: Hook response tracking into Next.js Telegram webhook** - `39d70c4` (feat)

## Files Created/Modified
- `supabase/functions/_shared/telegram-response-tracker.ts` - Deno response tracker: parseVasyaResponse, processAlertResponse, findAlertByReplyMessageId, handleAuditAlertResponse
- `lib/telegram/audit-response-handler.ts` - Node.js mirror: same parsing logic + Supabase client using process.env
- `lib/telegram/types.ts` - Added reply_to_message field to TelegramMessage
- `lib/telegram/lead-router.ts` - Calls handleAuditAlertResponse before lead routing

## Decisions Made
- Phone number detection takes priority over keyword matching to avoid missing alternative numbers embedded in "found" messages
- `not_found` responses keep alert as `pending` (not a new status) so follow-up reminders still fire
- `unknown` responses are stored but don't change status, allowing manual review
- Dual Deno/Node.js implementation needed because Edge Functions and Next.js webhook both handle Telegram messages

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. VASYA_TELEGRAM_USER_ID remains a placeholder (0) and must be set when Vasya's ID is obtained.

## Next Phase Readiness
- Response tracking complete -- closes the audit feedback loop
- Phase 12 (all 3 plans) complete, ready for Phase 13 (orchestration) or Phase 14 (scheduling)
- Remaining config needed before go-live: regional group IDs, Zypress Others chat ID, Vasya's Telegram user ID

---
*Phase: 12-telegram-integration*
*Completed: 2026-02-26*
