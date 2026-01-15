# SOPHIA P2: Address-Based Duplicate Search & Building Info

**Created**: 2026-01-15
**Status**: Ready for implementation
**Priority**: P2 (Enhanced Quality)
**Estimated Effort**: Medium (3-4 hours)

---

## Overview

Enhance SOPHIA's property upload system with two P2 features:
1. **Address-based duplicate detection** - Fuzzy matching on location/address strings
2. **Building/complex info in descriptions** - Capture and display building amenities for apartments

These features improve listing quality and reduce duplicate entries in the Zyprus property database.

---

## Problem Statement / Motivation

### Current Limitations

**Duplicate Detection:**
- Only searches by phone number (last 8 digits in `field_my_notes`)
- Only searches by owner name with location filtering
- Address matching is **defined in interface but NOT implemented** (`duplicate-checker.ts:11`)
- High risk of missing duplicates when owner info differs slightly

**Building Information:**
- No way to capture building name, complex name, or communal amenities
- Descriptions lack important apartment-specific information
- Agents must manually type building details into descriptions

### Business Impact

| Issue | Impact |
|-------|--------|
| Duplicate listings | Reviewer time wasted, poor user experience |
| Missing building info | Lower listing quality, incomplete property data |

---

## Proposed Solution

### 1. Address-Based Duplicate Search

Add fuzzy string matching using Jaro-Winkler algorithm to detect duplicate listings by address/location similarity.

**Search Strategy:**
1. Exact match on normalized address string (HIGH confidence)
2. Fuzzy match with Jaro-Winkler >= 0.85 (MEDIUM confidence)
3. Combined: Location + Price range + Property type (MEDIUM confidence)

### 2. Building/Complex Info in Descriptions

Add optional `buildingInfo` parameter to capture:
- Building/complex name
- Communal amenities (pool, gym, security, elevator)
- Generate building paragraph in descriptions

---

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Tool Definitions                      │
│  + address (string)                                      │
│  + buildingInfo (object)                                 │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    Tool Executor                         │
│  + Pass address to duplicate checker                     │
│  + Pass buildingInfo to description generator            │
└─────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
┌─────────────────┐ ┌─────────────┐ ┌─────────────┐
│ Duplicate       │ │ Description │ │ String      │
│ Checker         │ │ Generator   │ │ Similarity  │
│ + searchByAddr  │ │ + building  │ │ (new file)  │
│ + fuzzy match   │ │   paragraph │ │ + jaroWink  │
└─────────────────┘ └─────────────┘ └─────────────┘
```

### Implementation Phases

#### Phase 1: String Similarity Utilities (New File)

**File**: `sophia-bot/utils/string-similarity.ts`

```typescript
/**
 * Jaro-Winkler similarity algorithm
 * Optimized for Deno runtime, no external dependencies
 * Returns 0-1 where 1 = exact match
 */
export function jaroWinkler(s1: string, s2: string): number {
  // Implementation (~50 lines)
}

/**
 * Normalize address for comparison
 * - Lowercase, remove punctuation
 * - Expand abbreviations (St → Street)
 * - Remove common prefixes
 */
export function normalizeAddress(address: string): string {
  // Implementation (~30 lines)
}
```

#### Phase 2: Address-Based Duplicate Search

**File**: `sophia-bot/services/duplicate-checker.ts`

Add new function after line 137:

```typescript
/**
 * Search for duplicates by address/location string
 * Uses fuzzy matching with Jaro-Winkler algorithm
 */
