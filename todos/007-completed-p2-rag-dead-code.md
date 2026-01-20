---
status: completed
priority: p2
issue_id: "007"
tags: [code-review, simplicity, rag]
dependencies: []
completed_at: "2026-01-11"
---

# Remove Dead Code and Over-Engineering in RAG Module

## Problem Statement

The RAG implementation contains unused functions, over-engineered scoring logic, and brittle pattern matching that adds complexity without clear value.

**Impact**: Maintenance burden, larger bundle size, potential for bugs in unused code paths.

## Findings

### 1. `detectCommunicationStyle` is unused
**File**: `/tmp/sophia-deploy/supabase/functions/sophia-bot/memory/sophia-memory.ts:467-498`

Function exported but never called. 31 lines of dead code.

### 2. `calculateImportance` is over-engineered
**File**: `/tmp/sophia-deploy/supabase/functions/sophia-bot/memory/sophia-memory.ts:542-570`

Uses arbitrary scoring weights with no empirical basis:
```typescript
if (text.includes("?")) score += 0.1;
if (text.includes("!")) score += 0.05;
if (text.length > 200) score += 0.1;
```

Vector similarity already captures relevance - manual importance scoring adds no value.

### 3. `extractTopics` is brittle domain heuristics
**File**: `/tmp/sophia-deploy/supabase/functions/sophia-bot/memory/sophia-memory.ts:507-536`

Hardcoded topic patterns (11 categories) with fragile keyword matching:
```typescript
"mortgage": ["mortgage", "loan", "financing", "bank"],
"tax": ["tax", "vat", "transfer fee", "capital gains"],
```

Topics are stored but unclear if ever queried downstream.

### 4. `EMBEDDING_DIMENSION` constant unused
**File**: `/tmp/sophia-deploy/supabase/functions/sophia-bot/memory/sophia-memory.ts:19`

```typescript
const EMBEDDING_DIMENSION = 768; // Never used
```

**Severity**: P2 - IMPORTANT (code quality)
**Total LOC to remove**: ~100 lines

## Proposed Solutions

### Option 1: Delete unused, simplify over-engineered (Recommended)

**Pros**: Cleaner codebase, easier maintenance
**Cons**: Loses "future" functionality (that may never be needed)
**Effort**: Small (1 hour)
**Risk**: Low

Changes:
1. Delete `detectCommunicationStyle` entirely
2. Replace `calculateImportance` with `return 0.5;`
3. Delete `extractTopics` if topics aren't queried (verify first)
4. Delete `EMBEDDING_DIMENSION` constant

### Option 2: Keep but mark as TODO for future use

**Pros**: Preserves work if needed later
**Cons**: YAGNI violation, maintenance burden
**Effort**: Minimal
**Risk**: Low

## Recommended Action

Implement Option 1 - YAGNI principle. If these features are needed later, they can be re-implemented with actual requirements.

## Technical Details

**Affected Files**:
- `/tmp/sophia-deploy/supabase/functions/sophia-bot/memory/sophia-memory.ts`

**Database Changes**: None

**Pre-requisite**: Verify `topics` column in `sophia_conversation_memory` is not queried before deleting `extractTopics`

## Acceptance Criteria

- [ ] `detectCommunicationStyle` removed
- [ ] `calculateImportance` simplified to constant
- [ ] `extractTopics` removed (if unused) or documented (if used)
- [ ] `EMBEDDING_DIMENSION` constant removed
- [ ] All existing tests pass
- [ ] No runtime errors

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-11 | Created from simplicity review | YAGNI - don't build what you don't use |

## Resources

- Simplicity audit: agent a1b4940
- [YAGNI Principle](https://martinfowler.com/bliki/Yagni.html)
