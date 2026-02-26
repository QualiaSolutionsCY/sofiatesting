---
phase: 13-alerting-logic
plan: 02
subsystem: call-audit
tags: [follow-up, reminders, telegram-alerts, automation]
dependency_graph:
  requires:
    - 13-01-PLAN (audit pipeline orchestrator)
    - 12-02-PLAN (telegram alert sending)
    - 10-01-PLAN (call tracking infrastructure)
  provides:
    - "Follow-up reminder system for unresolved alerts"
    - "processFollowUpReminders function"
    - "?follow-up-only=true endpoint"
  affects:
    - "caller_alerts table (status transitions)"
    - "Telegram Zypress Others group (reminder messages)"
tech_stack:
  added: []
  patterns:
    - "Automatic reminder scheduling based on alert age"
    - "Status-driven workflow (alerted -> follow_up_sent)"
    - "Graceful degradation on unconfigured Telegram"
    - "Independent endpoint for follow-up execution"
key_files:
  created:
    - "supabase/functions/call-audit/follow-up.ts"
  modified:
    - "supabase/functions/call-audit/audit-pipeline.ts"
    - "supabase/functions/call-audit/index.ts"
decisions:
  - decision: "Follow-up threshold set to 24 hours"
    rationale: "Balances urgency with avoiding spam - gives time for manual resolution"
    alternatives: ["12 hours (too aggressive)", "48 hours (too slow for lead response)"]
  - decision: "Follow-up runs AFTER completing the day's audit (Step 7)"
    rationale: "Ensures current day's audit is recorded even if follow-ups fail"
    alternatives: ["Run before alerts (would delay current day)", "Separate cron job (more complex)"]
  - decision: "Individual send failures don't abort the batch"
    rationale: "Maximize delivery - one bad phone number shouldn't block others"
    alternatives: ["Fail entire batch (too brittle)", "Retry failed sends (adds complexity)"]
metrics:
  duration: "83 seconds"
  tasks_completed: 2
  files_created: 1
  files_modified: 2
  commits: 2
  completed_date: "2026-02-26"
---

# Phase 13 Plan 02: Follow-Up Reminders Summary

**One-liner:** Automatic 24-hour follow-up reminders for unresolved missing caller alerts via Telegram, integrated into daily audit pipeline with independent testing endpoint.

## Objective

Create the follow-up reminder system that automatically re-alerts for unresolved missing callers after 24 hours, and integrate it into the daily audit pipeline.

**Purpose:** Without follow-ups, alerts can be forgotten. This ensures unresolved callers get a reminder so no lead falls through the cracks.

## What Was Built

### 1. Follow-Up Reminder Module (`follow-up.ts`)

**Core Function:** `processFollowUpReminders(): Promise<FollowUpResult>`

**Logic Flow:**
1. **Guard Check:** If `ZYPRESS_OTHERS_CHAT_ID === 0`, skip with warning (graceful degradation)
2. **Query:** Call `getPendingFollowUps(24)` → returns `CallerAlert[]` where status=alerted AND alerted_at > 24h ago
3. **Process Each Alert:**
   - Calculate `daysSinceAlert` from `alerted_at` timestamp
   - Create `MissingCallerInfo` from alert fields
   - Format reminder using `formatFollowUpReminder(callerInfo, daysSinceAlert)`
   - Send via `bot.sendMessage()` to Zypress Others group
   - On success: Update status to `follow_up_sent` with `follow_up_message_id`
   - On failure: Log error, continue to next alert
   - Add 1-second delay between messages (rate limiting)
4. **Return Result:** `{ checked, remindersSent, remindersFailed, skippedReason? }`

**Error Handling:**
- Entire function wrapped in try/catch → returns zero result on fatal error
- Per-alert errors logged but don't abort batch
- Unconfigured Telegram → skip with `skippedReason: "telegram_not_configured"`

### 2. Pipeline Integration

**Updated `audit-pipeline.ts`:**
- Added `followUp?` field to `AuditPipelineResult` type
- Step 7: Call `processFollowUpReminders()` AFTER `completeAuditRun()`
- Follow-up wrapped in try/catch → failures don't fail the audit
- Result included in pipeline return value

