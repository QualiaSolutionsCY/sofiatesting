---
phase: 7-implement-land-listing-support-createlan
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/functions/sophia-bot/tools/definitions.ts
  - supabase/functions/sophia-bot/tools/executor.ts
  - supabase/functions/sophia-bot/tools/handlers/land-listing.ts
  - supabase/functions/sophia-bot/zyprus/client.ts
  - supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts
  - supabase/functions/sophia-bot/services/description-generator.ts
  - supabase/functions/sophia-bot/prompts/behaviors/property-upload.ts
autonomous: true

must_haves:
  truths:
    - "Agent can upload land/plot listings via WhatsApp"
    - "Land listings use createLandListing tool (not createPropertyListing)"
    - "Land listings post to /jsonapi/node/land endpoint"
    - "Land images upload to field_land_gallery"
    - "Land listings require landSize (no coveredArea)"
  artifacts:
    - path: "supabase/functions/sophia-bot/tools/handlers/land-listing.ts"
      provides: "Land listing handler logic"
      min_lines: 400
    - path: "supabase/functions/sophia-bot/zyprus/client.ts"
      exports: ["LandListingData", "createDraftLandListing", "buildJsonApiPayloadLand"]
    - path: "supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts"
      exports: ["findLandTypeUuid", "findInfrastructureUuids"]
  key_links:
    - from: "tools/executor.ts"
      to: "tools/handlers/land-listing.ts"
      via: "case 'createLandListing'"
      pattern: "handleCreateLandListing"
    - from: "tools/handlers/land-listing.ts"
      to: "zyprus/client.ts"
      via: "createDraftLandListing() function call"
      pattern: "createDraftLandListing"
    - from: "zyprus/client.ts"
      to: "zyprus/taxonomy-cache.ts"
      via: "findLandTypeUuid(), findInfrastructureUuids()"
      pattern: "findLandTypeUuid|findInfrastructureUuids"
---

<objective>
Implement land listing support (createLandListing tool) for Sophia to enable agents to upload land/plots via WhatsApp.

Purpose: Extend Sophia's listing capabilities to support land (plots, fields, agricultural land) in addition to properties. Land listings use different Zyprus schema (node--land), different fields (field_land_gallery, field_land_size, field_land_type), and simpler requirements (no rooms, no indoor/outdoor features).

Output: Functional createLandListing tool integrated into Sophia, allowing land uploads to Zyprus as unpublished drafts.
</objective>

<execution_context>
@/home/qualia/.claude/get-shit-done/workflows/execute-plan.md
@/home/qualia/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/home/qualia/Desktop/Projects/aiagents/sofiatesting/LAND-LISTING-HANDOFF.md
@/home/qualia/Desktop/Projects/aiagents/sofiatesting/CLAUDE.md
@/home/qualia/Desktop/Projects/aiagents/sofiatesting/supabase/functions/sophia-bot/tools/definitions.ts
@/home/qualia/Desktop/Projects/aiagents/sofiatesting/supabase/functions/sophia-bot/tools/executor.ts
@/home/qualia/Desktop/Projects/aiagents/sofiatesting/supabase/functions/sophia-bot/tools/handlers/property-listing.ts
@/home/qualia/Desktop/Projects/aiagents/sofiatesting/supabase/functions/sophia-bot/zyprus/client.ts
@/home/qualia/Desktop/Projects/aiagents/sofiatesting/supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts
@/home/qualia/Desktop/Projects/aiagents/sofiatesting/supabase/functions/sophia-bot/services/description-generator.ts
@/home/qualia/Desktop/Projects/aiagents/sofiatesting/supabase/functions/sophia-bot/prompts/behaviors/property-upload.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add createLandListing tool definition and routing</name>
  <files>
supabase/functions/sophia-bot/tools/definitions.ts
supabase/functions/sophia-bot/tools/executor.ts
  </files>
  <action>
**tools/definitions.ts:**
Add createLandListing tool to TOOLS array (after createPropertyListing, before getZyprusData). Required parameters: listingType, landType, price, location, landSize, ownerName, ownerPhone, imageUrls. Optional: buildingDensity, siteCoverage, maxFloors, maxHeight, infrastructure (array), features (views), titleDeedStatus, priceModifier, titleDeedFileUrls, coordinates, locationUrl, registrationNumber, specialNotes, areaDescription. Land type enum: ["plot", "field", "agricultural"]. Infrastructure values: ["electricity", "water", "road_access", "sewage", "telephone"]. Model exactly after createPropertyListing schema but remove all room-related fields (bedrooms, bathrooms, coveredArea, plotSize, coveredVeranda, uncoveredVeranda, floor, parkingType, condition, orientation, yearBuilt, yearRenovated, basementRooms, roofRooms, unitBreakdown, buildingName, energyClass, isNewBuild, floorPlanUrls, floorPlanImageIndices, imageOrder, mainPhotoIndex). Keep imageUrls, titleDeedFileUrls, titleDeedImageIndices.

