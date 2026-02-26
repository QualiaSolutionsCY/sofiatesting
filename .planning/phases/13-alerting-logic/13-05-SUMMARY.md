---
phase: 13
plan: 05
subsystem: alerting-logic
tags: [gap-closure, response-tracking, database-migration, dual-table-elimination]
dependency_graph:
  requires:
    - 13-04 (call time extraction for alert display)
    - 12-03 (original response tracker implementation)
    - 10-01 (caller_alerts table schema)
  provides:
    - unified-response-tracking (single table for alert state)
    - resolved-alert-exclusion (follow-ups stop correctly)
  affects:
    - supabase/functions/_shared/telegram-response-tracker.ts (Deno tracker)
    - lib/telegram/audit-response-handler.ts (Node.js tracker)
    - supabase/functions/_shared/telegram-alerts.ts (alert sender)
    - supabase/functions/call-audit/audit-pipeline.ts (alert creation)
    - supabase/functions/_shared/call-tracking.ts (types)
tech_stack:
  added: []
  patterns:
    - single-table-alert-state (caller_alerts owns all alert lifecycle)
    - field-mapping (audit_alerts fields -> caller_alerts schema)
    - text-cast-message-id (BIGINT -> TEXT for alert_message_id)
key_files:
  created:
    - supabase/migrations/20260226_add_chat_id_to_caller_alerts.sql
  modified:
    - supabase/functions/_shared/telegram-response-tracker.ts
    - supabase/functions/_shared/call-tracking.ts
    - supabase/functions/_shared/telegram-alerts.ts
    - supabase/functions/call-audit/audit-pipeline.ts
    - lib/telegram/audit-response-handler.ts
decisions:
  - what: Map audit_alerts "pending" status to caller_alerts "alerted" (not "pending")
    why: In caller_alerts, "pending" means pre-alert; "alerted" means alert sent and awaiting response
    impact: Response tracker sets correct status for follow-up eligibility
  - what: Store alert_message_id as TEXT (not BIGINT)
    why: caller_alerts uses TEXT for Telegram message IDs (consistent with schema)
    impact: Requires String() cast when querying
  - what: Remove all database operations from telegram-alerts.ts
    why: Separation of concerns - alerting module should only format and send, not persist
    impact: Cleaner module boundaries, no dual persistence logic
  - what: Add chat_id column to caller_alerts
    why: Enables response lookup by (alert_message_id, chat_id) pair
    impact: Matches audit_alerts lookup pattern, prevents message ID collisions across chats
metrics:
  duration: 4min
  completed_date: 2026-02-26
---

# Phase 13 Plan 05: Response Tracking Unification — Summary

**One-liner:** Unified alert response tracking onto caller_alerts table, eliminating dual-table architecture and fixing follow-up reminder issue where responses updated wrong table.

## What Was Built

Migrated the entire alert response tracking system from the deprecated `audit_alerts` table to the canonical `caller_alerts` table, closing the ALERT-04 blocker where Vasya's Telegram responses updated the wrong table and follow-up reminders ignored resolved status.

**Before:** Dual-table architecture with split responsibilities
- `audit_pipeline.ts` → created alerts in `caller_alerts` (status flow: pending → alerted)
- `telegram-alerts.ts` → sent Telegram messages, persisted duplicates in `audit_alerts`
- `telegram-response-tracker.ts` → updated `audit_alerts` on Vasya's reply
- `follow-up.ts` → read `caller_alerts` for pending alerts
- **Problem:** Response writes to `audit_alerts`, follow-up reads from `caller_alerts` → resolved alerts still got reminders

**After:** Single-table architecture with unified state
- `audit_pipeline.ts` → creates alerts in `caller_alerts`, passes `chat_id` when setting `alert_message_id`
- `telegram-alerts.ts` → sends Telegram messages only (no DB writes)
- `telegram-response-tracker.ts` → updates `caller_alerts` (status: "resolved" with `resolution_type`, or "alerted" for not_found)
- `follow-up.ts` → reads `caller_alerts` where status = "alerted" (excludes "resolved")
- **Solution:** Single source of truth → follow-ups correctly exclude resolved alerts

