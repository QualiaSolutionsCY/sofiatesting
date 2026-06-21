# SOPHIA Invoicing — Admin Runbook

**Last Updated**: 2026-06-21
**Status**: ✅ Production (live at `/admin/invoices` and over WhatsApp via Sophia)
**Audience**: Operators who must diagnose invoicing without reading TypeScript.

## Overview

The invoicing system lets an allowlisted set of staff drive invoice, receipt, and
credit-note lifecycle actions two ways:

1. **The admin dashboard** at `https://sofiatesting.vercel.app/admin/invoices`
   (NextAuth-gated, admin-only).
2. **Sophia over WhatsApp** — an authorized agent sends a natural-language request,
   Sophia maps it to an intent and calls the embedded invoicing control plane.

This runbook is the single operational reference for: which Supabase project holds
what, how a request flows from WhatsApp to the invoice database, how an invoice moves
through its lifecycle, and which WhatsApp phrase triggers which action.

**Related docs:**
- Environment variable reference — [`./invoicing-env-reference.md`](./invoicing-env-reference.md)
- Sophia invoicing allowlist — [`./invoicing-allowlist.md`](./invoicing-allowlist.md)
- General admin panel — [`./admin-panel-guide.md`](./admin-panel-guide.md)

> **Security note:** This document names environment *variable names* and *where*
> they are set. It never contains secret values (no keys, tokens, JWTs, or HMAC
> secrets). Get values from the appropriate secret store, never from a doc or commit.

---

## Two-Supabase-project topology

The application talks to **two separate Supabase projects**. Confusing them is the
most common source of "the data isn't where I expect" incidents.

| Concern | Project ref | Access layer | Holds |
|---|---|---|---|
| **Primary app data** | `vceeheaxcrhmpqueudqx` | Drizzle ORM | sophia-bot data, agents, listings, chat history, prompts |
| **Invoicing** | `tijadsdysuxkxrpdlecq` | `supabase-js` via `lib/invoices/supabase/server.ts` | invoice documents, approvals, payments, storage objects, PDFs |

**Invoice project wiring** (`lib/invoices/supabase/server.ts`):
- The client is created in `createServiceSupabaseClient()` from
  `process.env.INVOICE_SUPABASE_URL` (line 18) and the service-role key in env
  `INVOICE_SUPABASE_SERVICE_ROLE` (constant `SERVICE_ROLE_ENV`, line 7).
- If either env var is unset, persistence falls back to a non-Supabase mode
  (`getSupabasePersistenceMode()` returns `"fallback"`, line 9–11).
- `INVOICE_SUPABASE_URL` resolves to the invoice project `tijadsdysuxkxrpdlecq`
  (see `.continue-here.md:9` and `:42`).

**Invoice database tables** (`lib/invoices/supabase/schema.ts`, `SUPABASE_TABLES`):

| Key | Table |
|---|---|
| `accessUsers` | `invoice_access_users` |
| `documents` | `invoice_documents` |
| `revisions` | `invoice_document_revisions` |
| `approvals` | `invoice_approvals` |
| `payments` | `invoice_payments` |
| `storageObjects` | `invoice_storage_objects` |
| `messageEvents` | `invoice_message_events` |
| `actionQueue` | `invoice_action_queue` |
| `deliveryEvents` | `invoice_delivery_events` |
| `webhookEvents` | `invoice_webhook_events` |
| `providerAccounts` | `integration_provider_accounts` |

**PDF storage:** generated invoice/receipt/credit-note PDFs live in a Supabase
Storage bucket. The bucket name is env `SUPABASE_INVOICE_BUCKET` (default `"invoices"`,
`schema.ts:25–27`), with the `generated` path prefix (`GENERATED_DOCUMENT_PREFIX`,
line 29). PDFs are served via signed URLs.

> ⚠️ **Never import `lib/invoices/supabase/server` from a client component.** The
> file begins with `import "server-only";` (`server.ts:1`) — it holds the
> service-role key and must stay server-side. The same rule appears in
> `.continue-here.md:42`.

