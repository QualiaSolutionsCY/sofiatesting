---
phase: 1
goal: "The invoice lifecycle behaves the way Marios signed off on in the 2026-06-17 review: admin-created invoices flow straight to paid/receipt, the accounting WhatsApp group is notified on creation, receipts can reference an existing invoice, and the remaining template/label/immutability polish is resolved."
tasks: 4
waves: 1
---

# Phase 1: Invoice Workflow Fixes (Marios 2026-06-17)

**Goal:** Admin-created (auto-approved) invoices skip the dead-end manual *Mark as paid → Issue receipt* dance and land paid with a receipt; new invoices notify the accounting WhatsApp GROUP (not Marios's DM); `getWhatsAppGroupStatus` is wired into the admin UI rather than dead code; the receipt-reference flow is confirmed; and the meeting's template/label/immutability polish (recurrence labels, V.A.T Reg. No. removal, clearer auto-approve button, immutable receipts, "Iam Sophia" rename) all ship.
**Why this phase:** This is the Friday follow-up deploy (`deploy/invoices-friday`) — it turns Marios's verbal sign-off into the shipped behaviour he expects on Monday.

All four tasks write to disjoint file sets, so they are all **Wave 1** and parallel-safe. The live admin UI is `components/invoices/redesign/App.tsx` (mounted by `app/invoices/page.tsx:3` and `app/(admin)/admin/invoices/page.tsx`). `components/invoices/InvoiceDashboard.tsx` is a SEPARATE legacy surface — do NOT edit it.

---

## Task 1 — Auto-approved invoices flow to paid + receipt, and notify the accounting GROUP
**Wave:** 1
**Persona:** backend
**Files:**
- `components/invoices/redesign/App.tsx` (modify `handleCreate` auto-issue branch, ~lines 442-459; and `handleAct` "draft" case, ~lines 196-205)
- `components/invoices/redesign/modals/SettingsPanel.tsx` (replace the static "WhatsApp · Sophia bot · Staged · provider TBC" integration row, lines 143-150, with a live status fed by `getWhatsAppGroupStatus`)
- `lib/invoices/actions/documents.ts` (no new export needed — reuse existing `sendDocumentToAccountingGroup` at line 420 and `markPaidAndIssueReceiptAction` at line 312)

**Depends on:** none

**Why:** This is the #1 fix Marios called out. Today the admin auto-issue path (`App.tsx:448-455`) calls `approveDocumentAction(newId)` (which numbers the invoice — `lib/invoices/workflow-actions.ts:64-83` sets `status: "numbered"`) then `notifyMariosApprovedAction(newId)` (which DMs Marios individually — `lib/invoices/actions/documents.ts:112-117` → `notifyMariosOverWhatsApp` sends to `marios.msisdn`, line 159). Marios then had to manually run *Mark as paid → Issue receipt*. The fix makes admin-created invoices advance to paid+receipt automatically AND post to the accounting group, not Marios's DM.

**Acceptance Criteria:**
- Creating an invoice from the admin composer issues it with an official number, marks it paid, auto-creates the linked receipt, and selects the receipt — with no further clicks. The toast reads e.g. "Invoice issued, paid, and receipt sent to the accounting group."
- The PDF + caption are sent to the accounting WhatsApp GROUP (`INVOICE_ACCOUNTING_GROUP_MSISDN`), not to Marios's individual number.
- The Settings panel "Integrations" section shows a live WhatsApp accounting-group status (Connected / not connected with the reason) derived from `getWhatsAppGroupStatus()`, replacing the hardcoded "Staged · provider TBC" text.
- No regression in the Sophia/WhatsApp chat approval path (intent-handlers.ts is untouched).

**Action:**
1. In `App.tsx` `handleCreate` invoice branch (currently lines 448-458): after `approveDocumentAction(newId)`, call `await markPaidAndIssueReceiptAction(newId)` and reconcile on its result + selectedId (the receipt). Replace the `notifyMariosApprovedAction(newId)` call. Update the toast to reflect paid + receipt + group send.
2. Route the creation notification to the group: import and call `sendDocumentToAccountingGroup(document, caption)` (already exported at `lib/invoices/actions/documents.ts:420`) with an "Invoice issued: {number} · Client: {name}" caption. Build the `InvoiceDocument` to pass via the existing `docToInvoiceDocument(selected, clientById(...))` helper used at `App.tsx:297`, OR add a thin server action in `documents.ts` that loads the doc by id and calls `sendDocumentToAccountingGroup` (preferred — keeps the PDF build server-side). If adding the action, name it `notifyAccountingGroupOfInvoiceAction(id: string)` and have it `findDocument` + build caption + call `sendDocumentToAccountingGroup`.
3. Apply the same auto-paid + group-notify behaviour to the `handleAct` "draft" case (lines 196-205) so the explicit "Send to Marios for review" button on a draft also advances correctly and notifies the group.
4. In `SettingsPanel.tsx`: add a `useState<WhatsAppGroupStatus | null>` and a `useEffect` that, when `open` becomes true, calls `getWhatsAppGroupStatus()` (import the server action from `@/lib/invoices/actions/whatsapp-status`). Render the integration row's status pill from `status.connected` (green `var(--green-strong)` "● Connected · {groupName}") / not-connected (amber `var(--amber-strong)` "● {detail}"). Keep the row label `WhatsApp · accounting group`.

**Validation:** (builder self-check)
- `grep -c "markPaidAndIssueReceiptAction" components/invoices/redesign/App.tsx` → ≥ 2 (composer branch + draft action)
- `grep -c "sendDocumentToAccountingGroup\|notifyAccountingGroupOfInvoiceAction" components/invoices/redesign/App.tsx lib/invoices/actions/documents.ts` → ≥ 1
- `grep -c "notifyMariosApprovedAction" components/invoices/redesign/App.tsx` → `0` (the individual-DM call is removed from the create path)
- `grep -c "getWhatsAppGroupStatus" components/invoices/redesign/modals/SettingsPanel.tsx` → ≥ 1
- `npx tsc --noEmit` → exits 0

**Context:** Read @components/invoices/redesign/App.tsx @lib/invoices/actions/documents.ts @lib/invoices/actions/whatsapp-status.ts @lib/invoices/workflow-actions.ts @components/invoices/redesign/modals/SettingsPanel.tsx

**Design:**
- Register: product (ported sophiainvoice token system — `--ink`, `--muted`, `--green-strong`, `--amber-strong`, `--font-mono`)
- Tokens used: `var(--green-strong)`, `var(--amber-strong)`, `var(--font-mono)`, `var(--muted)`, `var(--rule)`
- Scope: component (the Settings integration row)
- Anti-pattern guard: builder runs `node bin/slop-detect.mjs components/invoices/redesign/modals/SettingsPanel.tsx` pre-commit; commit blocked on critical findings. Do NOT introduce Inter/Space Grotesk fonts or bounce/elastic easings (already removed per design-laws §6).

---

## Task 2 — Recurrence labels on template + PDF; remove V.A.T Reg. No. from both
**Wave:** 1
**Persona:** frontend
**Files:**
- `components/invoices/redesign/ledger/TemplatePreview.tsx` (remove V.A.T Reg. No. line at line 53; add recurrence/period label in the meta block ~lines 62-84)
- `lib/invoices/pdf.ts` (remove `V.A.T Reg. No.` from `headerLines` at line 110; add recurrence/period label to the meta array ~lines 120-127)

**Depends on:** none

**Why:** Items #17 + #10 both touch the same two shared files (the on-screen A4 template and the single PDF generator). They MUST be one task to avoid write conflicts, and both changes MUST apply to BOTH renderers in lockstep — the Sophia path and the admin path share `buildDocumentPdfBytes` (relevant-learnings: "single PDF generator … any PDF change must apply to both"). Marios wants the monthly/yearly cadence visible on the document and the Cyprus-irrelevant V8/VAT-Reg line gone.

**Acceptance Criteria:**
- The on-screen invoice preview and the generated PDF show a recurrence label ("Monthly", "Yearly", or nothing for one-off) plus the billing period ("May 2026") when the invoice recurs — e.g. a meta row `Recurring · Monthly` and the period text.
- The line `V.A.T Reg. No. : 10344546O` no longer appears on the on-screen template OR in the generated PDF letterhead. (The other CREA/reg lines stay.)
- Receipts and credit notes are unaffected (recurrence is an invoice concept; guard with `kind === "invoice"`).
- The template preview and the PDF still align line-for-line (they are kept in sync by design — see the comment at `pdf.ts:10-11`).

**Action:**
1. `TemplatePreview.tsx`: delete line 53 (`V.A.T Reg. No. : {tpl.vatNo}` + its trailing `<br />`). In the `template-meta` `<dl>` (lines 62-84), when `!isCredit && !isReceipt && doc.recurrence && doc.recurrence !== "none"`, add a `<div><dt>Recurring</dt><dd>{doc.recurrence === "monthly" ? "Monthly" : "Yearly"} · {doc.period}</dd></div>`.
2. `pdf.ts`: remove the `` `V.A.T Reg. No. : ${ENTITY.vatNo}` `` entry from the `headerLines` array (line 110). In the `meta` array build (lines 120-127), when `!isCredit && !isReceipt && document.recurrence !== "none"`, push `["Recurring", `${recurrenceLabel(document.recurrence)} · ${periodLabel}`]`. Use the existing `recurrenceLabel()` helper (`lib/invoices/format.ts:46`); derive `periodLabel` from `document.issueDate` the same way the adapter's `periodFromIssue` does (`lib/invoices/redesign/adapter.ts:23-28`) — inline a small month-year formatter, do not import the private adapter function.
3. Keep the PDF's `belowTableHeight` / layout math correct: adding a meta row only extends the right-hand meta block (variable-height already handled at `pdf.ts:131-141` via `metaY`), so no filler-row math change is needed — verify the totals don't collide after the change.

**Validation:** (builder self-check)
- `grep -c "V.A.T Reg. No." components/invoices/redesign/ledger/TemplatePreview.tsx lib/invoices/pdf.ts` → `0`
- `grep -c "recurrence" components/invoices/redesign/ledger/TemplatePreview.tsx` → ≥ 1
- `grep -c "recurrenceLabel\|Recurring" lib/invoices/pdf.ts` → ≥ 1
- `npx tsc --noEmit` → exits 0

**Context:** Read @components/invoices/redesign/ledger/TemplatePreview.tsx @lib/invoices/pdf.ts @lib/invoices/format.ts @lib/invoices/redesign/adapter.ts @lib/invoices/redesign/types.ts @lib/invoices/types/invoice.ts

**Design:**
- Register: product (sophiainvoice token system)
- Tokens used: `var(--ink-soft)`, `var(--muted)` (existing template-meta styling — reuse `<dt>/<dd>` pattern, add no new colors)
- Scope: component (template-meta block + PDF letterhead)
- Anti-pattern guard: builder runs `node bin/slop-detect.mjs components/invoices/redesign/ledger/TemplatePreview.tsx` pre-commit; commit blocked on critical findings.

---

## Task 3 — UI polish: clearer auto-approve button, immutable receipts, "Iam Sophia" rename
**Wave:** 1
**Persona:** frontend
**Files:**
- `lib/invoices/redesign/stages.tsx` (the "draft" primaryAction label at line 91; keep "Assign official number" semantics at lines 98-99)
- `components/invoices/redesign/ledger/DetailPane.tsx` (the `editable` computation at line 94 — exclude receipts)
- `components/invoices/redesign/chrome/Sidebar.tsx` (line 24 — assistant label)
- `components/invoices/redesign/chrome/AccessGate.tsx` (line 33 — "Sophia Invoice" eyebrow)
- `components/invoices/redesign/overlays/GuidedTour.tsx` (line 16 — "Meet Sophia")

**Depends on:** none

**Why:** Three independent small UI corrections from the meeting (#8 button label, #12 receipt immutability, #19 rename). They touch disjoint files from Tasks 1, 2 and 4, so they batch into one commit. #8: the draft-stage button reads "Send to Marios for review" but on the admin path it actually auto-approves — misleading. #12: credit notes are locked (`editable = doc.stage !== "credited"`, DetailPane.tsx:94) but receipts are still editable — they must be immutable once issued, for parity. #19: Marios asked the assistant be branded "Iam Sophia" on the invoice view.

**Acceptance Criteria:**
- The draft-stage primary action button reads approval-accurate text (e.g. "Approve & issue invoice" with sublabel "Auto-approved · sent to the accounting group") instead of "Send to Marios for review".
- An issued receipt (`doc.kind === "receipt"`) shows "Read only" in the inline editor and its fields are disabled — same treatment credit notes already get. Invoices and drafts remain editable.
- The assistant is labelled "Iam Sophia" on the invoice view in the sidebar, the access gate, and the guided tour (the three brand-label surfaces). Inline delivery-message signatures ("— Sophia", "via Sophia") are left as-is (they are message body text, not the brand label).

**Action:**
1. `stages.tsx` line 91: change the `"draft"` case label to `"Approve & issue invoice"` and `small` to `"Auto-approved · sent to the accounting group"`. Leave the `"approved"` case (line 98-99) as "Assign official number".
2. `DetailPane.tsx` line 94: change `const editable = doc.stage !== "credited";` to also exclude issued receipts, e.g. `const editable = doc.stage !== "credited" && doc.kind !== "receipt";`. Verify the `isSent`/`requiresCorrectionReason` logic still behaves (a receipt is read-only, so no correction path needed).
3. Rename the brand label to "Iam Sophia" at: `Sidebar.tsx:24` (`<strong>Sophia</strong>` → `<strong>Iam Sophia</strong>`), `AccessGate.tsx:33` (`Sophia Invoice` → `Iam Sophia · Invoice`), `GuidedTour.tsx:16` (`Meet Sophia` → `Meet Iam Sophia`). Do NOT change the delivery-message signatures in DetailPane (lines 553, 556, 614) or the comment text.

**Validation:** (builder self-check)
- `grep -c "Send to Marios for review" lib/invoices/redesign/stages.tsx` → `0`
- `grep -c "doc.kind !== \"receipt\"" components/invoices/redesign/ledger/DetailPane.tsx` → ≥ 1
- `grep -c "Iam Sophia" components/invoices/redesign/chrome/Sidebar.tsx components/invoices/redesign/chrome/AccessGate.tsx components/invoices/redesign/overlays/GuidedTour.tsx` → ≥ 3
- `npx tsc --noEmit` → exits 0

**Context:** Read @lib/invoices/redesign/stages.tsx @components/invoices/redesign/ledger/DetailPane.tsx @components/invoices/redesign/chrome/Sidebar.tsx @components/invoices/redesign/chrome/AccessGate.tsx @components/invoices/redesign/overlays/GuidedTour.tsx

**Design:**
- Register: product (sophiainvoice token system)
- Tokens used: none new — text/label changes only; existing button + fieldset styles unchanged
- Scope: component (button label, fieldset disabled state, brand labels)
- Anti-pattern guard: builder runs `node bin/slop-detect.mjs components/invoices/redesign/ledger/DetailPane.tsx` pre-commit; commit blocked on critical findings.

---

## Task 4 — Confirm + harden the receipt-reference picker
**Wave:** 1
**Persona:** frontend
**Files:**
- `components/invoices/redesign/modals/Composer.tsx` (the receipt source-invoice picker, lines 338-352; the "What happens next" copy, lines 509-519)

**Depends on:** none

**Why:** Item #11. The picker that lists a customer's invoices by number when issuing a receipt ALREADY EXISTS in the composer (`Composer.tsx:338-352` renders a `<select>` of `sourceInvoices`, filtered to that client's numbered invoices at lines 227-229, and submit blocks without a selection at line 537). The gap Marios flagged is discoverability: the prompt "apply to an existing invoice, list by number" is not surfaced as an explicit step, and the "What happens next" copy (lines 509-519) still talks only about the invoice/draft flow. This task confirms the existing flow works and adds the explicit prompt copy — it is intentionally minimal (the mechanism is built; do not rebuild it).

**Acceptance Criteria:**
- When the user switches the composer to "Receipt", the source-invoice picker is labelled clearly as "Apply this receipt to which invoice?" and lists that customer's invoices by official number (e.g. "№ 11425 · €1,234 · 2026-05-01"). Selecting one mirrors its amount/VAT/description into the receipt (existing `selectInvoiceForSource`, lines 234-250).
- If the chosen client has no numbered invoices, the picker shows "No invoices for this client yet" and the submit button stays disabled (existing behaviour at lines 344-345, 537 — verify it still holds).
- The "What happens next" copy reflects receipts/credit notes when in source mode (not only the draft-to-Marios flow).

**Action:**
1. In `Composer.tsx`, change the picker `<label><span>` text (currently `kind === "receipt" ? "Invoice to receipt" : ...` at line 336) to `"Apply this receipt to which invoice?"` for receipts and `"Which invoice to credit?"` for credit notes — clearer prompts.
2. Update the "What happens next" block (lines 509-519): when `isSourceMode`, render copy that says the receipt/credit note will be issued against the selected invoice № and sent to the accounting group. Keep the existing invoice/draft copy for non-source mode.
3. Do NOT change `selectInvoiceForSource`, the `sourceInvoices` filter, or the submit gating — they are correct. This is a copy/clarity pass over an existing, working picker.

**Validation:** (builder self-check)
- `grep -c "Apply this receipt to which invoice" components/invoices/redesign/modals/Composer.tsx` → ≥ 1
- `grep -c "sourceInvoices" components/invoices/redesign/modals/Composer.tsx` → ≥ 1 (picker still wired)
- `npx tsc --noEmit` → exits 0

**Context:** Read @components/invoices/redesign/modals/Composer.tsx @lib/invoices/redesign/types.ts

**Design:**
- Register: product (sophiainvoice token system)
- Tokens used: `var(--ink)`, `var(--muted)` (existing composer-description styling — no new colors)
- Scope: component (composer picker label + helper copy)
- Anti-pattern guard: builder runs `node bin/slop-detect.mjs components/invoices/redesign/modals/Composer.tsx` pre-commit; commit blocked on critical findings.

---

## Success Criteria
- [ ] Admin-created invoices auto-advance to paid with a receipt — no manual *Mark as paid → Issue receipt* step (Task 1).
- [ ] New invoices are sent to the accounting WhatsApp GROUP, and `getWhatsAppGroupStatus` is wired into the Settings UI rather than left as dead code (Task 1).
- [ ] Receipt issuance prompts to apply to an existing invoice and lists that customer's invoices by number (Task 4, confirming + clarifying the existing picker).
- [ ] Monthly/yearly recurrence label + period render on both the on-screen template and the PDF (Task 2).
- [ ] V.A.T Reg. No. line is removed from both the template and the PDF (Task 2).
- [ ] The auto-approve button carries clearer approval text (Task 3).
- [ ] Issued receipts are immutable, matching credit notes (Task 3).
- [ ] The assistant is labelled "Iam Sophia" on the invoice view (Task 3).
- [ ] `npx tsc --noEmit` and `next build` pass; no critical console errors on `/admin/invoices`.

## Verification Contract

### Contract for Task 1 — auto-paid + receipt wiring
**Check type:** grep-match
**Command:** `grep -c "markPaidAndIssueReceiptAction" components/invoices/redesign/App.tsx`
**Expected:** Non-zero (≥ 2)
**Fail if:** Returns < 2 — the auto-paid+receipt step is missing from the composer and/or draft-action create paths

### Contract for Task 1 — individual-DM removed from create path
**Check type:** grep-match
**Command:** `grep -c "notifyMariosApprovedAction" components/invoices/redesign/App.tsx`
**Expected:** `0`
**Fail if:** Non-zero — creation still DMs Marios individually instead of posting to the group

### Contract for Task 1 — group send wired
**Check type:** command-exit
**Command:** `grep -lq "sendDocumentToAccountingGroup\|notifyAccountingGroupOfInvoiceAction" components/invoices/redesign/App.tsx lib/invoices/actions/documents.ts && echo WIRED`
**Expected:** `WIRED`
**Fail if:** No match — the accounting-group send is not reachable from the create path

### Contract for Task 1 — getWhatsAppGroupStatus surfaced (dead code wired)
**Check type:** grep-match
**Command:** `grep -c "getWhatsAppGroupStatus" components/invoices/redesign/modals/SettingsPanel.tsx`
**Expected:** Non-zero (≥ 1)
**Fail if:** Returns 0 — the live group-status check remains dead code

### Contract for Task 2 — V.A.T Reg. No. removed from both renderers
**Check type:** command-exit
**Command:** `grep -c "V.A.T Reg. No." components/invoices/redesign/ledger/TemplatePreview.tsx lib/invoices/pdf.ts | grep -v ':0' | wc -l`
**Expected:** `0`
**Fail if:** Any file still contains the V.A.T Reg. No. line

### Contract for Task 2 — recurrence label on template
**Check type:** grep-match
**Command:** `grep -c "recurrence" components/invoices/redesign/ledger/TemplatePreview.tsx`
**Expected:** Non-zero (≥ 1)
**Fail if:** Returns 0 — recurrence label not rendered on the preview

### Contract for Task 2 — recurrence label on PDF
**Check type:** grep-match
**Command:** `grep -c "recurrenceLabel\|Recurring" lib/invoices/pdf.ts`
**Expected:** Non-zero (≥ 1)
**Fail if:** Returns 0 — recurrence label not rendered in the PDF

### Contract for Task 3 — auto-approve button relabelled
**Check type:** grep-match
**Command:** `grep -c "Send to Marios for review" lib/invoices/redesign/stages.tsx`
**Expected:** `0`
**Fail if:** Non-zero — the misleading draft-button label is still present

### Contract for Task 3 — receipts immutable
**Check type:** grep-match
**Command:** `grep -c "doc.kind !== \"receipt\"" components/invoices/redesign/ledger/DetailPane.tsx`
**Expected:** Non-zero (≥ 1)
**Fail if:** Returns 0 — issued receipts are still editable

### Contract for Task 3 — Iam Sophia rename
**Check type:** grep-match
**Command:** `grep -rc "Iam Sophia" components/invoices/redesign/chrome/Sidebar.tsx components/invoices/redesign/chrome/AccessGate.tsx components/invoices/redesign/overlays/GuidedTour.tsx | grep -v ':0' | wc -l`
**Expected:** `3`
**Fail if:** Fewer than 3 surfaces renamed

### Contract for Task 4 — receipt picker prompt clarified
**Check type:** grep-match
**Command:** `grep -c "Apply this receipt to which invoice" components/invoices/redesign/modals/Composer.tsx`
**Expected:** Non-zero (≥ 1)
**Fail if:** Returns 0 — the explicit "apply to existing invoice" prompt is missing

### Contract for all tasks — typecheck green
**Check type:** command-exit
**Command:** `npx tsc --noEmit 2>&1 | grep -c "error TS"`
**Expected:** `0`
**Fail if:** Any TypeScript compilation errors

### Contract for all tasks — production build passes
**Check type:** command-exit
**Command:** `npm run build 2>&1 | tail -5`
**Expected:** Build completes (no "Failed to compile")
**Fail if:** `next build` fails
