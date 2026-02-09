# Listing Upload Gaps — Implementation Plan

> Generated from gap analysis comparing meeting docs (`docs/UPLOAD-LISTINGS-EXTENSIVE-INFO/FROM-MEETINGS/`) against actual implementation. Each item references the original spec document.

---

## Status Legend

- [ ] Not started
- [x] Completed
- [~] In progress

---

## Phase 1: Quick Fixes (tool definitions + enums)

These are 5-10 line changes each. No new files needed.

### 1.1 Add "share_of_land" to title deed enum
- **Spec**: `05_REQUIRED_FIELDS.md` — Title deed options include "Share of Land"
- **File**: `supabase/functions/sophia-bot/tools/definitions.ts` line ~97
- **Change**: Add `"share_of_land"` to `titleDeedStatus` enum
- **Also**: Update `description-generator.ts` `formatTitleDeedStatus()` to handle it
- [x] Completed

### 1.2 Add `condition` field to tool definition
- **Spec**: `05_REQUIRED_FIELDS.md` — Property condition should be captured
- **File**: `supabase/functions/sophia-bot/tools/definitions.ts`
- **Change**: Add `condition` property with enum `["new", "excellent", "good", "fair", "needs_renovation"]`
- **Also**: Wire through `executor.ts` → `description-generator.ts` (already renders it)
- [x] Completed

### 1.3 Add `orientation` field to tool definition
- **Spec**: `05_REQUIRED_FIELDS.md` — Compass orientation
- **File**: `supabase/functions/sophia-bot/tools/definitions.ts`
- **Change**: Add `orientation` property with enum `["north", "south", "east", "west", "northeast", "northwest", "southeast", "southwest"]`
- **Also**: Wire through `executor.ts` → `description-generator.ts` (already has interface field)
- [x] Completed

### 1.4 Add `priceModifier` field (No VAT / Plus VAT / VAT Included)
- **Spec**: `05_REQUIRED_FIELDS.md` — Price modifier for VAT status
- **File**: `supabase/functions/sophia-bot/tools/definitions.ts`
- **Change**: Add `priceModifier` with enum `["no_vat", "plus_vat", "vat_included"]`
- **Also**: Pass through `executor.ts` → `client.ts` to set `field_price_modifier`
- **Note**: Need UUID mapping for each option in `business-rules.ts`
- [x] Completed

### 1.5 Fix CLAUDE.md — Michelle rentals reviewer 2
- **Spec**: `02_REVIEWER_ASSIGNMENTS.md` — Michelle rentals have Reviewer 2 = requestlimassol
- **File**: `CLAUDE.md`
- **Change**: Fix the table that says "Reviewer 2 = NONE" for Michelle to say "Reviewer 2 = requestlimassol@zyprus.com"
- [x] Completed

---

## Phase 2: Medium Complexity

### 2.1 List available agents for management assignment
- **Spec**: `13_STANDARD_MESSAGES.md` — Management should see available agents
- **Files**:
  - `supabase/functions/sophia-bot/tools/definitions.ts` — Add `getRegionalAgents` tool
  - `supabase/functions/sophia-bot/tools/executor.ts` — Implement handler
  - `supabase/functions/sophia-bot/agents/identifier.ts` — `getAgentsByRegion()` already exists
- **Change**: New tool that returns agent names and emails for a given region
- [x] Completed

### 2.2 Batch upload support (multiple properties)
- **Spec**: `11_WORKFLOW_STEPS.md`, `13_STANDARD_MESSAGES.md`
- **Files**:
  - `supabase/functions/sophia-bot/tools/executor.ts` — Modify upload lock logic
- **Change**: Upload lock should be per-property (use a property hash: location+price+owner), not per-agent. This allows sequential uploads from same agent for different properties.
- [x] Completed

