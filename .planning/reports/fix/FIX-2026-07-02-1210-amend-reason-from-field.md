# Fix Report - 2026-07-02 12:10

**Symptom:** After the last fix, Sophia asked a separate "What's the reason for the amendment?" question. It shouldn't — the change itself is the reason (Marios says "amount to 2100" → the amend is on "the amount"). Sophia should derive it and auto-fill the note.
**Mode:** quick (2 files — handler + prompt in sync)
**Outcome:** fixed

## Root Cause
- `lib/invoices/sophia/intent-handlers.ts` edit_invoice branch asked for a free-text reason instead of deriving it from the changed field.
- `supabase/functions/sophia-bot/prompts/behaviors/invoicing.ts:94` instructed Sophia to ask "What's the reason for the amendment?".

## Patch
- Handler: derive the amend reason from the field(s) Sophia passed (she sends only what changed) — amount→"the amount", description→"the description", VAT→"the VAT", due date→"the due date"; join multiple with "and". No "ask for reason" step — apply + compose + send to group + Marios in one go.
- Prompt: don't ask for a reason; the change IS the reason (field-derived); the system composes the fixed note.

## Verification
- `npx tsc --noEmit` - PASS (exit 0)
- prompt backtick balance - PASS (balanced)

## Remaining Notes
- Stale chat_history (old "still need that group message for 11467" wording seen mid-test) can make Sophia replay the previous flow — clearing the invoicing chat_history is the documented follow-up (not done here; destructive to live threads).
- Two deploys: Vercel (handler) + `supabase functions deploy sophia-bot` (prompt).
