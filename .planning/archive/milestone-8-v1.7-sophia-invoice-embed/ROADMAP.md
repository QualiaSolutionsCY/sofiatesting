# Roadmap

## Current Milestone

**Milestone 8 — v1.7 Sophia Invoice Embed**

Source of truth: `.planning/JOURNEY.md` (full arc) and `.planning/decisions/001-sophiainvoice-embedded-port.md` (locked architecture).

## Why Now

`sophiainvoice` shipped its own Milestone 3: provider-agnostic integration queue, WasenderAPI-compatible webhook parser, dashboard delivery controls, manual-provider fallback. `sofiatesting`'s `sophia-bot` already uses WasenderAPI (`supabase/functions/sophia-bot/utils/wasend.ts:15`). The cleanest next step is to vendor-port the invoicing UI + API into this repo so the same Sophia, same WhatsApp session, same authorized agents drive invoicing — no second deployment, no second login.

## Phase 1: Read-only port

### Goal

Land the invoicing UI + lib in `sofiatesting` behind NextAuth, reading from `tijadsdysuxkxrpdlecq` via a dedicated Supabase client. No mutations yet.

### Success criteria

- `lib/invoices/*`, `components/invoices/*`, `app/(admin)/admin/invoices/page.tsx`, `app/(admin)/admin/invoices/[id]/page.tsx` exist (vendor-copied from `sophiainvoice/src/`).
- `lib/invoices/supabase/server.ts` exports `invoiceDb` using `INVOICE_SUPABASE_URL` + `INVOICE_SUPABASE_SERVICE_ROLE` env vars; never imported from `'use client'` files.
- ESLint rule (`no-restricted-imports`) enforces the boundary.
- NextAuth `invoicing` role gates `/admin/invoices/*` — unauthenticated/unauthorized users redirected.
- `npm run typecheck` and `next build` pass.
- `/admin/invoices` lists existing documents from `tijadsdysuxkxrpdlecq` in production preview.

### Dependencies

- ADR-001 (decisions/001-sophiainvoice-embedded-port.md).
- `sophiainvoice` Supabase project `tijadsdysuxkxrpdlecq` reachable with its service-role key.
- NextAuth in `sofiatesting` supports role claims.

---

## Phase 2: Mutations + queue + manual provider

### Goal

Port `integration-repository`, server actions, and `manual-provider` so the dashboard can create drafts, queue Marios handoffs, mark paid, and issue receipts — all without real WhatsApp/email yet.

### Success criteria

- `lib/invoices/supabase/integration-repository.ts` ported with all 6 queue helpers (`queueDraftToMarios`, `queueAccountingHandoff`, `queueCorrectedResend`, `queueClientEmail`, `queueReceiptDelivery`, `queueCreditNoteDelivery`).
- `lib/invoices/integrations/manual-provider.ts` ported and selected when `EMAIL_PROVIDER=manual` or `WHATSAPP_PROVIDER=manual`.
- Dashboard controls (Send draft / Forward / Mark paid / Correct resend) write to `invoice_action_queue` + `invoice_delivery_events`.
- Vitest suite for `integration-repository` + `document-actions` + `format` + `numbering` ported and green.
- `next build` succeeds; no client-side leak of `INVOICE_SUPABASE_SERVICE_ROLE`.

### Dependencies

- Phase 1 complete.

---

## Phase 3: Sophia tool + intent endpoint

### Goal

Give Sophia a `manageInvoice` tool that drives the embedded invoicing through a signed, idempotent control plane.

### Success criteria

- `app/api/sophia/intent/route.ts` exists; verifies `X-Sophia-Signature` (HMAC-SHA256 with `SOPHIA_BRIDGE_SECRET`); enforces idempotency by `X-Sophia-Idempotency-Key` (WhatsApp message id).
- Handler supports intents: `create_draft`, `list_drafts`, `query_status`, `approve`.
- `config/business-rules.ts` exports `INVOICE_AUTHORIZED_AGENTS = [<Fawzi's WhatsApp>]`.
- `supabase/functions/sophia-bot/services/invoice-bridge.ts` (new) — HMAC-signs and POSTs to `/api/sophia/intent`.
- `supabase/functions/sophia-bot/tools/handlers/invoice.ts` + `tools/definitions.ts` registration — new `manageInvoice` tool. Rejects silently when actor ∉ allowlist.
- Prompt fragment in `supabase/functions/sophia-bot/prompts/behaviors/invoicing.ts` + DB row at priority 45.
- Live WhatsApp QA: Fawzi creates a draft via Sophia; row visible in `/admin/invoices`.

### Dependencies

- Phase 2 complete.
- `SOPHIA_BRIDGE_SECRET` provisioned in both Vercel and Supabase Edge Function env.

---

## Phase 4: Marios reply forwarding + remaining intents + archive

### Goal

Close the loop: Marios's WhatsApp replies feed the existing approval workflow, the intent set covers full lifecycle, and `sophiainvoice` Vercel project is archived.

### Success criteria

- `sophia-bot` inbound webhook detects invoice-thread replies and forwards a normalized payload to `/api/integrations/webhooks` in the same deployment.
- `app/api/integrations/webhooks/route.ts` ported and live; webhook-parser handles approval/rejection/correction/unknown.
- Intents added: `request_correction`, `mark_paid`, `issue_receipt`, `issue_credit_note`, `resend`.
- End-to-end live WhatsApp lifecycle verified by Fawzi: create draft → Marios approves on WhatsApp → official number applied → client email queued → accounting forward queued.
- `sophiainvoice` Vercel project archived; GitHub repo set to archived state.
- Post-deploy 8-check passes on `sofiatesting.vercel.app` per `rules/deployment.md`.

### Dependencies

- Phase 3 complete.
- WasenderAPI inbound webhook points at `sophia-bot` (already the case).

---

## Milestone 8 Exit Criteria

- `npm run typecheck` and `next build` green on `sofiatesting`.
- `/admin/invoices` reads + writes against `tijadsdysuxkxrpdlecq` in production.
- Sophia handles all 9 invoice intents on WhatsApp for the Fawzi allowlist.
- Marios's WhatsApp approval/rejection moves invoice state correctly.
- `sophiainvoice` Vercel project archived; this repo is the single source of truth.
- ADR-001 unchanged (no architectural drift during build).
