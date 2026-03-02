# Quick Task 20: Summary

## What Changed
Fixed all prompt rules that caused Sophia to output empty brackets `[ ]` in blank templates. Agents now see descriptive placeholders like `[DATE]`, `[FULL NAME]`, `[COUNTRY]`, `[PROPERTY DESCRIPTION]` so they know what each field requires.

## Changes Made

### 1. viewing-forms.ts — 4 blank template sections fixed
Replaced every `[ ]` with descriptive field names across all 4 blank template formats:
- Standard Viewing Form (single person): `Date: [ ]` → `Date: [DATE]`, etc.
- Standard Viewing Form (multiple people): same fixes
- Advanced Viewing Form (single person): same fixes
- Advanced Viewing Form (multiple people): same fixes

### 2. safety-rules.ts — "leave blank" rule fixed
- Before: "Leave the missing fields BLANK (empty) in the generated document/template"
- After: "Keep the original template placeholders for the missing fields (e.g., [Client's Name], [DATE], [ID NUMBER]) — NEVER output empty brackets [ ]"

### 3. document-routing.ts — "left BLANK" rule + field prompts fixed
- Before: "generate the template with those fields left BLANK"
- After: "generate the template with those fields showing their original template placeholders (e.g., [Client's Name], [DATE]) — NEVER output empty brackets [ ]"
- All 7 instances of "leave blank if not known" → "use [CLIENT'S NAME] if not known"

## Verification
- `npx tsc --noEmit` passes clean
- No remaining `[ ]` in prompt template output sections (only in "NEVER use `[ ]`" prohibition rules and markdown checkboxes)
- The existing DOCX parser guard in reservation-agreement.ts (line 967-968) is consistent — it already falls back to `[PROSPECTIVE BUYER]` when it detects empty brackets

## Deploy Required
Edge function `sophia-bot` needs redeployment for changes to take effect.
