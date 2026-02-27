# Handoff: Implement Land Listing Support for Sophia

## Context

Sophia (WhatsApp bot) currently only supports property listings (`node--property`). The Zyprus CMS API also supports **land listings** (`node--land`) with a different schema, different fields, and different taxonomy relationships. The prompt already references `createLandListing` as a tool, but it doesn't exist yet. This document tells you exactly what to build and where.

**Read CLAUDE.md first** — it has deploy commands, project IDs, and critical rules.

---

## What Exists Today (Property Listings)

The full property listing pipeline works like this:

1. **Tool Definition** → `supabase/functions/sophia-bot/tools/definitions.ts` — defines `createPropertyListing` tool schema for the AI
2. **Executor Router** → `supabase/functions/sophia-bot/tools/executor.ts` — routes `createPropertyListing` to handler
3. **Handler** → `supabase/functions/sophia-bot/tools/handlers/property-listing.ts` — validates fields, resolves agent, checks region, generates description, processes images, calls Zyprus client
4. **Zyprus Client** → `supabase/functions/sophia-bot/zyprus/client.ts` — `createDraftListing()` builds JSON:API payload, uploads files, POSTs to Zyprus
5. **Taxonomy Cache** → `supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts` — resolves names to UUIDs (location, property type, listing type, etc.)

---

## What You Need to Build

### Overview

Create a `createLandListing` tool that mirrors the property listing flow but uses the Zyprus **land** schema. The Zyprus API endpoint is `POST /jsonapi/node/land` instead of `POST /jsonapi/node/property`.

### Key Differences: Land vs Property

| Aspect | Property (`node--property`) | Land (`node--land`) |
|--------|---------------------------|---------------------|
| **Endpoint** | `POST /jsonapi/node/property` | `POST /jsonapi/node/land` |
| **Type field** | `field_property_type` (Apartment, Villa, etc.) | `field_land_type` (Plot, Field, Agricultural) |
| **Gallery field** | `field_gallery_` | `field_land_gallery` |
| **Price modifier** | `field_price_modifier` | `field_land_price_modifier` |
| **Title deed** | `field_title_deed` | `field_land_title_deed` |
| **Size field** | `field_covered_area` (mandatory) + `field_land_size` (optional) | `field_land_size` (mandatory), NO covered area |
| **Rooms** | bedrooms, bathrooms, kitchens, living rooms | NONE — land has no rooms |
| **Unique fields** | Indoor/outdoor features, floor plan, EPC, year built | `field_building_density`, `field_site_coverage`, `field_floors`, `field_height`, `field_infrastructure` |
| **Views** | `field_property_views` | `field_land_views` (same taxonomy: `property_views`) |
| **Title deed file** | `field_title_deed_file` | `field_title_deed_file` (same) |

### Taxonomy Endpoints (from Postman)

| Taxonomy | Endpoint | Resource Type |
|----------|----------|---------------|
| Land Type | `/jsonapi/taxonomy_term/land_type` | `taxonomy_term--land_type` |
| Infrastructure | `/jsonapi/taxonomy_term/infrastructure_` | `taxonomy_term--infrastructure_` |
| Listing Type | `/jsonapi/taxonomy_term/listing_type` | Same as property |
| Price Modifier | `/jsonapi/taxonomy_term/price_modifier` | Same as property |
| Title Deed | `/jsonapi/taxonomy_term/title_deed` | Same as property |
| Views | `/jsonapi/taxonomy_term/property_views` | Same as property |
| Location | `/jsonapi/node/location` | Same as property |

---

## Files to Modify/Create

### 1. `tools/definitions.ts` — Add `createLandListing` tool definition

Add a new tool entry to the `TOOLS` array. Key parameters:

