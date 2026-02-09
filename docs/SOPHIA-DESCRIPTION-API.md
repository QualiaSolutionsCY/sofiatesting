# Sophia AI Description Generator API

For Zyprus CMS Integration - Updated February 2026

---

## Overview

This API endpoint allows the Zyprus CMS to generate professional property descriptions using Sophia AI's description generation service.

**Base URL**: `https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot`

**Endpoint**: `POST /admin/generate-description`

---

## Authentication

The endpoint requires the `X-Admin-Secret` header with the shared secret key.

**Header**:
```
X-Admin-Secret: YOUR_SECRET_KEY
```

To set the secret in Supabase:
```bash
supabase secrets set SOPHIA_ADMIN_SECRET=your_secure_secret_here --project-ref vceeheaxcrhmpqueudqx
```

---

## Request Format

### URL
```
POST https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot/admin/generate-description
```

### Headers
| Header | Value | Required |
|--------|-------|----------|
| `X-Admin-Secret` | Your secret key | Yes |
| `Content-Type` | `application/json` | Yes |

### Request Body (JSON)

```json
{
  "type": "apartment",
  "listingType": "sale",
  "bedrooms": 2,
  "bathrooms": 2,
  "location": "Tala",
  "coveredArea": 95,
  "plotSize": 150,
  "coveredVeranda": 12,
  "uncoveredVeranda": 8,
  "features": [
    "Air Conditioning",
    "Central Heating",
    "Covered Parking",
    "Sea View",
    "Fitted Kitchen"
  ],
  "price": 250000,
  "yearBuilt": 2020,
  "condition": "new",
  "orientation": "south",
  "parking": "covered",
  "storage": true,
  "airConditioning": true,
  "centralHeating": true,
  "pool": false,
  "garden": true,
  "seaView": true,
  "mountainView": false,
  "titleDeedStatus": "separate",
  "areaDescription": "Peaceful area with stunning views of the Mediterranean coast."
}
```

---

## Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Property type: `apartment`, `villa`, `house`, `detached house`, `semi detached`, `bungalow`, `townhouse`, `maisonette`, `studio` |
| `listingType` | string | Yes | `sale` or `rent` |
| `bedrooms` | number | Yes | Number of bedrooms (0 for studio) |
| `bathrooms` | number | Yes | Number of bathrooms |
| `location` | string | Yes | Area name in Cyprus (e.g., `Tala`, `Kato Paphos`, `Limassol`, `Germasogeia`) |
| `coveredArea` | number | Yes | Interior covered area in square meters |
| `plotSize` | number | No | Plot size in square meters (for houses/villas) |
| `coveredVeranda` | number | No | Covered veranda area in sqm |
| `uncoveredVeranda` | number | No | Uncovered veranda/terrace area in sqm |
| `features` | string[] | No | Array of feature strings |
| `price` | number | Yes | Property price in EUR |
| `yearBuilt` | number | No | Year the property was built |
| `condition` | string | No | Property condition: `new`, `excellent`, `good`, `needs renovation` |
| `orientation` | string | No | Compass direction: `north`, `south`, `east`, `west` |
| `parking` | string | No | `covered`, `open`, `garage`, `none` |
| `storage` | boolean | No | Has storage room |
| `airConditioning` | boolean | No | Has air conditioning |
| `centralHeating` | boolean | No | Has central heating |
| `pool` | boolean | No | Has swimming pool |
| `garden` | boolean | No | Has garden |
| `seaView` | boolean | No | Has sea view |
| `mountainView` | boolean | No | Has mountain view |
| `titleDeedStatus` | string | No | `separate`, `pending`, `share_of_land`, `final_approval` |
| `areaDescription` | string | No | Custom area description (overrides default location text) |

---

## Response Format

### Success Response (200 OK)

```json
{
  "success": true,
  "description": "Stunning 2 Bedroom Apartment For Sale In Tala With Title Deeds\nLocated in a peaceful and highly sought-after area\nIt enjoys easy access to local amenities, including a supermarket and village square\nTala is only a 15-20 minute drive from the city center and the seafront!\n\nSea View\n2 Bedrooms\n2 Bathrooms\n95m² Covered Area\n12m² Covered Veranda\nSouth Facing\nAir Conditioning\nCentral Heating\nCovered Parking\nNew Condition\n\nThis apartment represents an excellent investment opportunity!\nPerfect for permanent residence, holiday use or rental investment\n\nContact us for full information and for a private viewing!",
  "title": "2 Bed Apartment in Tala"
}
```

