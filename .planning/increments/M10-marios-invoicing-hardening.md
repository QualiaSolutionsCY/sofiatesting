# M10 — Marios Invoicing Hardening

Source: CSC Zyprus meeting (Read.ai `01KWBZ00NMSQX6ZYP8Q0V44PQE`, Marios + Moayad + Fawzi) + production review `.planning/reports/review/REVIEW-2026-06-30-marios-invoicing.md`.

Scope decision (OWNER, 2026-06-30): **Tier-1** = all confirmed CRITICAL/HIGH bugs + Marios requests that are broken or completable in code. Defer Tier-2 (legacy-number seed → needs his final numbers; mobile/Safari repro → needs device; statement-PDF-by-date-range; WhatsApp delivery → Marios said longer-term). Schema/RLS: **add idempotent migration file, do NOT enable RLS on live this pass.**

## Builders (conflict-free file ownership)

### B1 — VAT + numbering math  (`lib/invoices/document-actions.ts`, `lib/invoices/numbering.ts`)
- Fix `included-vat`: `net = roundMoney(amount/1.19)`; `vatAmount = roundMoney(amount - net)`; so subtotal+vat == total by construction. (CRITICAL; Marios #8)
- Receipts/credit-notes route through draft-aware numbering (same as `officialNumberOnApproval`), not the floor-only `getNextOfficialNumber`. (HIGH)
- Draft number year derives from `issueDate`, not `now`. (LOW)

### B2 — Email + numbering safety + group retry  (`lib/invoices/actions/documents.ts`, `lib/invoices/supabase/document-repository.ts`)
- `sendInvoiceEmailAction`: **keep the `(id, toList)` signature**; internally always CC Marios from `process.env.INVOICE_MARIOS_EMAIL`; for monthly/recurring use **BCC** instead of CC; add `reply_to` from `process.env.INVOICE_REPLY_TO` so recipients don't reply to the AI sender. (CRITICAL #4, Marios #4/#5/#3)
- `applyOfficialNumberAction` (manual entry): on collision **reject with explicit error**, do NOT silently reallocate. (CRITICAL #20)
- Auto/approval numbering: mint via `allocate_official_number` RPC on the happy path (not only on 23505 collision). (HIGH)
- `sendDocumentToAccountingGroup`: add the same bounded 429 retry the Marios leg has. (HIGH)

### B3 — Sophia path  (`lib/invoices/sophia/intent-handlers.ts`, `supabase/functions/sophia-bot/tools/handlers/invoice.ts`, `tools/definitions.ts`, `prompts/behaviors/invoicing.ts`)
- Persist commission agent name: add `commissionPersonName` to `create_draft` schema + pass into DocumentInput (the field/column already exist). (CRITICAL #2)
- Stop hardcoding `marios@zyprus.com`; rely on B2's internal CC (call `sendInvoiceEmailAction(id, [clientEmail])`). (HIGH/MEDIUM)
- Approve auto-emails ALL kinds incl yearly, and **surfaces** a client-email send failure in the reply (no false success). (HIGH; Marios #1/#14)
- `mapVat`: reject/clarify unknown `vatMode` instead of defaulting to plus-vat. (MEDIUM)
- Dedupe accounting-group re-post on re-approval. (MEDIUM)
- Align `manageInvoice` allowlist with the tool description (Moayad). (HIGH)
- Prompt: default amendment message ("please ignore the previous invoice…"), reply-to wording, "amend" vs "edit", record edit reason, document `edit_invoice`. (Marios #9/#10/#11/#12)
- Verify which of `lib/invoices/sophia` vs `supabase/functions/sophia-bot` is the live WhatsApp path; fix both where the defect exists.

### B4 — Frontend hardening  (`components/invoices/redesign/**`)
- Wrap ALL unguarded `startTransition` action paths in `App.tsx` (`:333,348,355,372,469,478,517,636,644,678`) in try/catch + toast + `refetchDocuments()`. (HIGH)
- Validate editable recipient email (regex) in `client-edit-email` + re-check in `client-send-all`. (HIGH)
- Expose `isPending` from `useTransition`; disable primary CTA + delivery buttons + Composer submit while pending (no double-send/approve). (HIGH)
- MonthlyRun: carry source `vatMode`/`vatRate` into the run row + `createDocumentAction` instead of hardcoding plus-vat 19%. (MEDIUM)
- Composer: store `unitPrice` as `Number`; stop stuffing official № into the `due` date field. (MEDIUM)
- DetailPane: drive `saveState` from the real action result (not 600ms timer); show visible draft number before approval (Marios #19); richer/clickable history — issued date, receipt link, action summary (Marios #16/#17); default `Timeline` events to `[]`.
- Verify invoices-only default tab + free-text search field coverage (description/property/date/partial). (Marios #21/#22)

### B5 — Schema reproducibility migration  (`supabase/migrations/`)
- New idempotent `CREATE TABLE IF NOT EXISTS` for every invoice table (reconstruct columns from `lib/invoices/supabase/document-mappers.ts` + existing ALTERs) + service-role policy statements **guarded/idempotent**. **Do NOT `ENABLE ROW LEVEL SECURITY`** on live tables this pass — leave a clearly-commented follow-up block. No-op on prod (tables already exist). (CRITICAL #5, partial)

## Definition of Done
- `npx tsc --noEmit` = 0 errors.
- Each fix verifiable by grep/read against the finding.
- `npx supabase` edge-fn deploy succeeds for sophia-bot.
- Verify pass + targeted tests green, then `/qualia-ship` + `/qualia-report`.

## Deferred (Tier-2, next increment)
Legacy number seed 11517→11518 (needs Marios's numbers); mobile iPhone search/buttons + Safari logout (device repro); statement PDF by date range + remove-button/add-statement UI; configurable default email BODY text (needs Marios's wording); WhatsApp invoice delivery; enabling RLS on live invoice tables.