```typescript
{
  type: "function",
  function: {
    name: "createLandListing",
    description: "Create a land/plot listing draft on zyprus.com. Use when agent wants to upload land, plot, or field for sale.",
    parameters: {
      type: "object",
      properties: {
        listingType: { type: "string", enum: ["sale", "rent"] },
        landType: { type: "string", enum: ["plot", "field", "agricultural"], description: "Classification of land" },
        price: { type: "number" },
        location: { type: "string", description: "Area + district, same rules as property" },
        landSize: { type: "number", description: "Land size in square meters" },
        ownerName: { type: "string" },
        ownerPhone: { type: "string" },
        ownerEmail: { type: "string" },
        titleDeedStatus: { type: "string", enum: [...same as property...] },
        priceModifier: { type: "string", enum: ["no_vat", "plus_vat", "vat_included"] },
        imageUrls: { type: "array", items: { type: "string" } },
        titleDeedFileUrls: { type: "array", items: { type: "string" } },
        // Land-specific fields:
        buildingDensity: { type: "integer", description: "Building density percentage allowed" },
        siteCoverage: { type: "integer", description: "Site coverage percentage allowed" },
        maxFloors: { type: "integer", description: "Maximum floors allowed to build" },
        maxHeight: { type: "number", description: "Maximum building height allowed" },
        infrastructure: {
          type: "array", items: { type: "string" },
          description: "Available infrastructure: electricity, water, road_access, sewage, telephone"
        },
        features: { type: "array", items: { type: "string" }, description: "Views: sea view, mountain view, etc." },
        coordinates: { ... same as property ... },
        locationUrl: { type: "string" },
        registrationNumber: { type: "string" },
        specialNotes: { type: "string" },
        areaDescription: { type: "string" },
      },
      required: ["listingType", "landType", "price", "location", "landSize", "ownerName", "ownerPhone", "imageUrls"],
    },
  },
}
```

### 2. `tools/executor.ts` — Add routing

Add a new case in the switch statement:

```typescript
case "createLandListing":
  result = await handleCreateLandListing(tool.arguments, agent, supabaseUrl, supabaseKey);
  if (result.success && phoneNumber) {
    trackPropertyUploaded(phoneNumber, agent?.id, {
      propertyType: "land",
      location: tool.arguments.location,
    });
  }
  break;
```

Import: `import { handleCreateLandListing } from "./handlers/land-listing.ts";`

### 3. `tools/handlers/land-listing.ts` — NEW FILE (handler)

This is the biggest piece. Model it after `property-listing.ts` but **much simpler** since land has no rooms, no description generator (or a simpler one), no indoor/outdoor features.

Key logic to KEEP from property-listing.ts:
- Agent identification + validation (lines ~50-90)
- Region validation (lines ~90-120)
- Image processing (pending images merge, vision classification for title deeds)
- Upload lock (lines ~130-165)
- Location UUID resolution
- Duplicate checking
- Reviewer assignment
- Success message construction + listing tracking

