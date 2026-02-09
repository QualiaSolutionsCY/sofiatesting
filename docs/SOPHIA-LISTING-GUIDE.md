# SOPHIA Listing Upload Guide

> Complete documentation for how SOPHIA uploads property listings to Zyprus.com

---

## Table of Contents

1. [Zyprus API Credentials](#zyprus-api-credentials)
2. [How SOPHIA Uploads Work](#how-sophia-uploads-work)
3. [Listing Fields Reference](#listing-fields-reference)
4. [Gaps Identified & Fixes Applied](#gaps-identified--fixes-applied)
5. [How to Edit/Modify Behavior](#how-to-editmodify-behavior)
6. [Key Files Reference](#key-files-reference)
7. [Testing Uploads](#testing-uploads)

---

## Zyprus API Credentials

```
API Base URL:     https://dev9.zyprus.com
Client ID:        5Al3Dbs3X9Oqbi8PAjPh5wUfcfrothnub7gI8nOvLig
Client Secret:    M7wH"%zuyf8")KZ
Grant Type:       client_credentials
Token Endpoint:   /oauth/token
```

### Authentication Flow

1. Request OAuth token:
```bash
curl -X POST "https://dev9.zyprus.com/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "User-Agent: SophiaAI" \
  -d "grant_type=client_credentials&client_id=5Al3Dbs3X9Oqbi8PAjPh5wUfcfrothnub7gI8nOvLig&client_secret=M7wH%22%25zuyf8%22%29KZ"
```

2. Use token in all subsequent requests:
```
Authorization: Bearer {access_token}
Content-Type: application/vnd.api+json
User-Agent: SophiaAI    <- REQUIRED (Cloudflare whitelist)
```

---

## How SOPHIA Uploads Work

### Flow Overview

```
WhatsApp Message → SOPHIA Bot (Edge Function) → Tool Call → Zyprus API → Draft Listing
```

### Step-by-Step Process

1. **Agent sends message** via WhatsApp with property details
2. **SOPHIA extracts data** using AI (OpenRouter/Gemini)
3. **Tool executed**: `createPropertyListing` with extracted parameters
4. **Validation checks**:
   - Agent identified (must be in `agents` table)
   - Regional access (agent can only upload in their region)
   - Required fields present
   - Minimum 1 image
5. **Taxonomy resolution**: Convert text to UUIDs (location, property type, features)
6. **Description generated**: Auto-creates marketing copy
7. **My Notes generated**: Internal notes with owner details, reviewer info
8. **Images uploaded**: Parallel upload to Zyprus storage
9. **Draft created**: JSON:API POST to `/jsonapi/node/property`
10. **Confirmation sent**: Success message with draft URL

---

## Listing Fields Reference

### Property Details (Text/Number Fields)

| Field Name | API Field | What SOPHIA Fills | Source |
|------------|-----------|-------------------|--------|
| **Title** | `title` | Auto-generated: "3 Bedroom Villa For Sale in Tala" | Generated |
| **Description** | `body.value` | Full marketing write-up with features | Generated |
| **Price** | `field_price` | Number in EUR | Agent input |
| **Covered Area** | `field_covered_area` | Interior sqm | Agent input |
| **Covered Veranda** | `field_covered_veranda` | Covered outdoor sqm | Agent input |
| **Uncovered Veranda** | `field_uncovered_veranda` | Open terrace sqm | Agent input |
| **Plot Size** | `field_land_size` | Land sqm (houses/villas) | Agent input |
| **Bedrooms** | `field_no_bedrooms` | Number | Agent input |
| **Bathrooms** | `field_no_bathrooms` | Number | Agent input |
| **Kitchens** | `field_no_kitchens` | Number (default: 1) | Agent input |
| **Living Rooms** | `field_no_living_rooms` | Number (default: 1) | Agent input |
| **Year Built** | `field_year_built` | Construction year | Agent input |
| **Floor** | `field_floor` | Floor level (apartments) | Agent input |
| **Map Location** | `field_map` | GPS coordinates (with privacy offset) | Resolved from area name |

### Reference ID Format

| Field | API Field | Format | Example |
|-------|-----------|--------|---------|
| **Own Reference ID** | `field_own_reference_id` | `Owner - {Agent} - {Seller} - {Phone} - {Email}` | `Owner - Lauren - John Smith - 99123456 - john@email.com` |
| **AI Draft Ref ID** | `field_ai_draft_own_reference_id` | Same as above | Same as above |

### Dropdowns (Taxonomy Fields)

| Field Name | API Field | Options | Default |
|------------|-----------|---------|---------|
| **Property Type** | `field_property_type` | apartment, villa, house, detached house, semi-detached, maisonette, bungalow, penthouse, townhouse, studio | Required |
| **Listing Type** | `field_listing_type` | sale, rent | Required |
| **Price Type** | `field_price_modifier` | No VAT, Plus VAT, VAT Included | No VAT |
| **Title Deed** | `field_title_deed` | Title Deed, Final Approval, Share of Land, Pending | Title Deed |
| **Location** | `field_location` | Area UUID (node--location) | Resolved from text |

### Boolean Fields

| Field Name | API Field | Default | Notes |
|------------|-----------|---------|-------|
| **Published** | `status` | `false` | Always draft |
| **AI Generated** | `field_ai_generated` | `true` | Always true |
| **Negotiable** | `field_negotiable` | `true` | Unless agent says "fixed price" |
| **New Build** | `field_new_build` | `false` | Set if recent build or "new build" mentioned |
| **Potential Duplicate** | `field_potential_duplicate` | `false` | Set if similar listing found |

### Checkboxes (Feature Relationships)

| Category | API Field | Type | Examples |
|----------|-----------|------|----------|
| **Indoor Features** | `field_indoor_property_features` | `taxonomy_term--indoor_property_views` | A/C, Central Heating, Fitted Kitchen, Fireplace, Storage |
| **Outdoor Features** | `field_outdoor_property_features` | `taxonomy_term--outdoor_property_features` | Private Pool, Garden, Covered Parking, BBQ Area |
| **Property Views** | `field_property_views` | `taxonomy_term--property_views` | Sea View, Mountain View, City View |

### Images

| Field Name | API Field | Notes |
|------------|-----------|-------|
| **Gallery** | `field_gallery_` | Array of file UUIDs (note trailing underscore) |

### People Assignment (User Relationships)

| Field Name | API Field | Who | Notes |
|------------|-----------|-----|-------|
| **Instructor** | `field_ai_listing_instructor` | Agent who sent the listing | Resolved from agent email |
| **Reviewer(s)** | `field_ai_listing_reviewer` | People who review before publish | Array of user UUIDs |
| **Listing Owner** | (via `uid`) | Agent who owns for commission | Set by OAuth token |

### Reviewer Assignment Rules

| Listing Type | Region | Reviewer 1 | Reviewer 2 |
|--------------|--------|------------|------------|
| **FOR SALE** | Paphos/Limassol/Larnaca/Nicosia | Lauren (listings@zyprus.com) | Regional office |
| **FOR SALE** | Famagusta | requestfamagusta@zyprus.com | None |
| **FOR RENT** | Any | Agent who sent it | None |
| **Michelle Rentals** | Any | demetra@zyprus.com | requestlimassol@zyprus.com (joint account) |

### Internal Notes (AI Fields)

| Field Name | API Field | What SOPHIA Writes |
|------------|-----------|-------------------|
| **My Notes** | `field_my_notes` | Owner details, Agent, Reviewer, Coordinates, AI Message |
| **AI Notes** | `field_ai_assistant_notes` | AI understanding of the request |
| **AI Message** | `field_ai_message` | Duplicate warning or agent notes |
| **AI State** | `field_ai_state` | Always "draft" |

---

## Gaps Identified & Fixes Applied

### Fixes Applied (Feb 2026)

| Gap | Fix | File Changed |
|-----|-----|--------------|
| Missing kitchens field | Added `kitchens` to tool definition and API payload | `definitions.ts`, `client.ts` |
| Missing living rooms field | Added `livingRooms` to tool definition and API payload | `definitions.ts`, `client.ts` |
| Price always negotiable | Added `priceNegotiable` field (default true) | `definitions.ts`, `client.ts` |
| No new build indicator | Added `isNewBuild` field | `definitions.ts`, `client.ts` |
| Parking type too vague | Added `parkingType` enum (covered/open/garage/carport/none) | `definitions.ts` |
| Location not specific enough | Updated description to prompt for sub-areas | `definitions.ts` |
| Features description vague | Updated to list specific indoor/outdoor/view features | `definitions.ts` |
| Listing owner not in My Notes | Added to My Notes with assignment section at top | `my-notes-generator.ts` |
| AI message not in My Notes | Added AI message section to My Notes | `my-notes-generator.ts` |
| My Notes format unclear | Reorganized with clear sections (Assignment, Owner, Property, AI) | `my-notes-generator.ts` |

### Remaining Gaps (Future Work)

| Gap | Priority | Notes |
|-----|----------|-------|
| Floor plan upload | Medium | Separate field for floor plans |
| Image duplicate detection | Low | Detect and skip duplicate images |
| Image ordering | Low | Let agent specify main photo |
| Publication notification | Medium | Notify agent when listing goes live |
| Image analysis | Low | Infer features from photos (fitted kitchen, pool type) |

---

## How to Edit/Modify Behavior

### Change What Fields SOPHIA Asks For

Edit: `supabase/functions/sophia-bot/tools/definitions.ts`

```typescript
// Add a new field:
newFieldName: {
  type: "string",  // or "number", "boolean", "array"
  description: "What SOPHIA should understand about this field",
  enum: ["option1", "option2"],  // optional: limit to specific values
},

// Make it required:
required: [
  "existingField1",
  "newFieldName",  // Add here
],
```

### Change How Fields Map to Zyprus API

Edit: `supabase/functions/sophia-bot/zyprus/client.ts`

1. Add to `ListingData` interface:
```typescript
export interface ListingData {
  // ... existing fields
  newFieldName?: string;
}
```

2. Add to `buildJsonApiPayload` function:
```typescript
const attributes = {
  // ... existing attributes
  field_api_name: listing.newFieldName,
};
```

### Change Description Generation

Edit: `supabase/functions/sophia-bot/services/description-generator.ts`

- `generateDescription()` - Main description logic
- `LOCATION_DESCRIPTIONS` - Area-specific text
- `categorizeFeatures()` - How features are grouped
- `sortFeaturesByImportance()` - Feature ordering

### Change My Notes Format

Edit: `supabase/functions/sophia-bot/services/my-notes-generator.ts`

- `generateMyNotes()` - Main notes generation
- `ListingContext` interface - What data is passed in

### Change Reviewer Assignment

Edit: `supabase/functions/sophia-bot/rules/reviewer-assignment.ts`

- `assignReviewers()` - Main logic
- Regional office emails and UUIDs

### Change Regional Access Rules

Edit: `supabase/functions/sophia-bot/rules/region-validator.ts`

- `validateRegionalAccess()` - Who can upload where

---

## Key Files Reference

### Core Upload Logic

| File | Purpose |
|------|---------|
| `supabase/functions/sophia-bot/tools/definitions.ts` | Tool schema (what fields SOPHIA collects) |
| `supabase/functions/sophia-bot/tools/executor.ts` | Tool execution (orchestrates upload) |
| `supabase/functions/sophia-bot/zyprus/client.ts` | Zyprus API client (auth, upload) |
| `supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts` | UUID resolution (location, types, features) |

### Generation Services

| File | Purpose |
|------|---------|
| `supabase/functions/sophia-bot/services/description-generator.ts` | Marketing description |
| `supabase/functions/sophia-bot/services/my-notes-generator.ts` | Internal notes |
| `supabase/functions/sophia-bot/services/image-handler.ts` | Image validation |
| `supabase/functions/sophia-bot/services/duplicate-checker.ts` | Duplicate detection |

### Business Rules

| File | Purpose |
|------|---------|
| `supabase/functions/sophia-bot/rules/reviewer-assignment.ts` | Who reviews listings |
| `supabase/functions/sophia-bot/rules/region-validator.ts` | Regional access control |
| `supabase/functions/sophia-bot/rules/special-cases.ts` | Edge cases (Charalambos, Lauren, etc.) |

---

## Testing Uploads

### Test via WhatsApp (Production)

Send message to SOPHIA with property details. Must use registered agent phone number.

### Test via Script

```bash
# Test Zyprus API endpoints
pnpm exec tsx tests/manual/test-zyprus-api.ts

# Test webhook upload
pnpm exec tsx tests/manual/test-sophia-edge-upload.ts

# Test multiple uploads
pnpm exec tsx tests/manual/test-multi-upload.ts
```

### Verify Upload

1. Check draft dashboard: https://dev9.zyprus.com/draft-dashboard?ai_state=draft
2. Check Edge Function logs: `supabase functions logs sophia-bot`
3. Query chat_history table for SOPHIA responses

### Deploy Changes

```bash
supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx
```

---

## Appendix: Sample API Payloads

### Create Listing Request

```json
{
  "data": {
    "type": "node--property",
    "attributes": {
      "title": "3 Bedroom Villa For Sale in Tala",
      "status": false,
      "field_price": 450000,
      "field_no_bedrooms": 3,
      "field_no_bathrooms": 2,
      "field_no_kitchens": 1,
      "field_no_living_rooms": 1,
      "field_covered_area": 180,
      "field_land_size": 500,
      "field_negotiable": true,
      "field_ai_generated": true,
      "field_ai_state": "draft",
      "field_own_reference_id": "Owner - Lauren - John Smith - 99123456",
      "body": {
        "value": "Stunning 3 Bedroom Villa For Sale...",
        "format": "plain_text"
      },
      "field_my_notes": "=== LISTING ASSIGNMENT ===\nListing Owner: Lauren...",
      "field_map": {
        "value": "POINT (32.4297 34.8475)",
        "geo_type": "Point",
        "lat": 34.8475,
        "lon": 32.4297
      }
    },
    "relationships": {
      "field_listing_type": {
        "data": { "type": "taxonomy_term--listing_type", "id": "uuid" }
      },
      "field_property_type": {
        "data": { "type": "taxonomy_term--property_type", "id": "uuid" }
      },
      "field_location": {
        "data": { "type": "node--location", "id": "uuid" }
      },
      "field_gallery_": {
        "data": [
          { "type": "file--file", "id": "image-uuid-1" },
          { "type": "file--file", "id": "image-uuid-2" }
        ]
      },
      "field_ai_listing_instructor": {
        "data": { "type": "user--user", "id": "user-uuid" }
      },
      "field_ai_listing_reviewer": {
        "data": [
          { "type": "user--user", "id": "reviewer-uuid" }
        ]
      }
    }
  }
}
```

---

*Last updated: February 2026*
