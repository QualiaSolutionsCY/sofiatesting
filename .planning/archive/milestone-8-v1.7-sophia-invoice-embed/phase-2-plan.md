# Phase 2 Plan — Mutations + queue + manual provider

## Overview
P1 ports the whole app, so the mutation server actions (`lib/invoices/actions/documents.ts`) and queue helpers (`lib/invoices/supabase/integration-repository.ts`) already ship. P2 verifies and hardens the WRITE path: port the vitest suite, prove queue + manual-provider transitions, and wire env so `EMAIL_PROVIDER=manual`/`WHATSAPP_PROVIDER=manual` works end-to-end.

## Waves

### Wave 1
#### `P2-T1` — Port test suite under invoices namespace
- Files: `lib/invoices/**/*.test.ts`, `components/invoices/**/*.test.tsx`
- Action: copy the `*.test.*` files skipped in P1, apply the same ordered import-rewrite sed. Ensure sofiatesting has vitest configured (it lists `vitest` — confirm `vitest.config`); if absent, add a scoped config or run via `npx vitest run lib/invoices`.
- Validation: `npx vitest run lib/invoices` passes (or documents which suites need the invoice DB).

#### `P2-T2` — Confirm queue helpers + manual provider wired
- Files: `lib/invoices/supabase/integration-repository.ts`, `lib/invoices/integrations/manual-provider.ts`
- Action: verify all 6 `queue*` helpers compile against `invoiceDb`; manual-provider selected when `EMAIL_PROVIDER=manual`/`WHATSAPP_PROVIDER=manual`.
- Validation: `grep -c "queueDraftToMarios\|queueAccountingHandoff\|queueClientEmail\|queueReceiptDelivery\|queueCreditNoteDelivery\|queueCorrectedResend" lib/invoices/supabase/integration-repository.ts` = 6.

### Wave 2
#### `P2-T3` — Dashboard mutation smoke (live)
- Action: with `INVOICE_SUPABASE_SERVICE_ROLE` set, create a draft via the UI → confirm row in `invoice_action_queue`; "Send draft" → manual provider marks sent + `invoice_delivery_events` row.
- Validation: SQL: `SELECT count(*) FROM invoice_action_queue WHERE created_at > now() - interval '10 min'` ≥ 1 after action.

#### `P2-T4` — Env reference
- Files: `.env.example`
- Action: add `EMAIL_PROVIDER=manual`, `WHATSAPP_PROVIDER=manual` and the WasenderAPI/Resend placeholders (commented), matching sophiainvoice.
- Validation: keys present.

## Owner input required
- `INVOICE_SUPABASE_SERVICE_ROLE` (for live mutation smoke).

## Risks
- vitest may not be configured in sofiatesting → add minimal config or scope-run.
- Some tests assume sophiainvoice fixtures/paths → adjust imports.

## Acceptance (maps to ROADMAP P2)
- [ ] 6 queue helpers compile + manual provider active (P2-T2)
- [ ] dashboard controls write `invoice_action_queue` + `invoice_delivery_events` (P2-T3)
- [ ] ported vitest suite green (P2-T1)
- [ ] no client leak of `INVOICE_SUPABASE_SERVICE_ROLE` (`npx next build` clean)
