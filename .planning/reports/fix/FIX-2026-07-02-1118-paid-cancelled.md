# Fix Report - 2026-07-02 11:18

**Symptom:** Cancelled/credited invoices showing under the "Paid" filter (screenshot: 3 CANCELLED rows under Paid).
**Mode:** quick
**Outcome:** fixed

## Root Cause
`components/invoices/redesign/ledger/ListPane.tsx` "Paid" branch — the predicate accepted any invoice with paidOn/receiptNo, but a paid-then-voided invoice keeps that stamp while its stage flips to cancelled/credited (Doc has no paymentStatus field), so voided invoices leaked into "Paid".

## Patch
- Files changed: `components/invoices/redesign/ledger/ListPane.tsx`
- Added a guard: exclude `stage === CANCELLED || stage === CREDITED` from the "Paid" filter. They already live under the "Cancelled" filter (and the row chip already shows "Cancelled" first). Each invoice now under exactly one correct filter.

## Verification
- `npx tsc --noEmit` - PASS (exit 0)
- invoice tests - PASS (49/49)
