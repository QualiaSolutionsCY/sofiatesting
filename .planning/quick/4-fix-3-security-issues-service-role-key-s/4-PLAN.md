---
phase: quick-4
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/supabase/admin.ts
  - app/api/admin/agents/route.ts
  - app/api/admin/agents/[id]/route.ts
  - app/api/admin/agents/stats/route.ts
  - app/api/admin/agents/[id]/link-whatsapp/route.ts
  - app/api/admin/agents/[id]/link-telegram/route.ts
  - app/api/admin/agents/import/route.ts
  - app/api/admin/prompts/route.ts
  - app/api/admin/prompts/[key]/route.ts
  - app/api/admin/prompts/[key]/history/route.ts
  - app/api/admin/prompts/[key]/rollback/route.ts
  - app/api/admin/prompts/cache/invalidate/route.ts
  - app/(admin)/admin/page.tsx
  - app/(admin)/admin/activity/page.tsx
  - app/(admin)/admin/agents-registry/page.tsx
  - app/(admin)/admin/agents-registry/[id]/page.tsx
  - app/(admin)/admin/agents-registry/regional-offices/page.tsx
  - app/(admin)/admin/prompts/page.tsx
  - app/(admin)/admin/prompts/[key]/page.tsx
  - app/(admin)/admin/prompts/[key]/history/page.tsx
  - supabase/migrations/20260227_listing_uploads_agent_phone_index.sql
autonomous: true

must_haves:
  truths:
    - "Service role key never exposed to client bundle"
    - "Admin API routes reject unauthenticated requests"
    - "listing_uploads queries by agent_phone use index, not full scan"
  artifacts:
    - path: "lib/supabase/admin.ts"
      provides: "Server-only lazy-init Supabase admin client"
      contains: 'import "server-only"'
      min_lines: 10
    - path: "supabase/migrations/20260227_listing_uploads_agent_phone_index.sql"
      provides: "Database index on listing_uploads.agent_phone"
      contains: "CREATE INDEX"
  key_links:
    - from: "app/api/admin/agents/[id]/route.ts"
      to: "lib/supabase/admin.ts"
      via: "import getAdminSupabase"
      pattern: "getAdminSupabase\\(\\)"
    - from: "app/api/admin/agents/[id]/route.ts"
      to: "@/lib/auth/admin"
      via: "checkAdminAuth() in all handlers"
      pattern: "const adminCheck = await checkAdminAuth\\(\\)"
---

<objective>
Fix three critical security vulnerabilities identified in code review:
1. Service role key exposed at module scope in 19 admin files
2. Missing database index on listing_uploads.agent_phone (full table scan)
3. 5 admin API routes missing authentication checks

Purpose: Eliminate key leakage risk, improve query performance, and prevent unauthorized admin API access.

Output: Hardened admin backend with centralized service role client, indexed queries, and complete auth coverage.
</objective>

<execution_context>
@/home/qualia/.claude/get-shit-done/workflows/execute-plan.md
@/home/qualia/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@CLAUDE.md
@lib/auth/admin.ts
@app/api/admin/agents/route.ts
@supabase/functions/sophia-bot/tools/executor.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Centralize service role client with server-only guard</name>
  <files>
lib/supabase/admin.ts
app/api/admin/agents/route.ts
app/api/admin/agents/[id]/route.ts
app/api/admin/agents/stats/route.ts
app/api/admin/agents/[id]/link-whatsapp/route.ts
app/api/admin/agents/[id]/link-telegram/route.ts
app/api/admin/agents/import/route.ts
app/api/admin/prompts/route.ts
app/api/admin/prompts/[key]/route.ts
app/api/admin/prompts/[key]/history/route.ts
app/api/admin/prompts/[key]/rollback/route.ts
app/api/admin/prompts/cache/invalidate/route.ts
app/(admin)/admin/page.tsx
app/(admin)/admin/activity/page.tsx
app/(admin)/admin/agents-registry/page.tsx
app/(admin)/admin/agents-registry/[id]/page.tsx
app/(admin)/admin/agents-registry/regional-offices/page.tsx
app/(admin)/admin/prompts/page.tsx
app/(admin)/admin/prompts/[key]/page.tsx
app/(admin)/admin/prompts/[key]/history/page.tsx
  </files>
  <action>
