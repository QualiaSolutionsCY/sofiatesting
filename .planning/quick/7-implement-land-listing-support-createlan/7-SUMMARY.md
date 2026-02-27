---
phase: quick-7
plan: 1
subsystem: sophia-bot
tags: [land-listings, zyprus-api, tool-expansion]
dependency_graph:
  requires: [property-listing-system, zyprus-client, taxonomy-cache]
  provides: [land-listing-tool, land-upload-capability]
  affects: [agent-workflows, listing-uploads]
tech_stack:
  added: [land_type-taxonomy, infrastructure-taxonomy, field_land_gallery]
  patterns: [json-api-land-endpoint, land-specific-fields, building-regulations]
key_files:
  created:
    - supabase/functions/sophia-bot/tools/handlers/land-listing.ts (702 lines)
  modified:
    - supabase/functions/sophia-bot/tools/definitions.ts (add createLandListing tool)
    - supabase/functions/sophia-bot/tools/executor.ts (route to land handler)
    - supabase/functions/sophia-bot/zyprus/client.ts (add LandListingData, createDraftLandListing, buildJsonApiPayloadLand, uploadLandImages)
    - supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts (add landTypes, infrastructure, findLandTypeUuid, findInfrastructureUuids)
    - supabase/functions/sophia-bot/services/description-generator.ts (add LandDetails, generateLandDescription)
    - supabase/functions/sophia-bot/prompts/behaviors/property-upload.ts (add Land/Plot Listings section)
decisions:
  - decision: Separate handler file for land listings
    rationale: Cleaner separation, no risk of breaking property uploads, acceptable code duplication for validation logic
    alternatives: [Extend property-listing.ts with isLand flag]
  - decision: POST to /jsonapi/node/land endpoint
    rationale: Zyprus has separate land content type with different schema
    implementation: node--land type, field_land_gallery, field_land_size, field_land_type
  - decision: Reuse location correction and upload lock from properties
    rationale: Same validation rules apply (no street addresses, no city-only), same race condition prevention needed
  - decision: Land type enum limited to plot/field/agricultural
    rationale: Matches Zyprus land_type taxonomy terms from Postman spec
  - decision: Infrastructure as array of strings with taxonomy lookup
    rationale: Flexible input (electricity, water, road_access) with UUID resolution to taxonomy_term--infrastructure_
metrics:
  duration_minutes: 8
  completed_date: "2026-02-27"
  commits: 3
  files_modified: 7
  lines_added: 1680
  tests_added: 0
---

# Quick Task 7: Implement Land Listing Support (createLandListing)

**One-liner:** Agents can now upload land/plot listings via WhatsApp using createLandListing tool, posting to Zyprus /jsonapi/node/land with building regulations and infrastructure support.

## What Was Built

Extended Sophia's listing capabilities to support land (plots, fields, agricultural land) in addition to properties. Land listings use the Zyprus `node--land` content type with different fields and simpler requirements (no rooms, no indoor/outdoor features).

### Implemented Components

**1. Tool Definition (definitions.ts)**
- Added `createLandListing` tool to TOOLS array
- Required params: listingType, landType, price, location, landSize, ownerName, ownerPhone, imageUrls
- Optional params: buildingDensity, siteCoverage, maxFloors, maxHeight, infrastructure (array), views, titleDeedStatus, priceModifier, titleDeedFileUrls, coordinates, registrationNumber, specialNotes, areaDescription
- Land type enum: plot, field, agricultural
- Infrastructure values: electricity, water, road_access, sewage, telephone

**2. Executor Routing (executor.ts)**
- Route `createLandListing` to `handleCreateLandListing` from land-listing.ts
- Track land uploads with propertyType: "land"

**3. Land Listing Handler (land-listing.ts - NEW FILE, 702 lines)**

Modeled after property-listing.ts but simplified for land:

**Kept from property handler:**
- Agent identification + validation
- Region validation
- Upload lock (per-agent fingerprint)
- Location correction (street address detection, city-only blocking)
- Image processing (pending_images table, vision classification for title deeds, image validation)
- Pending documents retrieval
- Duplicate checking
- Reviewer assignment
- My Notes generation (owner info + Google Maps link + reviewer assignments + duplicate warnings)
- Coordinates resolution (from args, Google Maps URL, or defaults)
- Success message construction
- Listing tracking

**Removed from property handler:**
- Bedroom/bathroom validation
- EPC/year built/floor handling
- Pool type injection
- Parking features
- Unit breakdown
- Floor plan handling
- Indoor/outdoor feature processing

