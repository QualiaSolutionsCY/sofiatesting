# Phase 26: Upload Data Integrity Fixes — Execution Summary

## Completed Steps

### Step 1: Upload lock leak fix (FR-1)
- Added `releaseLock()` helper after lock acquisition in `field-validation.ts`
- 11 early-return paths now release the lock (was: only 1 — duplicate detection)
- Paths fixed: validation failure, confirmDuplicate retry, street address detection (2 paths), city-only location, regional access denied, special case rejected/needsInput, assignment needed, assignTo domain check, assignee region mismatch

### Step 2: listingType required (FR-2)
- Added `"listingType"` to `validateRequiredFields` required array in `special-cases.ts`
- Added friendly name "whether this is for sale or rent" to `getMissingFieldsMessage`
- Removed `.optional()` from `listingType` in Zod schema (`schemas.ts`)

### Step 3: Bedrooms fixes (FR-5, FR-8)
- Removed `.default(0)` from bedrooms Zod schema — missing bedrooms now fails validation instead of silently defaulting
- Removed `"bedrooms"` from `nullableFields` in `ai-chat.ts` — email studios preserve `bedrooms: 0`

### Step 4: parsePreExtractedFields robustness (FR-4)
- Added `MANDATORY` as alternate delimiter in regex (more resilient to format variations)
- Added `logger.warn` when regex fails to match (was: silent `return {}`)

### Step 5: poolType parsing fix (FR-6)
- Replaced `startsWith('"') && endsWith('"')` with proper closing-quote search
- Now handles `poolType: "none" [warning text]` correctly — extracts `"none"`

### Step 6: Email Google Maps follow-up (FR-3)
- New emails now check if last AI response mentions "Google Maps" or "pin location"
- If detected, loads last 4 messages so follow-up email has context to complete upload
- Normal new emails still use empty history (no contamination)

## Files Modified

| File | Changes |
|------|---------|
| `tools/handlers/field-validation.ts` | Lock release on 11 early-return paths |
| `rules/special-cases.ts` | listingType in required array + friendly name |
| `tools/schemas.ts` | listingType non-optional, bedrooms no default |
| `services/ai-chat.ts` | bedrooms nullableFields, parsePreExtractedFields regex+log, poolType parsing |
| `handlers/email-webhook.ts` | Google Maps follow-up history loading |

## Notes
- All changes are code-level — no migrations, no new files, no prompt changes
- Pre-existing TS diagnostics from Deno ESM imports are unrelated to changes
- Lock release uses fire-and-forget `.catch(() => {})` — negligible latency impact