Create `lib/supabase/admin.ts` with lazy-init pattern:

```typescript
import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Get admin Supabase client with service role key.
 *
 * SECURITY: import "server-only" ensures build-time error if imported in client component.
 * Lazy initialization prevents key exposure at module scope.
 */
export function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

Then replace module-scope `const supabase = createClient(...)` in all 19 files with:
1. Remove lines 7-10 (or similar) with createClient call
2. Add import: `import { getAdminSupabase } from "@/lib/supabase/admin";`
3. Replace all `supabase.` references with `getAdminSupabase().` (call function each time)

Note: This trades minimal perf overhead (createClient per request) for guaranteed safety. Service role clients are cheap to create.
  </action>
  <verify>
```bash
# Verify no module-scope service role clients remain
! grep -rn "const supabase = createClient" app/api/admin app/\(admin\)

# Verify server-only guard exists
grep -q 'import "server-only"' lib/supabase/admin.ts

# Verify all admin files use new pattern
grep -rn "getAdminSupabase()" app/api/admin app/\(admin\) | wc -l  # Should be >30 (multiple uses per file)
```
  </verify>
  <done>
All 19 admin files use `getAdminSupabase()` instead of module-scope client. `lib/supabase/admin.ts` has `import "server-only"` guard. Build-time error will fire if ever imported in client component.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add auth checks to 5 unprotected admin routes</name>
  <files>
app/api/admin/agents/[id]/route.ts
app/api/admin/agents/stats/route.ts
app/api/admin/agents/[id]/link-whatsapp/route.ts
app/api/admin/agents/[id]/link-telegram/route.ts
app/api/admin/agents/import/route.ts
  </files>
  <action>
For EACH of these 5 files, add auth checks to ALL handler functions (GET, POST, PUT, DELETE).

Pattern (from working routes like `app/api/admin/agents/route.ts`):

```typescript
import { checkAdminAuth, hasMinimumRole } from "@/lib/auth/admin";

export async function GET(request: NextRequest) {
  const adminCheck = await checkAdminAuth();
  if (!adminCheck.isAdmin) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.userId ? 403 : 401 }
    );
  }

  // ... rest of handler
}

export async function PUT/DELETE/POST(request: NextRequest) {
  const adminCheck = await checkAdminAuth();
  if (!adminCheck.isAdmin) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.userId ? 403 : 401 }
    );
  }

  // For mutating operations, also check minimum role
  if (!hasMinimumRole(adminCheck.role, "admin")) {
    return NextResponse.json(
      { error: "Insufficient permissions" },
      { status: 403 }
    );
  }

  // ... rest of handler
}
```

**Per-file details:**

1. `agents/[id]/route.ts` — GET (view agent), PUT (edit agent), DELETE (delete agent)
   - GET: checkAdminAuth only
   - PUT/DELETE: checkAdminAuth + hasMinimumRole("admin")

2. `agents/stats/route.ts` — GET (aggregate stats)
   - GET: checkAdminAuth only

3. `agents/[id]/link-whatsapp/route.ts` — POST (link), DELETE (unlink)
   - POST/DELETE: checkAdminAuth + hasMinimumRole("admin")

4. `agents/[id]/link-telegram/route.ts` — POST (link), DELETE (unlink)
   - POST/DELETE: checkAdminAuth + hasMinimumRole("admin")

5. `agents/import/route.ts` — POST (bulk import)
   - POST: checkAdminAuth + hasMinimumRole("admin")

Ensure imports are added at top of each file.
  </action>
  <verify>
```bash
# Verify all 5 files have checkAdminAuth imports
grep -l "checkAdminAuth" app/api/admin/agents/\[id\]/route.ts \
  app/api/admin/agents/stats/route.ts \
  app/api/admin/agents/\[id\]/link-whatsapp/route.ts \
  app/api/admin/agents/\[id\]/link-telegram/route.ts \
  app/api/admin/agents/import/route.ts | wc -l  # Should be 5