async function searchByAddress(
  address: string,
  location: string,
  zyprusApiUrl: string,
  accessToken: string
): Promise<Omit<DuplicateMatch, "matchReason" | "confidence">[]> {
  // 1. Normalize the address
  // 2. Search Zyprus API by title CONTAINS first few words
  // 3. Score results using Jaro-Winkler
  // 4. Return matches above threshold (0.85)
}
```

Update `checkForDuplicates()` to call new function:

```typescript
// After name search (line 85)
if (address) {
  const addressMatches = await searchByAddress(
    address, location, zyprusApiUrl, accessToken
  );
  for (const match of addressMatches) {
    duplicates.push({
      ...match,
      matchReason: "address",
      confidence: "high",
    });
  }
}
```

#### Phase 3: Building Info in Tool Definitions

**File**: `sophia-bot/tools/definitions.ts`

Add after line 121:

```typescript
buildingInfo: {
  type: "object",
  properties: {
    buildingName: {
      type: "string",
      description: "Name of the building (e.g., 'Aphrodite Tower')",
    },
    complexName: {
      type: "string",
      description: "Name of the complex/development (e.g., 'Limassol Marina')",
    },
    hasElevator: {
      type: "boolean",
      description: "Whether the building has an elevator",
    },
    communalPool: {
      type: "boolean",
      description: "Whether there's a communal swimming pool",
    },
    communalGym: {
      type: "boolean",
      description: "Whether there's a communal gym/fitness center",
    },
    security24h: {
      type: "boolean",
      description: "Whether there's 24-hour security",
    },
    concierge: {
      type: "boolean",
      description: "Whether there's a concierge service",
    },
  },
  description: "Building/complex information (for apartments/penthouses)",
},
address: {
  type: "string",
  description: "Street address of the property (helps with duplicate detection)",
},
```

#### Phase 4: Description Generator Enhancement

**File**: `sophia-bot/services/description-generator.ts`

Add to PropertyDetails interface (line 6):

```typescript
buildingName?: string;
complexName?: string;
buildingInfo?: {
  hasElevator?: boolean;
  communalPool?: boolean;
  communalGym?: boolean;
  security24h?: boolean;
  concierge?: boolean;
};
```

Add new function after line 187:

```typescript
/**
 * Generate building amenities paragraph for apartments
 */
function generateBuildingParagraph(details: PropertyDetails): string {
  if (!details.buildingInfo && !details.buildingName && !details.complexName) {
    return "";
  }

  const parts: string[] = [];

  // Building/complex name
  if (details.buildingName || details.complexName) {
    const name = details.buildingName || details.complexName;
    parts.push(`Located in ${name}`);
  }

  // Amenities
  const amenities: string[] = [];
  if (details.buildingInfo?.hasElevator) amenities.push("elevator access");
  if (details.buildingInfo?.communalPool) amenities.push("communal swimming pool");
  if (details.buildingInfo?.communalGym) amenities.push("fitness center");
  if (details.buildingInfo?.security24h) amenities.push("24-hour security");
  if (details.buildingInfo?.concierge) amenities.push("concierge service");

  if (amenities.length > 0) {
    const amenityText = amenities.length === 1
      ? amenities[0]
      : amenities.slice(0, -1).join(", ") + " and " + amenities.at(-1);
    parts.push(`the building offers ${amenityText}`);
  }

  if (parts.length === 0) return "";

  return "\n\n" + parts.join(", ") + ".";
}
```

Update `generateDescription()` to include building paragraph.

#### Phase 5: Executor Integration

**File**: `sophia-bot/tools/executor.ts`

Pass new fields to services:

```typescript
// Line 177 - Add address to duplicate check
const duplicates = await checkForDuplicates(
  args.ownerPhone as string,
  args.ownerName as string,
  location,
  args.address as string | undefined,  // NEW
  config.apiUrl,
  token
);