**tools/executor.ts:**
Add case "createLandListing" after createPropertyListing case. Import handleCreateLandListing from "./handlers/land-listing.ts". Track with trackPropertyUploaded(phoneNumber, agent?.id, { propertyType: "land", location: tool.arguments.location }) on success.
  </action>
  <verify>
grep -n "createLandListing" supabase/functions/sophia-bot/tools/definitions.ts
grep -n "handleCreateLandListing" supabase/functions/sophia-bot/tools/executor.ts
  </verify>
  <done>
createLandListing tool definition exists in TOOLS array with correct required fields (listingType, landType, price, location, landSize, ownerName, ownerPhone, imageUrls). Executor routes createLandListing to handleCreateLandListing with tracking.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create land listing handler and Zyprus client functions</name>
  <files>
supabase/functions/sophia-bot/tools/handlers/land-listing.ts
supabase/functions/sophia-bot/zyprus/client.ts
supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts
  </files>
  <action>
**tools/handlers/land-listing.ts (NEW FILE):**
Create land listing handler modeled after property-listing.ts but simpler (no rooms, no indoor/outdoor features). Keep: agent identification, region validation, upload lock (per-agent fingerprint), location correction (street address detection, city-only blocking), image processing (pending_images table, vision classification for title deeds, image validation), pending documents retrieval, duplicate checking, reviewer assignment, description generation (call generateLandDescription from description-generator.ts), My Notes generation (owner info + Google Maps link + reviewer assignments + duplicate warnings), coordinates resolution (from args, Google Maps URL, or defaults), success message construction, listing tracking. Remove: bedroom/bathroom validation, EPC/year built/floor handling, pool type injection, parking features, unit breakdown. Call createDraftLandListing() instead of createDraftListing(). Pass landType, landSize, buildingDensity, siteCoverage, maxFloors, maxHeight, infrastructure, views.

**zyprus/client.ts:**
Add LandListingData interface (same as ListingData but replace bedrooms/bathrooms/coveredArea/plotSize/coveredVeranda/uncoveredVeranda/floor/parkingType/yearBuilt/energyClass/floorPlanUrls with landType, landSize, buildingDensity?, siteCoverage?, maxFloors?, maxHeight?, infrastructure?, views?). Add createDraftLandListing() function modeled after createDraftListing() but POST to /jsonapi/node/land. Add buildJsonApiPayloadLand() helper — type: "node--land", field_land_type relationship (taxonomy_term--land_type), field_land_size attribute (mandatory), field_land_gallery relationship (not field_gallery_), field_land_price_modifier (not field_price_modifier), field_land_title_deed (not field_title_deed), field_land_views (same property_views taxonomy), field_infrastructure relationship (taxonomy_term--infrastructure_), field_building_density/field_site_coverage/field_floors/field_height attributes (optional integers/numbers). Title format: "Plot (2,500m²) For Sale in Mesa Chorio, Paphos" (no bedrooms). Upload images to /jsonapi/node/land/field_land_gallery. Upload title deed files to /jsonapi/node/land/field_title_deed_file (same as property).

**zyprus/taxonomy-cache.ts:**
Add findLandTypeUuid(landType: string): Promise<string> — GET /jsonapi/taxonomy_term/land_type?filter[name]={landType}, cache in TaxonomyCache.landTypes array (add to interface), fallback to hardcoded UUID or empty string if not found. Add findInfrastructureUuids(infrastructure: string[]): Promise<string[]> — GET /jsonapi/taxonomy_term/infrastructure_, cache in TaxonomyCache.infrastructure array, return matched UUIDs. Reuse findListingTypeUuid, findPriceModifierUuid, findTitleDeedUuid, findPropertyViewUuids, findLocationUuid unchanged.
  </action>
  <verify>
test -f supabase/functions/sophia-bot/tools/handlers/land-listing.ts && echo "land-listing.ts created" || echo "MISSING land-listing.ts"
grep -n "export async function createDraftLandListing" supabase/functions/sophia-bot/zyprus/client.ts
grep -n "export async function findLandTypeUuid" supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts
grep -n "export async function findInfrastructureUuids" supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts
  </verify>
  <done>