Key logic to CHANGE:
- No bedrooms/bathrooms validation
- No `coveredArea` — use `landSize` instead
- Description is simpler (land descriptions don't need room-by-room breakdown)
- Different taxonomy lookups (land type, infrastructure)
- Calls `createDraftLandListing()` instead of `createDraftListing()`

### 4. `zyprus/client.ts` — Add `createDraftLandListing()`

Add a new interface and function. Key differences from `createDraftListing()`:

```typescript
export interface LandListingData {
  listingType: "sale" | "rent";
  landType: string;           // plot, field, agricultural
  price: number;
  location: string;
  locationUuid?: string;
  landSize: number;           // sqm (MANDATORY for land)
  description: string;
  myNotes: string;
  images: string[];
  reviewer1: string;
  reviewer2?: string | null;
  listingOwner: string;
  listingInstructor: string;
  titleDeedStatus?: string;
  coordinates?: { lat: number; lon: number };
  priceModifier?: "no_vat" | "plus_vat" | "vat_included";
  titleDeedFileUrls?: string[];
  // Land-specific:
  buildingDensity?: number;
  siteCoverage?: number;
  maxFloors?: number;
  maxHeight?: number;
  infrastructure?: string[];
  views?: string[];
  // Reference ID fields:
  agentName?: string;
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  registrationNumber?: string;
}
```

The `buildJsonApiPayloadLand()` function must produce:

```json
{
  "data": {
    "type": "node--land",
    "attributes": {
      "title": "Plot (2500m²) For Sale in Mesa Chorio, Paphos",
      "status": false,
      "body": { "value": "...", "format": "plain_text" },
      "field_price": 250000,
      "field_land_size": 2500,
      "field_map": { ... same POINT format ... },
      "field_ai_generated": true,
      "field_ai_state": "draft",
      "field_own_reference_id": "Owner - ...",
      "field_ai_draft_own_reference_id": "Owner - ...",
      "field_building_density": 60,
      "field_site_coverage": 40,
      "field_floors": 3,
      "field_height": 12.5
    },
    "relationships": {
      "field_land_type": {
        "data": { "type": "taxonomy_term--land_type", "id": "UUID" }
      },
      "field_listing_type": {
        "data": { "type": "taxonomy_term--listing_type", "id": "UUID" }
      },
      "field_land_price_modifier": {
        "data": { "type": "taxonomy_term--price_modifier", "id": "UUID" }
      },
      "field_location": {
        "data": { "type": "node--location", "id": "UUID" }
      },
      "field_land_gallery": {
        "data": [{ "type": "file--file", "id": "UUID" }]
      },
      "field_land_title_deed": {
        "data": { "type": "taxonomy_term--title_deed", "id": "UUID" }
      },
      "field_infrastructure": {
        "data": [{ "type": "taxonomy_term--infrastructure_", "id": "UUID" }]
      },
      "field_land_views": {
        "data": [{ "type": "taxonomy_term--property_views", "id": "UUID" }]
      },
      "field_ai_listing_instructor": {
        "data": { "type": "user--user", "id": "UUID" }
      },
      "field_ai_listing_reviewer": {
        "data": [{ "type": "user--user", "id": "UUID" }]
      },
      "uid": {
        "data": { "type": "user--user", "id": "UUID" }
      }
    }
  }
}
```

**Critical differences in file upload:**
- Gallery images upload to `/jsonapi/node/land/field_land_gallery` (NOT `field_gallery_`)
- Title deed files upload to `/jsonapi/node/land/field_title_deed_file`

### 5. `zyprus/taxonomy-cache.ts` — Add land taxonomy resolvers

Add these new functions:

```typescript
export async function findLandTypeUuid(landType: string): Promise<string> {
  // GET /jsonapi/taxonomy_term/land_type?filter[name]=Plot
  // Fallback: hardcode a default UUID (fetch it once from the API)
}

export async function findInfrastructureUuids(infrastructure: string[]): Promise<string[]> {
  // GET /jsonapi/taxonomy_term/infrastructure_
  // Map: "electricity" → UUID, "water" → UUID, etc.
}
```

The existing `findListingTypeUuid`, `findPriceModifierUuid`, `findTitleDeedUuid`, `findUserUuid`, `findPropertyViewUuids`, and `findLocationUuid` can be reused as-is.

### 6. `services/description-generator.ts` — Add land description generation

Add a simpler `generateLandDescription()` function. Land descriptions don't need room breakdowns. Focus on:
- Land size and location
- Building density/coverage/floors if provided
- Infrastructure available
- Views
- Area description

### 7. `prompts/behaviors/property-upload.ts` — Update prompt

The prompt at line 494-495 already mentions `createLandListing`. Add a section explaining when to use it and what data to collect:

```
## Land/Plot Listings

When an agent wants to upload LAND (plot, field, agricultural land), use createLandListing instead of createPropertyListing.

Required data for land:
- Location (area + district)
- Land size in sqm
- Price
- Owner name + phone
- Photos
- Land type (plot, field, agricultural)

Optional but valuable:
- Building density, site coverage, max floors, max height
- Infrastructure (electricity, water, road access)
- Title deed status
- Registration number
- Google Maps link
```

---

## Testing

1. Deploy: `supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx`
2. Send WhatsApp message to Sophia: "I want to upload a plot of land for sale in Paphos, 2500 sqm, price 250,000"
3. Sophia should use `createLandListing` tool
4. Verify on Zyprus that a `node--land` draft was created (not `node--property`)
5. Check that images went to `field_land_gallery` and title deed files to `field_title_deed_file`

---

## Gotchas

1. **Gallery field name differs**: Property uses `field_gallery_` (trailing underscore), Land uses `field_land_gallery` (no trailing underscore). The upload endpoint changes accordingly.

2. **Price modifier field name differs**: Property uses `field_price_modifier`, Land uses `field_land_price_modifier`. Same taxonomy, different relationship field name.

3. **Title deed field name differs**: Property uses `field_title_deed`, Land uses `field_land_title_deed`. Same taxonomy.

4. **No covered area on land**: Land has no `field_covered_area`. The mandatory size field is `field_land_size`.

5. **Title generation**: Land titles should be like "Plot (2,500m²) For Sale in Mesa Chorio, Paphos" — no bedrooms.

6. **The `node--land` type in JSON:API payload**: Must be `"type": "node--land"` not `"node--property"`.

7. **field_infrastructure** taxonomy machine name has a trailing underscore: `infrastructure_`

8. **POST endpoint**: `POST /jsonapi/node/land` — NOT `/jsonapi/node/property`

9. **The Postman "Upload Land Listing" example body incorrectly uses `node--property`** — this is a copy-paste error in the Postman collection. The actual type MUST be `node--land`.

10. **Title deed file PATCH**: Same as property — title deed files may need to be attached via PATCH after creation if the service account gets a 403 on the initial POST.

---

## Architecture Decision: Separate vs Shared Handler

Two approaches:

**Option A: Separate handler file** (`land-listing.ts`) — Recommended
- Cleaner separation of concerns
- Land-specific validation logic
- No risk of breaking property uploads
- Some code duplication (agent validation, region check) is acceptable

**Option B: Extend property-listing.ts**
- Add `isLand` flag and conditionals
- Shares validation code
- Gets messy with all the if/else branches

Go with **Option A**. Copy the structure from `property-listing.ts` and simplify.

---

## Files Summary

| File | Action | What |
|------|--------|------|
| `tools/definitions.ts` | EDIT | Add `createLandListing` tool definition to TOOLS array |
| `tools/executor.ts` | EDIT | Add case + import for `createLandListing` |
| `tools/handlers/land-listing.ts` | CREATE | Land listing handler (model after property-listing.ts) |
| `zyprus/client.ts` | EDIT | Add `LandListingData` interface + `createDraftLandListing()` function |
| `zyprus/taxonomy-cache.ts` | EDIT | Add `findLandTypeUuid()` + `findInfrastructureUuids()` |
| `services/description-generator.ts` | EDIT | Add `generateLandDescription()` |
| `prompts/behaviors/property-upload.ts` | EDIT | Add land listing instructions section |

---

## Reference: Postman Collection IDs

- Workspace: `89682571-e6e8-4d3f-9cd5-7a5fb6748e34` (Zyprus Sophia AI)
- Main collection: `48817894-edcee9e2-379a-4e3e-8528-1d5d3638dd1a`
- Upload Land Listing request: `48817894-7b22b52b-4408-4175-b7cc-cfa7421209e7`
- GET Taxonomy request: `48817894-ecdad6a2-4cf3-426d-b03b-d60691e8f7ce`
- Upload File request: `48817894-17ed9bb6-2b2e-4422-a36f-9c9c730db877`

Use the Postman MCP tools to fetch full request details if needed:
```
mcp__postman__getCollectionRequest({ collectionId: "48817894-edcee9e2-...", requestId: "48817894-7b22b52b-..." })
```
