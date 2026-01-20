# P1 CRITICAL: Unsafe `any` and `as unknown as` Type Assertions

---
status: pending
priority: p1
issue_id: "017"
tags: [code-review, typescript]
dependencies: []
---

## Problem Statement

**What's broken:** Multiple TypeScript files use `any` type and `as unknown as X` patterns, completely bypassing type safety.

**Why it matters:**
- Type errors become runtime errors
- Potential security vulnerabilities from unchecked data
- Defeats the purpose of using TypeScript
- Hard to refactor safely

## Findings

**12 Critical Instances Found:**

### 1. message-handler.ts (line 211)
```typescript
let result: Awaited<ReturnType<typeof streamText<any>>> | null = null;
```

### 2. message-handler.ts (line 185)
```typescript
const mockDataStream = {...} as unknown as UIMessageStreamWriter<ChatMessage>;
```

### 3. create-listing.ts (line 474)
```typescript
zyprusResult = await uploadToZyprusAPI({...} as any);
```

### 4. upload-listing.ts (lines 122-130)
```typescript
...(listing.address as any), // Double any
} as any);
```

### 5. list-listings.ts (line 68)
```typescript
(listing.address as any).addressLocality
```

### 6. types.ts (lines 83-88)
```typescript
data: WaSenderMessageData | WaSenderStatusData | unknown; // | unknown makes union useless
```

### 7-12. Edge Function files with untyped database responses, Record<string, unknown>, etc.

## Proposed Solutions

### Option 1: Add Proper Types (Recommended)
**Pros:** Full type safety restored
**Cons:** Requires understanding each context
**Effort:** Medium (4-6 hours)
**Risk:** Low

For each `any`:
1. Identify the actual type expected
2. Create interface or use existing types
3. Add runtime validation if external data

### Option 2: Use Zod for Runtime Validation
**Pros:** Validates at runtime AND compile time
**Cons:** Additional dependency
**Effort:** Medium (3-4 hours)

```typescript
const listingSchema = z.object({
  address: z.object({
    addressLocality: z.string(),
  }),
});
const validated = listingSchema.parse(listing);
```

## Recommended Action

(To be filled during triage)

## Technical Details

**Affected files:**
- lib/whatsapp/message-handler.ts
- lib/ai/tools/create-listing.ts
- lib/ai/tools/upload-listing.ts
- lib/ai/tools/list-listings.ts
- lib/whatsapp/types.ts
- lib/ai/tools/registry.ts
- supabase/functions/sophia-bot/* (multiple)

## Acceptance Criteria

- [ ] All `as any` patterns removed
- [ ] All `as unknown as X` patterns removed
- [ ] Proper types defined for all data
- [ ] Runtime validation added for external data
- [ ] No TypeScript errors with strict mode

## Work Log

| Date | Author | Action | Learnings |
|------|--------|--------|-----------|
| 2026-01-11 | kieran-typescript-reviewer | Identified 12 issues | Type safety bypassed |
