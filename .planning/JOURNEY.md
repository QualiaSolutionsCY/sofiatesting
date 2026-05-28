# Journey — sofiatesting

## Project Type

Full project — Zyprus Sophia WhatsApp/email assistant + admin panel.

## Milestone Arc

| # | Milestone | Status | Phases | Closed |
|---|-----------|--------|--------|--------|
| 1 | v1.0 MVP — Core SOPHIA | CLOSED | 1-5 | 2026-01-27 |
| 2 | v1.1 Reliability & Hardening | CLOSED | 6-9 | 2026-01-29 |
| 3 | v1.2 3CX Call Log Audit | CLOSED | 10-14 | 2026-02-26 |
| 4 | v1.3 Production Audit Fixes | CLOSED | 15-17 | 2026-02-28 |
| 5 | v1.4 Security & Performance Hardening | CLOSED | 18-20 | 2026-03-01 |
| 6 | v1.5 Audit Excellence | CLOSED | 21-25 | 2026-03-02 |
| 7 | v1.6 Upload Pipeline Production Hardening | CLOSED | 26-27 | 2026-03-20 |
| 8 | **v1.7 Sophia Invoice Embed** | **CURRENT** | 1-4 | - |
| 9 | Handoff | OPEN | rolling | - |

> Milestones 1–7 are the historical shipped record (compressed view; the per-phase artifacts live in `.planning/archive/` if needed). Milestone 8 is the active port of `sophiainvoice` into this Vercel project per `.planning/decisions/001-sophiainvoice-embedded-port.md`.

---

## Milestone 8: v1.7 Sophia Invoice Embed (CURRENT)

**Why now:** `sophiainvoice` shipped its own Milestone 3 (provider-agnostic integration queue, WasenderAPI-compatible webhook parser, dashboard delivery controls). With sophia-bot already on WasenderAPI in this repo, the cleanest next step is to vendor-port the invoicing UI + API into `sofiatesting` so the same Sophia, the same WhatsApp number, and the same authorized agents drive invoicing without a second deployment.

**Goal:** `sofiatesting.vercel.app/admin/invoices` is the live invoicing surface; Sophia can create/list/approve invoice drafts on WhatsApp for the authorized allowlist; Marios's replies feed the existing approval workflow; `sophiainvoice` Vercel project is archived.

**Locked decisions (ADR-001):**
- Two Supabase backends for now (sofiatesting `vceeheaxcrhmpqueudqx` + invoicing `tijadsdysuxkxrpdlecq`). Merge is a future ADR.
- Vendor-copy from `sophiainvoice` repo into this repo (no monorepo, no workspace package).
- Authorized allowlist starts with **Fawzi only** — Marios/Charalambous added in a config-only change later.
- `sophiainvoice` Vercel project archived after P4 ships.

### Phases

1. **Read-only port**
   - Lift `lib/invoices/*`, `components/invoices/*`, and `app/(admin)/admin/invoices/*` (list + detail routes).
   - Wire second Supabase client `invoiceDb` (env: `INVOICE_SUPABASE_URL`, `INVOICE_SUPABASE_SERVICE_ROLE`).
   - Replace `sophiainvoice` access-code gate with NextAuth + `invoicing` role.
   - Add `no-restricted-imports` lint rule preventing `'use client'` files from importing `lib/invoices/supabase/server`.

2. **Mutations + queue + manual provider**
   - Port server actions, `integration-repository`, `manual-provider`.
   - Wire dashboard "Send draft", "Forward", "Mark paid" controls to the queue.
   - Tests pass for queue/delivery transitions.

3. **Sophia tool + intent endpoint**
   - `POST /api/sophia/intent` with HMAC verification, idempotency by WhatsApp message id.
   - `manageInvoice` tool in `sophia-bot` with intents: `create_draft`, `list_drafts`, `query_status`, `approve`.
   - Allowlist = Fawzi only (`config/business-rules.ts` → `INVOICE_AUTHORIZED_AGENTS`).
   - Prompt fragment at priority 45 ("for invoice intents from authorized agents, call manageInvoice").

4. **Marios reply forwarding + remaining intents + archive**
   - `sophia-bot` forwards Marios replies on invoice threads to `/api/integrations/webhooks`.
   - Add intents: `request_correction`, `mark_paid`, `issue_receipt`, `issue_credit_note`, `resend`.
   - End-to-end WhatsApp lifecycle verified.
   - Archive `sophiainvoice` Vercel project.

**Exit criteria:** typecheck/build green; `/admin/invoices` reads + writes against `tijadsdysuxkxrpdlecq`; live WhatsApp QA shows Fawzi creating + approving a draft end-to-end through Sophia; `sophiainvoice` Vercel project archived.

---

## Milestone 9: Handoff (OPEN)

**Goal:** Final production-readiness pass + client documentation for the unified Sophia + invoicing system.

Standard 4-phase Handoff template:

1. **Polish** — UX consistency, design tokens, copy, microcopy.
2. **Content + SEO** — admin docs, runbook, env reference, agent allowlist documentation.
3. **Final QA** — full regression (Sophia property uploads + invoicing) on staging + prod.
4. **Handoff** — credentials reference, walkthrough, archival of legacy `sophiainvoice` repo, final ERP closure.
