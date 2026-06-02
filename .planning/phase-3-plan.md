# Phase 3 Plan — Sophia tool + intent endpoint

## Overview
Give Sophia a `manageInvoice` tool that drives the embedded invoicing through a signed, idempotent same-origin control plane. Requires sophia-bot tool-system recon (deferred from M8 planning — do first).

## Pre-req recon (do at build start)
- `supabase/functions/sophia-bot/tools/definitions.ts` — tool declaration shape.
- `tools/executor.ts` + `tools/handlers/*` — handler signature + dispatch.
- `services/prompt-loader.ts` — priority ordering; how `prompts/behaviors/*.ts` map to DB rows.
- `utils/wasend.ts` — outbound fetch + circuit-breaker pattern to mirror in `invoice-bridge.ts`.

## Allowlist (resolved from DB)
`INVOICE_AUTHORIZED_AGENTS` (normalized E.164, match on `agents.mobile`):
- Fawzi Goussous `+35799111668`
- Charalambos Pitros `+35799076732`
- Marios Azinas `+35799926648`
(Sophia's own line `+35797935841` is NOT a sender.)

## Waves

### Wave 1
#### `P3-T1` — Intent endpoint
- Files: `app/api/sophia/intent/route.ts`, `lib/invoices/sophia/intent-handlers.ts`
- Action: `POST` handler verifies `X-Sophia-Signature` = HMAC-SHA256(`SOPHIA_BRIDGE_SECRET`, raw body); idempotency via `X-Sophia-Idempotency-Key` (WhatsApp message id, dedup against `invoice_webhook_events` or a small table). Dispatch intents → existing actions: `create_draft`→createDocumentAction, `list_drafts`→loadDocumentsAction, `query_status`→by id, `approve`→approveDocumentAction. Returns `{ ok, documentId, reply, ... }`.
- Validation: `curl` signed POST returns 200 + queued row; unsigned → 401.

#### `P3-T2` — Allowlist constant
- Files: `lib/invoices/constants.ts`
- Action: export `INVOICE_AUTHORIZED_AGENTS` (3 numbers above) + a `normalizeMsisdn` reuse from the agents-admin normalizer.
- Validation: `grep -c "+35799111668\|+35799076732\|+35799926648" lib/invoices/constants.ts` = 3.

### Wave 2 (depends on W1)
#### `P3-T3` — sophia-bot bridge caller
- Files: `supabase/functions/sophia-bot/services/invoice-bridge.ts`
- Action: mirror `utils/wasend.ts` fetch+breaker; HMAC-sign body with `SOPHIA_BRIDGE_SECRET`; POST to `SOPHIA_BRIDGE_URL` (`https://sofiatesting.vercel.app/api/sophia/intent`); return upstream `reply`.
- Validation: function compiles (`deno check` or function deploy dry).

#### `P3-T4` — manageInvoice tool + handler
- Files: `tools/handlers/invoice.ts`, register in `tools/definitions.ts`
- Action: declare `manageInvoice(intent, params)`; handler enforces allowlist on sender msisdn (silent generic deflection if not allowed), calls `invoice-bridge`, returns `reply` to the conversation.
- Validation: tool appears in definitions; unauthorized sender path returns deflection.

#### `P3-T5` — Prompt fragment
- Files: `supabase/functions/sophia-bot/prompts/behaviors/invoicing.ts` + DB row priority 45
- Action: "For invoice/credit-note/receipt requests from authorized agents, call manageInvoice. Never invent invoice numbers — the system assigns them."
- Validation: file exists; prompt-loader merges at priority 45.

### Wave 3
#### `P3-T6` — Live WhatsApp QA + deploy
- Action: provision `SOPHIA_BRIDGE_SECRET` in Vercel + Supabase Edge env; deploy sophia-bot; Fawzi messages "create invoice for client X €500 +VAT"; confirm draft in `/admin/invoices`.
- Validation: draft row created via WhatsApp.

## Owner input required
- `SOPHIA_BRIDGE_SECRET` (I can generate; set in both envs).
- Confirm `SOPHIA_BRIDGE_URL` = production sofiatesting URL.

## Risks
- WasenderAPI inbound sender format (`3579...@s.whatsapp.net`) → normalize before allowlist match.
- Edge Function → Vercel latency; keep 5s timeout + 1 retry.
- Idempotency store choice — reuse `invoice_webhook_events` vs new table.

## Acceptance (maps to ROADMAP P3)
- [ ] signed intent endpoint with idempotency (P3-T1)
- [ ] 4 intents: create/list/query/approve (P3-T1)
- [ ] allowlist enforced (P3-T2, T4)
- [ ] manageInvoice tool + bridge + prompt (P3-T3,T4,T5)
- [ ] live WhatsApp draft creation (P3-T6)
