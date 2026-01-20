# P1 Performance: sophia-bot Edge Function

**Priority**: P1 (Critical)
**Source**: performance-oracle review
**Created**: 2026-01-11

## Findings

### 1. Sequential Image Uploads (Critical)
**File**: `/tmp/sophia-deploy/supabase/functions/sophia-bot/services/image-handler.ts`
**Impact**: 3-5x slower than necessary, causes timeout risk

Current implementation uploads images one at a time:
```typescript
// Current: Sequential
for (const url of imageUrls) {
  const result = await uploadSingleImage(url);
  results.push(result);
}
```

**Fix**: Use `Promise.all()` for parallel uploads:
```typescript
// Fixed: Parallel
const results = await Promise.all(
  imageUrls.map(url => uploadSingleImage(url))
);
```

**Estimated Impact**: 5-10 images at 1-2s each = 5-20s → 2-3s with parallelization

### 2. Redundant OAuth Token Fetches
**File**: `zyprus/client.ts`
**Impact**: MEDIUM - Unnecessary API calls

Multiple operations in the same request might fetch tokens independently. The caching exists but request-scoped caching would be more efficient.

**Fix**: Pass token through call chain rather than re-fetching:
```typescript
// Current: Each function fetches token
async function checkDuplicates() { const token = await getAccessToken(); ... }
async function createListing() { const token = await getAccessToken(); ... }

// Better: Fetch once, pass through
async function handleCreateListing() {
  const token = await getAccessToken();
  await checkDuplicates(token);
  await createListing(token);
}
```

### 3. Sequential Duplicate Checking
**File**: `services/duplicate-checker.ts`
**Impact**: LOW - Adds 500ms-1s to request

Duplicate check is done sequentially before image processing. Could run in parallel.

**Fix**: Start duplicate check while processing images:
```typescript
const [duplicateResult, processedImages] = await Promise.all([
  checkForDuplicates(ownerPhone, ownerName, location),
  processImages(imageUrls)
]);
```

### 4. No Request-Scoped Caching
**Impact**: MEDIUM - Taxonomy loaded multiple times per request

Consider caching taxonomy data at request level to avoid repeated fetches.

## Action Items

- [x] Parallelize image uploads with `Promise.all()` ✅ FIXED
- [x] Pass OAuth token through function chain ✅ FIXED (token fetched once, passed to parallel ops)
- [x] Run duplicate check in parallel with image processing ✅ FIXED
- [ ] Consider request-scoped caching for taxonomy (P3 - future)

## Status: RESOLVED (2026-01-11)

## Testing

Before/after timing comparison:
1. Upload listing with 10 images
2. Measure total request time
3. Expected improvement: 50-70% reduction in total time
