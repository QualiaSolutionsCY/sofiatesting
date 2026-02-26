# Quick Task 1 Summary: Fix Sophia Upload Blocking

## Issues Found & Fixed

### Issue 1: Broken AI Model (CRITICAL)
- **Root Cause:** Model was changed to `google/gemini-3.1-pro-preview-customtools` which is a preview model that doesn't properly extract tool arguments from conversation context
- **Symptom:** Sophia called `createPropertyListing` with empty `{}` arguments, so ALL required fields appeared "missing" even though the user provided everything
- **Fix:** Reverted to `google/gemini-2.0-flash` (the stable, proven model)
- **File:** `supabase/functions/sophia-bot/services/ai-chat.ts:260`

### Issue 2: Duplicate Detection Blocking Uploads
- **Root Cause:** `listing_uploads` check in executor.ts returned an error and blocked upload entirely when a property in the same area was uploaded within 2 hours
- **Symptom:** "A listing for this property was already uploaded recently" error shown to agent, preventing even different properties in the same location
- **Fix:** Changed to informational-only — logs warning, sets `potentialDuplicateNote`, flags `field_ai_probably_exists` on Zyprus, but NEVER blocks the upload
- **File:** `supabase/functions/sophia-bot/tools/executor.ts:491-523`

### Issue 3: forceUpload Parameter Cleanup
- **Root Cause:** `forceUpload` boolean was added to tool definitions as a workaround for Issue 2
- **Fix:** Removed since duplicate detection no longer blocks. Cleaned up from both definitions.ts and executor.ts
- **File:** `supabase/functions/sophia-bot/tools/definitions.ts`

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/sophia-bot/services/ai-chat.ts` | Model: `gemini-3.1-pro-preview-customtools` → `gemini-2.0-flash` |
| `supabase/functions/sophia-bot/tools/executor.ts` | Duplicate check: blocking → informational (logs + flags on Zyprus) |
| `supabase/functions/sophia-bot/tools/definitions.ts` | Removed `forceUpload` parameter |

## Deployment

- Deployed to production via `supabase functions deploy sophia-bot --no-verify-jwt`
- All logs showing 200 OK on version 860+
- Chat history cleared for affected agent numbers

## Verification

- Edge function logs: All 200s, no errors
- Pending images: Intact for active conversations
- Upload locks: Clean
- Ready for agent to retry upload
