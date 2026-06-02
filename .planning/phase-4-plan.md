# Phase 4 Plan — Marios reply forwarding + remaining intents + archive

## Overview
Close the loop: Sophia forwards Marios's WhatsApp replies into the existing approval workflow, the intent set covers full lifecycle, and the standalone `sophiainvoice` Vercel project is archived.

## Waves

### Wave 1
#### `P4-T1` — Port inbound webhook route
- Files: `app/api/integrations/webhooks/route.ts`
- Action: vendor-copy sophiainvoice `src/app/api/integrations/webhooks/route.ts` (+ `lib/invoices/supabase/webhook-repository.ts`, `lib/invoices/integrations/webhook-parser.ts` already ported in P1). Rewrite imports. Verify `WEBHOOK_SIGNATURE_SECRET` handling.
- Validation: route compiles; `curl` normalized payload inserts `invoice_webhook_events`.

#### `P4-T2` — sophia-bot reply forwarding
- Files: `supabase/functions/sophia-bot/` inbound handler
- Action: detect invoice-thread replies (quoted-message ref or `Ref:/Doc:` in text, or thread mapping to a `provider_message_id`), forward normalized payload to `/api/integrations/webhooks`. Reuse `invoice-bridge` HMAC pattern or the webhook secret.
- Validation: a Marios "approved" reply reaches the webhook + moves the doc.

### Wave 2
#### `P4-T3` — Remaining intents
- Files: `app/api/sophia/intent/route.ts`, `lib/invoices/sophia/intent-handlers.ts`
- Action: add `request_correction`→correctResendAction, `mark_paid`→markPaidAndIssueReceiptAction, `issue_receipt`, `issue_credit_note`→cancelWithCreditNoteAction, `resend`.
- Validation: each intent maps to its existing action; curl smoke per intent.

#### `P4-T4` — Full lifecycle live QA
- Action: Fawzi: create draft → Marios approves on WhatsApp → official number applied → client email queued → accounting forward queued. All visible in `/admin/invoices` timeline.
- Validation: end-to-end pass.

### Wave 3
#### `P4-T5` — Archive standalone + deploy gate
- Action: `vercel --prod` sofiatesting; run post-deploy 8-check (rules/deployment.md). Archive `sophiainvoice` Vercel project (pause/remove) + set GitHub repo archived. Disable GitHub auto-deploy on sofiatesting (noted earlier).
- Validation: 8-check passes; sophiainvoice project archived; sofiatesting is single source of truth.

## Owner input required
- Confirm archive of `sophiainvoice` Vercel project + GitHub repo.

## Risks
- Mapping Marios's bare "approved" to the right document (no Ref typed) → rely on quoted-message `provider_message_id` → `invoice_action_queue` lookup.
- Two inbound consumers (property uploads vs invoicing) on one webhook → route by thread/intent, don't double-handle.

## Acceptance (maps to ROADMAP P4)
- [ ] inbound webhook ported + live (P4-T1)
- [ ] Marios replies forwarded → approval workflow (P4-T2)
- [ ] all 9 intents implemented (P4-T3)
- [ ] full WhatsApp lifecycle verified (P4-T4)
- [ ] sophiainvoice archived; 8-check green (P4-T5)