**Positioning:** Follow-up runs after the day's audit is complete and recorded. This ensures:
- Current day's stats are saved even if follow-ups fail
- Follow-ups process alerts from PREVIOUS days (not today's new alerts)
- Clean separation of concerns (today's audit + yesterday's follow-ups)

### 3. Independent Endpoint

**Added to `index.ts`:** `?follow-up-only=true` query parameter

**Purpose:** Allows testing/manual triggering of follow-ups without running the full 3CX audit.

**Usage:**
```bash
curl "https://.../call-audit?follow-up-only=true"
```

**Returns:**
```json
{
  "success": true,
  "result": {
    "checked": 3,
    "remindersSent": 3,
    "remindersFailed": 0,
    "timestamp": "2026-02-26T16:30:00Z",
    "executionMs": 3200
  }
}
```

## Deviations from Plan

None - plan executed exactly as written.

## Key Technical Details

### Status Transitions
| From | To | Trigger |
|------|-----|---------|
| alerted | follow_up_sent | Follow-up reminder sent successfully |
| follow_up_sent | resolved | User responds (handled by 12-03 response tracking) |
| alerted | resolved | User responds before follow-up (handled by 12-03) |

**Critical:** `getPendingFollowUps()` only queries status=alerted, so resolved/ignored alerts are automatically excluded.

### Message Format

Example reminder message:
```
🔔 REMINDER: Unresolved Missing Caller

Phone: +357 22 123 456
Original Call: 2026-02-25 at 14:30
Days since alert: 1

This caller has not been confirmed as attended to.
Please respond if this number has been handled.
```

### Rate Limiting
- 1-second delay between messages (same as alert sending)
- Telegram Bot API allows ~20 messages/min to same group
- 1s delay = 60 messages/hour → safe for any realistic follow-up volume

## Testing Checklist

Before deploying:

- [ ] Deploy Edge Function: `supabase functions deploy call-audit --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx`
- [ ] Test follow-up-only endpoint: `curl "https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/call-audit?follow-up-only=true"`
- [ ] Verify graceful skip when Telegram not configured (set ZYPRESS_OTHERS_CHAT_ID=0 temporarily)
- [ ] Create test alert older than 24h (manually UPDATE alerted_at in DB)
- [ ] Trigger follow-up, verify Telegram message sent
- [ ] Verify status transition: alerted → follow_up_sent
- [ ] Verify follow_up_message_id populated in DB
- [ ] Test full pipeline with follow-up step included

## Self-Check: PASSED

**Created files verified:**
```bash
[ -f "supabase/functions/call-audit/follow-up.ts" ] && echo "FOUND"
```
Result: FOUND

**Modified files verified:**
```bash
[ -f "supabase/functions/call-audit/audit-pipeline.ts" ] && echo "FOUND"
[ -f "supabase/functions/call-audit/index.ts" ] && echo "FOUND"
```
Result: FOUND (both files)

**Commits verified:**
```bash
git log --oneline --all | grep -q "a81becd" && echo "FOUND: a81becd"
git log --oneline --all | grep -q "0fe3fc3" && echo "FOUND: 0fe3fc3"
```
Result: FOUND (both commits)

**Export verification:**
```bash
grep -n "export.*processFollowUpReminders" supabase/functions/call-audit/follow-up.ts
```
Result: Line 49 - export function found

**Integration verification:**
```bash
grep "processFollowUpReminders" supabase/functions/call-audit/audit-pipeline.ts
```
Result: Import and call confirmed

**Endpoint verification:**
```bash
grep "follow-up-only" supabase/functions/call-audit/index.ts
```
Result: Query parameter handling confirmed

## Next Phase Readiness

**Phase 14 (Scheduling)** can proceed:
- Follow-up logic complete and integrated into pipeline
- Pipeline returns comprehensive result including follow-up stats
- ?follow-up-only endpoint available for testing/debugging
- Graceful degradation ensures scheduling works even if Telegram unconfigured

**Blockers:** None

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | a81becd | feat(13-02): create follow-up reminder module |
| Task 2 | 0fe3fc3 | feat(13-02): integrate follow-up reminders into audit pipeline |

---

**Plan completed:** 2026-02-26
**Execution time:** 83 seconds
**Status:** ✓ All tasks complete, all verifications passed
