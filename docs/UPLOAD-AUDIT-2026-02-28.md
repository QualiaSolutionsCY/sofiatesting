# Upload System Audit - 2026-02-28

## Status: NEEDS FIXES - 5 Critical Issues Found

This audit covers the SOPHIA bot property listing upload system. It compares the live implementation against the Postman source-of-truth, analyzes 20 recent listing uploads, and identifies root causes for duplicate listings, missing notifications, and data quality problems.

---

## Executive Summary

| Issue | Severity | Impact |
|-------|----------|--------|
| **Duplicate uploads not blocked** | CRITICAL | Same property uploaded 3-4 times to Zyprus |
| **Street addresses in location field** | HIGH | "Apostolou Pavlou Ave" appears 4 times as location |
| **Lauren's chat history missing** | HIGH | AI has zero conversation context for main user |
| **Listing notifications never sent** | MEDIUM | All 20 listings stuck as draft, notified_at = NULL |
| **Payload mismatches vs Postman spec** | MEDIUM | Land `field_notes` uses wrong field name |

---

## Issue 1: DUPLICATE UPLOADS (CRITICAL)

### What's Happening
The `listing_uploads` table shows the same properties uploaded repeatedly:
- "5 bed detached house in Tremithousa, Paphos" - 3 times on Feb 27
- "3 bed detached house in Geroskipou, Paphos" - 3 times
- "2 bed apartment in Apostolou Pavlou Ave, Paphos" - 4 times
- "5 bed detached house in Emba, Paphos" - 3 times
- "14 bed residential building in Limassol" - 3 times

### Root Causes (3 independent issues)

#### 1a. Upload lock is per-AGENT, not per-PROPERTY
**File:** `supabase/functions/sophia-bot/tools/handlers/property-listing.ts:74`
```typescript
const propertyLockKey = `upload:${agentPhone}`;  // Per-agent only
```
- Lock lasts 120 seconds, then expires
- Same property can be uploaded again after lock expires
- **FIX:** Change to per-property fingerprint: `upload:${agentPhone}:${location}:${price}:${ownerPhone}`

#### 1b. Duplicate checker is "informational only" - never blocks
**File:** `supabase/functions/sophia-bot/tools/handlers/property-listing.ts:89`
```typescript
// 1.6 Check listing_uploads for recent duplicates (informational only - never blocks)
```
- When duplicate is detected, it logs a warning and **proceeds with upload**
- Only checks within 2-hour window
- Uses simple substring match that can miss variants
- **FIX:** Make it BLOCK the upload and return `needsInput` asking user to confirm

#### 1c. Zyprus API duplicate checker service exists but is NEVER CALLED
**File:** `supabase/functions/sophia-bot/services/duplicate-checker.ts`
- Has `checkForDuplicates()` that searches Zyprus API by owner phone and name
- **Not imported or called** from property-listing.ts handler
- **FIX:** Import and call it, use its results to block obvious duplicates

### Fix Plan
```
1. property-listing.ts:74 → Change lock key to include location+price+owner
2. property-listing.ts:89-120 → Change from informational to blocking
3. property-listing.ts → Import and call duplicate-checker.ts service
4. Extend duplicate check window from 2 hours to 24 hours
```

---

## Issue 2: STREET ADDRESSES IN LOCATION (HIGH)

### What's Happening
Despite `isStreetAddress()` detection in `tools/validators/location.ts`, street names get through:
- "Apostolou Pavlou Ave, Paphos" (4 times)
- "Michali Sougioul, Limassol" (1 time)

### Root Causes

#### 2a. "Michali Sougioul" bypasses Greek name detection
**File:** `supabase/functions/sophia-bot/tools/validators/location.ts:152-157`
```typescript
const endings = ['ou', 'os', 'is', 'as', 'es', 'oul', 'ios', 'ias', 'eas', 'akis'];
```
- "Michali" ends with "i" which is NOT in the suffix list
- `looksLikeGreekName("michali")` returns FALSE
- Condition `FALSE && TRUE` = FALSE → not detected as street
- **FIX:** Add 'i' to suffix list, or add known street names as explicit blocklist

#### 2b. "Apostolou Pavlou Ave" IS detected but correction may fail
**File:** `supabase/functions/sophia-bot/tools/handlers/property-listing.ts:148-176`
- `isStreetAddress("Apostolou Pavlou Ave, Paphos")` → TRUE (catches "Ave")
- BUT if `extractAreaFromGoogleMapsUrl()` returns null AND locationUrl is missing, it should ask the user
- Possible scenario: AI passes location without "Ave" (just "Apostolou Pavlou, Paphos") which passes the `\bave\b` regex but the two-word Greek name check fails because "Apostolou" ends in "ou" (caught) but "Pavlou" also ends in "ou" (caught) → should return TRUE
- **FIX:** Add explicit known street names blocklist

### Fix Plan
```
1. location.ts:153 → Add 'i' to Greek suffix endings list
2. location.ts → Add commonStreetNames blocklist array with known streets:
   ["apostolou pavlou", "michali sougioul", "georgiou griva",
    "archbishop makarios", "spyrou kyprianou"]
3. property-listing.ts → When street detected and no Google Maps URL, ALWAYS ask for area
```

---

## Issue 3: LAUREN'S CHAT HISTORY MISSING (HIGH)

### What's Happening
- `chat_history` table has ONLY user_id `35799111668` (Fawzi)
- Lauren (`+35799279563`) has 982 webhook entries but ZERO chat history
- She uploaded 79 listings with no conversation context preserved

