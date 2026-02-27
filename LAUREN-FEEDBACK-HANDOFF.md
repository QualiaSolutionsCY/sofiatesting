# SOPHIA Property Upload Fixes - Lauren's Feedback Handoff

**Date:** 2026-02-24
**Source:** Lauren Ellingham Ioannou - 4 test listings (IDs: 40289, 40290, 40291, 40292)
**Priority:** HIGH - Production issues affecting listing quality
**Status:** Investigation complete, ready for implementation

---

## Draft Listings for Review

| Draft ID | Test # | Property | Key Issues |
|----------|--------|----------|------------|
| 40289 | 1 | 1 bed apartment, Mesa Chorio, Paphos | Wrong location resolution, pool confusion, missing features |
| 40290 | 2 | (not detailed) | Photos not in order |
| 40291 | 3 | House + bungalow, Paphos | Wrong listing owner, permits-only not handled, wrong pool type |
| 40292 | 4 | (renovated, final approval) | Wrong location, missing renovation year, ignored photo ordering |

---

## Issue Breakdown (8 Categories)

### BUG 1: Location Resolution - Wrong Area Names

**Lauren's feedback:**
- Test 1: Agent said "Mesa Chorio, Paphos" but SOPHIA resolved it to "Kato Paphos" in title and description
- Test 3: Location correct but pin too accurate (should be neutral, not on the property)
- Test 4: Location wrong entirely

**Root cause:**
The taxonomy resolution in `executor.ts:630-643` replaces the agent's original location with the closest taxonomy match. If "Mesa Chorio" fuzzy-matches to "Kato Paphos" in the Zyprus taxonomy, the title/description gets the wrong area name.

**Where the resolution happens:**
```
executor.ts:622-643 — findLocationUuid() returns matchedName + district
                      descriptionLocation is built from matchedName
                      If matchedName differs from raw input, it overrides the title/description
```

**Files to fix:**
| File | Line(s) | What to change |
|------|---------|----------------|
| `supabase/functions/sophia-bot/services/description-generator.ts` | 49-139 | Add "mesa chorio" to `LOCATION_DESCRIPTIONS` map |
| `supabase/functions/sophia-bot/services/description-generator.ts` | 931-1086 | Add "mesa chorio" to `getGenericLocationSentences` |
| `supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts` | `findLocationUuid()` | Verify Mesa Chorio has its own taxonomy entry; if not, the fallback matching may be too aggressive |
| `supabase/functions/sophia-bot/tools/executor.ts` | 630-643 | Consider: if the agent's raw location is in a known list (business-rules.ts line 132 already has "mesa chorio"), prefer the raw location over taxonomy-resolved name for the description |

**Suggested Mesa Chorio location text:**
```
"mesa chorio": "Mesa Chorio is a peaceful hillside village overlooking Paphos, just 10 minutes to the town center and close to local amenities."
```

---

### BUG 2: Pool Type Confusion (Communal vs Private vs Provisions)

**Lauren's feedback:**
- Test 1: "Communal pool in the description but private pool on the features"
- Test 1: "Communal pool as a feature but not at the top of the listing as a priority"
- Test 3: Agent said "provisions to add a pool" but SOPHIA put "private pool" (implies pool already exists)

**Root cause:**
`description-generator.ts:293` has a boolean `pool` field. When `pool: true`, it ALWAYS outputs "Private Swimming Pool". There is NO distinction between communal, private, or provisions for a pool.

```typescript
// Line 293 — current code (broken):
if (details.pool) outdoor.push("Private Swimming Pool");
```

The tool definitions (`definitions.ts:158-161`) list "communal pool" and "private pool" as valid features, but the `pool` boolean in `PropertyDetails` doesn't distinguish them. The AI passes `pool: true` and also puts "communal pool" in the features array, but the boolean overrides with "Private Swimming Pool".

