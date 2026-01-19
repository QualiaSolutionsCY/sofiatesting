# SOPHIA Property Upload Tests

## Current Working Tests (Jan 2026)

All uploads go through **Supabase Edge Function `sophia-bot`** to the **Zyprus API** (`dev9.zyprus.com`).

### Test Files

| File | Purpose | Run Command |
|------|---------|-------------|
| `test-multi-upload.ts` | **RECOMMENDED** - Upload multiple properties via webhook | `npx tsx tests/manual/test-multi-upload.ts` |
| `upload-sophia-ai.ts` | Direct API test with SOPHIA_AI user | `npx tsx tests/manual/upload-sophia-ai.ts` |
| `test-sophia-edge-upload.ts` | Edge Function webhook test (single property) | `npx tsx tests/manual/test-sophia-edge-upload.ts` |
| `test-zyprus-api.ts` | Test all Zyprus API endpoints | `npx tsx tests/manual/test-zyprus-api.ts` |
| `test-zyprus-upload-direct.ts` | Direct upload with full payload | `npx tsx tests/manual/test-zyprus-upload-direct.ts` |

### Important: Agent Region Restrictions

Agents can **ONLY** upload properties in their assigned region. Before testing:

```sql
-- Find valid agent phone numbers and their regions
SELECT mobile, full_name, region FROM agents WHERE can_upload = true AND is_active = true;
```

If you get error "not allowed to market outside your region", use a phone number for an agent in that region.

### Key Constants

```typescript
// User UUIDs
SOPHIA_AI_UUID = "7026c7a3-1ef0-419f-9957-15a8c161b614"  // For field_ai_listing_instructor
MICHELLE_UUID = "dc2688d2-0ea1-4c13-b03d-3309ee8de6a4"   // Michelle Pitsillides
LAUREN_UUID = "0caa9a75-362a-4156-b11b-b52839243b74"    // Lauren (default reviewer)

// Default Taxonomy UUIDs (dev9.zyprus.com)
DEFAULT_LOCATION = "7dbc931e-90eb-4b89-9ac8-b5e593831cf8" // Acropolis, Strovolos
DEFAULT_PROPERTY_TYPE = "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44" // Apartment
DEFAULT_LISTING_TYPE = "8f187816-a888-4cda-a937-1cee84b9c0ee" // For Sale
DEFAULT_TITLE_DEED = "5c553db1-e53d-46a2-b609-093d17e75a7a"
DEFAULT_PRICE_MODIFIER = "ab39af2d-c8f5-4971-9fa5-2df6822ab9a9" // No VAT
```

### New Fields (Jan 16, 2026)

These fields are now properly populated on upload:

| Field | Type | Description |
|-------|------|-------------|
| `field_listing_owner` | relationship | UUID of agent who owns the listing |
| `field_ai_draft_own_reference_id` | attribute | `SOPHIA-YYYYMMDD-HHMMSS-TYP` reference |
| `field_property_views` | relationship | Array of view UUIDs (Sea View, Mountain View) |

### Description Format

Descriptions now use comprehensive itemized format:

```
Stunning 4 Bedroom Detached Villa For Sale in Agios Tychonas with Separate Title Deeds

[Location paragraph]

KEY FEATURES:
• 4 Bedrooms
• 3 Bathrooms
• 280m² Covered Area
• 1200m² Plot Size
• Built in 2019

INDOOR FEATURES:
• Air Conditioning
• Central Heating

OUTDOOR FEATURES:
• Private Swimming Pool
• Landscaped Garden

PROPERTY VIEWS:
• Sea View
• Mountain View

[Closing + Price + CTA]
```

File: `supabase/functions/sophia-bot/services/description-generator.ts`

### Required Environment Variables

**For webhook tests** (recommended):
- Uses `WASEND_WEBHOOK_SECRET` from Supabase secrets (not needed locally)
- Phone number must match registered agent

**For direct API tests**:
Set in `.env.local`:
```bash
ZYPRUS_API_URL=https://dev9.zyprus.com
ZYPRUS_CLIENT_ID=your_client_id
ZYPRUS_CLIENT_SECRET=your_client_secret
```

### Verification

After running tests, check:
- **Draft Dashboard**: https://dev9.zyprus.com/draft-dashboard?ai_state=draft
- **Supabase Logs**: Use Supabase MCP `get_logs` with service="edge-function"
- **Chat History**: Query `chat_history` table in Supabase

### Architecture

```
WhatsApp → WaSend Webhook → sophia-bot Edge Function → OpenRouter AI → Tool Executor → Zyprus API
                                                                            ↓
                                                              Creates draft listing on dev9.zyprus.com

Key files:
- tools/executor.ts - Tool execution
- zyprus/client.ts - API client with new fields
- services/description-generator.ts - Itemized descriptions
- zyprus/taxonomy-cache.ts - UUID resolution
```

### Source of Truth

For detailed Zyprus API documentation, see:
`/home/qualia/Desktop/Projects/aiagents/sofiatesting/UPLOAD-LISTINGS-EXTENSIVE-INFO/`

**DO NOT modify that folder** - it's the reference documentation from Zyprus.