**Field mapping (audit_alerts → caller_alerts):**
```
phone_number → caller_phone
telegram_message_id (BIGINT) → alert_message_id (TEXT, requires String() cast)
status "resolved" → status "resolved" (same)
status "pending" → status "alerted" (NOT "pending" - means pre-alert in caller_alerts)
response_text → resolution_note
responded_at → resolved_at (when status is "resolved")
N/A → resolution_type ("found_in_telegram" | "alternative_phone" | "not_client" | "manual_ignore")
N/A → alternative_phone (extracted phone number from response)
```

## Tasks Completed

### Task 1: Add chat_id column and migrate Deno response tracker
- **Commit:** bb3f204
- **Files:**
  - `supabase/migrations/20260226_add_chat_id_to_caller_alerts.sql` — adds `chat_id BIGINT` column + index
  - `supabase/functions/_shared/call-tracking.ts` — updated types (`CallerAlert`, `CreateCallerAlertParams`, `UpdateAlertStatusParams`) to include `chat_id`
  - `supabase/functions/_shared/telegram-response-tracker.ts` — migrated from `audit_alerts` to `caller_alerts` with field remapping

**Changes:**
- Added `chat_id` column to `caller_alerts` table via migration
- Created index `idx_caller_alerts_message_lookup` on `(alert_message_id, chat_id)` for fast response lookup
- Updated `findAlertByReplyMessageId`: `.from("audit_alerts")` → `.from("caller_alerts")`, `.eq("telegram_message_id", ...)` → `.eq("alert_message_id", String(...))`
- Updated `processAlertResponse`: removed `response_text`, `responded_by_telegram_id`, `responded_at`; added `resolution_type`, `resolution_note`, `alternative_phone`, `resolved_at`
- Status mapping: "found" → "resolved" + "found_in_telegram", "not_found" → "alerted" (keep for follow-up), "alternative_number" → "resolved" + "alternative_phone"

### Task 2: Clean up telegram-alerts.ts and wire chat_id
- **Commit:** 550a95b
- **Files:**
  - `supabase/functions/_shared/telegram-alerts.ts` — removed all DB operations
  - `supabase/functions/call-audit/audit-pipeline.ts` — added `chat_id` to `updateAlertStatus` call

**Changes:**
- Removed `persistAlert` function (no longer needed - `createCallerAlert` + `updateAlertStatus` handle persistence)
- Removed `getUnresolvedAlerts` and `markAlertResolved` (superseded by `call-tracking.ts` equivalents)
- Removed `AuditAlert` type (no longer used)
- Removed `getSupabaseAdmin` import (no DB operations remain)
- `sendMissingCallerAlert` now only sends Telegram message, returns `messageId` for caller to persist
- Wired `chat_id: ZYPRESS_OTHERS_CHAT_ID` in `audit-pipeline.ts` when updating alert status after send

**Result:** `telegram-alerts.ts` now contains only formatting (`formatMissingCallerAlert`, `formatFollowUpReminder`) and sending functions (`sendMissingCallerAlert`, `sendBatchMissingCallerAlerts`). Zero database operations.

### Task 3: Migrate Node.js audit-response-handler
- **Commit:** c460b14
- **Files:**
  - `lib/telegram/audit-response-handler.ts` — migrated to `caller_alerts` table

**Changes:**
- Updated lookup query: `.from("audit_alerts")` → `.from("caller_alerts")`, `.eq("telegram_message_id", ...)` → `.eq("alert_message_id", String(...))`
- Updated field names in update payload: same field mapping as Deno tracker (resolution_type, resolution_note, alternative_phone, resolved_at)
- Updated log field: `phone: alert.phone_number` → `phone: alert.caller_phone`
- Updated comment: "audit_alerts record" → "caller_alerts record"

