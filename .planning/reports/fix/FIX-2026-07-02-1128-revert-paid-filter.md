# Fix Report - 2026-07-02 11:28

**Symptom:** Invoice filtering "messed up" — it worked normally before. Each filter should simply show its own type of invoice.
**Mode:** quick
**Outcome:** fixed (revert)

## Root Cause
My two prior filter changes (bfef379 "Paid = real payments"; f2e64cb "exclude cancelled/credited") replaced the simple stage-based "Paid" filter with payment-based logic. That changed which invoices appeared under "Paid" (dropped sent-to-accounting-but-unpaid, relabeled their chip "Approved") and introduced the cancelled-leak that then needed a second patch. Net: over-complicated filtering that regressed the working behavior.

## Patch
- File changed: `components/invoices/redesign/ledger/ListPane.tsx` — reverted to the pre-change version (cbbd5f5). "Paid" is stage-based again (stage === sent-to-accounting); each filter shows its own type; chip logic restored. No other files touched (email signature, centered title, and middleware fix are unrelated and kept).

## Verification
- `git diff cbbd5f5 -- ListPane.tsx` → empty (byte-identical to the known-good original)
- `npx tsc --noEmit` - PASS (exit 0)

## Remaining Notes
- The original "Paid count vs Receipts count" question (the very first request) is intentionally NOT re-touched — the owner prefers the simple stage-based filtering. If it needs revisiting, do it as a deliberate, separately-scoped change, not a filter-logic rewrite.
