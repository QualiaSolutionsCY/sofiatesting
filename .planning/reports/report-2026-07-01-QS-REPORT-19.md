# Session Report — 2026-07-01 (QS-REPORT-19)

**Project:** sofiatesting
**Employee:** Moayad
**Branch:** main (shipped — feature/m11-marios-invoicing-hardening-ii integrated + closed)
**Phase:** Handoff — increment M11 "Marios Invoicing Hardening II" shipped
**Date:** 2026-07-01

## What Was Done
- Built and shipped **M11 — Marios Invoicing Hardening II**: 14 planned items from the 30-06 CSC Zyprus meeting (30-item request table) plus Marios's live-testing feedback. Why: close every invoicing gap Marios flagged.
- Fixed the **email/delivery path**: one CSC Zyprus letterhead as the default body everywhere (client-delivery compose, panel "Send email", Sophia-over-WhatsApp), auto-send on admin approval, and the amend flow now sends the corrected PDF to the accounting group AND Marios with a default "ignore the previous invoice" message. Why: Marios's delivery asks (items 1, 8).
- Fixed the **duplicate email** (Marios got two, one without the PDF): the webhook double-send guard now also skips the `detectEmailSendingIntent` heuristic when `manageInvoice` ran. Added a "Sophia is AI" line and a **bold** "please don't reply" via an HTML email twin. Why: live-test feedback.
- Built **admin features**: statements export (PDF + XLS, structured ledger), live preview in the template editor, top-bar document search, single "All Invoices" filter, deduped + expandable history. Why: Marios's UI requests (items 4, 5, 6, 7, 10).
- Fixed **recurring + workflow**: source edits reflect in the upcoming run preview (stale-draft override); 15s panel auto-refresh; newest→oldest list sort; editable client delivery before approval; route error boundary for logout; auto-send-on-approval wired to the panel (and stopped a Sophia double-send). Why: Marios's workflow feedback (items 2, 3, 9, 11-14 + follow-ups).
- Hardened the **sophia-bot deploy**: switched `index.ts` to built-in `Deno.serve`, dropping the `deno.land/std` http import that was timing out the bundler. Why: unblock the edge deploy during a deno.land outage.
- **Shipped**: integrated to `main` (c8e7a02), deployed Vercel + `sophia-bot`, set `INVOICE_MARIOS_EMAIL` + `INVOICE_REPLY_TO` = marios@zyprus.com in prod, verified (panel HTTP 307 auth-redirect, `sophia-bot /health` 200) and ran a live e2e + create→approve→email/WhatsApp test via Claude-in-Chrome.

## Blockers
None blocking. deno.land outage temporarily blocked the edge deploy — resolved by moving to `Deno.serve`.

## Next Steps
1. Marios continues live testing on WhatsApp + the panel (email dedup, letterhead+AI+bold, amend flow, newest-first list).
2. Optional cleanup: cancel/delete the test invoice № 11478 ("TEST — Moayad, please ignore").
3. Tier-3 deferred: legacy number seed (needs Marios's final numbers), mobile/Safari device repro, live RLS enablement on invoice tables.

## Commits (17)
- c8e7a02 chore(planning): M11 session tracking state
- 0373938 fix(sophia/deploy): built-in Deno.serve, drop deno.land/std http import
- 2c43518 fix(invoices/email+list): no duplicate email, Sophia-is-AI + bold no-reply, newest-first sort
- 048ab58 fix(invoices/panel): live auto-refresh, drafts-first in All Invoices, editable delivery pre-approval
- d327c4e fix(invoices/recurring): source edit reflects in the upcoming run preview
- 844f93b fix(invoices): auto-send client email on panel approval (+ stop Sophia double-send)
- b3c8fc8 report: QS-REPORT-18 session 2026-07-01
- fb52a77 feat(invoices/statements): clearer, more structured statement PDF/XLS (item 14)
- cfeba87 fix(invoices/ui): client-delivery letterhead, expandable history, drop 'All caught up'
- 68df6df feat(invoices/template): live preview in the template editor (item 10)
- 9443d7d feat(invoices/statements): download account statements as PDF or XLS (item 7)
- c8fd20a fix(invoices/auth): route error boundary + hardened logout (item 9)
- e4ccf60 feat(invoices/admin): top-bar doc search, single 'All Invoices' filter, fixed history
- fde916e feat(invoices/sophia): amend flow sends corrected PDF to group AND Marios + default message
- 4c7cc76 feat(invoices/email): CSC letterhead as the one default body + auto-send on approval
- 62bc559 docs(planning): M11 Marios invoicing hardening II — scope + waves
- 0c0f690 chore(sophia): upgrade chat/vision model Sonnet 4.6 → Sonnet 5
