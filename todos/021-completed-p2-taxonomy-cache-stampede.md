# P2 IMPORTANT: Taxonomy Cache Stampede Risk

---
status: pending
priority: p2
issue_id: "021"
tags: [code-review, performance]
dependencies: []
---

## Problem Statement

**What's broken:** When taxonomy cache expires, multiple concurrent requests all trigger parallel taxonomy fetches - no lock prevents stampede.

**Why it matters:**
- 6 API calls * N concurrent requests = potential Zyprus API rate limiting
- Wasted resources on duplicate fetches
- Can cause cascading failures

## Findings

**Location:** `supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts` (lines 74-107)

```typescript
export async function loadTaxonomy(): Promise<TaxonomyCache> {
  if (cache && Date.now() - cache.lastUpdated < CACHE_TTL) {
    return cache;
  }
  // No lock - multiple requests can trigger parallel loads
  const [locations, propertyTypes, ...] = await Promise.all([...]);
```

## Proposed Solutions

### Option 1: Singleton Promise Pattern (Recommended)
**Pros:** Simple, prevents stampede
**Cons:** First request still waits
**Effort:** Small (30 min)
**Risk:** Low

```typescript
let taxonomyPromise: Promise<TaxonomyCache> | null = null;

export async function loadTaxonomy(): Promise<TaxonomyCache> {
  if (cache && Date.now() - cache.lastUpdated < CACHE_TTL) {
    return cache;
  }

  if (!taxonomyPromise) {
    taxonomyPromise = (async () => {
      try {
        const result = await fetchAllTaxonomy();
        cache = result;
        return result;
      } finally {
        taxonomyPromise = null;
      }
    })();
  }

  return taxonomyPromise;
}
```

### Option 2: Stale-While-Revalidate
**Pros:** Never blocks on cache refresh
**Cons:** May serve stale data briefly
**Effort:** Medium (1 hour)

## Recommended Action

(To be filled during triage)

## Technical Details

**Affected files:** `supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts`
**Cache TTL:** 1 hour
**API calls per refresh:** 6 taxonomy endpoints

## Acceptance Criteria

- [ ] Stampede protection implemented
- [ ] Only one concurrent fetch allowed
- [ ] Cache refresh doesn't block requests
- [ ] Tested with concurrent requests
- [ ] Deployed and verified

## Work Log

| Date | Author | Action | Learnings |
|------|--------|--------|-----------|
| 2026-01-11 | performance-oracle | Identified stampede risk | No lock on cache refresh |
