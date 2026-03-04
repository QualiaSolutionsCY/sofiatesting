# Plan: 21 — Fix title deed attachment failure + image ordering bug

**Mode:** quick
**Created:** 2026-03-04

## Root Cause Analysis

### Bug 1: Title Deed PATCH 403
**File:** `supabase/functions/sophia-bot/zyprus/property-api.ts`

The title deed flow is:
1. Upload file to `/jsonapi/node/property/field_title_deed_file` → **WORKS** (returns file UUID)
2. Create listing POST without `field_title_deed_file` in relationships
3. PATCH listing to add `field_title_deed_file` → **FAILS 403** (Drupal permission)

**Fix:** Include `field_title_deed_file` in the initial POST payload (just like `field_floor_plan` already is at lines 366-374). The POST creates the node with all relationships at once, which may have different Drupal permissions than PATCH. Keep PATCH as fallback.

### Bug 2: Image Ordering Destroyed by validateImages()
**File:** `supabase/functions/sophia-bot/services/image-handler.ts`

`validateImages()` (lines 288-306) uses `Promise.all` with `.push()` to build the `valid` array. Since validation checks complete in unpredictable network order, the original image sequence is destroyed. Zyprus then receives photos in random order instead of the agent's intended order.

**Fix:** Replace the push-based approach with index-based filtering to preserve original order.

## Task 1: Include title deed files in initial POST payload

**What:** Add `titleDeedFileIds` parameter to `buildJsonApiPayload()` and include `field_title_deed_file` relationship in the POST body. Keep the existing PATCH as a fallback (in case POST inclusion also 403s for some listing types).

**Files:**
- `supabase/functions/sophia-bot/zyprus/property-api.ts` — Add parameter and relationship to buildJsonApiPayload, update createDraftListing to pass it

**Done when:** `field_title_deed_file` appears in the initial POST payload alongside `field_floor_plan`

## Task 2: Fix image ordering in validateImages()

**What:** Rewrite `validateImages()` to preserve original array order instead of push-order.

**Files:**
- `supabase/functions/sophia-bot/services/image-handler.ts` — Fix validateImages function

**Done when:** Valid images are returned in the same order they were passed in, regardless of network timing

## Task 3: Deploy and verify

**What:** Deploy sophia-bot edge function.

**Files:** None (deploy command only)

**Done when:** Edge function deployed successfully
