# P1 CRITICAL: prompts.ts is 4354 Lines

---
status: pending
priority: p1
issue_id: "016"
tags: [code-review, architecture]
dependencies: []
---

## Problem Statement

**What's broken:** The prompts.ts file contains 4354 lines - the entire SYSTEM_PROMPT with all templates, business rules, calculator docs, and API documentation embedded in a single string constant.

**Why it matters:**
- Cannot unit test individual prompt sections
- Changes require editing a massive file
- No version control granularity for prompt changes
- Memory pressure at runtime loading entire string
- Impossible to find specific sections quickly

## Findings

**Location:** `supabase/functions/sophia-bot/prompts.ts`
**Size:** 4354 lines

**Embedded content:**
- Core personality and formatting rules
- All template instructions (viewing forms, reservations, etc.)
- Calculator documentation (VAT, transfer fees, capital gains)
- Cyprus real estate knowledge base
- Zyprus API documentation
- Business rules for agents

## Proposed Solutions

### Option 1: Split into Composable Modules (Recommended)
**Pros:** Maintainable, testable, faster to navigate
**Cons:** Requires careful composition logic
**Effort:** Large (1-2 days)
**Risk:** Medium

```
prompts/
├── base.ts             (core personality, ~100 lines)
├── templates/
│   ├── viewing-forms.ts
│   ├── reservations.ts
│   ├── marketing-agreements.ts
│   └── email-templates.ts
├── calculators.ts      (VAT, fees, capital gains)
├── knowledge-base.ts   (Cyprus facts)
└── index.ts            (composer - builds final prompt)
```

### Option 2: Use Template Literals with Imports
**Pros:** Simpler than full restructure
**Cons:** Still one large output
**Effort:** Medium (4-6 hours)

```typescript
import { VIEWING_FORMS } from './templates/viewing-forms';
import { CALCULATORS } from './calculators';

const SYSTEM_PROMPT = `
${BASE_PERSONALITY}

## Templates
${VIEWING_FORMS}

## Calculators
${CALCULATORS}
`;
```

## Recommended Action

(To be filled during triage)

## Technical Details

**Affected files:** `supabase/functions/sophia-bot/prompts.ts`
**New files:** 10-15 focused prompt modules
**Target:** Max 500 lines per file

## Acceptance Criteria

- [ ] prompts.ts split into logical modules
- [ ] Each section independently editable
- [ ] Final composed prompt identical to current
- [ ] No regression in AI behavior
- [ ] Deployed and verified

## Work Log

| Date | Author | Action | Learnings |
|------|--------|--------|-----------|
| 2026-01-11 | architecture-strategist | Identified issue | 4354 lines unmaintainable |