### 2.3 Publication notification
- **Spec**: `11_WORKFLOW_STEPS.md` — Notify agent when listing published
- **Files**:
  - `supabase/functions/_shared/db.ts` — `trackListingUpload()`, `getPendingListingUploads()`, `markListingPublished()`, `markListingExpired()`
  - `supabase/functions/listing-notifier/index.ts` — New edge function that polls Zyprus API
  - `supabase/functions/sophia-bot/tools/executor.ts` — Calls `trackListingUpload()` after successful upload
- **Change**: Polls Zyprus API every 15 min to check if drafted listings are published, sends WhatsApp notification
- **Deploy steps**:
  1. Create `listing_uploads` table (SQL in `_shared/db.ts` comments)
  2. `supabase functions deploy listing-notifier --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx`
  3. `supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx`
  4. Set up pg_cron schedule (see listing-notifier/index.ts header comment)
- [x] Completed — Deployed 2026-02-07. Table created, pg_cron job #7 (every 15 min)

---

## Phase 3: High Complexity

### 3.1 Bazaraki link extraction
- **Spec**: `08_IMAGE_HANDLING.md`, `11_WORKFLOW_STEPS.md`, `13_STANDARD_MESSAGES.md`
- **What it does**: When agent sends a Bazaraki link, SOPHIA scrapes the listing page to extract:
  - Photos (direct image URLs)
  - Price
  - Location
  - Property type, bedrooms, bathrooms, area
  - Description text
  - Features
- **Files**:
  - NEW: `supabase/functions/sophia-bot/services/bazaraki-scraper.ts` — Scraper with HTML + URL fallback
  - `supabase/functions/sophia-bot/tools/definitions.ts` — Added `extractFromBazaraki` tool
  - `supabase/functions/sophia-bot/tools/executor.ts` — Added handler + import
- **Implementation notes**:
  - Two-phase extraction: tries HTML fetch first, falls back to URL pattern parsing
  - Bazaraki has Cloudflare protection (403 likely) — URL pattern extraction is the reliable fallback
  - Extracted data returned to AI which pre-fills `createPropertyListing` fields
  - AI still asks agent for: owner name, phone, title deed status, and confirmation
  - Bazaraki image watermark warnings automatically included
- [x] Completed

### 3.2 Floor plan separate upload
- **Spec**: `05_REQUIRED_FIELDS.md`, `08_IMAGE_HANDLING.md`
- **Files**:
  - `supabase/functions/sophia-bot/tools/definitions.ts` — Added `floorPlanUrls` field
  - `supabase/functions/sophia-bot/tools/executor.ts` — Passes `floorPlanUrls` to listing data
  - `supabase/functions/sophia-bot/zyprus/client.ts` — Added `floorPlanUrls` to `ListingData`, `uploadFloorPlans()` function, `field_floor_plan` relationship in payload
- **Zyprus fields**: `field_floor_plan` (images), `field_pdf_floor_plan` (PDFs)
- [x] Completed

---

## Deployment Status

All phases implemented and deployed on **2026-02-07**.

| Phase | Item | Status |
|-------|------|--------|
| 1.1 | share_of_land enum | Deployed |
| 1.2 | condition field | Deployed |
| 1.3 | orientation field | Deployed |
| 1.4 | priceModifier field | Deployed |
| 1.5 | CLAUDE.md Michelle fix | Deployed |
| 2.1 | getRegionalAgents tool | Deployed |
| 2.2 | Per-property upload locks | Deployed |
| 2.3 | Publication notification | Deployed (pg_cron job #7, every 15 min) |
| 3.1 | Bazaraki scraper | Deployed |
| 3.2 | Floor plan upload | Deployed |

### Infrastructure Created
- **Table**: `listing_uploads` (with RLS enabled)
- **Edge Function**: `listing-notifier` (polls Zyprus API for published listings)
- **pg_cron**: Job #7 — calls listing-notifier every 15 minutes

---

*Created: 2026-02-07*
*Last updated: 2026-02-07*
