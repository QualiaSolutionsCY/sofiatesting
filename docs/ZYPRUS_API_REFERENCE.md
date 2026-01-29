# Zyprus API Reference (dev9.zyprus.com)

**Complete API documentation for SOPHIA AI property/land listing uploads**

> **Source**: Extracted from Postman collection "Zyprus Sophia AI" (Dec 2025)
> **Target**: Supabase Edge Function `sophia-bot`

---

## Table of Contents
1. [Configuration](#1-configuration)
2. [Authentication](#2-authentication)
3. [Required Headers](#3-required-headers)
4. [GET Endpoints](#4-get-endpoints)
5. [POST Endpoints](#5-post-endpoints)
6. [Complete Payload Examples](#6-complete-payload-examples)
7. [Taxonomy Reference](#7-taxonomy-reference)
8. [Field Reference](#8-field-reference)
9. [Error Handling](#9-error-handling)

---

## 1. Configuration

### Base URLs
| Environment | URL |
|-------------|-----|
| **Development** | `https://dev9.zyprus.com` |
| **Production** | `https://www.zyprus.com` (NOT for AI uploads) |

### OAuth Credentials (Development)
```
Client ID:     <ZYPRUS_CLIENT_ID>
Client Secret: <ZYPRUS_CLIENT_SECRET>
```

> **IMPORTANT**: Get credentials from Supabase Edge Function secrets. Set via `supabase secrets set`. Tokens expire after ~1 hour.

---

## 2. Authentication

### OAuth 2.0 Token Request

**Endpoint**: `POST /oauth/token`

**Headers**:
```
Content-Type: application/x-www-form-urlencoded
User-Agent: SophiaAI
```

**Body** (form-urlencoded):
```
grant_type=client_credentials
client_id=<ZYPRUS_CLIENT_ID>
client_secret=<ZYPRUS_CLIENT_SECRET>
```

**Response**:
```json
{
  "token_type": "Bearer",
  "expires_in": 3600,
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ..."
}
```

### Token Usage
Include in all subsequent requests:
```
Authorization: Bearer <access_token>
```

### TypeScript Implementation
```typescript
interface TokenResponse {
  token_type: string;
  expires_in: number;
  access_token: string;
}

async function getAccessToken(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'SophiaAI',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: Deno.env.get('ZYPRUS_CLIENT_ID') || '',
      client_secret: Deno.env.get('ZYPRUS_CLIENT_SECRET') || '',
    }),
  });

  const data: TokenResponse = await response.json();
  return data.access_token;
}
```

---

## 3. Required Headers

### For ALL JSON:API Requests
```
Authorization: Bearer <token>
Content-Type: application/vnd.api+json
Accept: application/vnd.api+json
User-Agent: SophiaAI
```

> **CRITICAL**: `User-Agent: SophiaAI` is MANDATORY - Cloudflare whitelist requires this exact value.

### For File Uploads
```
Authorization: Bearer <token>
Content-Type: application/octet-stream
Content-Disposition: file; filename="<filename.ext>"
User-Agent: SophiaAI
```

---

## 4. GET Endpoints

### 4.1 GET Listings

**Endpoint**: `GET /jsonapi/node/{bundle}`

| Bundle | Description |
|--------|-------------|
| `property` | Houses, apartments, offices, shops |
| `land` | Plots, fields, agricultural land |

**Examples**:
```
# All properties
GET /jsonapi/node/property

# Single property by UUID
GET /jsonapi/node/property/7b1c2d3e-4f5a-6b7c-8d9e-0f1a2b3c4d5e

# Filter by AI state
GET /jsonapi/node/property?filter[field_ai_state]=draft

# Filter by location UUID
GET /jsonapi/node/property?filter[field_location.id]=A1B2C3D4...

# Filter by price
GET /jsonapi/node/property?filter[field_price]=500000

# Combined filters
GET /jsonapi/node/property?filter[field_location.id]=A1B2...&filter[field_ai_state]=draft
```

---

### 4.2 GET Users

**Endpoint**: `GET /jsonapi/user/user`

**Purpose**: Lookup User UUIDs for `field_ai_listing_instructor` and `field_ai_listing_reviewer`.

**Searchable Attributes**:
- `name` - Username (primary search key)
- `mail` - Email address
- `drupal_internal__uid` - Numeric ID
- `display_name` - Visible name
- `status` - `true` = active user

**Examples**:
```
# Find user by username
GET /jsonapi/user/user?filter[name]=JohnDoe

# Find user by email
GET /jsonapi/user/user?filter[mail]=john@example.com

# Find active users only
GET /jsonapi/user/user?filter[status]=true
```

**Response Usage**:
```json
{
  "field_ai_listing_instructor": {
    "data": {
      "type": "user--user",
      "id": "94503467-3327-4c75-870f-560662d5351a"
    }
  }
}
```

---

### 4.3 GET Locations

**Endpoint**: `GET /jsonapi/node/location`

**Purpose**: Retrieve Area/Neighborhood UUIDs for `field_location` (MANDATORY field).

**Searchable Attributes**:
- `title` - Area/Neighborhood name (primary search key)
- `field_map` - Geo-coordinates for verification

**Examples**:
```
# Find location by name
GET /jsonapi/node/location?filter[title]=Limassol Marina

# Find location by partial name
GET /jsonapi/node/location?filter[title][operator]=CONTAINS&filter[title][value]=Marina
```

**Response Usage**:
```json
{
  "field_location": {
    "data": {
      "type": "node--location",
      "id": "a1b2c3d4-e5f6-7890-abcd-ef0123456789"
    }
  }
}
```

> **TIP**: If searching "Marina" returns multiple results, check `field_town` relationship to pick the correct one (Limassol vs Larnaca).

---

### 4.4 GET Taxonomy Terms

**Endpoint**: `GET /jsonapi/taxonomy_term/{vocabulary}`

**Available Vocabularies**:

| Vocabulary | Description | Used For |
|------------|-------------|----------|
| `listing_type` | For Sale, For Rent, Exchange | Property + Land |
| `price_modifier` | No VAT, Plus VAT, VAT Included | Property + Land |
| `title_deed` | Title Deed, Final Approval, Share of Land | Property + Land |
| `property_type` | Apartment, Villa, Office, Shop | Property only |
| `property_status` | Under Construction, Resale, Off Plan | Property only |
| `indoor_property_views` | Air Conditioning, Central Heating, Fireplace | Property only |
| `outdoor_property_features` | Private Pool, Communal Pool, Garden | Property only |
| `property_views` | Sea View, Mountain View, City View | Property + Land |
| `land_type` | Plot, Field, Agricultural | Land only |
| `infrastructure_` | Electricity, Water, Road Access | Land only |
| `towns` | Limassol, Paphos, Nicosia | Location filter |

**Examples**:
```
# Get all property types
GET /jsonapi/taxonomy_term/property_type

# Find specific term by name
GET /jsonapi/taxonomy_term/property_type?filter[name]=Apartment

# Get all listing types
GET /jsonapi/taxonomy_term/listing_type
```

**Universal Search Pattern**:
```
GET /jsonapi/taxonomy_term/{vocabulary}?filter[name]={TERM_NAME}
```

---

## 5. POST Endpoints

### 5.1 Upload Property Listing

**Endpoint**: `POST /jsonapi/node/property`

**Required Fields**:
| Field | Type | Description |
|-------|------|-------------|
| `status` | boolean | **MUST BE `false`** (unpublished draft) |
| `title` | string | Listing headline (max 255 chars) |
| `body.value` | string | Property description |
| `field_price` | number | Price in EUR |
| `field_covered_area` | integer | Internal area in sqm |
| `field_map` | object | Coordinates (see format below) |
| `field_ai_state` | string | **MUST BE `"draft"`** |
| `field_property_type` | relationship | Taxonomy term UUID |
| `field_listing_type` | relationship | Taxonomy term UUID |
| `field_location` | relationship | Location node UUID |
| `field_price_modifier` | relationship | Taxonomy term UUID |
| `field_title_deed` | relationship | Taxonomy term UUID |
| `field_gallery_` | relationship[] | File UUIDs (min 1) |

**Coordinates Format** (`field_map`):
```json
{
  "value": "POINT (33.429859 35.126413)",
  "geo_type": "Point",
  "lat": 35.126413,
  "lon": 33.429859,
  "latlon": "35.126413,33.429859"
}
```
> **IMPORTANT**: POINT format is `POINT (LON LAT)` - longitude comes FIRST!

---

### 5.2 Upload Land Listing

**Endpoint**: `POST /jsonapi/node/land`

**Required Fields**:
| Field | Type | Description |
|-------|------|-------------|
| `status` | boolean | **MUST BE `false`** |
| `title` | string | Listing headline |
| `body.value` | string | Land description |
| `field_land_price` | number | Price in EUR |
| `field_land_size` | integer | Size in sqm |
| `field_land_map` | object | Coordinates |
| `field_ai_state` | string | **MUST BE `"draft"`** |
| `field_land_type` | relationship | Taxonomy term UUID |
| `field_listing_type` | relationship | Taxonomy term UUID |
| `field_location` | relationship | Location node UUID |
| `field_land_price_modifier` | relationship | Taxonomy term UUID |
| `field_land_gallery` | relationship[] | File UUIDs |

> **NOTE**: Land fields use `field_land_*` prefix instead of `field_*`

---

### 5.3 Upload File (Images/Documents)

**Endpoint**: `POST /jsonapi/node/{bundle}/{field}`

**File Fields by Bundle**:

**Property** (`node--property`):
| Field | Type | Description |
|-------|------|-------------|
| `field_gallery_` | Image | Main gallery (MANDATORY) |
| `field_floor_plan` | Image | Floor plan images |
| `field_pdf_floor_plan` | PDF | Floor plan documents |
| `field_epc` | PDF | Energy certificate |

**Land** (`node--land`):
| Field | Type | Description |
|-------|------|-------------|
| `field_land_gallery` | Image | Main gallery (MANDATORY) |
| `field_marketing_agreement` | PDF | Marketing contract |
| `field_title_deed_file` | PDF | Scanned title deed |

**Request**:
```
POST /jsonapi/node/property/field_gallery_
Content-Type: application/octet-stream
Content-Disposition: file; filename="living_room_01.jpg"
User-Agent: SophiaAI
Authorization: Bearer <token>

[Binary file data]
```

**Response**:
```json
{
  "data": {
    "type": "file--file",
    "id": "c3d4e5f6-7890-abcd-ef01-234567890123",
    "attributes": {
      "uri": { "value": "public://..." }
    }
  }
}
```

**Workflow**:
1. Upload file → Get UUID from response
2. Use UUID in `field_gallery_` relationship array

---

## 6. Complete Payload Examples

### 6.1 Property Upload Payload

> **Note**: The `body.value` description is auto-generated by `description-generator.ts` as professional marketing prose with multiple paragraphs (opening, location, features, details, call-to-action).

```json
{
  "data": {
    "type": "node--property",
    "attributes": {
      "status": false,
      "title": "Luxury 3-Bedroom Apartment in Limassol Marina",
      "body": {
        "value": "Stunning 3 bedroom apartment for sale in Limassol Marina with full title deeds. This property offers 150 square meters of covered living space, comprising 3 bedrooms and 2 bathrooms.\n\nLimassol is Cyprus's vibrant second city, combining business energy with beachfront living and a rich cultural scene.\n\nThe property benefits from air conditioning, central heating, sea views, and covered parking.\n\nThe property is built in 2020.\n\nOffered at €750,000, this represents an excellent opportunity in Limassol Marina. Contact us today to arrange a viewing.",
        "format": "plain_text"
      },
      "field_price": 750000,
      "field_covered_area": 150,
      "field_land_size": 0,
      "field_map": {
        "value": "POINT (33.0413 34.6841)",
        "geo_type": "Point",
        "lat": 34.6841,
        "lon": 33.0413,
        "latlon": "34.6841,33.0413"
      },
      "field_ai_state": "draft",
      "field_ai_generated": true,
      "field_new_build": false,
      "field_no_bedrooms": 3,
      "field_no_bathrooms": 2,
      "field_no_kitchens": 1,
      "field_no_living_rooms": 1,
      "field_year_built": 2020,
      "field_own_reference_id": "SOPHIA-001",
      "field_ai_assistant_notes": "User requirements: 3BR apartment near marina, sea view, budget 800k"
    },
    "relationships": {
      "field_location": {
        "data": {
          "type": "node--location",
          "id": "85789fe8-84a0-400b-84ec-451c4c77f1ad"
        }
      },
      "field_property_type": {
        "data": {
          "type": "taxonomy_term--property_type",
          "id": "76b4fa8e-de7e-4232-85ac-869dca3620f4"
        }
      },
      "field_listing_type": {
        "data": {
          "type": "taxonomy_term--listing_type",
          "id": "8f187816-a888-4cda-a937-1cee84b9c0ee"
        }
      },
      "field_price_modifier": {
        "data": {
          "type": "taxonomy_term--price_modifier",
          "id": "afecdce5-edb4-4fb5-ba09-09727967c1a8"
        }
      },
      "field_title_deed": {
        "data": {
          "type": "taxonomy_term--title_deed",
          "id": "5c553db1-e53d-46a2-b609-093d17e75a7a"
        }
      },
      "field_indoor_property_features": {
        "data": [
          {
            "type": "taxonomy_term--indoor_property_views",
            "id": "f577829f-8cbe-4ba8-9ce8-e67a30b6fe76"
          },
          {
            "type": "taxonomy_term--indoor_property_views",
            "id": "1b16146f-6298-4690-a779-328b0fc3b88c"
          }
        ]
      },
      "field_outdoor_property_features": {
        "data": [
          {
            "type": "taxonomy_term--outdoor_property_features",
            "id": "c3f02ad5-4275-4cb5-acaa-359673e2b0ac"
          }
        ]
      },
      "field_gallery_": {
        "data": [
          {
            "type": "file--file",
            "id": "94434ad8-2945-485c-a5d2-5bdc8f757b0b"
          }
        ]
      }
    }
  }
}
```

### 6.2 Land Upload Payload

> **Note**: Land listings also use auto-generated prose descriptions.

```json
{
  "data": {
    "type": "node--land",
    "attributes": {
      "status": false,
      "title": "Building Plot in Paphos with Sea View",
      "body": {
        "value": "Exceptional building plot for sale in Paphos. This plot offers 1,500 square meters of land in a prime location.\n\nPaphos offers an excellent location combining convenience with quality of life, close to local amenities and transport links.\n\nThe plot benefits from sea views, electricity connection, water connection, and road access.\n\nOffered at €250,000, this represents an excellent opportunity in Paphos. Contact us today to arrange a viewing.",
        "format": "plain_text"
      },
      "field_land_price": 250000,
      "field_land_size": 1500,
      "field_land_map": {
        "value": "POINT (32.4167 34.7667)",
        "geo_type": "Point",
        "lat": 34.7667,
        "lon": 32.4167,
        "latlon": "34.7667,32.4167"
      },
      "field_ai_state": "draft",
      "field_ai_generated": true,
      "field_building_density": 80,
      "field_site_coverage": 35,
      "field_floors": 2,
      "field_height": 8.3,
      "field_own_reference_id": "SOPHIA-L001"
    },
    "relationships": {
      "field_location": {
        "data": {
          "type": "node--location",
          "id": "a1b2c3d4-e5f6-7890-abcd-ef0123456789"
        }
      },
      "field_land_type": {
        "data": {
          "type": "taxonomy_term--land_type",
          "id": "uuid-of-land-type"
        }
      },
      "field_listing_type": {
        "data": {
          "type": "taxonomy_term--listing_type",
          "id": "8f187816-a888-4cda-a937-1cee84b9c0ee"
        }
      },
      "field_land_price_modifier": {
        "data": {
          "type": "taxonomy_term--price_modifier",
          "id": "ab39af2d-c8f5-4971-9fa5-2df6822ab9a9"
        }
      },
      "field_infrastructure": {
        "data": [
          {
            "type": "taxonomy_term--infrastructure_",
            "id": "uuid-of-electricity"
          },
          {
            "type": "taxonomy_term--infrastructure_",
            "id": "uuid-of-water"
          }
        ]
      },
      "field_land_gallery": {
        "data": [
          {
            "type": "file--file",
            "id": "file-uuid-here"
          }
        ]
      }
    }
  }
}
```

---

## 7. Taxonomy Reference

### Default UUIDs (Common Defaults)

| Field | Default UUID | Value |
|-------|--------------|-------|
| `field_listing_type` | `8f187816-a888-4cda-a937-1cee84b9c0ee` | For Sale |
| `field_price_modifier` | `ab39af2d-c8f5-4971-9fa5-2df6822ab9a9` | No VAT |
| `field_title_deed` | `5c553db1-e53d-46a2-b609-093d17e75a7a` | Title Deed |

### Taxonomy Endpoints Quick Reference

```
# Core (Property + Land)
GET /jsonapi/taxonomy_term/listing_type
GET /jsonapi/taxonomy_term/price_modifier
GET /jsonapi/taxonomy_term/title_deed
GET /jsonapi/taxonomy_term/towns

# Property Specific
GET /jsonapi/taxonomy_term/property_type
GET /jsonapi/taxonomy_term/property_status
GET /jsonapi/taxonomy_term/indoor_property_views
GET /jsonapi/taxonomy_term/outdoor_property_features
GET /jsonapi/taxonomy_term/property_views

# Land Specific
GET /jsonapi/taxonomy_term/land_type
GET /jsonapi/taxonomy_term/infrastructure_
```

---

## 8. Field Reference

### Property Fields

#### Mandatory Attributes
| Field | Type | Max | Description |
|-------|------|-----|-------------|
| `title` | string | 255 | Listing headline |
| `body.value` | string | - | Description |
| `field_price` | number | - | Price in EUR |
| `field_covered_area` | integer | - | Internal area (sqm) |
| `field_map` | object | - | Coordinates |
| `field_ai_state` | string | - | Must be "draft" |

#### Optional Attributes
| Field | Type | Description |
|-------|------|-------------|
| `field_no_bedrooms` | integer | Number of bedrooms |
| `field_no_bathrooms` | integer | Number of bathrooms |
| `field_no_kitchens` | integer | Number of kitchens |
| `field_no_living_rooms` | integer | Number of living rooms |
| `field_no_storage_rooms` | integer | Storage rooms |
| `field_no_covered_verandas` | integer | Covered veranda area (sqm) |
| `field_no_uncovered_verandas` | integer | Uncovered veranda area (sqm) |
| `field_year_built` | integer | Year of construction |
| `field_new_build` | boolean | Is brand new |
| `field_energy_class` | string | Energy rating (A, B, etc.) |
| `field_land_size` | integer | Plot size (for villas) |
| `field_own_reference_id` | string | External reference ID |
| `field_phone_number` | string | Contact phone |
| `field_video_walkthrough` | string | YouTube/Vimeo URL |
| `field_property_notes` | string | Internal notes |

#### AI Workflow Attributes
| Field | Type | Description |
|-------|------|-------------|
| `field_ai_generated` | boolean | Set to `true` |
| `field_ai_state` | string | Set to `"draft"` |
| `field_ai_message.value` | string | Generation notes |
| `field_ai_probably_exists` | boolean | Duplicate suspected |
| `field_ai_assistant_notes` | string | User requirements summary |

#### Property Relationships
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `field_property_type` | `taxonomy_term--property_type` | Yes | Apartment, Villa, etc. |
| `field_listing_type` | `taxonomy_term--listing_type` | Yes | For Sale, For Rent |
| `field_location` | `node--location` | Yes | Area/Neighborhood |
| `field_price_modifier` | `taxonomy_term--price_modifier` | Yes | VAT status |
| `field_title_deed` | `taxonomy_term--title_deed` | Yes | Legal status |
| `field_gallery_` | `file--file[]` | Yes | Images (min 1) |
| `field_indoor_property_features` | `taxonomy_term--indoor_property_views[]` | No | Interior features |
| `field_outdoor_property_features` | `taxonomy_term--outdoor_property_features[]` | No | Exterior features |
| `field_property_views` | `taxonomy_term--property_views[]` | No | Sea/Mountain view |
| `field_property_status` | `taxonomy_term--property_status` | No | Build status |

### Land Fields

#### Mandatory Attributes
| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Listing headline |
| `body.value` | string | Description |
| `field_land_price` | number | Price in EUR |
| `field_land_size` | integer | Size in sqm |
| `field_land_map` | object | Coordinates |
| `field_ai_state` | string | Must be "draft" |

#### Optional Attributes
| Field | Type | Description |
|-------|------|-------------|
| `field_building_density` | integer | Density % allowed |
| `field_site_coverage` | integer | Coverage % allowed |
| `field_floors` | integer | Max floors allowed |
| `field_height` | number | Max height allowed |
| `field_video_walkthrough` | string | Video URL |
| `field_notes.value` | string | Internal notes |
| `field_own_reference_id` | string | External reference |

#### Land Relationships
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `field_land_type` | `taxonomy_term--land_type` | Yes | Plot, Field, etc. |
| `field_listing_type` | `taxonomy_term--listing_type` | Yes | For Sale |
| `field_location` | `node--location` | Yes | Area |
| `field_land_price_modifier` | `taxonomy_term--price_modifier` | Yes | VAT status |
| `field_land_gallery` | `file--file[]` | Yes | Images |
| `field_land_title_deed` | `taxonomy_term--title_deed` | No | Legal status |
| `field_infrastructure` | `taxonomy_term--infrastructure_[]` | No | Utilities |
| `field_land_views` | `taxonomy_term--property_views[]` | No | Views |

---

## 9. Error Handling

### Common HTTP Errors

| Code | Cause | Solution |
|------|-------|----------|
| 401 | Token expired | Request new token |
| 403 | Missing User-Agent | Add `User-Agent: SophiaAI` header |
| 404 | Wrong endpoint/UUID | Verify endpoint path and UUIDs |
| 422 | Invalid payload | Check required fields and UUID validity |

### Validation Checklist

Before uploading:
1. ✅ `status: false` (MUST be unpublished)
2. ✅ `field_ai_state: "draft"` (MUST be draft)
3. ✅ All relationship UUIDs are valid (fetch from taxonomy first)
4. ✅ At least one image in gallery field
5. ✅ Coordinates in correct format: `POINT (LON LAT)`
6. ✅ All required headers present

---

## TypeScript Types

```typescript
// Coordinate format
interface GeoField {
  value: string;      // "POINT (LON LAT)"
  geo_type: "Point";
  lat: number;
  lon: number;
  latlon: string;     // "LAT,LON"
}

// Relationship reference
interface RelationshipData {
  type: string;       // "taxonomy_term--property_type"
  id: string;         // UUID
}

interface Relationship {
  data: RelationshipData | RelationshipData[];
}

// Property payload
interface PropertyPayload {
  data: {
    type: "node--property";
    attributes: {
      status: false;
      title: string;
      body: { value: string; format?: string };
      field_price: number;
      field_covered_area: number;
      field_map: GeoField;
      field_ai_state: "draft";
      field_ai_generated?: boolean;
      field_no_bedrooms?: number;
      field_no_bathrooms?: number;
      // ... other optional fields
    };
    relationships: {
      field_property_type: Relationship;
      field_listing_type: Relationship;
      field_location: Relationship;
      field_price_modifier: Relationship;
      field_title_deed: Relationship;
      field_gallery_: Relationship;
      field_indoor_property_features?: Relationship;
      field_outdoor_property_features?: Relationship;
      field_property_views?: Relationship;
    };
  };
}

// Land payload
interface LandPayload {
  data: {
    type: "node--land";
    attributes: {
      status: false;
      title: string;
      body: { value: string };
      field_land_price: number;
      field_land_size: number;
      field_land_map: GeoField;
      field_ai_state: "draft";
      // ... other fields
    };
    relationships: {
      field_land_type: Relationship;
      field_listing_type: Relationship;
      field_location: Relationship;
      field_land_price_modifier: Relationship;
      field_land_gallery: Relationship;
      // ... other relationships
    };
  };
}
```

---

## Quick Start Workflow

1. **Get Token**
   ```
   POST /oauth/token
   ```

2. **Lookup Taxonomy UUIDs**
   ```
   GET /jsonapi/taxonomy_term/property_type?filter[name]=Apartment
   GET /jsonapi/taxonomy_term/listing_type?filter[name]=For Sale
   ```

3. **Lookup Location UUID**
   ```
   GET /jsonapi/node/location?filter[title]=Limassol Marina
   ```

4. **Upload Images**
   ```
   POST /jsonapi/node/property/field_gallery_
   → Get file UUID from response
   ```

5. **Create Listing**
   ```
   POST /jsonapi/node/property
   → Include all UUIDs in payload
   ```

---

**Last Updated**: January 2026
**Source**: Postman Collection "Zyprus Sophia AI"