// Line 219 - Add building info to description
const description = generateDescription({
  // ... existing fields ...
  buildingName: (args.buildingInfo as any)?.buildingName,
  complexName: (args.buildingInfo as any)?.complexName,
  buildingInfo: args.buildingInfo as PropertyDetails["buildingInfo"],
});
```

---

## Acceptance Criteria

### Functional Requirements

- [ ] **Address duplicate detection**: Listings with similar addresses (Jaro-Winkler >= 0.85) are flagged
- [ ] **Building name in description**: Building/complex name appears in generated description
- [ ] **Communal amenities**: Elevator, pool, gym, security listed in description when provided
- [ ] **Backward compatible**: Existing uploads without address/buildingInfo continue to work

### Non-Functional Requirements

- [ ] **Performance**: Address search adds < 500ms to upload time
- [ ] **No external dependencies**: String similarity implemented in pure TypeScript
- [ ] **Deno compatible**: All code works in Supabase Edge Function runtime

### Quality Gates

- [ ] All existing unit tests pass
- [ ] Manual E2E test: Upload with building info generates correct description
- [ ] Manual E2E test: Upload with matching address triggers duplicate warning

---

## File Change Summary

| File | Changes | Lines |
|------|---------|-------|
| `utils/string-similarity.ts` | **NEW FILE** - Jaro-Winkler, address normalization | ~100 |
| `tools/definitions.ts` | Add `address`, `buildingInfo` parameters | +40 |
| `services/duplicate-checker.ts` | Add `searchByAddress()` function | +50 |
| `services/description-generator.ts` | Add `generateBuildingParagraph()` | +40 |
| `tools/executor.ts` | Pass new fields to services | +10 |

**Total new/modified lines**: ~240

---

## Test Plan

### Unit Tests

```typescript
// tests/unit/string-similarity.test.ts
describe("jaroWinkler", () => {
  it("returns 1 for exact match", () => {
    expect(jaroWinkler("test", "test")).toBe(1);
  });

  it("returns high score for similar addresses", () => {
    const score = jaroWinkler("10 Main Street Paphos", "10 Main St Paphos");
    expect(score).toBeGreaterThan(0.85);
  });

  it("returns low score for different addresses", () => {
    const score = jaroWinkler("10 Main Street", "50 Oak Avenue");
    expect(score).toBeLessThan(0.5);
  });
});

// tests/unit/description-generator.test.ts
describe("generateBuildingParagraph", () => {
  it("includes building name", () => {
    const result = generateBuildingParagraph({
      buildingName: "Aphrodite Tower",
    });
    expect(result).toContain("Located in Aphrodite Tower");
  });

  it("lists communal amenities", () => {
    const result = generateBuildingParagraph({
      buildingInfo: { communalPool: true, hasElevator: true },
    });
    expect(result).toContain("communal swimming pool");
    expect(result).toContain("elevator access");
  });
});
```

### Manual E2E Tests

| Test | Steps | Expected |
|------|-------|----------|
| Address duplicate | Upload property with address similar to existing | "Potential duplicate" warning |
| Building info | Upload apartment with buildingInfo | Description includes building paragraph |
| No building info | Upload house without buildingInfo | No building paragraph in description |

---

## Dependencies & Prerequisites

- [x] P1 gaps completed and deployed (registration number, privacy offset, cross-assignment)
- [ ] Existing duplicate checker working correctly
- [ ] Access to test WhatsApp number for E2E testing

---

## Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| False positive duplicates | Medium | Low | Tune Jaro-Winkler threshold (0.85) |
| Performance impact | Low | Medium | Limit API search results, cache taxonomy |
| Breaking existing uploads | Low | High | All new fields are optional |

---

## References

### Internal References
- `sophia-bot/services/duplicate-checker.ts:11` - DuplicateMatch interface with unused "address" reason
- `sophia-bot/services/description-generator.ts:6` - PropertyDetails interface
- `sophia-bot/tools/definitions.ts:24` - createPropertyListing parameters

### External References
- [Jaro-Winkler Algorithm](https://en.wikipedia.org/wiki/Jaro%E2%80%93Winkler_distance)
- [RESO Data Dictionary - Building Features](https://ddwiki.reso.org/display/DDW20/InteriorFeatures+Field)
- [Drupal JSON:API Filtering](https://www.drupal.org/docs/core-modules-and-themes/core-modules/jsonapi-module/filtering)

### Related Work
- P1 Implementation (completed): Registration number, privacy offset, cross-assignment validation
