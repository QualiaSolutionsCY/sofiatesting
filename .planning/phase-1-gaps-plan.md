---
phase: 1
type: gap-closure
goal: "Close the 3 HIGH money-path gaps from phase-1 verification — no false-success toasts, no silently-swallowed errors, no silent personal-DM fallback for the accounting group."
tasks: 2
waves: 1
---

# Phase 1 — Gap Closure: Money-Path Error Handling

**Goal:** The admin invoice money path tells the operator the truth. A partial failure (numbered-but-not-paid, no receipt, group-send unconfigured) produces a distinct, honest toast — never the unconditional "issued, paid, receipt created, sent to the group" success message. The accounting-group send never silently routes to Marios's personal WhatsApp.

**Why this phase:** Verification (`.planning/phase-1-verification.md`) FAILED with 3 HIGH gaps, all on the critical money path. The artifacts exist and TypeScript/build pass; what's broken is error-path honesty. This is a surgical gap-closure — fix ONLY the 3 findings, touch no passing task.

**Scope guard:** Do NOT re-plan T2 (VAT/recurrence), T3 (labels/immutability/rename), or T4 (picker) — all verified PASS. Do NOT add features. Two tasks, both Wave 1, disjoint writes → parallel-safe.

---

## Task 1 — Honest toasts + error handling on both admin auto-issue paths
**Wave:** 1
**Persona:** frontend
**Files:** `components/invoices/redesign/App.tsx` (the ONLY file this task writes)
**Depends on:** none

**Why:** Gap 1 (HIGH) — `handleCreate` fires the success toast unconditionally after a `try/catch` whose `catch` only `console.error`s, so a throw in `markPaidAndIssueReceiptAction` after `approveDocumentAction` succeeds leaves the invoice numbered-but-unpaid with no receipt while the operator sees a false success. Gap 2 (HIGH) — `handleAct` "draft" path has three sequential awaits inside `startTransition` with NO try/catch; React swallows async throws from transition callbacks in prod, so a failure shows the operator nothing and local state diverges from the DB. Both are on the same file, so they are one commit.

**Acceptance Criteria:**
- When the composer invoice path (`handleCreate`, `form.kind === "invoice"`) completes the full approve → mark-paid → group-notify chain, the operator sees the existing full-success toast ("Invoice issued, paid, receipt created — sent to the accounting group.").
- When any step of that chain throws, the operator sees a distinct partial-failure toast — `"Invoice numbered — mark paid manually and retry the group send."` — and the UI reconciles to the actual current document state (re-fetched via `loadDocumentsAction`), not the stale pre-approve `created` snapshot.
- When the `handleAct` "draft" path (invoice branch) throws on any of its awaits, the operator sees an error toast — `"Couldn't issue this invoice — please try again."` — instead of silence; the error is `console.error`-logged for observability.
- The non-invoice `handleAct` "draft" branch (the `else` calling `approveDocumentAction` again) is also inside the same try/catch and surfaces the same error toast on failure.
- `npx tsc --noEmit` exits 0 and `npm run build` exits 0 — no regression.

**Action:**
1. **Gap 1 — `handleCreate` invoice branch (currently App.tsx:458-474).** Replace the `try { ... } catch (error) { console.error(...) }` block + unconditional `reconcile`/`setToast` with a flag-gated flow:
   - Add `let fullyIssued = false;` before the `try`.
   - In the `try`, after `await notifyAccountingGroupOfInvoiceAction(newId);`, set `fullyIssued = true;` (last statement in the try).
   - In the `catch (error)`, keep `console.error("Auto-issue failed", error);`, then re-fetch true state: `const fresh = await loadDocumentsAction(); result = fresh; selectId = fresh.selectedId ?? newId;` — so the reconcile reflects the real DB state (numbered, unpaid), not the stale `created` snapshot. (`loadDocumentsAction` is already imported at App.tsx:12 and returns the same `{ documents, selectedId }` shape used by `reconcile`.)
   - After the try/catch: `reconcile(result.documents, selectId); setFilters((f) => ({ ...f, stage: "all" }));` then `setToast(fullyIssued ? "Invoice issued, paid, receipt created — sent to the accounting group." : "Invoice numbered — mark paid manually and retry the group send.");`
2. **Gap 2 — `handleAct` "draft" case (currently App.tsx:196-214).** Wrap the entire body of the `startTransition(async () => { ... })` callback in `try { ... } catch (error) { console.error("Issue from draft failed", error); setToast("Couldn't issue this invoice — please try again."); }`. The existing `await approveDocumentAction`, the `if (selected.kind === "invoice")` mark-paid/notify/reconcile/toast block, AND the `else` re-approve/reconcile/toast block all go inside the `try`. Do not change the happy-path toasts or the reconcile logic — only add the surrounding try/catch.
3. Do not alter any other `case` in `handleAct`, any other path in `handleCreate`, or the import list (both `loadDocumentsAction` and the action fns are already imported).

