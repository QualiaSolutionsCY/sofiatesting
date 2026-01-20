# P3 NICE-TO-HAVE: Deprecated Schema Fields Still Present

---
status: complete
priority: p3
issue_id: "025"
tags: [code-review, simplicity, deferred]
dependencies: []
---

## Problem Statement

**What's broken:** Three deprecated fields remain in the database schema, consuming space and causing confusion.

**Why it matters:**
- Database storage waste
- Confusion about which fields to use
- Technical debt

**DEFERRED - STILL IN ACTIVE USE:**
These fields are NOT safe to remove. Despite being marked "deprecated" in comments, they are actively used by:
- `lib/ai/tools/create-listing.ts` - uses verandaArea and amenityFeature
- `app/api/listings/create/route.ts` - uses propertyType and amenityFeature
- `app/properties/page.tsx` - uses propertyType
- `app/api/admin/listings/route.ts` - uses propertyType
- Multiple other API routes and components

Removing these would require a coordinated migration across the entire codebase (API routes, UI components, AI tools). This is a P3 item that should be tracked as tech debt for a future cleanup sprint, not a quick fix.

## Findings

**Location:** `/home/qualia/Desktop/Projects/aiagents/sofiatesting/lib/db/schema.ts`

```typescript
propertyType: varchar("propertyType", { length: 50 }),
  // [DEPRECATED - use taxonomy fields below]

verandaArea: real("verandaArea").default(0),
  // (deprecated - use coveredVeranda)

amenityFeature: jsonb("amenityFeature").$type<string[]>().default([]),
  // [DEPRECATED - use featureIds above]
```

## Proposed Solutions

### Option 1: Migration to Remove Fields (Recommended)
**Pros:** Clean schema
**Cons:** Requires data migration
**Effort:** Medium (1 hour)
**Risk:** Low (deprecated = not used)

1. Verify no code references these fields
2. Create migration to drop columns
3. Apply migration

### Option 2: Add @deprecated JSDoc
**Pros:** Signals intent
**Cons:** Still clutters schema
**Effort:** Small (5 min)

## Recommended Action

(To be filled during triage)

## Technical Details

**Affected files:** `lib/db/schema.ts`
**Table:** `PropertyListing`
**Fields:** propertyType, verandaArea, amenityFeature

## Acceptance Criteria

- [ ] Confirm no code uses these fields
- [ ] Migration created to drop columns
- [ ] Migration applied successfully
- [ ] Schema file updated

## Work Log

| Date | Author | Action | Learnings |
|------|--------|--------|-----------|
| 2026-01-11 | code-simplicity-reviewer | Identified deprecated fields | Need cleanup |
| 2026-01-12 | claude-opus-4-5 | Verified fields ARE in active use | Cannot remove without app-wide migration. Deferred to future sprint. |
