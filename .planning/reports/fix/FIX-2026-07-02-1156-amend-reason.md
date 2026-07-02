# Fix Report - 2026-07-02 11:56

**Symptom:** Sophia's amend flow asked "what message should I send (or default)" and hardcoded "There was an amend on the balance due". Desired: ask/capture the REASON, then send "Please ignore the previous invoice №X! There was an amend on {reason}! Here is the correct one" to Marios + the accounting group.
**Mode:** quick (2 files — handler + prompt must stay in sync)
**Outcome:** fixed

## Root Cause
- `lib/invoices/sophia/intent-handlers.ts:428-446` — hardcoded "the balance due" and asked for a free-form group message with a "default".
- `supabase/functions/sophia-bot/prompts/behaviors/invoicing.ts:94-98` — instructed Sophia to ask "what message should I send" + offer that default.
The existing `correctionReason` param (IntentParams:52, passed by edit_invoice at invoice.ts:95) already carries the WHY but wasn't used in the note.

## Patch
- Handler: amend note is now the fixed template with the reason interpolated — `There was an amend on ${correctionReason || groupMessage}`. If no reason yet, asks ONE follow-up ("What's the reason for the amendment?") previewing the exact note. Then sends to the accounting group AND Marios (unchanged).
- Prompt: don't ask "what message" / don't offer "default"; capture the reason as correctionReason; the system composes the fixed note (number + reason).

## Verification
- `npx tsc --noEmit` - PASS (exit 0) [handler]
- prompt backtick balance check - PASS (balanced) [edge fn; full check at deploy]

## Remaining Notes
- Prompt change → per CLAUDE.md, chat_history may need clearing if Sophia still copies the old "what message/default" wording from recent history. Not cleared here (destructive to live conversations) — flagged.
- Requires TWO deploys: Vercel (handler) + `supabase functions deploy sophia-bot` (prompt).