**Result:** Both Deno (Edge Function) and Node.js (Next.js API) response trackers now write to the same table with identical field mapping.

## Deviations from Plan

None - plan executed exactly as written. All three tasks completed with expected field mappings and status transitions.

## Verification Results

**End-to-end data flow:**
1. **Alert creation:** `audit-pipeline.ts` → `createCallerAlert` (status: "pending") → `sendMissingCallerAlert` → `updateAlertStatus` (status: "alerted", alert_message_id, chat_id)
2. **Response handling:** Vasya replies → `findAlertByReplyMessageId` (caller_alerts by alert_message_id + chat_id) → `processAlertResponse` (status: "resolved" with resolution_type OR "alerted" if not_found)
3. **Follow-up reminders:** `getPendingFollowUps` → queries `caller_alerts` WHERE status = "alerted" → excludes "resolved" alerts correctly

**Code verification:**
```bash
# Zero audit_alerts references in runtime code
$ grep -rn 'from("audit_alerts")' supabase/functions/ lib/ --include="*.ts"
# (empty - only migrations and planning docs)

# Schema consistency confirmed
$ grep -c 'caller_phone\|alert_message_id\|resolution_type' supabase/functions/_shared/telegram-response-tracker.ts
# Multiple matches - correct field names used

# Both trackers use same table
$ grep 'from("caller_alerts")' supabase/functions/_shared/telegram-response-tracker.ts
#   .from("caller_alerts")  # findAlertByReplyMessageId
#   .from("caller_alerts")  # processAlertResponse

$ grep 'from("caller_alerts")' lib/telegram/audit-response-handler.ts
#   .from("caller_alerts")  # lookup query
#   .from("caller_alerts")  # update query
```

## Self-Check: PASSED

**Created files:**
```bash
$ test -f supabase/migrations/20260226_add_chat_id_to_caller_alerts.sql && echo "FOUND"
FOUND
```

**Modified files verified:**
```bash
$ git log --oneline -3
c460b14 feat(13-05): migrate Node.js audit-response-handler to caller_alerts
550a95b refactor(13-05): clean up telegram-alerts.ts and wire chat_id
bb3f204 feat(13-05): migrate response tracker to caller_alerts table
```

**Commits exist:**
```bash
$ git log --oneline --all | grep -E "bb3f204|550a95b|c460b14"
c460b14 feat(13-05): migrate Node.js audit-response-handler to caller_alerts
550a95b refactor(13-05): clean up telegram-alerts.ts and wire chat_id
bb3f204 feat(13-05): migrate response tracker to caller_alerts table
```

All files exist, commits are present, and zero audit_alerts references remain in runtime code.

## Impact

**ALERT-04 blocker RESOLVED:**
- Vasya's Telegram responses now update `caller_alerts` (same table follow-up logic reads)
- Follow-up reminders correctly exclude alerts with status = "resolved"
- No duplicate alert records created across two tables
- Single source of truth for alert state: `caller_alerts` table

**Code quality improvements:**
- Separation of concerns: `telegram-alerts.ts` does only formatting + sending (no DB)
- Consistent field naming across Deno and Node.js trackers
- Indexed lookup for fast response matching: `(alert_message_id, chat_id)`

**Migration notes:**
- `audit_alerts` table is now deprecated (migration file stays for history)
- `chat_id` column added to `caller_alerts` for future-proofing (supports multi-chat scenarios)
- `alert_message_id` stored as TEXT (matches existing schema, requires String() cast from Telegram's BIGINT)

## Next Phase Readiness

**Phase 14 (Scheduling & Orchestration) ready:**
- Alert response tracking is unified and correct
- Follow-up logic reads from canonical table with correct status filtering
- No blockers from alert system architecture

**No additional migration needed** - `caller_alerts` table now has all required columns for full alert lifecycle.