**Validation:** (builder self-check)
- `grep -c "fullyIssued" components/invoices/redesign/App.tsx` → `≥ 3` (declare, set-true, ternary read)
- `grep -c "Invoice numbered — mark paid manually" components/invoices/redesign/App.tsx` → `1`
- `grep -c "Couldn't issue this invoice" components/invoices/redesign/App.tsx` → `1`
- `grep -n "loadDocumentsAction()" components/invoices/redesign/App.tsx` → at least one hit inside the `handleCreate` catch
- `npx tsc --noEmit 2>&1 | grep -c "error TS"` → `0`

**Context:** Read @components/invoices/redesign/App.tsx @.planning/phase-1-verification.md

**Design:**
- Register: product
- Tokens used: n/a — logic-only edit (no DOM/style nodes added; toast string copy only). Builder confirms zero color/spacing/type changes by running `grep -nE "style=|className=" components/invoices/redesign/App.tsx` against the pre-edit baseline and verifying the diff touches no `style=`/`className=` line before commit.
- Scope: component
- Anti-pattern guard: builder runs `node bin/slop-detect.mjs components/invoices/redesign/App.tsx` pre-commit; commit blocked on critical findings. (Em-dash in the new toast copy matches the existing in-file toast voice, e.g. App.tsx:207 "Issued, paid, receipt created —"; pre-existing baseline, not a new finding.)

---

## Task 2 — Remove the silent personal-DM fallback for the accounting group + document the env var
**Wave:** 1
**Persona:** backend
**Files:** `lib/invoices/actions/documents.ts`, `.env.example` (disjoint from Task 1)
**Depends on:** none

**Why:** Gap 3 (HIGH) — `sendDocumentToAccountingGroup` (documents.ts:424-426) falls back to Marios Polyviou's personal MSISDN (`35799921560`, constants.ts:13) via `?? INVOICE_AUTHORIZED_AGENTS.find(... "Marios Polyviou")?.msisdn` when `INVOICE_ACCOUNTING_GROUP_MSISDN` is unset, then returns `true` — so every invoice silently goes to Marios's DM and the operator sees success, defeating the entire phase. The credit-note group sender at documents.ts:386-388 has the IDENTICAL fallback and must be fixed in the same pass (same file, same root cause, same write set). The env var is absent from `.env.example`, so nothing tells the operator to provision it at setup.

**Acceptance Criteria:**
- When `INVOICE_ACCOUNTING_GROUP_MSISDN` is set, both group senders post to that number exactly as before (no behavior change on the configured happy path).
- When `INVOICE_ACCOUNTING_GROUP_MSISDN` is unset, `sendDocumentToAccountingGroup` sends NOTHING to any personal number, emits a `sendLogger.warn` ("accounting group not configured"), and returns `false` — so the caller / Task-1 `fullyIssued` flag treats it as a failed group send and the operator gets the partial-failure toast.
- When `INVOICE_ACCOUNTING_GROUP_MSISDN` is unset, the credit-note group sender (documents.ts:386-388 path) likewise sends nothing to a personal number and warn-logs instead.
- `grep -c "Marios Polyviou" lib/invoices/actions/documents.ts` returns `1` — only the legitimate DM-to-Marios approval path (documents.ts:130) remains; both group-fallback occurrences (was 386-388 and 424-426) are gone.
- `.env.example` contains `INVOICE_ACCOUNTING_GROUP_MSISDN=` with an explanatory comment.
- `npx tsc --noEmit` exits 0.

**Action:**
1. **`sendDocumentToAccountingGroup` (documents.ts:424-426).** Replace:
   ```
   const groupMsisdn =
     process.env.INVOICE_ACCOUNTING_GROUP_MSISDN ??
     INVOICE_AUTHORIZED_AGENTS.find((agent) => agent.name === "Marios Polyviou")?.msisdn;
   ```
   with:
   ```
   const groupMsisdn = process.env.INVOICE_ACCOUNTING_GROUP_MSISDN?.trim() || undefined;
   ```
   The existing guard at documents.ts:427-430 (`if (!groupMsisdn) { sendLogger.warn("No accounting group number configured; group message not sent"); return false; }`) already handles the unset case correctly — once the fallback is removed it returns `false` with a warn-log and never sends. Keep that guard.