**Files to fix:**
| File | Line(s) | What to change |
|------|---------|----------------|
| `description-generator.ts` | 29 | Add `poolType?: "private" \| "communal" \| "provisions"` to `PropertyDetails` interface |
| `description-generator.ts` | 293 | Replace boolean pool check with poolType logic: `"private"` → "Private Swimming Pool", `"communal"` → "Communal Swimming Pool", `"provisions"` → "Provisions For Swimming Pool" (NOT a pool feature, should not be at top) |
| `description-generator.ts` | 624-631 | Add "communal swimming pool" and "communal pool" to the `topFeatures` check so communal pools appear above bedrooms |
| `tools/definitions.ts` | (new field) | Add `poolType` field to `createPropertyListing` parameters: `enum: ["private", "communal", "provisions"]` |
| `tools/executor.ts` | 783-807 | Pass `poolType` from `args.poolType` to `generateDescription()` |
| **DB prompt** `property_upload` | Features section | Add explicit rule: "When agent mentions 'communal pool' pass poolType: 'communal'. When agent says 'provisions for a pool' / 'can add a pool', pass poolType: 'provisions' (NO pool exists). When agent says 'private pool' or just 'pool', pass poolType: 'private'." |
| **File prompt** `prompts/behaviors/property-upload.ts` | Same | Same update |

**How the pool boolean currently flows:**
```
AI sends pool: true in features → categorizeFeatures() → line 293 → "Private Swimming Pool"
                                   ALSO features array may have "communal pool" → gets added too
                                   = BOTH "Private Swimming Pool" AND "Communal Pool" in description = WRONG
```

---

### BUG 3: Location Description Missing / Low Quality

**Lauren's feedback:**
- Test 1: "She used to describe the location on the 2nd-3rd lines very nicely (with what is nearby, walking distance etc). But now she isn't describing the location at all"
- Test 3: "Within walking distance of many amenities" but there are no amenities nearby (fabricated)
- Test 4: "Within walking distance to major places such as a mall and university which she did not add"

**Root cause:**
The DB prompt (priority 40, takes precedence over file) restricts `areaDescription` to: **"MAX 1 SHORT SENTENCE (under 80 characters)"**. This is too restrictive. Lauren wants 2 sentences with specific nearby amenities.

The `description-generator.ts:915-926` function `getLocationSentences()`:
1. Uses AI's `areaDescription` if provided (currently limited to 1 sentence by prompt)
2. Falls back to static `getGenericLocationSentences()` for known areas
3. If area is unknown, returns generic "Located in a desirable area..."

The static generic sentences (line 931-1086) are actually good but only cover ~40 known locations. Mesa Chorio isn't among them.

**Files to fix:**
| File | Line(s) | What to change |
|------|---------|----------------|
| **DB prompt** `property_upload` | areaDescription section | Change from "MAX 1 SHORT SENTENCE (under 80 characters)" to "1-2 SHORT SENTENCES. Mention what is nearby: shops, schools, malls, universities, beaches, parks, highway access. If walking distance is relevant, include it. Do NOT fabricate — if you don't know, SKIP areaDescription and let the system use its built-in location database." |
| **File prompt** `prompts/behaviors/property-upload.ts` | line ~168-174 | Same update |
| `description-generator.ts` | 886 | Consider increasing sentence truncation from 120 to 150 chars |
| `description-generator.ts` | 907 | Consider allowing up to 3 sentences instead of max 2 (for detailed area descriptions) |

---

### BUG 4: Title Deeds / Permits Handling

**Lauren's feedback:**
- Test 1: "I sent her a PDF document with the title deeds, she hasn't mentioned the title deeds in the description, or added them to back office"
- Test 3: "This case has permits only, and no title deeds as I specified in good detail. She failed to add that. Did not remove 'title deeds available' from the facts/dropdown box. She added this info only to the notes"

**Root cause — Two separate issues:**

**4a. PDF title deeds not reflected in description:**
The system captures PDFs in `pending_documents` (executor.ts:553-566) and attaches them to the listing, but the AI doesn't extract information FROM the PDF (e.g., plot size, location, deed type). The AI can't read PDF content — it just stores the file. The prompt says "acknowledge receipt" but doesn't instruct SOPHIA to ask the agent what info is ON the deed.

**4b. "Permits only" not a valid titleDeedStatus:**
Current valid values in `definitions.ts:88-90`:
```
enum: ["separate", "final_approval", "in_process", "pending", "share_of_land", "unknown", "do_not_display"]
```
There is NO "permits_only" or "building_permit" option. When agent says "permits only, no title deeds", the AI has no proper value to use. It defaults to something wrong or puts the info only in notes.

Also, `description-generator.ts:400-421` `formatTitleDeedStatus()` has no handling for permits:
```typescript
switch (status?.toLowerCase()) {
  case "separate": return "Title Deeds";
  case "final_approval": return "Final Approval";
  // ... no "permits_only" case
}
```

