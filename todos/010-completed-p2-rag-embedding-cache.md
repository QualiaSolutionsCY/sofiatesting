---
status: completed
priority: p2
issue_id: "010"
tags: [code-review, performance, rag]
dependencies: ["006"]
completed_at: "2026-01-11"
---

# Add Embedding Cache for Common Queries

## Problem Statement

Every call to `generateEmbedding()` makes an external API request. Common queries (greetings, FAQs) generate identical embeddings repeatedly.

**Impact**:
- Unnecessary latency for repeated queries
- Increased API costs
- Rate limit consumption

## Findings

**File**: `/tmp/sophia-deploy/supabase/functions/sophia-bot/memory/sophia-memory.ts`
**Lines**: 70-105

```typescript
export async function generateEmbedding(text: string): Promise<number[] | null> {
  // Every call hits the API - no caching
  const response = await fetch(...);
  ...
}
```

Common phrases like "hello", "hi", "what's the VAT?" are embedded repeatedly.

**Severity**: P2 - HIGH (Performance)

## Proposed Solutions

### Option 1: In-memory LRU cache (Recommended)

**Pros**: Simple, fast, works in Edge Functions
**Cons**: Cache lost on cold start, memory usage
**Effort**: Medium (1-2 hours)
**Risk**: Low

```typescript
const embeddingCache = new Map<string, { embedding: number[], timestamp: number }>();
const CACHE_TTL_MS = 3600000; // 1 hour
const MAX_CACHE_SIZE = 1000;

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const cacheKey = text.toLowerCase().trim();
  const cached = embeddingCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log("[Memory] Cache hit for embedding");
    return cached.embedding;
  }

  const embedding = await fetchEmbeddingFromAPI(text);

  if (embedding && embeddingCache.size < MAX_CACHE_SIZE) {
    embeddingCache.set(cacheKey, { embedding, timestamp: Date.now() });
  }

  return embedding;
}
```

### Option 2: Database cache for embeddings

**Pros**: Persistent across cold starts, shared across instances
**Cons**: Additional DB query, more complex
**Effort**: Large (3-4 hours)
**Risk**: Medium

```sql
CREATE TABLE embedding_cache (
  text_hash TEXT PRIMARY KEY,
  embedding VECTOR(768),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Option 3: Pre-compute common phrase embeddings

**Pros**: Zero latency for common queries
**Cons**: Maintenance burden, limited coverage
**Effort**: Medium (2 hours)
**Risk**: Low

## Recommended Action

Start with Option 1 (in-memory cache), monitor hit rate. If cold starts are frequent, consider Option 2.

## Technical Details

**Affected Files**:
- `/tmp/sophia-deploy/supabase/functions/sophia-bot/memory/sophia-memory.ts`

**Database Changes**: None for Option 1

## Acceptance Criteria

- [ ] Embedding cache implemented
- [ ] Cache hit logging for monitoring
- [ ] TTL-based expiration
- [ ] Size-limited to prevent memory issues
- [ ] Repeated queries return cached embeddings

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-11 | Created from performance review | Cache frequently accessed data |

## Resources

- Performance audit: agent a90f6cc
- [LRU Cache Pattern](https://en.wikipedia.org/wiki/Cache_replacement_policies#Least_recently_used_(LRU))
