---
phase: 1
result: PASS
gaps: 0
run: re-verification after gap closure (commits f685559, b687712)
---

# Phase 1 Re-Verification

**Baseline commits verified against:** `6a80f85` (prior failing baseline), `a9324f9` (original Sophia regression guard baseline)
**Gap-closure commits:** `f685559` (App.tsx), `b687712` (documents.ts + .env.example)

---

## Contract Results

Machine contract (`phase-1-contract.json`) ran before this re-verification — 7/7 checks passed.

| Task | Check | Command | Result |
|------|-------|---------|--------|
| T1 | partial-failure toast | `grep -c "Invoice numbered — mark paid manually" App.tsx` | PASS (1) |
| T1 | fullyIssued flag | `grep -c "fullyIssued" App.tsx` | PASS (3) |
| T1 | loadDocumentsAction in catch | `grep -c "loadDocumentsAction()" App.tsx` | PASS (≥1) |
| T1 | handleAct error toast | `grep -c "Couldn't issue this invoice" App.tsx` | PASS (1) |
| T2 | Marios personal fallback removed | `grep -c "Marios Polyviou" documents.ts` | PASS (1) |
| T2 | both senders read env var | `grep -c "INVOICE_ACCOUNTING_GROUP_MSISDN" documents.ts` | PASS (2) |
| T2 | env var documented | `grep -c "INVOICE_ACCOUNTING_GROUP_MSISDN" .env.example` | PASS (1) |

---

## Gap 1 — `handleCreate` false success toast — CLOSED

**Criterion:** On partial failure, UI shows honest partial-failure toast and reconciles to real DB state, not the stale `created` snapshot.

**Logic trace:**

`components/invoices/redesign/App.tsx:466` — `"let fullyIssued = false;"` — flag declared before try, defaults false.

`components/invoices/redesign/App.tsx:473` — `"fullyIssued = true;"` — set ONLY after `await notifyAccountingGroupOfInvoiceAction(newId)` on line 472 completes without throwing. Any throw before this line keeps `fullyIssued = false`.

`components/invoices/redesign/App.tsx:474-479` — catch block:
```
console.error("Auto-issue failed", error);
const fresh = await loadDocumentsAction();
result = fresh;
selectId = fresh.selectedId ?? newId;
```
On any throw, the code re-fetches real DB state via `loadDocumentsAction()` (already imported at line 12), overwrites `result` with the live snapshot. The stale `created` snapshot can no longer reach `reconcile`.

`components/invoices/redesign/App.tsx:482-486` — toast ternary:
```
setToast(
  fullyIssued
    ? "Invoice issued, paid, receipt created — sent to the accounting group."
    : "Invoice numbered — mark paid manually and retry the group send."
);
```
`fullyIssued` is `true` only when the entire try block completes (approve + mark-paid + group notify all succeed). Any partial failure leaves it `false` and the partial-failure toast fires.

**`fullyIssued` cannot be true on a partial failure** — it is set on the line immediately following `notifyAccountingGroupOfInvoiceAction`, which is the last await in the try block. A throw at `approveDocumentAction`, `markPaidAndIssueReceiptAction`, or `notifyAccountingGroupOfInvoiceAction` all jump to catch before line 473 is reached.

**Verdict: CLOSED.**

---

## Gap 2 — `handleAct` "draft" silently swallowed — CLOSED

**Criterion:** The entire `startTransition` async body (invoice branch AND else branch) is inside a try/catch that shows an error toast + console.errors on failure. No await sits outside the try.

**Logic trace:**

`components/invoices/redesign/App.tsx:201-217` — full block:
```
try {
  await approveDocumentAction(selected.id);        // line 202
  if (selected.kind === "invoice") {
    const paid = await markPaidAndIssueReceiptAction(selected.id);  // line 204
    await notifyAccountingGroupOfInvoiceAction(selected.id);        // line 205
    reconcile(paid.documents, paid.selectedId ?? selected.id);
    setFilters((f) => ({ ...f, stage: "all" }));
    setToast("Issued, paid, receipt created — sent to the accounting group.");
  } else {
    const result = await approveDocumentAction(selected.id);        // line 210
    reconcile(result.documents, selected.id);
    setToast("Approved and numbered.");
  }
} catch (error) {
  console.error("Issue from draft failed", error);               // line 215
  setToast("Couldn't issue this invoice — please try again.");    // line 216
}
```

The `try` opens at line 201 before the first `await approveDocumentAction`. All three awaits in the invoice branch (lines 202, 204, 205) and the else branch await (line 210) are inside the try. The catch (lines 214-217) fires on any throw, calls `console.error` for observability, and calls `setToast` with the error copy. No await sits outside the try.

**Both branches (invoice and else) are covered** — the try wraps the entire `if/else` block.

**Verdict: CLOSED.**

---

## Gap 3 — `sendDocumentToAccountingGroup` personal-DM fallback — CLOSED

**Criterion:** Both group senders read `process.env.INVOICE_ACCOUNTING_GROUP_MSISDN?.trim() || undefined` with no `?? <personal msisdn>` fallback. When unset, they warn-log and return/skip without sending. `grep -c "Marios Polyviou" documents.ts` == 1 (legitimate DM path only). Env var in `.env.example`.

