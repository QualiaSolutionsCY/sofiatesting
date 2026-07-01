# M11 — Marios Invoicing Hardening II

Source: 30‑06‑2026 CSC Zyprus meeting (Read.ai `01KWBZ00NMSQX6ZYP8Q0V44PQE`, Marios + Moayad + Fawzi), transcribed in `.planning/reports/review/REVIEW-2026-06-30-marios-invoicing.md` (30‑item table) + M10 ship `.planning/reports/report-2026-06-30-QS-REPORT-17.md` + a 4‑explorer code audit (2026‑07‑01) of what M10 actually closed vs. what remains.

Scope owner sign‑off: user approved route `/qualia-milestone` (run as increment — state layout is `increments`) + item‑5 clarification, 2026‑07‑01.

## HARD CONSTRAINT — non‑breaking (gate on every wave)
**Additive, backward‑compatible only.** Do NOT regress anything M10 verified good:
- Keep `sendInvoiceEmailAction(id, toList, customMessage?)` signature intact.
- Do NOT touch the money path: VAT rounding (`document-actions.ts:calculateVat`), Marios CC/BCC (`documents.ts:477‑496`), official‑number allocation/collision logic, PDF subtotal reconciliation (`pdf.ts:221`).
- Fix by **adding guards / boundaries / new files**, not rewriting working flows.
- Prompt/email body = **file‑based** (never a `sophia_prompts` DB row) — autoresearch clobbers DB rows (see memory `invoicing-prompt-db-backed`).
- Gate: `npx tsc --noEmit` = 0 + touched tests green **after every wave**; edge‑fn `deno check`/deploy for any `supabase/functions/**` change; live smoke before ship. Nothing ships until green.

## Build waves (conflict‑free ownership, executed SEQUENTIALLY — several streams touch `App.tsx` / `documents.ts` / `document-repository.ts`, so no parallel edits)

### B1 — Default email body + "please don't reply"  (item 1)  [`lib/invoices/email.ts`, `lib/invoices/actions/documents.ts`, `.env.example`]
- Replace the hardcoded body at `documents.ts:499‑504` with a file‑based template = Marios's exact CSC Zyprus letterhead, with dynamic placeholders `{clientName} {label} {invoiceNo} {monthYear} {amountDue} {dueDate}` and a **"Please don't reply to this email."** line. Repurpose the unused `buildClientEmailMessage()` in `lib/invoices/email.ts` as the single source; call it from `sendInvoiceEmailAction` only when no `customMessage` is passed.
- Keep `reply_to` (`INVOICE_REPLY_TO`, already wired `documents.ts:490,497`). Prod action: set `INVOICE_REPLY_TO` + confirm `INVOICE_MARIOS_EMAIL`.
- Non‑breaking: `customMessage` still overrides; signature unchanged.

### B2 — Sophia retrieve→edit→amend flow  (item 8)  [`lib/invoices/sophia/intent-handlers.ts`, `supabase/functions/sophia-bot/prompts/behaviors/invoicing.ts`, `supabase/functions/sophia-bot/tools/handlers/invoice.ts`]
- `edit_invoice` post‑approval (`intent-handlers.ts:424‑443`) already asks "what message for the group?" and sends to the accounting group — ADD a send to **Marios** in the same step (reuse `notifyMariosOverWhatsApp()`), so the amended PDF reaches group **and** Marios.
- Default proposed amend message = Marios's exact wording: **"Please ignore the previous invoice {oldNo}! There was an amend on the balance due! Here is the correct one."** Update the file fallback `invoicing.ts`; verify/sync the `sophia_prompts` invoicing row + clear chat_history (runtime).
- Non‑breaking: additive send; existing group send untouched. Validate via `deno check` + deploy `sophia-bot`.

