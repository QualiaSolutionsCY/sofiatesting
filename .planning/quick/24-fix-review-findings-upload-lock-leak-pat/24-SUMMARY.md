# Summary: 24 — Fix review findings for production readiness

**Completed:** 2026-03-11

## Changes Made

### Task 1: Upload lock leak on early returns (CRITICAL)
- Added `await releaseUploadLock(uploadLockKey)` before 3 early returns in `property-listing.ts`
- Lines: ~216 (not enough images), ~244 (Zyprus token failure), ~355 (no valid images)
- Impact: Agents no longer get stuck unable to re-upload when errors occur mid-pipeline

### Task 2: PATCH retry logic — break on 4xx (HIGH)
- Changed `continue` to `break` for 4xx errors in `property-api.ts` title deed PATCH retry
- 403 (permissions) errors now abort immediately instead of wasting 3 retries
- 5xx errors still retry with backoff as intended

### Task 3: Email rotation key mismatch (HIGH)
- `router.ts` was reading rotation with key `"email_paphos"` but `index.ts` wrote with bare `"paphos"`
- Fixed `router.ts` to use bare region names (`"paphos"`) consistently
- Round-robin between Marios/Dimitris now works correctly

### Task 4: MIME type allowlist for email attachments (HIGH)
- Added strict allowlist in `sophia-handler.ts`: jpeg, png, webp, gif, heic only
- SVG (XSS risk via embedded scripts in public bucket) is now blocked
- Non-image MIME types rejected before upload

### Task 5: releaseUploadLock error handling (HIGH)
- `upload-lock.ts` now checks and logs Supabase delete errors
- Previously, failed deletes were silently swallowed, leaving agents locked

### Task 6: Listing-owner security fixes (CRITICAL)
- Removed `console.log` that leaked first 8 chars of admin secret on every request
- Replaced `!==` string comparison with constant-time XOR comparison (timing attack prevention)
- Added `nid` parameter validation (`/^\d+$/`) to prevent query injection

### Task 7: Duplicate location entry (LOW)
- Removed duplicate `"letymvou"` from Paphos locations in `business-rules.ts`

### Bonus: Reviewer UUID display fix (LOW)
- Success message now shows `listingOwnerName` instead of raw UUID for reviewer

## Files Modified
- `supabase/functions/sophia-bot/tools/handlers/property-listing.ts`
- `supabase/functions/sophia-bot/zyprus/property-api.ts`
- `supabase/functions/sophia-bot/tools/validators/upload-lock.ts`
- `supabase/functions/sophia-bot/config/business-rules.ts`
- `supabase/functions/listing-owner/index.ts`
- `services/email-router/src/router.ts`
- `services/email-router/src/sophia-handler.ts`