land-listing.ts handler exists with agent validation, region check, image processing, location correction, duplicate checking, reviewer assignment, createDraftLandListing() call. createDraftLandListing() function exists in client.ts, posts to /jsonapi/node/land, uses field_land_gallery/field_land_size/field_land_type. findLandTypeUuid() and findInfrastructureUuids() exist in taxonomy-cache.ts and return UUIDs.
  </done>
</task>

<task type="auto">
  <name>Task 3: Add land description generator and update prompt</name>
  <files>
supabase/functions/sophia-bot/services/description-generator.ts
supabase/functions/sophia-bot/prompts/behaviors/property-upload.ts
  </files>
  <action>
**services/description-generator.ts:**
Add generateLandDescription() function. Parameters: landType, listingType, landSize, location, titleDeedStatus, buildingDensity?, siteCoverage?, maxFloors?, maxHeight?, infrastructure?, views?, price, areaDescription?, priceModifier?. Structure: Opening paragraph (land type + size + location), building regulations paragraph (if buildingDensity/siteCoverage/maxFloors/maxHeight provided), infrastructure paragraph (if infrastructure array provided), views/location paragraph (if views or areaDescription provided), title deed paragraph, price paragraph (with VAT status if priceModifier). NO room-by-room breakdown. Keep professional marketing tone. Return formatted description string.

**prompts/behaviors/property-upload.ts:**
Add section at end (after property listing instructions, before final closing): "## Land/Plot Listings\n\nWhen an agent wants to upload LAND (plot, field, agricultural land), use createLandListing instead of createPropertyListing.\n\nRequired data for land:\n- Location (area + district)\n- Land size in sqm\n- Price\n- Owner name + phone\n- Photos\n- Land type (plot, field, agricultural)\n\nOptional but valuable:\n- Building density, site coverage, max floors, max height\n- Infrastructure (electricity, water, road access, sewage, telephone)\n- Title deed status\n- Registration number\n- Google Maps link\n\nLand listings have NO bedrooms/bathrooms, NO covered area. Use field_land_size for total land area."
  </action>
  <verify>
grep -n "export function generateLandDescription" supabase/functions/sophia-bot/services/description-generator.ts
grep -n "## Land/Plot Listings" supabase/functions/sophia-bot/prompts/behaviors/property-upload.ts
  </verify>
  <done>
generateLandDescription() function exists, generates professional land descriptions with building regulations, infrastructure, views, title deed status. property-upload.ts prompt contains land listing instructions section explaining when to use createLandListing and what data to collect.
  </done>
</task>

</tasks>

<verification>
After all tasks complete:
1. Check tool definition: `grep -A 10 'name: "createLandListing"' supabase/functions/sophia-bot/tools/definitions.ts`
2. Check routing: `grep -B 2 -A 5 'case "createLandListing"' supabase/functions/sophia-bot/tools/executor.ts`
3. Verify handler exists: `wc -l supabase/functions/sophia-bot/tools/handlers/land-listing.ts`
4. Check Zyprus functions: `grep -n "createDraftLandListing\|buildJsonApiPayloadLand" supabase/functions/sophia-bot/zyprus/client.ts`
5. Check taxonomy cache: `grep -n "findLandTypeUuid\|findInfrastructureUuids" supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts`
6. Check description generator: `grep -n "generateLandDescription" supabase/functions/sophia-bot/services/description-generator.ts`
7. Check prompt update: `grep -n "Land/Plot Listings" supabase/functions/sophia-bot/prompts/behaviors/property-upload.ts`

All 7 files modified/created. Land listing pipeline complete: tool definition → executor routing → handler validation → Zyprus client → taxonomy resolution → description generation.
</verification>

<success_criteria>
1. createLandListing tool defined in definitions.ts with correct required fields
2. Executor routes createLandListing to handleCreateLandListing
3. land-listing.ts handler created with agent validation, region check, image processing, duplicate checking
4. createDraftLandListing() and buildJsonApiPayloadLand() functions exist in client.ts
5. findLandTypeUuid() and findInfrastructureUuids() functions exist in taxonomy-cache.ts
6. generateLandDescription() function exists in description-generator.ts
7. property-upload.ts prompt contains land listing instructions

Test criteria (manual after deployment):
- Send WhatsApp message: "I want to upload a plot of land for sale in Paphos, 2500 sqm, price 250,000"
- Sophia uses createLandListing tool (not createPropertyListing)
- Draft listing created on Zyprus as node--land (verify in Zyprus dashboard)
- Images appear in field_land_gallery
- Title contains land size in sqm (not bedrooms)
</success_criteria>

<output>
After completion, create `.planning/quick/7-implement-land-listing-support-createlan/7-SUMMARY.md` documenting implementation details, key file changes, and deployment notes.
</output>