---

## Request path / bridge

When an authorized agent asks Sophia to do anything invoicing-related over WhatsApp,
the request crosses from the Supabase Edge runtime (sophia-bot) to the Vercel app
(invoicing control plane). The path is:

```
WhatsApp message
  → manageInvoice tool (sophia-bot, allowlist check)        [Supabase Edge / Deno]
  → invoice-bridge.ts  (HMAC-signs the request body)        [Supabase Edge / Deno]
  → POST https://sofiatesting.vercel.app/api/sophia/intent  [HTTP]
  → /api/sophia/intent route (HMAC verify + allowlist re-check)  [Vercel / Node]
  → runIntent(...)                                          [Vercel / Node]
  → invoice DB tijadsdysuxkxrpdlecq + PDF bucket
```

### Step 1 — `manageInvoice` tool (sophia-bot)
File: `supabase/functions/sophia-bot/tools/handlers/invoice.ts`

- `handleManageInvoice(...)` first runs `isAllowed(phone, agent)` (line 43). If the
  sender is **not** on the allowlist, it returns a polite refusal and nothing leaves
  the bot (lines 43–52).
- The allowlist is matched on the **last 8 digits** of the phone number
  (`ALLOWED_LAST8`, line 27; the specific people are documented in
  [`./invoicing-allowlist.md`](./invoicing-allowlist.md)).
- If allowed, it builds the `params` object from the tool args (lines 63–76) and
  calls `callInvoiceIntent(...)` (line 78).
- When the result carries a `pdfUrl`, the tool also delivers the PDF to the agent's
  WhatsApp via `sendDocumentByUrl(...)` using `result.reply` as the caption
  (lines 89–101).

### Step 2 — `invoice-bridge.ts` (HMAC sign)
File: `supabase/functions/sophia-bot/services/invoice-bridge.ts`

- This is the **only** place sophia-bot talks to the invoicing system (file header,
  lines 1–9).
- `callInvoiceIntent(...)` builds the JSON body `{ actor: { wa_number }, intent,
  params, context }` (lines 51–59).
- It HMAC-signs the body with env `SOPHIA_BRIDGE_SECRET` (`BRIDGE_SECRET`, line 16;
  `sign(...)`, lines 18–30) using SHA-256, and sends the signature in the
  `X-Sophia-Signature` request header (line 67).
- It POSTs to env `SOPHIA_BRIDGE_URL`, defaulting to
  `https://sofiatesting.vercel.app/api/sophia/intent` (lines 13–15).
- If `SOPHIA_BRIDGE_SECRET` is unset, the bridge short-circuits with
  "Invoicing isn't connected yet." (lines 47–49).

### Step 3 — `/api/sophia/intent` route (verify + re-check)
File: `app/api/sophia/intent/route.ts`

- If env `SOPHIA_BRIDGE_SECRET` is unset on the Vercel side, the route returns
  `503 bridge not configured` (lines 31–33).
- `verifySignature(...)` recomputes the HMAC over the raw body and compares it to the
  `X-Sophia-Signature` header using a timing-safe comparison (lines 15–28, 36). A bad
  or missing signature returns `401 bad signature` (lines 36–38).
- It then **re-checks the allowlist independently** via
  `isAuthorizedAgent(waNumber)` (line 52). An unauthorized number returns a generic
  `403` deflection that never reveals the allowlist (lines 52–58).
- Only after both checks does it call `runIntent(intent, params)` (line 61) and
  return the result (`200` on success, `422` on a handled failure, `500` on a thrown
  error).

### Defense in depth
The allowlist is enforced **twice**: once in sophia-bot before the request leaves the
bot (`invoice.ts` `isAllowed`), and again in the Vercel route
(`route.ts` `isAuthorizedAgent`). Either layer alone rejects an unauthorized sender;
the HMAC signature additionally proves the request originated from sophia-bot and
wasn't forged against the public Vercel endpoint.

---

## Invoice lifecycle

A document is one of three **kinds** (`DocumentKind`, `lib/invoices/types/invoice.ts:1`):