### Error Response (400 Bad Request)

```json
{
  "success": false,
  "error": "Missing required fields",
  "missingFields": ["bedrooms", "location"]
}
```

### Error Response (401 Unauthorized)

```json
{
  "success": false,
  "error": "Unauthorized"
}
```

### Error Response (500 Internal Server Error)

```json
{
  "success": false,
  "error": "Failed to generate description",
  "details": "Error message..."
}
```

---

## Example Usage

### cURL Example

```bash
curl -X POST \
  'https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot/admin/generate-description' \
  -H 'X-Admin-Secret: YOUR_SECRET_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "villa",
    "listingType": "sale",
    "bedrooms": 3,
    "bathrooms": 2,
    "location": "Peyia",
    "coveredArea": 150,
    "plotSize": 400,
    "features": ["Private Pool", "BBQ Area", "Sea View"],
    "price": 450000,
    "pool": true,
    "seaView": true,
    "garden": true
  }'
```

### JavaScript/Fetch Example

```javascript
const response = await fetch(
  'https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot/admin/generate-description',
  {
    method: 'POST',
    headers: {
      'X-Admin-Secret': 'YOUR_SECRET_KEY',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'apartment',
      listingType: 'sale',
      bedrooms: 2,
      bathrooms: 1,
      location: 'Kato Paphos',
      coveredArea: 75,
      price: 180000,
      airConditioning: true,
      parking: 'covered'
    })
  }
);

const data = await response.json();

if (data.success) {
  console.log('Generated description:');
  console.log(data.description);
} else {
  console.error('Error:', data.error);
}
```

### PHP Example (for Drupal/Zyprus backend)

```php
$url = 'https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot/admin/generate-description';

$data = [
  'type' => 'apartment',
  'listingType' => 'sale',
  'bedrooms' => 2,
  'bathrooms' => 2,
  'location' => 'Limassol',
  'coveredArea' => 95,
  'price' => 250000,
  'airConditioning' => true,
  'seaView' => true
];

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
  'X-Admin-Secret: YOUR_SECRET_KEY',
  'Content-Type: application/json'
]);

$response = curl_exec($ch);
curl_close($ch);

$result = json_decode($response, true);

if ($result['success']) {
  $description = $result['description'];
  // Use description in your CMS
} else {
  // Handle error
}
```

---

## Description Format

The generated description follows this structure:

1. **Headline** - Title Case summary (e.g., "Spacious 2 Bedroom Apartment For Sale In Tala With Title Deeds")
2. **Location Sentences** - 2-4 short sentences about the area
3. **Premium Features** - Pool, views, cul-de-sac
4. **Basic Specs** - Bedrooms, bathrooms, covered area
5. **Remaining Features** - Sorted by importance (parking, rooms, heating, etc.)
6. **Closing Sentences** - 2 sentences about the investment opportunity
7. **Call to Action** - Contact information

---

## Supported Locations

The AI has built-in knowledge of these Cyprus areas:

### Paphos
- Tala, Peyia, Coral Bay, Chloraka, Kato Paphos, Universal, Yeroskipou

### Limassol
- Limassol, Potamos Germasogeia, Agios Tychonas, Mesa Geitonia, Germasogeia, Moutagiaka/Mouttagiaka

### Larnaca
- Larnaca, Oroklini, Pervolia

### Famagusta
- Paralimni, Ayia Napa, Protaras

### Nicosia
- Nicosia, Strovolos

For other areas, a generic location description is used.

---

## Rate Limiting & Performance

- **Response Time**: Typically < 500ms
- **No Rate Limit**: Currently unlimited for Zyprus CMS
- **Timeout**: 30 second timeout on Supabase Edge Functions

---

## Testing

Before integrating with Zyprus CMS, test the endpoint using:

```bash
# Health check
curl https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot/health

# Generate description test
curl -X POST \
  'https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot/admin/generate-description' \
  -H 'X-Admin-Secret: YOUR_SECRET_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"type":"apartment","listingType":"sale","bedrooms":2,"bathrooms":1,"location":"Tala","coveredArea":85,"price":200000}'
```

---

## Deployment Notes

After updating the code, deploy the Edge Function:

```bash
supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx
```

---

## Support

For issues or questions:
- Check Supabase logs: `supabase functions logs sophia-bot --project-ref vceeheaxcrhmpqueudqx`
- Contact: Qualia Solutions
