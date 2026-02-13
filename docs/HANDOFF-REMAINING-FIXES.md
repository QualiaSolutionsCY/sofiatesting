# SOPHIA Remaining Fixes — Agent Handoff

> **Context**: Lauren Ellingham (Zyprus listing manager) tested SOPHIA's property upload flow and identified issues. Most have been fixed. Three remain. This document gives the next agent everything needed to fix and deploy them.

---

## Project Location & Deploy

```
Project root: /home/qualia/Desktop/Projects/aiagents/sofiatesting/
Supabase ref: vceeheaxcrhmpqueudqx

# Deploy edge function
supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx

# After ANY prompt change, clear chat history (AI copies old patterns from history)
# Run in Supabase SQL editor or via MCP:
DELETE FROM chat_history;

# DB prompt updates (if needed):
# Edit sophia_prompts table WHERE key = 'property_upload'
# Then POST to /admin/prompts/invalidate to clear 5-min cache
```

---

## Issue 1: Photos — Duplicates & Wrong Order

**Lauren's feedback**: "Photos: Duplicate and not in correct order."

### Root Cause Analysis

The image pipeline has two stages that both use `Promise.all()` for parallel processing, which **does not guarantee order**:

1. **`image-persistence.ts:97-108`** — `persistImages()` uploads WhatsApp images to Supabase Storage in parallel:
   ```typescript
   const results = await Promise.all(
     urls.map((url, index) => persistImage(url, index))
   );
   ```
   `Promise.all` resolves in input order, so this actually preserves order. **Not the problem.**

2. **`zyprus/client.ts:608-633`** — `uploadImages()` uploads to Zyprus API in parallel:
   ```typescript
   const results = await Promise.all(
     imageUrls.map((url, index) => uploadSingleImage(url, index, token, config))
   );
   ```
   Same — `Promise.all` preserves input order. **Also not the problem.**

3. **The REAL duplicate issue**: When WhatsApp sends multiple photos as separate messages, each message triggers a separate webhook call. Each webhook call independently:
   - Persists images to Supabase Storage (`message-processor.ts:312`)
   - Adds them to `pending_images` table (`message-processor.ts:325`)
   - Sends the message text (or `[User sent image(s)]`) to the AI

   The AI may see these as multiple messages and try to call `createPropertyListing` multiple times, OR the same image URL might be persisted twice if the webhook fires twice for the same message (WaSenderAPI retry).

### Files to Read

| File | Why |
|------|-----|
| `supabase/functions/sophia-bot/services/message-processor.ts` (lines 280-352) | Where images are received, validated, persisted, and queued |
| `supabase/functions/sophia-bot/services/pending-images.ts` | `addPendingImages` and `getPendingImages` — the accumulation layer |
| `supabase/functions/sophia-bot/services/image-persistence.ts` | Re-uploads WhatsApp images to Supabase Storage |
| `supabase/functions/sophia-bot/tools/executor.ts` (lines 370-450) | Where `getPendingImages()` is called during listing creation |
| `supabase/functions/sophia-bot/zyprus/client.ts` (lines 608-633) | `uploadImages()` — uploads to Zyprus in parallel |

### Suggested Fix

**Deduplication**: Before inserting into `pending_images`, check if the same `image_url` already exists for that phone number. Either:
- Add a UNIQUE constraint on `(phone_number, image_url)` and use `ON CONFLICT DO NOTHING`
- Or deduplicate in `addPendingImages()` before inserting

**Order**: The order should already be correct since `pending_images` is queried with `ORDER BY created_at ASC` (`pending-images.ts:108`). If order is still wrong, it's because parallel persistence in `persistImages()` produces URLs in a non-deterministic order (different images take different times to upload to Storage). Fix: use sequential upload instead of `Promise.all()`:

```typescript
// In image-persistence.ts, change persistImages to sequential:
export async function persistImages(urls: string[]): Promise<string[]> {
  const persisted: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const result = await persistImage(urls[i], i);
    if (result) persisted.push(result);
  }
  return persisted;
}
```

This is slower but guarantees the order matches what the user sent.

**Also check**: Message deduplication in the webhook handler. Look for `claimMessageForProcessing` and `generateMessageKey` in `message-processor.ts` — if the dedup key doesn't include media IDs, the same image could be processed twice on webhook retries.

### DB Schema

```sql
-- Check pending_images table structure
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'pending_images';

-- Add unique constraint to prevent duplicate images
ALTER TABLE pending_images ADD CONSTRAINT unique_phone_image
  UNIQUE (phone_number, image_url);
```

---

## Issue 2: Documents — Upload Title Deeds to Back Office

**Lauren's feedback**: "Documents: we need her to add the deeds to the documents folder in the back office (I gave her the document attachment)"

### What This Means

When an agent sends a document (PDF/image of title deeds) via WhatsApp during the property upload flow, SOPHIA should upload it to the Zyprus listing's `field_title_deed_file` field. Currently, documents sent via WhatsApp are detected but NOT uploaded to Zyprus — they're only stored in Supabase Storage.

### Current Document Flow

1. Agent sends a document via WhatsApp
2. Webhook receives it → `message-processor.ts` extracts it
3. It's detected as a document (not an image) via `isDocumentUrl()` in `executor.ts:32-52`
4. Document URLs are **filtered OUT** from imageUrls at `executor.ts:384-394`
5. **No upload to Zyprus happens for documents**

### What Needs to Happen

1. When agent sends a document (PDF, image of deeds) during property creation, persist it to Supabase Storage (like images)
2. Pass the document URL(s) to `createPropertyListing` via a new parameter (e.g., `titleDeedFileUrls`)
3. In `zyprus/client.ts`, upload the file to `field_title_deed_file` (similar to how `field_floor_plan` works at lines 639-713)
4. Add the relationship in `buildJsonApiPayload()`

