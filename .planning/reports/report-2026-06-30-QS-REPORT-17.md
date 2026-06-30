# Session Report — 2026-06-30 (M10 Marios Invoicing Hardening)

**Project:** sofiatesting
**Employee:** Fawzi Goussous (OWNER)
**Branch:** main (via feature/m10-marios-invoicing-hardening)
**Phase:** M10 — Marios Invoicing Hardening (shipped)
**Date:** 2026-06-30

## What Was Done
- Studied the CSC Zyprus meeting (Read.ai `01KWBZ00NMSQX6ZYP8Q0V44PQE`, Marios + Moayad + Fawzi) and mapped all 30 of Marios's requests (the meeting action-items = Moayad's end-of-call list) against the current code. Why: turn the meeting into a verifiable work list.
- Ran a 4-cluster production review of Moayad's invoice work; found 5 CRITICAL + 9 HIGH defects, several matching Marios's flagged bugs. Why: invoicing handles real money — needed evidence, not vibes. Report: `.planning/reports/review/REVIEW-2026-06-30-marios-invoicing.md`.
- Fixed the money path: included-VAT rounding (subtotal+VAT==total), Marios always CC'd (BCC on recurring) + optional reply-to, manual invoice-number collisions now reject instead of silently overwriting, atomic RPC numbering on the approval happy path, draft-aware receipt/credit-note numbering, accounting-group send 429 retry. Why: close the CRITICAL/HIGH money defects.
- Fixed the Sophia path: commission agent name persisted end-to-end (no more unattributed group posts), approve auto-emails + surfaces failures honestly, mapVat no longer defaults to +19%, group re-post deduped, allowlist aligned (Moayad), amendment-message/"amend" prompt wording. Why: Marios's edit/amend + auto-send requests + attribution integrity.
- Hardened the admin panel: every action path crash-proofed, recipient email validated, double-send/double-approve blocked, MonthlyRun carries source VAT mode, visible draft number before approval, richer/clickable history. Why: Marios's UI requests + the "crashes on failed send" defect.
- Added an idempotent schema-reproducibility migration (CREATE TABLE IF NOT EXISTS for 11 invoice tables + the missing enum); RLS enable left commented per OWNER decision. Why: the invoice schema had no in-repo origin.
- Shipped: merged to main, deployed `sophia-bot` edge function + Vercel admin panel, verified (edge fn HTTP 200, web routes healthy 307 auth redirects). Why: Marios is waiting on the live build to start parallel testing.

## Blockers
None blocking. Two config/data follow-ups need OWNER action (below).

## Next Steps
1. **Set `INVOICE_REPLY_TO`** in Vercel prod (e.g. `zyprus@zyprus.com`) to activate the "clients don't reply to Sophia" behavior — code is live but inert until set.
2. **Amend-message prompt wording** lives in the file fallback (`prompts/behaviors/invoicing.ts`); if the `sophia_prompts` DB has an invoicing row it takes precedence — verify and sync the DB row (then clear chat_history) so the new wording actually takes effect.
3. **Smoke-test on WhatsApp**: create a commission invoice → approve → confirm Marios is CC'd, the agent name posts to the accounting group, and the included-VAT total is cent-correct on the PDF.
4. **Tier-2 increment** (deferred): legacy number seed 11517→11518 (needs Marios's final numbers), statement-PDF-by-date-range, mobile/iPhone + Safari logout (device repro), configurable default email body, WhatsApp invoice delivery, live RLS enablement.

## Commits (6)
- 115f035 docs(env): document INVOICE_MARIOS_EMAIL / INVOICE_REPLY_TO / INVOICE_ACCOUNTING_EMAIL
- 06b131b docs(planning): M10 Marios invoicing review + increment scope
- 914b796 chore(invoices/db): idempotent schema-reproducibility migration (RLS deferred)
- f72389a fix(invoices/admin): crash-proof actions, no double-send, recurring VAT carry
- f8b5370 fix(sophia/invoices): persist commission name, honest approve, amend messaging
- 72ff2c7 fix(invoices): money-path hardening — VAT rounding, Marios CC/BCC, safe numbering
