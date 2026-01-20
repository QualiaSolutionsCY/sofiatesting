# P2 IMPORTANT: 11 Unused `getAll*` Functions in Taxonomy Cache

---
status: complete
priority: p2
issue_id: "023"
tags: [code-review, simplicity, invalid]
dependencies: []
---

## Problem Statement

**What's broken:** ~~11 `getAll*` functions exported from taxonomy-cache.ts are never called anywhere in the codebase - YAGNI violation.~~

**INVALID FINDING**: These functions ARE actively used in `lib/ai/tools/get-zyprus-data.ts` by the `getZyprusData` tool, which is a core AI tool for fetching Zyprus taxonomy data.

**Why it matters:**
- ~~180 lines of dead code~~ NOT DEAD CODE - actively used
- ~~Maintenance burden for unused code~~
- ~~Increases cognitive load when reading codebase~~
- ~~May have bugs that are never discovered~~

## Findings

**Location:** `/home/qualia/Desktop/Projects/aiagents/sofiatesting/lib/zyprus/taxonomy-cache.ts`

**Unused functions (~180 LOC total):**
- `getAllLocations()` (lines 310-322)
- `getAllPropertyTypes()` (lines 327-339)
- `getAllIndoorFeatures()` (lines 344-356)
- `getAllOutdoorFeatures()` (lines 358-370)
- `getAllPriceModifiers()` (lines 375-387)
- `getAllTitleDeeds()` (lines 392-404)
- `getAllLandTypes()` (lines 527-539)
- `getAllInfrastructure()` (lines 544-556)
- `getAllPropertyViews()` (lines 561-573)
- `getAllPropertyStatus()` (lines 578-590)
- `getAllListingTypes()` (lines 595-607)

Also: `hasCacheData()` (lines 612-614) - never called.

## Proposed Solutions

### Option 1: Delete All Unused Functions (Recommended)
**Pros:** Clean code, reduced maintenance
**Cons:** Need to re-add if ever needed
**Effort:** Small (15 min)
**Risk:** Very Low

### Option 2: Mark as @deprecated
**Pros:** Signals intent to remove
**Cons:** Still clutters codebase
**Effort:** Small (10 min)

## Recommended Action

(To be filled during triage)

## Technical Details

**Affected files:** `lib/zyprus/taxonomy-cache.ts`
**LOC to remove:** ~180 lines

## Acceptance Criteria

- [ ] All unused getAll* functions removed
- [ ] hasCacheData() removed
- [ ] No broken imports after removal
- [ ] Tests still pass

## Work Log

| Date | Author | Action | Learnings |
|------|--------|--------|-----------|
| 2026-01-11 | code-simplicity-reviewer | Identified 11 unused functions | YAGNI violation |
| 2026-01-12 | claude-opus-4-5 | Verified functions ARE used in get-zyprus-data.ts | Invalid finding - always grep before removing |