```
invoice | credit-note | receipt
```

### Approval status (`ApprovalStatus`, invoice.ts:7–16)

```
draft → sent-to-marios → approved → numbered → sent-to-accounting
```

Plus the off-happy-path states:

| Status | Meaning |
|---|---|
| `draft` | Created, not yet sent for approval |
| `sent-to-marios` | Queued to Marios for approval |
| `approved` | Marios approved it |
| `numbered` | An official sequence number has been assigned |
| `sent-to-accounting` | Posted to the accounting WhatsApp group |
| `correction-needed` | Flagged for the team to redo |
| `corrected-resend` | Re-issued after a correction |
| `cancelled` | Cancelled |
| `credited` | Cancelled via a credit note |

### Payment status (`PaymentStatus`, invoice.ts:24)

```
not-required | unpaid | paid
```

### Approve flow
File: `lib/invoices/sophia/intent-handlers.ts`, `case "approve"` (lines 187–223)

1. The first `approve` call assigns the **official number**
   (`approveDocumentAction`, line 196) — but only if the document isn't already
   numbered (idempotent guard, line 195).
2. Because no `groupMessage` was supplied, the tool replies asking what message to
   send to the group (lines 204–211).
3. The agent answers, and Sophia calls `approve` **again for the same invoice** with
   `groupMessage` set. That second call posts the PDF to the accounting group via
   `sendDocumentToAccountingGroup(...)` (lines 213–222).

### Edit flow (`case "edit_invoice"`, lines 225–300)
- Applies only the fields the agent changed (description, amount, VAT, due date) and
  merges them onto the current document so a partial edit never wipes other fields
  (lines 243–256).
- **The group is only notified after approval.** Editing an un-approved draft just
  applies the change and waits (lines 270–277). Editing an already-approved invoice
  triggers the same two-step group-message follow-up as approve (lines 281–299).

### Mark paid / issue receipt (`case "mark_paid" / "issue_receipt"`, lines 310–324)
- Both intents call `markPaidAndIssueReceiptAction(...)` (line 315), which marks the
  invoice paid and **creates a receipt** document. The reply names the new receipt's
  draft number.

### Credit note (`case "issue_credit_note"`, lines 326–348)
- A `groupMessage` is **required** before the credit note is issued. If it's missing,
  the tool refuses and asks for the group message first (lines 332–338).
- With the message, `cancelWithCreditNoteAction(...)` (line 339) cancels the invoice
  (status → `credited`) and creates a credit-note document.

### Request correction / resend
- `request_correction` (lines 302–308) calls `correctResendAction(...)` to flag the
  invoice for the team to redo, using `correctionReason`.
- `resend` (lines 350–357) re-issues and re-attaches the PDF.

---

## Sophia intents reference

All 11 intents are defined as `SophiaIntent`
(`lib/invoices/sophia/intent-handlers.ts:17–28`). The triggering agent phrases are the
mappings the prompt teaches Sophia
(`supabase/functions/sophia-bot/prompts/behaviors/invoicing.ts:37–47`).

| Intent | Agent phrase (trigger) | Result |
|---|---|---|
| `create_draft` | "create / draft an invoice for {client}" | Creates a draft invoice (client, amount, vatMode, description, recurrence), default due 30 days; queues to Marios for approval |
| `list_drafts` | "list / show my drafts / open invoices / monthly invoices to review" | Lists up to 10 open drafts (not yet approved/numbered) |
| `query_status` | "what's the status of {invoice}" | Reports status + payment status for the matched invoice |
| `approve` | "approve {invoice}" | Assigns the official number; **two-step** — then asks for a group message and posts the invoice to the accounting group on the follow-up call |
| `edit_invoice` | "edit / change / update / correct the description, amount, VAT, or due date of {invoice}" | Changes the named fields. Before approval: applies and waits. After approval: **two-step** group-message follow-up posts the edited invoice to the group |
| `request_correction` | "this is wrong / flag it for the team to redo" (no specific field) | Marks the invoice `correction-needed` with a reason |
| `mark_paid` | "mark {invoice} paid" | Marks paid and creates a receipt |
| `issue_receipt` | "issue a receipt" | Marks paid and creates a receipt (same handler as `mark_paid`) |
| `issue_credit_note` | "issue a credit note" | **Two-step** — Sophia must first ask "What message should I send to the group with this credit note?", then issue with that `groupMessage`; cancels the invoice via credit note |
| `resend` | "resend / send me the PDF of {invoice}" | Re-issues and attaches the PDF |
| `send_pdf` | "resend / send me the PDF of {invoice}" | Regenerates and attaches the invoice PDF |

