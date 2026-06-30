# Production Review — Marios Invoicing (Moayad's changes) — 2026-06-30

Scope: all of Moayad's invoice work now in `main` (admin panel + `lib/invoices` + Sophia edge function + 2 migrations), cross-referenced against Marios's requests from the **CSC Zyprus Property Group** meeting (Read.ai `01KWBZ00NMSQX6ZYP8Q0V44PQE`, Marios + Moayad + Fawzi).

## Summary
| Category | Critical | High | Medium | Low | Score |
|----------|:--:|:--:|:--:|:--:|:--:|
| Sophia AI invoice path | 2 | 3 | 3 | 2 | 2/5 |
| Core / PDF / numbering | 2 | 2 | 3 | 2 | 2/5 |
| Admin frontend | 0 | 3 | 6 | 3 | 2/5 |
| Migrations / delivery | 1 | 1 | 2 | 1 | 3/5 |
| **Total** | **5** | **9** | **14** | **8** | **2/5** |

Baseline deterministic scans (invoice scope): **0 TS errors, no `service_role` leak, no empty catch, no `any`, no `console.log`, no `dangerouslySetInnerHTML`.** The risk is behavioural correctness on the money path, not hygiene.

## Findings

### CRITICAL
- **Marios silently never CC'd on emailed invoices** — `lib/invoices/actions/documents.ts:455-459` — `sendInvoiceEmailAction` sends `to: toList` with **no `cc`**; recurring path explicitly excludes Marios (`lib/invoices/sophia/intent-handlers.ts:152-153`). Marios's #4 ask broken. Fix: env-sourced Marios CC/BCC on every invoice email.
- **Commission agent name never persisted** — `lib/invoices/sophia/intent-handlers.ts:203-217` — `create_draft` never stores `commissionPersonName`; `stripAgentName` scrubs it from the description (`:210`); approval caption falls back to empty (`:292-296`). Group post can land with no agent attribution. Fix: persist the name on the draft, use as caption fallback.
- **VAT `included-vat` net computed unrounded** — `lib/invoices/document-actions.ts:40-42` — `net = amount/1.19` never rounded/stored; PDF re-derives `subtotal = total − vatAmount` (`pdf.ts:221`), leaving sub-cent VAT reconciliation drift on a legal tax doc. This is **exactly Marios's "including VAT vs plus VAT" bug**. Fix: `net = roundMoney(amount/1.19)`, derive vat from rounded net.
- **Manual official-number entry silently overwritten on collision** — `lib/invoices/actions/documents.ts:271-280` + `document-repository.ts:117-127` — operator-typed legal number that collides is auto-reallocated to a different RPC number, returns success with no warning. Fix: manual path rejects on collision; auto path keeps reallocation.
- **No in-repo `CREATE TABLE` / RLS for invoice tables** — `supabase/migrations/` — only `ALTER`s exist (`20260617121000_security_advisor_hardening.sql:39`, `20260623120000_invoice_soft_delete.sql:6`); schema is non-reproducible and RLS unprovable from the repo. Fix: add idempotent `CREATE TABLE IF NOT EXISTS` + `ENABLE RLS` + service-role policies migration. **(Apply to live DB with care — tables already exist.)**

### HIGH
- **~10 unguarded `startTransition` action paths still crash on a failed send** — `components/invoices/redesign/App.tsx:333-342, 348-354, 355-362, 372-378, 469-474, 478-484, 517-523, 636-642, 644-652, 678-688` — no try/catch → unhandled rejection, UI stalls. The "no longer crash" fix only covered 5 paths. Fix: wrap each in try/catch + toast + `refetchDocuments()`.
- **Editable recipient email never validated** — `components/invoices/redesign/App.tsx:567-576, 608-627` — inline override stored verbatim, passed straight to send. Fix: regex-validate before send.
- **Double-send / double-approve on rapid clicks** — `DetailPane.tsx:821-824`, `App.tsx:133` discards `isPending`. Two fast clicks → double `approveDocumentAction` (double number / double WhatsApp post). Fix: expose `isPending`, disable CTAs while pending.
- **Official number minted from stale in-app list, RPC only on collision** — `lib/invoices/actions/documents.ts:250-253, 502-505, 538-541`; `numbering.ts:53-65` — `Math.max+1` over possibly-stale array; atomic `allocate_official_number` RPC exists but only runs after a 23505. Fix: call RPC on the happy path.
- **Receipt/credit-note numbering floor can regress below draft sequence** — `lib/invoices/numbering.ts:53-65` vs `documents.ts:504,540` — `getNextOfficialNumber` ignores draft numbers; invoices use `officialNumberOnApproval` but receipts/credit-notes don't. Fix: route all kinds through draft-aware numbering.
- **Approve-path reports success it can't confirm** — `lib/invoices/sophia/intent-handlers.ts:307-313` (client email swallowed), `tools/handlers/invoice.ts:180-194` (Marios DM best-effort, discarded) while reply says "Sent Marios his copy". Fix: surface real send outcomes.
- **Accounting-group send has no 429 retry** — `lib/invoices/actions/documents.ts:625, 631-636` — single-shot while the Marios leg retries (`:213`); group send runs first so eats the first 429. Fix: same bounded retry on the group path.
- **`manageInvoice` allowlist vs tool description disagree on Moayad** — `tools/handlers/invoice.ts:27-28` (allows `99687499`) vs `tools/definitions.ts:725` ("Fawzi, Marios, Charalambos"). Fix: align.
- **Hardcoded `marios@zyprus.com` CC contradicts env policy** — `intent-handlers.ts:308` vs the env-driven path at `:155` / `documents.ts:749`. Fix: env var.

