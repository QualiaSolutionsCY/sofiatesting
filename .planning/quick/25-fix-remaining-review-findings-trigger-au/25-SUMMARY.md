# Summary: 25 — Fix remaining review findings

**Completed:** 2026-03-11

## Changes Made

### Task 1: Auth on trigger endpoints (CRITICAL)
- Both `/trigger` and `/trigger/sophia` now require `x-admin-secret` header
- Returns 401 Unauthorized without valid secret
- Prevents external actors from triggering email processing loops

### Task 2: Block unknown senders on email webhook (HIGH)
- Unknown email senders now get a polite rejection instead of running through full AI pipeline
- Prevents prompt injection from arbitrary external senders
- Only registered Zyprus agents can use the email→AI flow

### Task 3: Fix history load order (HIGH)
- History is now loaded BEFORE `addMessage`, not after
- Prevents the current message from appearing twice in AI context

### Task 4: Create email table migrations (CRITICAL)
- Added `20260311000000_email_router_tables.sql` migration
- Creates `email_forwards` (with unique gmail_message_id index) and `email_forwarding_rotation`
- RLS enabled, service_role only access

### Task 5: Strip internal error details (HIGH)
- Removed `err.message` from 500 response body in email-webhook.ts
- Internal errors still logged via logger.error, just not returned to caller

### Task 6: Redact sophia email from health endpoint (MEDIUM)
- Health endpoint now shows `"configured"` instead of actual email address
- Also redacted from sophia mailbox status in main health

### Task 7: Sophia trigger concurrency guard (HIGH)
- `/trigger/sophia` now checks `getSophiaStatus().isRunning` and returns 409 if busy
- Matches the info@ trigger pattern

## Files Modified
- `services/email-router/src/index.ts`
- `services/email-router/src/sophia-handler.ts`
- `supabase/functions/sophia-bot/handlers/email-webhook.ts`
- `supabase/migrations/20260311000000_email_router_tables.sql` (new)
