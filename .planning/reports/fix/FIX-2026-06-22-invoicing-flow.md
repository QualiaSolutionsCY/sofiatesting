# Fix Report - 2026-06-22

**Symptom:** Five Sophia invoicing-flow behaviors wrong (agent name in description; approve only hit accounting group; credit note/receipt asked for approval; receipts posted to group).
**Mode:** general
**Outcome:** fixed

## Root Cause
- Agent name in description: AI behavior, no hardcoded source — `sophia_prompts` key=invoicing didn't forbid it. (`invoice_documents.description` = "...Tala, Paphos - Agent: Andreas")
- Approve → accounting only: `lib/invoices/sophia/intent-handlers.ts:220` sent only `sendDocumentToAccountingGroup`.
- Credit note "approval": `intent-handlers.ts` issue_credit_note gated on `groupMessage` (returned needsInput). Action `cancelWithCreditNoteAction` already auto-approves + auto-sends.
- Receipts to group: `lib/invoices/actions/documents.ts:328` `queueReceiptDelivery` → `buildReceiptDeliveryPayload` targets "accounting-group".

## Patch
- `lib/invoices/sophia/intent-handlers.ts`: approve also calls `notifyMariosApprovedAction` (Marios + accounting); issue_credit_note no longer gates on groupMessage (issued directly).
- `lib/invoices/actions/documents.ts`: removed `queueReceiptDelivery` from `markPaidAndIssueReceiptAction` (receipts internal); fixed stale panel caption.
- DB `sophia_prompts` (key=invoicing): explicit rule — agent name NEVER in the description.
- (Prior commit) `components/invoices/redesign/ledger/ListPane.tsx`: receipts get their own "Receipts" section.

## Verification
- `npx tsc --noEmit` - PASS (exit 0)
- Approved invoices appear under "Approved" (#6): `approveDocumentAction` → status `numbered`, ListPane "Approved" bucket includes `numbered` — already correct.

## Remaining Notes
- Fallback `supabase/functions/sophia-bot/prompts/behaviors/invoicing.ts` is out of sync with the DB prompt (pre-existing; DB overrides). Sync if the file-fallback is ever used.
