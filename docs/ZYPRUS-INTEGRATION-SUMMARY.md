# Zyprus CMS Integration - Sophia AI Description Generator

**Quick Summary for Zyprus Developers**

---

## API Endpoint

```
POST https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot/admin/generate-description
```

---

## Authentication

Include this header in every request:

```
X-Admin-Secret: [CONTACT QUALIA FOR THE SECRET KEY]
```

You need to set this secret in your Supabase project before the API will work:

```bash
supabase secrets set SOPHIA_ADMIN_SECRET=your_secure_secret_here --project-ref vceeheaxcrhmpqueudqx
```

---

## Minimal Request Example

```json
{
  "type": "apartment",
  "listingType": "sale",
  "bedrooms": 2,
  "bathrooms": 2,
  "location": "Tala",
  "coveredArea": 95,
  "price": 250000
}
```

---

## Response Example

```json
{
  "success": true,
  "description": "Stunning 2 Bedroom Apartment For Sale In Tala With Title Deeds\nLocated in a peaceful and highly sought-after area\nIt enjoys easy access to local amenities, including a supermarket and village square\nTala is only a 15-20 minute drive from the city center and the seafront!\n\n2 Bedrooms\n2 Bathrooms\n95m² Covered Area\nSouth Facing\n\nThis apartment represents an excellent investment opportunity!\nPerfect for permanent residence, holiday use or rental investment\n\nContact us for full information and for a private viewing!",
  "title": "2 Bed Apartment in Tala"
}
```

---

## Complete Field Reference

| Field | Type | Required | Example |
|-------|------|----------|---------|
| `type` | string | Yes | `"apartment"`, `"villa"`, `"house"`, `"bungalow"` |
| `listingType` | string | Yes | `"sale"` or `"rent"` |
| `bedrooms` | number | Yes | `2` (use `0` for studio) |
| `bathrooms` | number | Yes | `2` |
| `location` | string | Yes | `"Tala"`, `"Kato Paphos"`, `"Limassol"` |
| `coveredArea` | number | Yes | `95` (square meters) |
| `price` | number | Yes | `250000` (EUR) |
| `plotSize` | number | No | `400` (for houses/villas) |
| `coveredVeranda` | number | No | `12` |
| `uncoveredVeranda` | number | No | `8` |
| `features` | string[] | No | `["Air Conditioning", "Sea View"]` |
| `yearBuilt` | number | No | `2020` |
| `condition` | string | No | `"new"`, `"excellent"`, `"good"` |
| `orientation` | string | No | `"north"`, `"south"`, `"east"`, `"west"` |
| `parking` | string | No | `"covered"`, `"open"`, `"garage"` |
| `storage` | boolean | No | `true` |
| `airConditioning` | boolean | No | `true` |
| `centralHeating` | boolean | No | `true` |
| `pool` | boolean | No | `true` |
| `garden` | boolean | No | `true` |
| `seaView` | boolean | No | `true` |
| `mountainView` | boolean | No | `true` |
| `titleDeedStatus` | string | No | `"separate"`, `"pending"` |
| `areaDescription` | number | No | Custom area description text |

---

## cURL Test Command

```bash
curl -X POST \
  'https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot/admin/generate-description' \
  -H 'X-Admin-Secret: YOUR_SECRET_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "apartment",
    "listingType": "sale",
    "bedrooms": 2,
    "bathrooms": 2,
    "location": "Tala",
    "coveredArea": 95,
    "price": 250000,
    "seaView": true,
    "airConditioning": true
  }'
```

---

## Error Responses

**401 Unauthorized** - Missing or invalid admin secret
```json
{"success": false, "error": "Unauthorized"}
```

**400 Bad Request** - Missing required fields
```json
{
  "success": false,
  "error": "Missing required fields",
  "missingFields": ["bedrooms", "location"]
}
```

---

## Postman Import

You can import this as a Postman request:

**URL**: `POST https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot/admin/generate-description`

**Headers**:
| Key | Value |
|-----|-------|
| X-Admin-Secret | `{{secret_key}}` |
| Content-Type | `application/json` |

**Body** (raw JSON):
```json
{
  "type": "villa",
  "listingType": "sale",
  "bedrooms": 3,
  "bathrooms": 2,
  "location": "Peyia",
  "coveredArea": 150,
  "plotSize": 400,
  "price": 450000,
  "pool": true,
  "seaView": true,
  "garden": true
}
```

---

## Notes

1. **CORS**: The endpoint accepts requests from `zyprus.com`, `www.zyprus.com`, and `dev9.zyprus.com`
2. **Rate Limiting**: Currently no rate limiting for Zyprus CMS
3. **Response Time**: Typically under 500ms
4. **Timeout**: 30 second timeout on Edge Function

---

## Full Documentation

See `docs/SOPHIA-DESCRIPTION-API.md` for complete API documentation with PHP and JavaScript examples.

---

## Support

For the admin secret key or any issues, contact Qualia Solutions.