### Two-step group-message intents
`approve`, `edit_invoice` (when already approved), and `issue_credit_note` are
**two-call** flows: the first call performs the action and asks Marios what message to
attach for the accounting group; the second call repeats the intent with
`groupMessage` set, which posts the document to the group. Sophia must never invent
official sequence numbers — the system assigns them (`invoicing.ts:51–52`).

---

## Accounting group notification

File: `lib/invoices/actions/whatsapp-status.ts`, `getWhatsAppGroupStatus()`
(lines 24–62)

- The accounting WhatsApp group is identified by env
  `INVOICE_ACCOUNTING_GROUP_MSISDN` (line 25). When unset, `configured` is `false`
  and no document is posted to a group (lines 38–40).
- Reachability is checked **live**: the action queries WasenderAPI for the session
  status (`getSessionStatus`, line 33), and — when the session is connected —
  confirms the group JID itself is reachable and resolves the group name via
  `getGroupMetadata` (lines 46–50).
- The JID is normalized to `{number}@g.us` if it isn't already in that form
  (line 46).
- The check is **best-effort and defensive** — any failure resolves to
  `connected: false` with a human-readable reason rather than throwing (lines 51–60).

### Diagnosing "the invoice didn't reach the group"
1. **Is the group configured?** Confirm `INVOICE_ACCOUNTING_GROUP_MSISDN` is set on
   Vercel (value not shown here — see
   [`./invoicing-env-reference.md`](./invoicing-env-reference.md)). If unset,
   `getWhatsAppGroupStatus()` reports `No group configured`.
2. **Is the WhatsApp session live?** If `sessionStatus` is not `connected`
   (e.g. `need_scan`), the session must be re-linked before any group message sends.
3. **Did the agent complete the two-step flow?** For `approve` / `edit_invoice` /
   `issue_credit_note`, the document is only posted on the **second** call that
   carries `groupMessage`. If the agent never answered the "what message?" prompt,
   the document was never sent to the group.
4. **Is the JID reachable?** A live session with an unreachable JID reports
   "Session live, but the group JID wasn't reachable" — re-verify the MSISDN value.

---

## Quick reference

| Resource | Location |
|---|---|
| Intent handlers (all 11 intents) | `lib/invoices/sophia/intent-handlers.ts` |
| WhatsApp → Vercel route | `app/api/sophia/intent/route.ts` |
| Bridge (HMAC sign, outbound) | `supabase/functions/sophia-bot/services/invoice-bridge.ts` |
| `manageInvoice` tool (allowlist) | `supabase/functions/sophia-bot/tools/handlers/invoice.ts` |
| Sophia invoicing prompt (phrase → intent) | `supabase/functions/sophia-bot/prompts/behaviors/invoicing.ts` |
| Invoice document types & statuses | `lib/invoices/types/invoice.ts` |
| Invoice Supabase client (server-only) | `lib/invoices/supabase/server.ts` |
| Invoice tables & buckets | `lib/invoices/supabase/schema.ts` |
| Accounting-group status check | `lib/invoices/actions/whatsapp-status.ts` |
| Environment variable reference | [`./invoicing-env-reference.md`](./invoicing-env-reference.md) |
| Allowlist (who can invoice) | [`./invoicing-allowlist.md`](./invoicing-allowlist.md) |

---

**Last Updated**: 2026-06-21
**Maintainers**: SOFIA Development Team
**Status**: ✅ Production