**Files to fix:**
| File | Line(s) | What to change |
|------|---------|----------------|
| `tools/definitions.ts` | 88-90 | Add `"permits_only"` to `titleDeedStatus` enum |
| `description-generator.ts` | 400-421 | Add case for `"permits_only"` → return `"Building Permits"` |
| `zyprus/client.ts` | (find title deed mapping) | Map `"permits_only"` to appropriate Zyprus API value (likely `"do_not_display"` for the title deed field, but include "Building Permits Only" in the description headline) |
| **DB prompt** `property_upload` | titleDeedStatus section | Add: `"permits only" / "no title deeds, only permits" / "building permit" → use "permits_only"` |
| **File prompt** `prompts/behaviors/property-upload.ts` | Same section | Same update |
| **DB + file prompt** | Title deed documents section | Add: "When agent sends title deed documents, ASK what information is on them: 'I've received your document. Can you confirm: is this a title deed, building permit, or planning permit? And what is the plot size shown on it?'" |

---

### BUG 5: Photo Ordering Not Working

**Lauren's feedback:**
- Test 1: Photos in order (possibly by luck)
- Test 2: Photos NOT in order
- Test 3: Photos NOT in order
- Test 4: "She asked me which number photo to start with, I told her number 9... but she ignored it. Photos are not in order."

**Root cause:**
The photo ordering mechanism works correctly in code (`executor.ts:527-551`). The issue is the AI:
1. Sometimes asks about photo ordering (good)
2. Agent responds with a specific photo number (good)
3. AI doesn't pass the `imageOrder` array in the tool call (bad)

This is a prompt adherence issue, not a code issue. The AI forgets to construct the `imageOrder` array from the agent's response.

**Files to fix:**
| File | Line(s) | What to change |
|------|---------|----------------|
| **DB prompt** `property_upload` | Photo ordering section | Strengthen: "**CRITICAL: If the agent specifies ANY photo ordering preference (e.g., 'start with photo 9', 'photo 5 is the best exterior'), you MUST construct an imageOrder array with that photo FIRST, followed by remaining photos in original order. Example: agent says 'start with 9' and there are 15 photos → pass imageOrder: [9, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15]. NEVER ignore the agent's photo preference.**" |
| **File prompt** `prompts/behaviors/property-upload.ts` | Same section | Same update |

---

### BUG 6: Features Missing from Listing

**Lauren's feedback:**
- Test 1: "Missing BBQ area, solar system, fitted kitchen, open plan, water heater"
- Test 3: "Missing some features she could have assumed based on the photos"
- Test 4: "She failed to add furnished and electrical appliances as I mentioned to her"

**Root cause — Two separate issues:**

**6a. Code blocklist filters out valid features:**
`description-generator.ts:338-344` explicitly blocks these features:
```typescript
const isGenericFeature = [
  "electrical appliances", "appliances",
  "provisions for a/c", "provision for a/c", "provisions for ac",
  "fully furnished", "furnished",  // ← BLOCKED
  "new condition",
].some(gf => lower === gf || lower.includes(gf));
if (isGenericFeature) continue;  // ← SKIPPED entirely
```

"Electrical appliances" and "furnished" are explicitly filtered out! Lauren wants them included.

**6b. AI prompt tells SOPHIA not to include them:**
Both the DB prompt and file prompt say:
> "NEVER include energy class, 'fully furnished', 'electrical appliances', 'provisions for A/C', or 'new condition' in features."

This directly contradicts Lauren's feedback. The agent explicitly mentioned "furnished and electrical appliances" and expects them in the listing.

**Files to fix:**
| File | Line(s) | What to change |
|------|---------|----------------|
| `description-generator.ts` | 338-344 | Remove "electrical appliances", "appliances", "fully furnished", "furnished" from the blocklist. Keep "new condition" and "provisions for a/c" blocked. |
| **DB prompt** `property_upload` | Features section | Remove "fully furnished" and "electrical appliances" from the "NEVER include" list. Change to: "NEVER include energy class, 'provisions for A/C', or 'new condition' in features. DO include 'furnished', 'fully furnished', 'electrical appliances' when the agent explicitly mentions them." |
| **File prompt** `prompts/behaviors/property-upload.ts` | Same | Same update |

**Note:** "Provisions for A/C" should remain blocked (it means A/C is NOT installed). "Furnished" and "electrical appliances" are real features that add value.

---

### BUG 7: Wrong Listing Owner / Reference ID

**Lauren's feedback:**
- Test 3: "Listing Reference ID: She put me, I didn't mention me anywhere"
- Test 3: "Very odd she put in my notes: Listing Owner: lysandros@zyprus.com who is the manager for Larnaca district. This is a Paphos property."

