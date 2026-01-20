---
status: completed
priority: p2
issue_id: "008"
tags: [code-review, architecture, rag]
dependencies: []
completed_at: "2026-01-11"
---

# Consolidate Multiple Supabase Client Instances

## Problem Statement

Three separate Supabase clients are instantiated at module level in different files, violating Single Responsibility Principle and potentially causing connection pool issues.

**Impact**:
- Potential connection pool exhaustion under load
- Difficult to test due to hard-coded singletons
- No centralized client configuration

## Findings

**File 1**: `/tmp/sophia-deploy/supabase/functions/sophia-bot/memory/sophia-memory.ts:10-12`
```typescript
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);
```

**File 2**: `/tmp/sophia-deploy/supabase/functions/sophia-bot/index.ts:71`
```typescript
const supabase = createClient(supabaseUrl, supabaseKey);
```

**File 3**: `/tmp/sophia-deploy/supabase/functions/sophia-bot/database.ts:4-5`
```typescript
const supabase = createClient(supabaseUrl, supabaseKey);
```

### Additional Issue: Non-null assertion on env vars

Using `!` (non-null assertion) on environment variables means unclear errors if not set:
```typescript
const supabaseUrl = Deno.env.get("SUPABASE_URL")!; // Crashes with unclear error if not set
```

**Severity**: P2 - IMPORTANT

## Proposed Solutions

### Option 1: Create shared client module (Recommended)

**Pros**: Single source of truth, easy to test, proper error handling
**Cons**: Requires updating all imports
**Effort**: Medium (1-2 hours)
**Risk**: Low

Create `lib/supabase.ts`:
```typescript
// lib/supabase.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
```

Update all imports:
```typescript
import { supabase } from "./lib/supabase.ts";
```

### Option 2: Dependency injection pattern

**Pros**: Maximum testability
**Cons**: More complex, requires refactoring function signatures
**Effort**: Large (3-4 hours)
**Risk**: Medium

## Recommended Action

Implement Option 1 - shared client module with proper validation.

## Technical Details

**Affected Files**:
- `/tmp/sophia-deploy/supabase/functions/sophia-bot/memory/sophia-memory.ts`
- `/tmp/sophia-deploy/supabase/functions/sophia-bot/index.ts`
- `/tmp/sophia-deploy/supabase/functions/sophia-bot/database.ts`
- New: `/tmp/sophia-deploy/supabase/functions/sophia-bot/lib/supabase.ts`

**Database Changes**: None

## Acceptance Criteria

- [ ] Single Supabase client module created
- [ ] All files import from shared module
- [ ] Proper error handling if env vars missing
- [ ] No duplicate `createClient` calls
- [ ] Edge function deploys successfully

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-11 | Created from architecture review | Centralize shared dependencies |

## Resources

- Architecture audit: agent acacf12
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