### Files to Modify

| File | Change |
|------|--------|
| `tools/definitions.ts` | Add `titleDeedFileUrls` parameter to `createPropertyListing` tool schema |
| `tools/executor.ts` | Stop filtering out document URLs; pass them as `titleDeedFileUrls` to the Zyprus client |
| `zyprus/client.ts` | Add `uploadTitleDeedFiles()` function (copy pattern from `uploadFloorPlans` at line 639), add to `ListingData` interface, add `field_title_deed_file` relationship in `buildJsonApiPayload()` |
| `prompts/behaviors/property-upload.ts` | Add instruction telling AI to pass document attachments as title deed files |
| DB: `sophia_prompts` key `property_upload` | Same update as the file fallback |

### Implementation Pattern (Copy from Floor Plans)

The `field_floor_plan` implementation at `zyprus/client.ts:639-713` is the exact pattern to follow:

```typescript
// 1. Upload endpoint for title deed files
// Endpoint: ${config.apiUrl}/jsonapi/node/property/field_title_deed_file
// Method: POST with application/octet-stream
// Same auth header pattern as uploadFloorPlans

// 2. In buildJsonApiPayload, add relationship:
if (titleDeedFileIds.length > 0) {
  relationships.field_title_deed_file = {
    data: titleDeedFileIds.map((id) => ({
      type: "file--file",
      id,
    })),
  };
}
```

### Important

- Verify the Zyprus API field name is `field_title_deed_file` by checking the API docs or doing a GET on an existing property that has deeds uploaded. See `docs/ZYPRUS_API_REFERENCE.md` for field names.
- Documents should be tracked separately from gallery images (don't mix them into `field_gallery_`)
- The document could be PDF or image (JPG/PNG of scanned deeds)

---

## Issue 3: Price Negotiable Not Being Selected

**Lauren's feedback**: "Price: Correct but needs to select negotiable"

### Current State

The code already defaults `priceNegotiable` to `true`:
- `zyprus/client.ts:298`: `field_negotiable: listing.priceNegotiable !== false`
- `tools/definitions.ts:92-95`: Tool schema says "Default is TRUE"
- `executor.ts:688`: `priceNegotiable: args.priceNegotiable as boolean | undefined`
- DB prompt (`property_upload`): "Do NOT pass priceNegotiable at all (defaults to TRUE/negotiable)"

### Why It's Still Not Working

**Hypothesis 1: Zyprus API field value mismatch**
The code sends `field_negotiable: true` (boolean). Zyprus might expect a string like `"Yes"` or a taxonomy term UUID, not a boolean. Check what the Zyprus API actually accepts for this field.

**How to verify**:
```bash
# Get an existing negotiable listing from Zyprus and check what field_negotiable looks like
# Use the Zyprus API with OAuth token
curl -H "Authorization: Bearer $TOKEN" \
  "https://dev9.zyprus.com/jsonapi/node/property?filter[status]=1&page[limit]=1&fields[node--property]=field_negotiable"
```

Or check in the Zyprus Drupal admin what type `field_negotiable` is (boolean, list, taxonomy reference).

**Hypothesis 2: The field isn't being sent at all**
When `priceNegotiable` is `undefined` (AI doesn't pass it), the expression `listing.priceNegotiable !== false` evaluates to `true`, so `field_negotiable: true` IS being sent. But if the Zyprus API ignores `true` and only checks for a specific value, it won't work.

**Hypothesis 3: The AI is explicitly passing `false`**
Check `chat_history` table for recent tool calls to see what the AI is actually sending:

```sql
SELECT content FROM chat_history
WHERE role = 'assistant'
  AND content LIKE '%createPropertyListing%'
  AND content LIKE '%priceNegotiable%'
ORDER BY created_at DESC LIMIT 5;
```

### Files to Check

| File | What to Check |
|------|---------------|
| `zyprus/client.ts:298` | `field_negotiable: listing.priceNegotiable !== false` — is `true` the right value type? |
| `docs/ZYPRUS_API_REFERENCE.md` | What does the API expect for `field_negotiable`? |
| Zyprus Drupal admin | Check field type of `field_negotiable` on the property content type |

### Fix

Once you know what Zyprus expects:
- If it's a boolean, the code is correct — the issue is elsewhere (maybe the listing UI doesn't display it)
- If it's a string, change to `field_negotiable: "Yes"` / `"No"`
- If it's a taxonomy term, resolve the UUID like other taxonomy fields

---

## Post-Fix Checklist

After fixing any of the above:

1. **Deploy**: `supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx`
2. **Clear chat history**: `DELETE FROM chat_history;` (critical — AI copies old patterns)
3. **If prompt changed**: Also clear prompt cache by POST to `/admin/prompts/invalidate` or wait 5 minutes
4. **Test on WhatsApp**: Send a test property listing through the full flow
5. **Verify in Zyprus**: Check the draft listing on dev9.zyprus.com for correct images, documents, and negotiable status

---

## Key Architecture Notes

- Edge Function runs on Deno Deploy (multiple isolates — in-memory state doesn't persist across requests)
- Images arrive as separate WhatsApp messages → separate webhook calls → accumulated in `pending_images` DB table
- Zyprus API is Drupal JSON:API with OAuth2 (`client_credentials` grant)
- AI model: Gemini via OpenRouter (`google/gemini-2.0-flash`)
- Prompts: DB (`sophia_prompts` table) takes precedence over file fallbacks in `prompts/` directory