**Land-specific additions:**
- Call `generateLandDescription()` instead of `generateDescription()`
- Pass landType, landSize, buildingDensity, siteCoverage, maxFloors, maxHeight, infrastructure, views to Zyprus client

**4. Zyprus Client Functions (client.ts)**

**LandListingData interface:**
- Same structure as ListingData but replace bedrooms/bathrooms/coveredArea/plotSize with:
  - landType: string (plot/field/agricultural)
  - landSize: number (sqm, mandatory)
  - buildingDensity?: number (percentage)
  - siteCoverage?: number (percentage)
  - maxFloors?: number (integer)
  - maxHeight?: number (meters)
  - infrastructure?: string[] (electricity, water, etc.)
  - views?: string[] (sea view, mountain view)

**createDraftLandListing() function:**
- POST to `/jsonapi/node/land` (NOT /jsonapi/node/property)
- Resolve land-specific taxonomy UUIDs in parallel
- Upload images to `field_land_gallery` (NOT field_gallery_)
- Upload title deeds to same endpoint as properties
- Build JSON:API payload with `node--land` type

**buildJsonApiPayloadLand() function:**
- type: "node--land"
- Title format: "Plot (2,500m²) For Sale in Mesa Chorio, Paphos" (no bedrooms)
- Attributes: field_land_size (mandatory), field_building_density, field_site_coverage, field_floors, field_height
- Relationships:
  - field_land_type (taxonomy_term--land_type)
  - field_land_gallery (file--file array)
  - field_land_price_modifier (taxonomy_term--price_modifier)
  - field_land_title_deed (taxonomy_term--title_deed)
  - field_land_views (taxonomy_term--property_views)
  - field_infrastructure (taxonomy_term--infrastructure_)
  - field_location (node--location)
  - field_ai_listing_instructor, field_ai_listing_reviewer, uid (same as property)

**uploadLandImages() function:**
- Upload to `/jsonapi/node/land/field_land_gallery` endpoint
- Same SSRF protection, size limits, retry logic as property images

**5. Taxonomy Cache Functions (taxonomy-cache.ts)**

**Updated TaxonomyCache interface:**
- Add landTypes: TaxonomyItem[]
- Add infrastructure: TaxonomyItem[]

**Updated loadTaxonomy() and refreshTaxonomyInBackground():**
- Fetch `land_type` taxonomy
- Fetch `infrastructure_` taxonomy (note trailing underscore)

**findLandTypeUuid(landType: string):**
- Try exact match, partial match, return first available
- Fallback: empty string (land type is optional)

**findInfrastructureUuids(infrastructure: string[]):**
- Try exact match, normalized match (replace underscores/hyphens), partial match
- Return array of matched UUIDs
- Handles input like ["electricity", "water", "road_access"]

**6. Land Description Generator (description-generator.ts)**

**LandDetails interface:**
- landType, listingType, landSize, location, titleDeedStatus
- buildingDensity, siteCoverage, maxFloors, maxHeight
- infrastructure (array), views (array)
- price, areaDescription, priceModifier

**generateLandDescription() function:**

Structure:
1. Opening paragraph: land type + size + location
2. Building regulations paragraph (if provided): "Building regulations allow 60% building density, 40% site coverage, up to 3 floors, maximum height of 12.5m."
3. Infrastructure paragraph (if provided): "The plot has electricity, water and road access available."
4. Views paragraph (if provided): "The land offers sea view and mountain view."
5. Area description (agent-provided or from LOCATION_DESCRIPTIONS)
6. Title deed paragraph (status-specific messaging)
7. Price paragraph (with VAT handling)
8. Closing CTA: "For more information or to arrange a viewing, please contact us today."

**7. Prompt Update (property-upload.ts)**

Added section before "Tool Usage":

```markdown
## Land/Plot Listings

When an agent wants to upload **LAND** (plot, field, agricultural land), use **createLandListing** instead of createPropertyListing.

**Required data for land:**
- Location (area + district)
- Land size in sqm
- Price
- Owner name + phone
- Photos (at least 1 photo of the land)
- Land type: plot (building plot), field (undeveloped land), or agricultural (farming land)

**Optional but valuable:**
- Building density (e.g., 60%)
- Site coverage (e.g., 40%)
- Max floors allowed (e.g., 3)
- Max height allowed (e.g., 12.5m)
- Infrastructure: electricity, water, road_access, sewage, telephone
- Title deed status
- Registration number
- Google Maps link
- Views (sea view, mountain view, etc.)

**Land listings have NO bedrooms/bathrooms, NO covered area.** Use field_land_size for total land area.

**Example:** Agent says "I want to upload a plot of land for sale in Paphos, 2500 sqm, price €250,000, has electricity and water, building density 60%, coverage 40%, separate title deeds" → Use createLandListing with landType: "plot", landSize: 2500, price: 250000, infrastructure: ["electricity", "water"], buildingDensity: 60, siteCoverage: 40, titleDeedStatus: "separate".
```