2. **Credit-note group sender (documents.ts:386-388).** Apply the same replacement: `const groupMsisdn = process.env.INVOICE_ACCOUNTING_GROUP_MSISDN?.trim() || undefined;`. Confirm the existing `if (!groupMsisdn)` guard at documents.ts:389 returns/skips the send and warn-logs (read those lines first — if it does not already warn-log, add `sendLogger.warn("No accounting group number configured; credit-note message not sent");` before the early return). Do not add a personal-number send.
3. **`.env.example`.** Append:
   ```
   # Accounting WhatsApp GROUP MSISDN (digits, e.g. 35799000000) that issued invoices
   # and credit notes are posted to. REQUIRED for group routing — if unset, no group
   # message is sent (the app will NOT fall back to anyone's personal number).
   INVOICE_ACCOUNTING_GROUP_MSISDN=
   ```
4. Do not modify the legitimate Marios DM approval path at documents.ts:130 — that is the Sophia/WhatsApp approval flow, out of scope and verified untouched.

**Validation:** (builder self-check)
- `grep -c "Marios Polyviou" lib/invoices/actions/documents.ts` → `1`
- `grep -c "INVOICE_ACCOUNTING_GROUP_MSISDN" lib/invoices/actions/documents.ts` → `2` (both senders)
- `grep -c "INVOICE_ACCOUNTING_GROUP_MSISDN" .env.example` → `1`
- `npx tsc --noEmit 2>&1 | grep -c "error TS"` → `0`

**Context:** Read @lib/invoices/actions/documents.ts @lib/invoices/constants.ts @.env.example @.planning/phase-1-verification.md

---

## Success Criteria
- [ ] A partial failure in the admin auto-issue chain (composer or draft-act) shows an honest distinct toast, never the false full-success message. (Gaps 1 + 2)
- [ ] On `handleCreate` partial failure the UI reconciles to the real DB state, not the stale `created` snapshot. (Gap 1)
- [ ] `handleAct` "draft" failures surface an error toast instead of silence. (Gap 2)
- [ ] With `INVOICE_ACCOUNTING_GROUP_MSISDN` unset, no invoice or credit-note notification reaches any personal number; both senders return/skip with a warn-log. (Gap 3)
- [ ] `INVOICE_ACCOUNTING_GROUP_MSISDN` is documented in `.env.example`. (Gap 3)
- [ ] `npx tsc --noEmit` and `npm run build` pass.

## Verification Contract

### Contract for Task 1 — partial-failure toast exists
**Check type:** grep-match
**Command:** `grep -c "Invoice numbered — mark paid manually" components/invoices/redesign/App.tsx`
**Expected:** `1`
**Fail if:** Returns 0 — `handleCreate` still has only the unconditional success toast.

### Contract for Task 1 — fullyIssued flag gates the toast
**Check type:** grep-match
**Command:** `grep -c "fullyIssued" components/invoices/redesign/App.tsx`
**Expected:** Non-zero (≥ 3 — declaration, set-true, ternary read)
**Fail if:** Returns 0 — success toast is not gated behind full-chain completion.

### Contract for Task 1 — handleCreate catch reconciles to real state
**Check type:** grep-match
**Command:** `grep -c "loadDocumentsAction()" components/invoices/redesign/App.tsx`
**Expected:** Non-zero (≥ 1)
**Fail if:** Returns 0 — partial-failure path still reconciles the stale `created` snapshot.

### Contract for Task 1 — handleAct draft error toast exists
**Check type:** grep-match
**Command:** `grep -c "Couldn't issue this invoice" components/invoices/redesign/App.tsx`
**Expected:** `1`
**Fail if:** Returns 0 — `startTransition` draft body still has no catch / no error toast.

### Contract for Task 2 — personal-DM fallback removed
**Check type:** grep-match
**Command:** `grep -c "Marios Polyviou" lib/invoices/actions/documents.ts`
**Expected:** `1`
**Fail if:** Returns ≥ 2 — a group-send path still falls back to Marios's personal number.

### Contract for Task 2 — both senders read the env var
**Check type:** grep-match
**Command:** `grep -c "INVOICE_ACCOUNTING_GROUP_MSISDN" lib/invoices/actions/documents.ts`
**Expected:** `2`
**Fail if:** Returns < 2 — one of the two group senders was missed.

### Contract for Task 2 — env var documented
**Check type:** grep-match
**Command:** `grep -c "INVOICE_ACCOUNTING_GROUP_MSISDN" .env.example`
**Expected:** Non-zero (≥ 1)
**Fail if:** Returns 0 — the env gap is still invisible at setup.

### Contract for Tasks 1 + 2 — typecheck clean
**Check type:** command-exit
**Command:** `npx tsc --noEmit 2>&1 | grep -c "error TS"`
**Expected:** `0`
**Fail if:** Any TypeScript compilation errors.

### Contract for Tasks 1 + 2 — build clean
**Check type:** command-exit
**Command:** `npm run build >/dev/null 2>&1 && echo BUILD_OK`
**Expected:** `BUILD_OK`
**Fail if:** Build fails.