### MEDIUM (selected)
- VAT `mapVat` defaults any unknown token to `plus-vat` (most expensive default) — `intent-handlers.ts:71-75`.
- MonthlyRun hardcodes `vatMode:"plus-vat"` / `vatRate:19` — `App.tsx:1000, 1058-1059` — a `no-vat`/`included-vat` recurring invoice is re-issued with 19% on top; preview total diverges from issued total.
- Re-approval re-posts PDF to the accounting group a 2nd time — `intent-handlers.ts:281-297`.
- Inline save shows "Saved" on a 600ms timer regardless of real result — `DetailPane.tsx:201-213`.
- Composer `unitPrice` stored as string into a `number` field — `Composer.tsx:154-155`.
- `selectInvoiceForSource` stuffs official number into the date `due` field — `Composer.tsx:244`.
- `statusLabel` no fallback for unmapped status — `format.ts:30-44`.
- Soft-delete relies on app-level `.is("deleted_at", null)` filter, no DB-level guarantee — `document-repository.ts:43-51`.
- Related-row writers (payment/message/storage) swallow insert failures — `document-repository.ts:282-343`.
- Hardcoded Marios phone in committed sample data — `lib/invoices/data/sample-records.ts:3`.

### LOW
- Dead `{false && …}` branch — `TemplatePreview.tsx:109`.
- Misleading "credit notes store negative total" comment (they don't) — `pdf.ts:222-224`.
- Draft number uses local-machine year not issueDate — `numbering.ts:4-7`.
- `batchPreview` arrow-nav desync — `App.tsx:968-971`.

## Marios requests vs. current state (action-items = Moayad's end-of-call list)
✅ done · ⚠️ done-but-buggy (see findings) · ❌ missing · 🕐 defer (needs external input/device)

| # | Marios request | State |
|---|---|---|
| 1 | Auto-send email on approval (monthly/yearly/one-off) | ⚠️ only `kind==invoice`, failure swallowed |
| 2 | Configurable default email body (Marios's text) | ❌ no mechanism; needs his wording |
| 3 | Non-replyable / reply-to a named person | ❌ no reply-to on invoice emails |
| 4 | Always CC Marios on invoice emails | ⚠️ CRITICAL — email_invoice sends no CC |
| 5 | Monthly email = BCC Marios (not CC) | ❌ no BCC support |
| 6 | Same template monthly/yearly/one-off | ✅ (verify) |
| 7 | Template: invoice №, billing, kind-regards | ✅ |
| 8 | Fix including-VAT vs plus-VAT totals | ⚠️ CRITICAL rounding bug |
| 9 | Prompt + record edit reason | ✅ (polish) |
| 10 | Default amendment "ignore previous invoice" msg | ⚠️ partial |
| 11 | "amend" vs "edit" wording | ❌ minor |
| 12 | Stop unnecessary follow-up questions | ✅ (verify) |
| 13 | Recurring edits → preview + next-charge | ⚠️ VAT-mode not carried |
| 14 | Yearly behaves same as monthly | ✅ (verify) |
| 15 | Fix preview zero-padding | ⚠️ input handling |
| 16 | Richer history (date, receipt link, actions) | ❌/partial |
| 17 | Clickable receipts in history | ❌/partial |
| 18 | Seed numbering from 11517 → 11518 | 🕐 needs Marios's final numbers |
| 19 | Visible draft number before approval | ⚠️ note only, no number shown |
| 20 | Manual number override on draft | ⚠️ CRITICAL silent overwrite |
| 21 | Invoices tab = invoices only | ✅ (verify) |
| 22 | Free-text search (desc/property/date/partial) | ⚠️ verify field coverage |
| 23 | Send invoice PDF by № to group, no footer | ✅/⚠️ verify "no footer" |
| 24 | Statement PDF by date range | ❌ missing |
| 25 | iPhone view missing search/buttons | 🕐 needs device repro |
| 26 | Mobile search button | ❌ |
| 27 | Safari logout error | 🕐 needs device repro |
| 28 | Template spacing alignment | ✅ (verify) |
| 29 | Remove a button, add statement | 🕐 tied to #24 |
| 30 | WhatsApp delivery of invoices | 🕐 Marios said longer-term |

## Verdict
**FAIL — 5 CRITICAL + 9 HIGH.** The invoice feature is functionally rich but has real money-path defects (dropped CC, VAT rounding, silent number overwrite, unattributed commission posts, ~10 crash-on-error UI paths). Several map directly to Marios's flagged bugs.

## Recommended Next Command
`/qualia-plan` for a new milestone (M10 — Marios Invoicing Hardening) covering Tier-1 confirmed bugs + broken Marios asks; defer Tier-2 (legacy-number seed, mobile/Safari repro, statement PDF, WhatsApp delivery).
