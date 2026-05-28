# ADR-001 — Embed Sophia Invoice into sofiatesting via vendor-port

**Date:** 2026-05-28
**Status:** Accepted
**Owner:** Fawzi Goussous (OWNER)
**Supersedes:** none
**Related repos:**
- `QualiaSolutionsCY/sofiatesting` (this repo)
- `QualiaSolutionsCY/sophiainvoice` (vendor source)

## Context

`sophiainvoice` is a Next.js 16.2.6 + React 19 + TypeScript invoicing app on its own Vercel project, backed by its own Supabase project `tijadsdysuxkxrpdlecq`. It has shipped Milestone 3 / Phase 4: provider-agnostic integration queue, WasenderAPI-compatible webhook parser, dashboard delivery controls, and manual-provider fallback. See `/home/qualia-new/Projects/sophiainvoice/.planning/codebase/README.md`.

The live `sofiatesting` Sophia WhatsApp bot (Supabase Edge Function `sophia-bot`) already uses WasenderAPI via `WASEND_API_KEY` (`supabase/functions/sophia-bot/utils/wasend.ts:15`). One WhatsApp session, one phone number, one accounting group JID.

The OWNER wants: a small number of authorized agents to message the same Sophia about invoicing and have her drive the existing invoice workflow. Two evaluated shapes:

1. **Bridge variant** — keep `sophiainvoice` as a separate Vercel deployment; `sophia-bot` calls it over HTTPS.
2. **Embedded variant** — vendor-port the invoicing UI + API into `sofiatesting`; one Vercel deployment.

## Decision

**Embedded variant.** Vendor-copy `sophiainvoice/src/` into `sofiatesting` under the `(admin)/admin/invoices/*` route group and `lib/invoices/*` namespace. Replace `sophiainvoice`'s hardcoded MVP access-code gate with `sofiatesting`'s NextAuth + role check.

## Locked sub-decisions

| # | Decision | Choice | Notes |
|---|---|---|---|
| 1 | Supabase backends | **Keep two for now, merge later.** | `sofiatesting` continues to use `vceeheaxcrhmpqueudqx`; invoicing code uses a second client `invoiceDb` pointing at `tijadsdysuxkxrpdlecq` via `INVOICE_SUPABASE_URL` + `INVOICE_SUPABASE_SERVICE_ROLE`. Merge is a future ADR. |
| 2 | Code transport | **Vendor-copy.** | One-time lift-and-shift, no monorepo. After P4 ships, `sophiainvoice` GitHub repo is archived. |
| 3 | Authorized agents (initial allowlist) | **Fawzi only.** | Encoded in `config/business-rules.ts` as `INVOICE_AUTHORIZED_AGENTS`. Marios + Charalambous added in a later phase once the wiring is proven. |
| 4 | `sophiainvoice` Vercel project | **Archive after P4 ships.** | Saves a deployment slot, prevents drift, single source of truth. GitHub repo stays private-archived for history. |

## Architecture

```
WasenderAPI (one session)
  │
  ├── outbound  ←── /api/sophia/intent (NEW, same-origin) ← sophia-bot tool manageInvoice
  │                  │
  │                  └── lib/invoices/supabase/integration-repository.ts (vendor-ported)
  │                        └── invoiceDb → tijadsdysuxkxrpdlecq
  │
  └── inbound  ──→ sophia-bot webhook ──→ if invoice thread: forward
                                          to /api/integrations/webhooks (NEW, same-origin)
                                          → existing webhook-parser
```

URLs after port:
- `sofiatesting.vercel.app/admin/invoices` — invoice dashboard
- `sofiatesting.vercel.app/api/sophia/intent` — Sophia control plane (HMAC-signed)
- `sofiatesting.vercel.app/api/integrations/webhooks` — Marios reply ingest

## Security posture

- `sophia-bot` (Supabase Edge Function) → Vercel API route is **cross-service**, so HMAC stays: `X-Sophia-Signature: hmac_sha256(SOPHIA_BRIDGE_SECRET, body)` and `X-Sophia-Idempotency-Key: {whatsapp_message_id}`.
- `INVOICE_SUPABASE_SERVICE_ROLE` is server-only — enforced via `no-restricted-imports` lint rule (`lib/invoices/supabase/server.ts` must never be imported from a `'use client'` file).
- Allowlist check happens twice: once in `sophia-bot` before calling the bridge, once in `/api/sophia/intent` before queueing.
- `INVOICE_AUTHORIZED_AGENTS` is by WhatsApp phone number; matched against `agents` table for `agent_id` resolution.

## Phasing

| Phase | Scope | Ship gate |
|---|---|---|
| **P1** | Port read-only: `lib/invoices/*`, `components/invoices/*`, `/admin/invoices` list + detail. NextAuth-gated. `invoiceDb` client. | typecheck + build + page loads, lists docs from `tijadsdysuxkxrpdlecq`. |
| **P2** | Mutations: server actions, `integration-repository`, manual-provider. Queue rows written through the dashboard. | Create draft → queue row in `invoice_action_queue` → manual-provider marks sent. |
| **P3** | Sophia tool + intent endpoint. Intents: `create_draft`, `list_drafts`, `query_status`, `approve`. Allowlist = Fawzi. | Live WhatsApp: Fawzi creates a draft via Sophia, sees row in `/admin/invoices`. |
| **P4** | Marios reply forwarding to `/api/integrations/webhooks` + remaining intents (`request_correction`, `mark_paid`, `issue_receipt`, `issue_credit_note`, `resend`). Then archive `sophiainvoice` Vercel project. | Full WhatsApp lifecycle end-to-end. |

## Out of scope for this milestone

- Supabase backend merge (future ADR).
- Marios / Charalambous in the allowlist (added by config change, not architecture).
- Final client-provided invoice numbering algorithm.
- Production PDF generation pipeline (browser print stays for now).
- Replacing `sophiainvoice`'s OKLCH design tokens with sofiatesting's design system (cosmetic, deferred).

## Consequences

**Positive**
- One Vercel project, one URL, one login surface for agents.
- Sophia gains invoicing capability without a second WhatsApp number.
- Sophiainvoice's M3 integration queue (the hard-earned audit/retry/webhook spine) is preserved verbatim.

**Negative**
- `sofiatesting` build time grows ~2,500 LOC and the invoicing test suite.
- Two Supabase projects live in one Next.js app — discipline required (lint rule + naming convention).
- A bad `sofiatesting` deploy now also takes invoicing down. Mitigation: route-group isolation and Vercel preview on every PR.

## Reversal cost

Low. The vendor-port is contained under `lib/invoices/*`, `components/invoices/*`, and `app/(admin)/admin/invoices/*`. A future "split back out" is a `git mv` exercise. The shared dependency is `INVOICE_SUPABASE_*` env + the bridge secret — both portable.