# Verify auth checks in handler functions (pattern: "const adminCheck = await checkAdminAuth()")
grep -rn "const adminCheck = await checkAdminAuth()" app/api/admin/agents/ | grep -v route.ts$ | wc -l  # Should be >=9 (one per handler)
```
  </verify>
  <done>
All 5 admin API route files have `checkAdminAuth()` at the top of every handler function. Unauthenticated requests return 401, authenticated non-admins return 403. Mutating operations require "admin" role or higher.
  </done>
</task>

<task type="auto">
  <name>Task 3: Create database index for listing_uploads.agent_phone</name>
  <files>
supabase/migrations/20260227_listing_uploads_agent_phone_index.sql
  </files>
  <action>
Create migration file with index creation:

```sql
-- Add index on agent_phone for efficient upload history queries
-- Used by: supabase/functions/sophia-bot/tools/executor.ts (lines 497-505)
CREATE INDEX IF NOT EXISTS idx_listing_uploads_agent_phone
ON listing_uploads(agent_phone);

-- Add comment documenting the index purpose
COMMENT ON INDEX idx_listing_uploads_agent_phone IS
  'Supports upload history queries by agent phone number in createPropertyListing tool';
```

Then apply migration using Supabase MCP:

```bash
# Apply migration via MCP
node -e "console.log(JSON.stringify({
  method: 'run_sql',
  params: {
    sql: require('fs').readFileSync('supabase/migrations/20260227_listing_uploads_agent_phone_index.sql', 'utf8')
  }
}))" | npx @modelcontextprotocol/inspector supabase
```

Alternative: Use Supabase CLI if MCP unavailable:
```bash
supabase db push --project-ref vceeheaxcrhmpqueudqx
```
  </action>
  <verify>
```bash
# Verify migration file exists and has correct SQL
grep -q "CREATE INDEX.*idx_listing_uploads_agent_phone" supabase/migrations/20260227_listing_uploads_agent_phone_index.sql

# Verify index exists in database (via psql or Supabase dashboard)
# Query: SELECT indexname FROM pg_indexes WHERE tablename = 'listing_uploads' AND indexname = 'idx_listing_uploads_agent_phone';
# Should return 1 row
```
  </verify>
  <done>
Index `idx_listing_uploads_agent_phone` exists on `listing_uploads(agent_phone)`. Upload history queries in `createPropertyListing` tool use index scan instead of sequential scan. Query performance improves from O(n) to O(log n).
  </done>
</task>

</tasks>

<verification>
**Security validation:**
- Build succeeds (no server-only violations)
- No `const supabase = createClient` at module scope in admin files
- All 5 unprotected routes return 401 when called without auth
- Database index query plan shows index scan, not seq scan

**Functional validation:**
- Admin panel loads and displays agent list
- Agent detail pages load correctly
- Admin API routes work when authenticated
- Upload history queries complete quickly (check Supabase dashboard > Logs > Query Performance)
</verification>

<success_criteria>
- [ ] `lib/supabase/admin.ts` exists with `import "server-only"` guard
- [ ] All 19 admin files use `getAdminSupabase()` instead of module-scope client
- [ ] `grep -rn "const supabase = createClient" app/api/admin app/(admin)` returns 0 results
- [ ] All 5 previously unprotected routes have `checkAdminAuth()` in every handler
- [ ] Migration file created and applied successfully
- [ ] `idx_listing_uploads_agent_phone` index exists in production database
- [ ] All admin routes return 401 when called without authentication
- [ ] Admin panel continues to function correctly when authenticated
</success_criteria>

<output>
After completion, create `.planning/quick/4-fix-3-security-issues-service-role-key-s/4-SUMMARY.md`
</output>
