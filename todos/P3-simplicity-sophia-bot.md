# P3 Simplicity: sophia-bot Edge Function

**Priority**: P3 (Nice to Have)
**Source**: code-simplicity-reviewer review
**Created**: 2026-01-11

## Findings

### 1. Dead Code (~505 LOC estimated)

**Unused Functions**:
- `clearCache()` in taxonomy-cache.ts - never called
- Several helper functions in description-generator.ts not used

**YAGNI Violations**:
- `createLandListing` tool returns "not implemented" - remove until needed
- Multiple calculator tools that may not be used in WhatsApp context

### 2. Duplicate Data: Agents

Agent data exists in two places:
1. Supabase `agents` table
2. Hardcoded in `rules/reviewer-assignment.ts` and `rules/special-cases.ts`

**Recommendation**: Single source of truth in database, load at request start.

### 3. Over-Engineered Description Generator

The description generator has extensive templates for property types that may not all be needed.

**Current**: 200+ lines with random adjective selection, multiple paragraph generators.

**Simpler Alternative**: Basic template with key facts, let AI enhance if needed.

### 4. Verbose Type Definitions

Some interfaces have optional fields that are never used:
```typescript
interface ToolResult {
  success?: boolean;    // Always set
  error?: string;       // Always set on error
  needsInput?: boolean; // Used
  question?: string;    // Used
  message?: string;     // Used
  data?: unknown;       // Rarely used
}
```

### 5. Commented Code

Several files have commented-out code blocks that should be removed:
- Webhook signature verification (should be enabled, not commented)
- Debug logging statements
- Alternative implementation attempts

## Action Items

- [ ] Remove `createLandListing` tool until implemented
- [ ] Remove `clearCache()` function
- [ ] Consolidate agent data to database only
- [ ] Simplify description generator
- [ ] Remove commented code (except TODOs with clear purpose)
- [ ] Audit unused helper functions

## Metrics

Estimated reduction: ~505 lines of code
- Dead functions: ~100 LOC
- Duplicate data: ~150 LOC
- Over-engineered description: ~150 LOC
- Commented code: ~50 LOC
- Verbose types: ~55 LOC
