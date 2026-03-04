# Summary: Quick Task 21

**Task:** Fix title deed attachment failure + image ordering bug
**Date:** 2026-03-04
**Commit:** 119266d

## What Was Fixed

### Bug 1: Title Deed PATCH 403 (Draft 40323)
**Root cause:** Drupal service account lacks permission to PATCH `field_title_deed_file` onto an existing node. The file uploaded fine, but attaching it to the listing always returned 403.

**Fix:** Include `field_title_deed_file` as a relationship in the initial POST payload (same pattern as `field_floor_plan`). Node creation via POST has different Drupal permissions than PATCH updates. The PATCH fallback is retained in case POST also rejects the field.

**Files changed:**
- `supabase/functions/sophia-bot/zyprus/property-api.ts` — Added `titleDeedFileIds` to `buildJsonApiPayload()`, included in POST relationships, added POST-first-then-PATCH-fallback logic
- `supabase/functions/sophia-bot/zyprus/land-api.ts` — Same fix for land listings

### Bug 2: Image Ordering Race Condition
**Root cause:** `validateImages()` in `image-handler.ts` used `Promise.all` with `.push()` to build the valid images array. Since network checks complete in unpredictable order, images were returned in random order instead of the agent's intended sequence.

**Fix:** Rewrote to collect results paired with their original index, then iterate in order.

**Files changed:**
- `supabase/functions/sophia-bot/services/image-handler.ts` — Rewrote `validateImages()` to preserve original array order

### Validation Completeness (Verified)
Reviewed the full upload pipeline:
1. Field validation (validateAndPrepareFields) - Complete
2. Image processing + classification (processListingImages) - Complete
3. Image count check (hasEnoughImages) - Complete
4. Zyprus auth (getAccessToken) - Complete
5. Image validation (validateImages) - Fixed ordering
6. Duplicate check (checkForDuplicates) - Complete
7. Location resolution (findLocationUuid) - Complete
8. Coordinate resolution with privacy offset - Complete
9. VAT safeguard - Complete
10. Feature auto-injection (pool, parking, penthouse, playroom) - Complete
11. Content generation - Complete
12. Listing creation with all relationships - Complete

No validation steps are being skipped.

## Deployment
- sophia-bot edge function deployed and verified (HTTP 200)
