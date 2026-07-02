# Fix Report - 2026-07-02 11:18

**Symptom:** The "Invoice" title in the header is top-right; reference Invoice 11491 has it centered. Move it, and keep the on-screen preview and the downloadable PDF identical.
**Mode:** quick
**Outcome:** fixed

## Root Cause
Title was right-anchored in both renderers: `lib/invoices/pdf.ts` (`textRight(MR,768,...)`) and the preview `<h3>` sat in the right column of the `.template-header` grid with CSS `text-align: right`.

## Patch (kept preview == PDF)
- `lib/invoices/pdf.ts`: title now centered at `(ML+MR)/2`.
- `components/invoices/redesign/ledger/TemplatePreview.tsx`: moved `<h3 class="template-title">` OUT of the right column to a full-width heading above `.template-header`.
- `app/invoices/invoices.css`: replaced `.template-header h3` (text-align:right) with `.template-title` (text-align:center); reduced `.template-header` padding-top; removed the dead `.template-header h3` mobile override.
- PDF Qty/columns left as-is per owner ("keep things as is").

## Verification
- `npx tsc --noEmit` - PASS (exit 0); invoice tests - PASS (49/49)
- Regenerated PDF (Invoice 11469 data) - title renders CENTERED at the top ✓
