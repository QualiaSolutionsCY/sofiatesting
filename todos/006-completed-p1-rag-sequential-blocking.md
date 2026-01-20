---
status: completed
priority: p1
issue_id: "006"
tags: [code-review, performance, rag]
dependencies: []
completed_at: "2026-01-11"
---

# Sequential Operations Block Message Flow

## Problem Statement

`buildUserContext()` executes 4 sequential database/API operations, adding 700-1200ms latency to every message before AI processing begins.

**Impact**: Users experience significant delays. At 100 concurrent users, Edge Function timeout risk becomes critical.

## Findings

**File**: `/tmp/sophia-deploy/supabase/functions/sophia-bot/memory/sophia-memory.ts`
**Lines**: 328-374

Current sequential execution:
```
1. getOrCreateUser() - DB RPC call (~50-100ms)
2. searchMemory() - Embedding API + DB RPC (~300-500ms)
3. getRecentMemories() - DB RPC call (~50-100ms)
4. searchKnowledge() - Embedding API + DB RPC (~300-500ms)
Total: 700-1200ms blocking delay
```

Additionally:
- **Lines 227, 294**: `searchMemory()` and `searchKnowledge()` both call `generateEmbedding()` with the same message - **duplicate API calls**
- **index.ts:1046-1052**: User message stored to memory synchronously before AI response
- **index.ts:1283-1295**: AI response stored synchronously before sending to user

**Severity**: P1 - CRITICAL
**Measured Impact**: 1700-3100ms total overhead per message

## Proposed Solutions

### Option 1: Parallelize and Fire-and-Forget (Recommended)

**Pros**: Massive latency reduction, simple implementation
**Cons**: Slight risk of memory storage failure going unnoticed
**Effort**: Medium (2-3 hours)
**Risk**: Low

```typescript
// 1. Generate embedding ONCE
const messageEmbedding = await generateEmbedding(currentMessage);

// 2. Parallelize independent operations
const [profile, recentMemories] = await Promise.all([
  getOrCreateUser(phoneNumber, userName),
  getRecentMemories(userId, 5), // Fallback doesn't need embedding
]);

// 3. Parallelize semantic searches with shared embedding
const [relevantMemories, relevantKnowledge] = await Promise.all([
  searchMemoryWithEmbedding(profile.id, messageEmbedding, options),
  searchKnowledgeWithEmbedding(messageEmbedding, options),
]);

// 4. Fire-and-forget memory storage
storeMemory(...).catch(err => console.error("[Memory] Async store failed:", err));
```

### Option 2: Background job queue for memory operations

**Pros**: Complete decoupling of memory from response path
**Cons**: Additional infrastructure complexity
**Effort**: Large (1-2 days)
**Risk**: Medium

## Recommended Action

Implement Option 1 - parallelize operations and fire-and-forget memory storage.

**Expected improvement**: -1000ms to -1500ms per message (50% reduction)

## Technical Details

**Affected Files**:
- `/tmp/sophia-deploy/supabase/functions/sophia-bot/memory/sophia-memory.ts`
- `/tmp/sophia-deploy/supabase/functions/sophia-bot/index.ts`

**Database Changes**: Add new RPC function `searchMemoryWithEmbedding` that accepts pre-computed embedding

## Acceptance Criteria

- [ ] Embedding generated only once per message
- [ ] User profile lookup runs in parallel with recent memories
- [ ] Semantic searches run in parallel with shared embedding
- [ ] Memory storage does not block message response
- [ ] Message response time reduced by 50%+
- [ ] Error logging for async failures

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-11 | Created from performance review | Sequential operations compound latency |

## Resources

- Performance audit: agent a90f6cc
- [JavaScript Promise.all](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all)