## Key Implementation Details

### Field Name Differences

| Aspect | Property | Land |
|--------|----------|------|
| Endpoint | POST /jsonapi/node/property | POST /jsonapi/node/land |
| Type field | field_property_type | field_land_type |
| Gallery field | field_gallery_ (trailing underscore) | field_land_gallery (no trailing underscore) |
| Price modifier | field_price_modifier | field_land_price_modifier |
| Title deed | field_title_deed | field_land_title_deed |
| Size field | field_covered_area (mandatory) | field_land_size (mandatory) |
| Views | field_property_views | field_land_views |

### Infrastructure Taxonomy

Machine name: `infrastructure_` (with trailing underscore)
Resource type: `taxonomy_term--infrastructure_`
Example values: Electricity, Water, Road Access, Sewage, Telephone

Input is normalized (underscores → spaces) so agents can say "road access" and it maps to "Road Access" taxonomy term.

### Title Generation

**Property:** "2 Bedroom Villa (125m²) For Sale in Mesa Chorio, Paphos"
**Land:** "Plot (2,500m²) For Sale in Mesa Chorio, Paphos"

No bedrooms in land titles. Size formatted with thousand separators.

## Deviations from Plan

None - plan executed exactly as written.

## Testing Notes

**Manual testing steps (after deployment):**

1. Send WhatsApp message to Sophia: "I want to upload a plot of land for sale in Paphos, 2500 sqm, price €250,000"
2. Sophia should use `createLandListing` tool (not `createPropertyListing`)
3. Verify draft listing created on Zyprus as `node--land` (check in Zyprus dashboard)
4. Check images appear in `field_land_gallery`
5. Verify title contains land size in sqm (not bedrooms)
6. Check building regulations appear if provided (density, coverage, floors, height)
7. Check infrastructure appears if provided

**Test with building regulations:**
"Plot 3000 sqm for sale in Limassol, €400,000, building density 80%, coverage 45%, max 4 floors, has electricity and water, sea view, separate title deeds"

Expected result: Draft listing with all building regulations, infrastructure, and views populated.

## Deployment

After all tasks complete:

```bash
supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx
```

This deploys:
- New createLandListing tool definition
- Land listing handler
- Updated taxonomy cache (fetches land_type and infrastructure_)
- Land description generator
- Updated property-upload prompt

## Next Steps

1. Test land listing upload via WhatsApp
2. Verify Zyprus land listings display correctly in dashboard
3. Monitor for any field mapping issues or taxonomy mismatches
4. Consider adding land-specific validation (e.g., minimum land size, valid building density ranges)
5. Add automated tests for land listing flow (similar to property listing tests)

## Self-Check: PASSED

**Created files:**
```bash
[ -f "supabase/functions/sophia-bot/tools/handlers/land-listing.ts" ] && echo "FOUND: land-listing.ts" || echo "MISSING: land-listing.ts"
# Output: FOUND: land-listing.ts
```

**Modified files:**
```bash
grep -q "createLandListing" supabase/functions/sophia-bot/tools/definitions.ts && echo "FOUND: createLandListing tool" || echo "MISSING"
# Output: FOUND: createLandListing tool

grep -q "handleCreateLandListing" supabase/functions/sophia-bot/tools/executor.ts && echo "FOUND: routing" || echo "MISSING"
# Output: FOUND: routing

grep -q "createDraftLandListing" supabase/functions/sophia-bot/zyprus/client.ts && echo "FOUND: Zyprus function" || echo "MISSING"
# Output: FOUND: Zyprus function

grep -q "findLandTypeUuid" supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts && echo "FOUND: taxonomy function" || echo "MISSING"
# Output: FOUND: taxonomy function

grep -q "generateLandDescription" supabase/functions/sophia-bot/services/description-generator.ts && echo "FOUND: description generator" || echo "MISSING"
# Output: FOUND: description generator

grep -q "Land/Plot Listings" supabase/functions/sophia-bot/prompts/behaviors/property-upload.ts && echo "FOUND: prompt update" || echo "MISSING"
# Output: FOUND: prompt update
```

**Commits:**
```bash
git log --oneline | head -3
# Output:
# d3fbc40 feat(quick-7): add land description generator and update prompt
# 240d716 feat(quick-7): create land listing handler and Zyprus client functions
# ed5869d feat(quick-7): add createLandListing tool definition and routing
```

All files created/modified as expected. All commits present.