**Root cause:**
This is an AI hallucination issue. The reviewer assignment code (`rules/reviewer-assignment.ts`) correctly maps regions to reviewers. But the AI is:
1. Putting Lauren as Reference ID (may be confused because Lauren is the tester)
2. Setting `lysandros@zyprus.com` (Larnaca manager) as listing owner for a Paphos property

The code flow for listing owner:
```
executor.ts:385-405 — listingOwnerName comes from agent.fullName (the person sending the WhatsApp message)
                       OR from assignTo (if management specified assignment)
reviewer-assignment.ts — assigns reviewer1/reviewer2 based on region
my-notes-generator.ts:52-57 — puts listingOwner in My Notes
```

The issue might be that:
1. Lauren is testing from her own phone → she IS the agent → she becomes listing owner
2. BUT for sale properties, management must specify assignTo → if she didn't, the system should have asked
3. Lysandros appearing suggests the AI hallucinated the assignTo value

**Files to check:**
| File | What to check |
|------|---------------|
| `rules/reviewer-assignment.ts` | Verify that Lauren (management) uploading FOR SALE triggers the "must specify assignTo" flow |
| `rules/special-cases.ts` | Check if `handleSpecialCases` correctly blocks management uploads without assignTo |
| `executor.ts:356-361` | The `needsAssignmentInput` check — verify it fires for Lauren |
| **DB prompt** | Add stronger rule: "NEVER guess or hallucinate a listing owner. If the agent is management (Lauren, Charalambos), you MUST ask who to assign to. NEVER auto-assign to a regional manager." |

---

### BUG 8: Renovation Year Not in Description

**Lauren's feedback:**
- Test 4: "She put the correct year of build however as it is renovated in 2025, she should have added this to the description as it has a huge plus in regards to the value"

**Root cause:**
There is NO `yearRenovated` field anywhere in the system. The `PropertyDetails` interface has `yearBuilt` but nothing for renovation year. The description only outputs `Year of Build: XXXX` (line 812).

**Files to fix:**
| File | Line(s) | What to change |
|------|---------|----------------|
| `description-generator.ts` | 20 | Add `yearRenovated?: number` to `PropertyDetails` interface |
| `description-generator.ts` | 810-813 | After year built line, add: `if (details.yearRenovated) lines.push(\`Renovated in ${details.yearRenovated}\`)` |
| `tools/definitions.ts` | (after yearBuilt) | Add `yearRenovated: { type: "integer", description: "Year the property was last renovated (if mentioned by agent)" }` |
| `tools/executor.ts` | 783-807 | Pass `yearRenovated: args.yearRenovated as number \| undefined` to `generateDescription()` |
| **DB prompt** | Optional fields section | Add: "**Year Renovated** - If agent mentions the property was renovated, capture the year. PASS AS yearRenovated. A recently renovated property is a major selling point." |
| **File prompt** | Same | Same |

---

## Additional Issue: House + Separate Bungalow Description

**Lauren's feedback (Test 3):** "This property is a house with a separate bungalow, which I gave her a nice detailed description, but she failed to add that correctly."

This is an AI comprehension issue. The system has `specialNotes` for capturing complex descriptions, but the AI didn't properly convey the house+bungalow structure in the description. Consider adding to the prompt:

> "When the property has multiple structures (e.g., main house + separate bungalow, main villa + guest house), ALWAYS mention this in specialNotes AND ensure the description reflects the full property. Example: 'This property comprises a main 3-bedroom house AND a separate 1-bedroom bungalow, offering flexible living arrangements.'"

---

## Implementation Order (Recommended)

1. **BUG 6 (Features blocklist)** — Quickest fix, biggest impact. Just remove items from blocklist.
2. **BUG 2 (Pool types)** — Add poolType field + logic. High-visibility fix.
3. **BUG 4 (Permits handling)** — Add permits_only enum value + description format.
4. **BUG 8 (Renovation year)** — Add yearRenovated field. Simple addition.
5. **BUG 1 (Location resolution)** — Add Mesa Chorio + review taxonomy matching.
6. **BUG 3 (Location description quality)** — Prompt update for areaDescription.
7. **BUG 5 (Photo ordering)** — Prompt strengthening.
8. **BUG 7 (Listing owner)** — Investigate + prompt fix.

---

## How to Access Everything

### Code Files (all under `supabase/functions/sophia-bot/`)

