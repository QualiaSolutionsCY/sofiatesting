# Quick Task 1: Fix All Things Blocking Sophia From Uploading

## Context

Sophia was failing to upload property listings for agents. Three distinct issues identified through live debugging with Lauren Ellingham:

1. **Broken AI model** — `google/gemini-3.1-pro-preview-customtools` was calling `createPropertyListing` tool with **empty arguments**, causing all required fields to appear "missing" even though the user provided everything
2. **Duplicate detection blocking uploads** — The `listing_uploads` check in executor.ts returned an error and blocked the upload entirely, even for different properties in the same area
3. **forceUpload parameter leaking to users** — The `forceUpload=true` hint was shown raw to agents instead of being handled internally

## Tasks

### Task 1: Switch AI model back to stable Gemini 2.0 Flash
- **File:** `supabase/functions/sophia-bot/services/ai-chat.ts`
- **Change:** Replace `google/gemini-3.1-pro-preview-customtools` with `google/gemini-2.0-flash`
- **Why:** The preview model doesn't extract tool arguments from conversation context — calls tools with `{}`
- **Status:** DONE (already applied)

### Task 2: Make duplicate detection informational-only (never block)
- **File:** `supabase/functions/sophia-bot/tools/executor.ts`
- **Change:** Remove the early return that blocks uploads. Instead, log a warning, set `potentialDuplicateNote`, and flag `field_ai_probably_exists` on Zyprus
- **Why:** Per Zyprus workflow docs: "Do NOT refuse to upload because of potential duplicate" — always upload, just flag it
- **Status:** DONE (already applied)

### Task 3: Clean up forceUpload parameter (no longer needed)
- **File:** `supabase/functions/sophia-bot/tools/definitions.ts`
- **Change:** Remove the `forceUpload` parameter from `createPropertyListing` tool definition since duplicate detection no longer blocks
- **Status:** TODO

### Task 4: Deploy and verify
- Deploy sophia-bot edge function
- Verify no errors in logs