### B3 — Admin UI: search + filter + history  (items 4, 5, 6)  [new `lib/invoices/redesign/search.ts`; `components/invoices/redesign/modals/CommandPalette.tsx`; `ledger/ListPane.tsx`; `ledger/DetailPane.tsx`; `lib/invoices/redesign/adapter.ts`; `lib/invoices/supabase/document-mappers.ts`]
- **Search (item 4):** extract the full‑coverage matcher from `ListPane.tsx:76‑107` into `search.ts:matchesQuery(doc, q)`; reuse in both `ListPane` (no behaviour change) and `CommandPalette.tsx` (pass `docs` + add a "Documents" results section so the top "Search or jump…" bar searches client/number/date/amount/partial). Removes the false "Type a client, invoice number…" placeholder gap.
- **Filter (item 5):** in `ListPane.tsx:9‑21` `STAGE_OPTIONS`, drop the redundant `"approved-numbered" / "Invoices"` option; make **"All Invoices" the single main filter** (default). Keep Monthly/Yearly/Deleted. Data untouched — cancelled/credited still show.
- **History (item 6):** root‑cause the duplicate "Invoice number NNNNN applied" ×N with no dates — dedupe approval events (`document-mappers.ts` / `adapter.ts`, key on label+at+by), give distinct descriptive labels per transition, render the real date, keep receipts clickable (`DetailPane.tsx:771‑854`). Preserve working single‑event cases.

### B4 — Statements export PDF/XLS  (item 7)  [new `lib/invoices/statement-pdf.ts`, `lib/invoices/statement-xls.ts`, `components/invoices/redesign/modals/StatementExporter.tsx`; `chrome/Topbar.tsx`; `lib/invoices/downloads.ts`; `lib/invoices/supabase/document-repository.ts`]
- Add `listInvoiceDocumentsByDateRange(from,to)` (SELECT on issued/created range, still `.is("deleted_at", null)`). Statement **PDF** (reuse `pdf.ts` byte builder, tabular layout: date · № · client · description · subtotal · VAT · total + letterhead). Statement **XLS** via `xlsx-js-style` (already in `package.json`). Add `downloadStatementPdf/Xls` in `downloads.ts`. Add a "Statements" button in `Topbar.tsx` → `StatementExporter` modal (date range + PDF/XLS choice + matched‑count).
- Net‑new; one button added — cannot regress existing flows.

### B5 — Logout robustness  (item 9)  [new `app/invoices/error.tsx`; `components/invoices/redesign/App.tsx`; `app/invoices/page.tsx`]
- Add a route‑level `app/invoices/error.tsx` boundary so a throw no longer escalates to the full‑page `app/global-error.tsx` "Something went wrong". Guard `signOut` (`App.tsx:255‑258`) + the initial/`refetchDocuments` load (`page.tsx`, `App.tsx`) so a failed/aborted fetch during logout can't take the page down. Confirm the exact throw with one live logout repro before finalizing.

### B6 — Verify yearly==monthly parity + VAT  (items 2, 3)  [read + live smoke; patch only if broken]
- Prove: yearly recurring runs identically to monthly (`App.tsx:902‑951`), Marios copy parity (BCC both), and editing an **issued** monthly/yearly invoice reflects in the **next** period's upcoming preview. Verify incl‑VAT / plus‑VAT totals cent‑correct on a real PDF. Patch the single spot only if propagation is missing. No rewrite.

### B7 — Live preview in the invoice-template editor  (item 10, added 2026-07-01)  [`components/invoices/redesign/modals/TemplateEditor.tsx`, `lib/invoices/redesign/template-context.tsx`]
- Marios wants to SEE the invoice update live while he edits the template text fields (company name, address, bank, CREA, notes…). The editor had a form only, no preview.
- Add a two-column layout: fields left, a scaled `TemplatePreview` right, wrapped in a `TemplateContext.Provider` fed by the editor's in-progress `draft` — so the preview re-renders on every keystroke without committing. Sample invoice content is fixed; only the template text is live. Inline styles only (no CSS-file churn). `TemplateContext` exported additively.

## Definition of Done
- `npx tsc --noEmit` = 0; touched tests green; `deno check` clean for `sophia-bot`.
- Each item verifiable by grep/read against its finding + a live smoke: email body renders with letterhead + no‑reply; amend reaches group + Marios; top‑bar search finds by number/date; single "All Invoices" filter; history shows distinct dated events; statement PDF+XLS download; logout no longer errors; yearly == monthly; VAT cent‑correct.
- Ship: `/qualia-ship` from this branch → deploy `sophia-bot` + Vercel → `/qualia-report`.

## Deferred (Tier‑3, needs external input/device)
Legacy number seed 11517→11518 (needs Marios's final numbers); mobile iPhone search/buttons (device repro); enabling RLS on live invoice tables; WhatsApp invoice delivery (Marios said longer‑term).