| File | Purpose | Key Lines |
|------|---------|-----------|
| `services/description-generator.ts` | Generates listing description text | 29 (PropertyDetails interface), 293 (pool), 338-344 (feature blocklist), 400-421 (title deed format), 624-631 (top features), 810-813 (year built), 915-926 (location sentences) |
| `tools/definitions.ts` | Tool parameter schemas for AI | 88-90 (titleDeedStatus enum), 158-161 (features), all `createPropertyListing` params |
| `tools/executor.ts` | Executes tool calls, orchestrates upload | 527-551 (photo ordering), 630-643 (location resolution), 750-807 (generateDescription call) |
| `prompts/behaviors/property-upload.ts` | Fallback prompt for property upload behavior | Full file — SOPHIA's instructions for collecting info |
| `services/image-handler.ts` | Image classification and ordering | 93-158 (classifyImage — filename-based, not AI vision) |
| `config/business-rules.ts` | Regional assignments, coordinates, constants | 130-134 (Paphos locations list includes "mesa chorio") |
| `rules/reviewer-assignment.ts` | Reviewer 1/2 assignment logic | Region-based reviewer mapping |
| `rules/special-cases.ts` | Management upload rules | Lauren/Charalambos rejection for rentals, assignment requirement for sales |
| `zyprus/taxonomy-cache.ts` | Zyprus API taxonomy (locations, features, property types) | `findLocationUuid()`, `findOutdoorFeatureUuids()` |
| `zyprus/client.ts` | Zyprus API client (OAuth2, listing creation) | `createDraftListing()` |

### Database (Supabase MCP)

| Resource | How to access |
|----------|---------------|
| **DB Prompt (TAKES PRECEDENCE over files)** | `SELECT content FROM sophia_prompts WHERE key = 'property_upload';` |
| **All prompts** | `SELECT key, priority, LENGTH(content) FROM sophia_prompts ORDER BY priority;` |
| **Recent listings** | `SELECT * FROM listing_uploads ORDER BY created_at DESC LIMIT 10;` |
| **Agent info** | `SELECT full_name, region, communication_email FROM agents;` |
| **Chat history** (clear after prompt changes!) | `DELETE FROM chat_history WHERE phone_number = '...' ;` |
| **Prompt cache** | 5-minute TTL in `prompt-loader.ts`. Set `CACHE_TTL_MS = 0` during testing. |

### Deploy Commands

```bash
# Deploy sophia-bot edge function (primary)
supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx

# After prompt DB changes, invalidate cache:
# POST to https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot/admin/prompts/invalidate
```

### Testing

1. Make code changes in files
2. Update DB prompt via SQL: `UPDATE sophia_prompts SET content = '...' WHERE key = 'property_upload';`
3. Deploy edge function
4. Clear test agent's chat history: `DELETE FROM chat_history WHERE phone_number = '+357XXXXXXXX';`
5. Test on WhatsApp with Lauren's scenarios
6. Check draft on dev9.zyprus.com

### Key Gotchas

- **DB prompt overrides file prompt** — if you only edit the file, the DB version still wins. Edit BOTH.
- **5-minute cache** — set `CACHE_TTL_MS = 0` in `prompt-loader.ts` while testing, restore after.
- **Chat history carries old patterns** — AI copies behavior from old messages. ALWAYS clear after prompt changes.
- **Feature blocklist is in CODE** — the `isGenericFeature` filter in description-generator.ts silently drops features even if the AI correctly includes them. Fix the code, not just the prompt.
- **Pool boolean vs poolType** — the `pool: true` boolean in PropertyDetails currently overrides any "communal pool" in the features array. Must add explicit `poolType` field.

---

## Summary of Changes Needed

### Code Changes (6 files)
1. `description-generator.ts` — poolType, feature blocklist, permits format, renovation year, Mesa Chorio location, communal pool as top feature
2. `tools/definitions.ts` — poolType param, yearRenovated param, permits_only enum value
3. `tools/executor.ts` — pass new fields through to description generator
4. `zyprus/client.ts` — map permits_only to Zyprus API value
5. `prompts/behaviors/property-upload.ts` — all prompt updates (fallback)

### DB Prompt Changes (1 record)
6. `sophia_prompts WHERE key = 'property_upload'` — pool type rules, areaDescription relaxation, photo ordering enforcement, feature blocklist update, permits_only, renovation year, listing owner rules

### Post-Deploy
7. Clear chat_history for test agents
8. Test all 4 scenarios Lauren reported

---

*Handoff prepared by Claude — 2026-02-24*
