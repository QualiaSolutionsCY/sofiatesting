# Fix Report - 2026-07-02 11:41

**Symptom:** The "Invoice" title was dead-center of the page ("too much in the center"). Reference Invoice 11491 has it centered over the Date/No/Due block on the right.
**Mode:** quick
**Outcome:** fixed

## Root Cause
Prior fix centered the title over the whole page: pdf.ts used (ML+MR)/2 and the preview .template-title was a full-width text-align:center heading above the header grid.

## Patch (preview + PDF kept in sync)
- lib/invoices/pdf.ts: title centered over the meta block (metaBlockLeft..MR), not the page.
- components/invoices/redesign/ledger/TemplatePreview.tsx: moved .template-title back INTO the right (meta) column, centered over it.
- app/invoices/invoices.css: .template-title centered within the column; restored .template-header padding-top.

## Verification
- npx tsc --noEmit - PASS (exit 0)
- Regenerated PDF (Invoice 11491 data) - title renders top-right, centered over Date/No/Due
