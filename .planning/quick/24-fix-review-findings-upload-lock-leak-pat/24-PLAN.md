# Plan: 24 — Fix review findings for production readiness

**Mode:** quick (no-plan)
**Created:** 2026-03-11

## Task 1: Fix upload lock leak on early returns
**What:** Add `releaseUploadLock(uploadLockKey)` before 3 early returns in property-listing.ts (lines ~216, ~243, ~354)
**Files:** supabase/functions/sophia-bot/tools/handlers/property-listing.ts
**Done when:** All early-return paths release the upload lock

## Task 2: Fix PATCH retry logic — break on 4xx, not continue
**What:** Change `continue` to `break` for 4xx errors in property-api.ts and land-api.ts PATCH retry blocks
**Files:** supabase/functions/sophia-bot/zyprus/property-api.ts, supabase/functions/sophia-bot/zyprus/land-api.ts
**Done when:** 4xx errors abort retries immediately

## Task 3: Fix email rotation key mismatch
**What:** Make rotation key consistent between router.ts read and index.ts write
**Files:** services/email-router/src/router.ts, services/email-router/src/index.ts, services/email-router/src/db.ts
**Done when:** Same key format used for both read and write operations

## Task 4: Add MIME type allowlist for email attachment uploads
**What:** Block SVG and non-image MIME types in sophia-handler.ts, map to safe extensions
**Files:** services/email-router/src/sophia-handler.ts
**Done when:** Only jpeg/png/webp/gif/heic accepted, SVG blocked

## Task 5: Fix releaseUploadLock error swallowing
**What:** Check and log Supabase delete errors in upload-lock.ts
**Files:** supabase/functions/sophia-bot/tools/validators/upload-lock.ts
**Done when:** Failed lock releases are logged with warning

## Task 6: Remove secret logging in listing-owner
**What:** Remove console.log that exposes first 8 chars of admin secret
**Files:** supabase/functions/listing-owner/index.ts
**Done when:** No secret material in logs

## Task 7: Fix duplicate "letymvou" in business-rules.ts
**What:** Remove duplicate entry from Paphos locations
**Files:** supabase/functions/sophia-bot/config/business-rules.ts
**Done when:** No duplicate entries