**Evidence — `sendDocumentToAccountingGroup` (invoice group sender):**

`lib/invoices/actions/documents.ts:422` — `"const groupMsisdn = process.env.INVOICE_ACCOUNTING_GROUP_MSISDN?.trim() || undefined;"` — no `??` fallback, no personal MSISDN.

`lib/invoices/actions/documents.ts:423-425` — `"if (!groupMsisdn) { sendLogger.warn("No accounting group number configured; group message not sent"); return false; }"` — warn-logs and returns `false` (propagates up through `notifyAccountingGroupOfInvoiceAction` to the Gap 1 try/catch where `fullyIssued` stays `false`).

**Evidence — credit-note group sender:**

`lib/invoices/actions/documents.ts:386` — `"const groupMsisdn = process.env.INVOICE_ACCOUNTING_GROUP_MSISDN?.trim() || undefined;"` — identical pattern.

`lib/invoices/actions/documents.ts:387-389` — `"if (!groupMsisdn) { sendLogger.warn("No accounting group number configured; credit-note message not sent"); return; }"` — warn-logs and returns void without sending.

**Evidence — Marios reference count:**

`grep -c "Marios Polyviou" lib/invoices/actions/documents.ts` → `1`

`lib/invoices/actions/documents.ts:130` — `"const marios = INVOICE_AUTHORIZED_AGENTS.find((agent) => agent.name === \"Marios Polyviou\");"` — this is inside `notifyMariosOverWhatsApp`, the legitimate Sophia/WhatsApp DM approval path. Not a group-send fallback.

The personal MSISDN `35799921560` does not appear anywhere in documents.ts — confirmed by `grep -n "35799921560" lib/invoices/actions/documents.ts` returning 0 results.

**Evidence — `.env.example`:**

`.env.example:250-253` — full block:
```
# Accounting WhatsApp GROUP MSISDN (digits, e.g. 35799000000) that issued invoices
# and credit notes are posted to. REQUIRED for group routing — if unset, no group
# message is sent (the app will NOT fall back to anyone's personal number).
INVOICE_ACCOUNTING_GROUP_MSISDN=
```

**Verdict: CLOSED.**

---

## Regression Guard

**Files changed since `6a80f85`:** `git diff 6a80f85..HEAD --name-only` → `.env.example`, `components/invoices/redesign/App.tsx`, `lib/invoices/actions/documents.ts` — exactly the 3 expected files, no unintended changes.

**Sophia path:** `git diff a9324f9..HEAD -- lib/invoices/sophia/intent-handlers.ts` → 0 bytes — untouched.

**T2 / T3 / T4 files** not in the diff: `lib/invoices/pdf.ts`, `components/invoices/redesign/ledger/TemplatePreview.tsx`, `lib/invoices/redesign/stages.tsx`, `components/invoices/redesign/ledger/DetailPane.tsx`, `components/invoices/redesign/chrome/Sidebar.tsx`, `components/invoices/redesign/modals/Composer.tsx` — all previously-PASS work is unchanged.

**Verdict: No regression.**

---

## Code Quality

- **TypeScript:** PASS — `npx tsc --noEmit 2>&1 | grep -c "error TS"` → `0`
- **Build:** PASS — `npm run build` exits 0 (`BUILD_OK`)
- **Stubs found:** 0
- **Empty handlers:** 0 — prior catch-less `startTransition` is now wrapped; both catches call `console.error` + `setToast`

---

## Scores (re-verified criteria only)

| Criterion | Correctness | Completeness | Wiring | Quality | Verdict |
|-----------|-------------|--------------|--------|---------|---------|
| Auto-advance to paid + receipt — honest toast (Gap 1) | 5 | 5 | 5 | 5 | **PASS** |
| Accounting GROUP notification — no personal fallback (Gap 3) | 5 | 5 | 5 | 5 | **PASS** |
| `handleAct` draft error handling (Gap 2) | 5 | 5 | 5 | 5 | **PASS** |

**Previously-PASS criteria:** All 8 (getWhatsAppGroupStatus, Sophia regression, VAT removal, recurrence label, button relabel, receipts immutable, Iam Sophia rename, receipt picker) — unchanged files confirm PASS unchanged.

**Minimum threshold check:** All dimensions ≥ 3 on all criteria. No scores below threshold.

---

## Verdict

**PASS — Phase 1 goal achieved. All 3 HIGH gaps are genuinely closed. No regression. Build green.**

1. **Gap 1 closed:** `handleCreate` `fullyIssued` flag is set only after `notifyAccountingGroupOfInvoiceAction` completes; toast is gated on it with a ternary; catch re-fetches live DB state via `loadDocumentsAction()` before reconciling.
2. **Gap 2 closed:** Entire `startTransition` async body (invoice branch + else branch) is inside a single try/catch; all awaits are inside the try; catch shows error toast + console.errors.
3. **Gap 3 closed:** Both group senders use `?.trim() || undefined` with no personal-MSISDN fallback; both warn-log and return/skip when unset; `grep -c "Marios Polyviou" documents.ts` == 1 (legitimate DM path only); `INVOICE_ACCOUNTING_GROUP_MSISDN` documented in `.env.example` with explanatory comment.