### Root Cause
**File:** `supabase/functions/sophia-bot/handlers/webhook.ts:561-568`
```typescript
if (isImageOnlyMessage) {
  // Stores image to pending_images
  // Returns HTTP 200 immediately
  // NEVER calls processRequest() → NEVER saves chat_history
  return new Response("OK", { status: 200 });
}
```
- Image-only messages bypass the entire AI pipeline including chat history
- Lauren's workflow is: send images → send text with property details → upload
- The image messages create NO history, and if a text message triggers the upload immediately, it may not accumulate enough context

### Fix Plan
```
1. webhook.ts:561-568 → Add addMessage() call before early return for image-only messages
2. Consider adding an acknowledgment message: "Image saved. Send more or type 'done'."
```

---

## Issue 4: LISTING NOTIFICATIONS NEVER SENT (MEDIUM)

### What's Happening
- All 20 listings have `notified_at = NULL` and `status = 'draft'`
- `listing-notifier` runs every 15 minutes, all returning HTTP 200
- Manual invocation confirms: `checked: 20, notified: 0, expired: 0, errors: []`

### Root Cause: BY DESIGN - Notifier waits for PUBLICATION
**File:** `supabase/functions/listing-notifier/index.ts:92-93`
```typescript
return data.data?.attributes?.status === true;  // Only sends when PUBLISHED
```

The workflow is:
1. SOPHIA uploads listing as **unpublished draft**
2. Reviewer (Lauren/regional office) must **manually publish** on Zyprus dashboard
3. Notifier polls Zyprus API every 15 min to detect `status: false → true`
4. When published, sends WhatsApp notification to agent

**None of the 20 listings have been manually published by reviewers.**

### Fix Plan (choose one)
```
Option A: Train reviewers to publish listings on Zyprus dashboard
Option B: Add a "stale draft" alert — notify management if listing is draft > 7 days
Option C: Auto-publish listings (requires business decision — NOT recommended without review)
```

---

## Issue 5: PAYLOAD MISMATCHES VS POSTMAN SPEC (MEDIUM)

### Comparison: Code vs Postman Source-of-Truth

#### Property Listings: Mostly Correct
All mandatory fields match. Key differences:
| Field | Postman | Code | Status |
|-------|---------|------|--------|
| `field_no_kitchens` | Optional | NOT SET | Intentionally skipped |
| `field_no_living_rooms` | Optional | NOT SET | Intentionally skipped |
| `field_phone_number` | Optional | NOT SET | Missing |
| `field_video_walkthrough` | Optional | NOT SET | Not collected |
| `field_property_status` | Optional | NOT SET | Not collected |

#### Land Listings: 2 Issues Found

**Issue 5a: Wrong field name for notes**
**File:** `supabase/functions/sophia-bot/zyprus/client.ts:1288`
```typescript
attributes.field_property_notes = listing.myNotes;  // WRONG
// Should be: attributes.field_notes = { value: listing.myNotes };
```
- Postman spec says land uses `field_notes`, not `field_property_notes`
- Notes may silently fail to save on Zyprus

**Issue 5b: Inconsistent geo_type casing**
**File:** `supabase/functions/sophia-bot/zyprus/client.ts:1296`
```typescript
geo_type: "point",  // Lowercase
// Property uses "Point" (capitalized) — should be consistent
```

### Fix Plan
```
1. client.ts:1288 → Change field_property_notes to field_notes for land listings
2. client.ts:1296 → Change "point" to "Point" to match property listing format
```

---

## Database State Summary

### listing_uploads (20 most recent)
| Agent | Listings | All Status | notified_at |
|-------|----------|------------|-------------|
| Lauren Ellingham | 19 | draft | NULL |
| Fawzi Goussous | 1 | draft | NULL |

### chat_history
| user_id | Entries |
|---------|---------|
| 35799111668 (Fawzi) | 10 |
| 35799279563 (Lauren) | 0 |

### Edge Function Logs (24h)
| Function | Status | Notes |
|----------|--------|-------|
| listing-notifier | All 200 | Runs every 15 min, 0 notifications sent |
| sophia-bot | All 200 | Working, up to 52s execution time |
| telegram-sophia | All 200 | Disabled, returning early |

---

## Recommended Fix Priority

### P0 - Fix Immediately
1. **Make duplicate checker block uploads** (`property-listing.ts:89-120`)
2. **Change upload lock to per-property** (`property-listing.ts:74`)
3. **Fix land `field_notes` field name** (`client.ts:1288`)

### P1 - Fix This Week
4. **Save chat history for image-only messages** (`webhook.ts:561-568`)
5. **Improve street address detection** (`location.ts:153` + add blocklist)
6. **Call Zyprus API duplicate checker** (import `duplicate-checker.ts`)

### P2 - Follow-up
7. **Add stale draft alerts** for listings not published within 7 days
8. **Fix land geo_type casing** (`client.ts:1296`)
9. **Consider adding missing optional fields** (phone_number, video_walkthrough)

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/sophia-bot/tools/handlers/property-listing.ts` | Fix lock key (L74), make duplicate check blocking (L89-120) |
| `supabase/functions/sophia-bot/tools/validators/location.ts` | Add 'i' to Greek suffixes (L153), add street blocklist |
| `supabase/functions/sophia-bot/zyprus/client.ts` | Fix land field_notes (L1288), fix geo_type case (L1296) |
| `supabase/functions/sophia-bot/handlers/webhook.ts` | Save chat_history for image-only messages (L561-568) |

---

## Connections Verified

| Service | Status |
|---------|--------|
| Supabase MCP | Connected (SELECT 1 = OK) |
| Supabase DB | Read/write working |
| Edge Function Logs | Accessible via MCP |
| Zyprus API | Responding (listings exist as drafts on dev9.zyprus.com) |
