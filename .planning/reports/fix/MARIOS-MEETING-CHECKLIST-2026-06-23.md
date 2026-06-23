# Invoicing — Marios Meeting Checklist (2026-06-23)

All fixes are **deployed to production** (https://sofiatesting.vercel.app/invoices) and validated.
Commits on `feature/moayad-invoicing-access`: `a398119`, `ccafad3`, `d992ecc`, `3051ece`.

## What was fixed
| # | Bug (before) | Fix (now) | Where |
|---|--------------|-----------|-------|
| 1 | "Included VAT" invoice printed **V.A.T 16%** + Subtotal = gross (€35,000) | Always **19%**, Subtotal = net (€29,411.76), Subtotal+VAT=Total | `lib/invoices/pdf.ts` |
| 2 | After approval **Marios's copy was dropped** (only the group got it) | Document **send now retries** with backoff → every recipient gets their copy | `lib/whatsapp/client.ts` |
| 3 | Credit note showed only "Credit note for invoice X" (no original description) | Now **"Credit note for invoice no X" + the original invoice's description** | `document-actions.ts`, `pdf.ts`, `format.ts`, `TemplatePreview.tsx` |
| 4 | Credit note **"Applies to invoice"** field showed a **date** | Shows the **source invoice number** (read-only) | `DetailPane.tsx` |
| 5 | Commission invoice approved from the **admin panel** posted to the group with a generic caption | Commission invoices post to the group **under the agent's name** | `actions/documents.ts` |

## Re-do steps with Marios (admin panel → https://sofiatesting.vercel.app/invoices)

### A. Included-VAT invoice → 19%
1. **New invoice** → client, set **VAT treatment = Including VAT**, amount **35000**, one line.
2. ✅ Confirm: **Subtotal €29,411.76 · V.A.T 19% €5,588.24 · Total €35,000** (NOT 16%).

### B. Approve → Marios + accounting group, right number
1. Open the draft → **Approve & send to accounting**.
2. ✅ Toast: "Approved — sent to Marios and the accounting group."
3. ✅ An **official № is assigned** and shows on the PDF.
4. ✅ **On Marios's phone:** he receives his copy **with the official number** (not just the group).

### C. Mark paid → issue receipt
1. On the approved invoice → **Mark as paid → issue receipt**.
2. ✅ Receipt shows **"Receipt for invoice no {N}" + original description**, **19% VAT**, and is **READ-ONLY** (immutable).

### D. Commission invoice → group post under agent name
1. **New invoice** → description containing **"commission"** (e.g. "Commission for property sale …"), **Commission flag = Yes — track agent**, **Agent of record = {agent name}**, amount.
2. Approve & send to accounting.
3. ✅ **In the accounting WhatsApp group:** the post caption is the **agent's name** (e.g. "Christos Lambrou"), with the invoice PDF attached.

### E. Credit note → linked to invoice, full description
1. On an **approved (unpaid)** invoice → **… menu → Cancel this invoice**.
   - Note: already-**paid** invoices can't be credit-noted (the option is disabled) — credit-note before marking paid.
2. ✅ Credit note line: **"Credit note for invoice no {N}" + the original invoice's description**.
3. ✅ **"Applies to invoice"** field = the **invoice number** (not a date).
4. ✅ **"Open linked credit note" / credit ↔ invoice link** works; the invoice moves to **Credited**.

### F. Filters
- ✅ Status filter (All / Draft / Invoices / Paid / Receipts / **Credited** / Cancelled …) narrows the list correctly.
- ✅ WhatsApp-created invoices appear in the panel (refresh on focus / refresh button).

## Two things only you can confirm (I can't see them from here)
- **D** — the exact caption in the **real accounting WhatsApp group** (agent name).
- **B** — that **Marios's phone** actually received his copy with the official number.

Validation invoices created during testing are clearly named **"TEST IGNORE …"** and can be ignored/deleted.
