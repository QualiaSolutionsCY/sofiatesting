---
phase: quick-4
plan: 01
subsystem: admin-backend
tags: [security, performance, authentication]
dependency_graph:
  requires: []
  provides:
    - server-only admin supabase client
    - authenticated admin API routes
    - indexed upload history queries
  affects:
    - admin panel
    - admin API routes
    - listing upload performance
tech_stack:
  added: []
  patterns:
    - lazy-init service role client
    - server-only guard
    - role-based access control
key_files:
  created:
    - lib/supabase/admin.ts
    - supabase/migrations/20260227_listing_uploads_agent_phone_index.sql
    - scripts/apply-migration-listing-uploads-index.js
  modified:
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
decisions:
  - decision: Use lazy-init pattern (createClient per request) instead of singleton
    rationale: Guarantees server-only safety, minimal perf cost, prevents edge cases
  - decision: Require 'admin' role for mutating operations, 'analyst' OK for read
    rationale: Follows principle of least privilege, analysts can view but not modify
  - decision: Add database index on listing_uploads.agent_phone
    rationale: Queries by agent phone were doing full table scans, O(log n) vs O(n)
metrics:
  duration: ~6min
  completed_date: 2026-02-27
  commits: 3
  files_modified: 23
  loc_added: ~180
  loc_removed: ~30
---

# Quick Task 4: Fix 3 Security Issues (Service Role Key, Auth, Index)

**One-liner:** Hardened admin backend with centralized service role client, auth on all routes, and indexed upload queries

## What Was Done

Fixed three critical security and performance vulnerabilities in the admin backend:

1. **Service role key exposure (CRITICAL)** — Module-scope `const supabase = createClient()` in 19 admin files could leak service role key into client bundle via Next.js module graph analysis. Created centralized `lib/supabase/admin.ts` with lazy-init pattern and `import "server-only"` guard.

2. **Missing authentication (HIGH)** — 5 admin API routes had zero auth checks, allowing unauthenticated access to view agents, link accounts, and bulk import. Added `checkAdminAuth()` to all handlers and `hasMinimumRole("admin")` to mutating operations.

3. **Full table scans (MEDIUM)** — Upload history queries in `createPropertyListing` tool scanned entire `listing_uploads` table on every request. Created index on `agent_phone` column.

## Task Breakdown

### Task 1: Centralize service role client (21185b1)

**Problem:** 19 files (11 API routes + 8 RSC pages) had module-scope `const supabase = createClient(service_role_key)`. Next.js module graph could include this in client bundle, exposing service role key.

**Solution:**
- Created `lib/supabase/admin.ts` with `getAdminSupabase()` function
- Added `import "server-only"` guard (build-time error if imported in client component)
- Replaced all module-scope clients with `getAdminSupabase()` calls inside handler functions
- Lazy-init pattern: creates client per request (minimal perf impact, maximum safety)

**Files modified:** 20 files (1 created, 19 refactored)

**Verification:**
```bash
grep -rn "const supabase = createClient" app/api/admin app/\(admin\)  # Returns 0
grep -q 'import "server-only"' lib/supabase/admin.ts  # OK
```

### Task 2: Add auth checks to unprotected routes (0ac5934)

**Problem:** 5 admin API routes had ZERO authentication:
1. `app/api/admin/agents/[id]/route.ts` — GET, PUT, DELETE (view/edit/delete agent)
2. `app/api/admin/agents/stats/route.ts` — GET (aggregate stats)
3. `app/api/admin/agents/[id]/link-whatsapp/route.ts` — POST, DELETE (link/unlink)
4. `app/api/admin/agents/[id]/link-telegram/route.ts` — POST, DELETE (link/unlink)
5. `app/api/admin/agents/import/route.ts` — POST (bulk import from Excel)

Anyone could call these endpoints without authentication.

**Solution:**
- Added `checkAdminAuth()` to start of EVERY handler function (11 handlers total)
- Added `hasMinimumRole(adminCheck.role, "admin")` to mutating operations (PUT, POST, DELETE)
- GET handlers allow 'analyst' role (read-only access)
- Mutating handlers require 'admin' role or higher
- Returns 401 if not authenticated, 403 if authenticated but not admin

**Pattern applied:**
```typescript
export async function GET/PUT/POST/DELETE(request, context) {
  const adminCheck = await checkAdminAuth();
  if (!adminCheck.isAdmin) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.userId ? 403 : 401 }
    );
  }

  // For mutating operations only:
  if (!hasMinimumRole(adminCheck.role, "admin")) {
    return NextResponse.json(
      { error: "Insufficient permissions. Admin role required." },
      { status: 403 }
    );
  }

  // ... handler logic
}
```

**Verification:**
```bash
# All 5 files have checkAdminAuth import
grep -l "checkAdminAuth" [5 files] | wc -l  # Returns 5

# 11 handler functions have auth checks
grep -rn "const adminCheck = await checkAdminAuth()" app/api/admin/agents/ | wc -l  # Returns 11
```

### Task 3: Create database index (3de3c93)

**Problem:** `createPropertyListing` tool (sophia-bot Edge Function) queries `listing_uploads` table to check if agent uploaded today:

```sql
SELECT * FROM listing_uploads
WHERE agent_phone = '+357...'
ORDER BY created_at DESC
LIMIT 1;
```

Without index on `agent_phone`, Postgres does sequential scan (O(n)). With thousands of uploads, this becomes slow.

**Solution:**
- Created migration `supabase/migrations/20260227_listing_uploads_agent_phone_index.sql`
- Adds index: `CREATE INDEX idx_listing_uploads_agent_phone ON listing_uploads(agent_phone)`
- Query now uses index scan (O(log n))
- Added migration script for automated application

**Migration SQL:**
```sql
CREATE INDEX IF NOT EXISTS idx_listing_uploads_agent_phone
ON listing_uploads(agent_phone);

COMMENT ON INDEX idx_listing_uploads_agent_phone IS
  'Supports upload history queries by agent phone number in createPropertyListing tool';
```

**To apply migration:**
- Option 1: Supabase SQL Editor at https://supabase.com/dashboard/project/vceeheaxcrhmpqueudqx/sql/new
- Option 2: Via Supabase MCP tool `apply_migration`
- Option 3: `supabase db push` after linking project locally

**Verification (after applying):**
```sql
SELECT indexname FROM pg_indexes
WHERE tablename = 'listing_uploads'
AND indexname = 'idx_listing_uploads_agent_phone';
-- Should return 1 row

EXPLAIN SELECT * FROM listing_uploads
WHERE agent_phone = '+35799123456';
-- Should show "Index Scan using idx_listing_uploads_agent_phone"
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Import path typo in 8 files**
- **Found during:** Task 1 execution
- **Issue:** Replace-all for `supabase` → `getAdminSupabase()` created typo: `@/lib/getAdminSupabase()/admin` instead of `@/lib/supabase/admin`
- **Fix:** Used `sed` to correct import paths in all affected files
- **Files modified:** 8 API route files
- **Impact:** Prevented build errors

## Verification Results

### Security validation
✅ Build succeeds (no server-only violations)
✅ No `const supabase = createClient` at module scope in admin files
✅ All 5 previously unprotected routes have `checkAdminAuth()` in every handler
✅ Migration file created with correct SQL syntax

### Functional validation (manual)
- [ ] Admin panel loads and displays agent list
- [ ] Agent detail pages load correctly
- [ ] Admin API routes work when authenticated
- [ ] Admin API routes return 401 when called without auth
- [ ] Mutating operations return 403 when called by analysts
- [ ] Upload history queries complete quickly after migration applied

**Note:** Functional validation requires:
1. Migration applied to production database
2. Admin user logged in to test protected routes
3. Non-admin user to test role restrictions

## Self-Check

**Files created:**
- ✅ lib/supabase/admin.ts exists
- ✅ supabase/migrations/20260227_listing_uploads_agent_phone_index.sql exists
- ✅ scripts/apply-migration-listing-uploads-index.js exists

**Commits:**
- ✅ 21185b1 exists (centralize admin supabase client)
- ✅ 0ac5934 exists (add auth checks)
- ✅ 3de3c93 exists (add database index)

**Code changes:**
```bash
# Verify no module-scope service role clients
grep -rn "const supabase = createClient" app/api/admin app/\(admin\) | wc -l
# Result: 0 ✅

# Verify server-only guard
grep -q 'import "server-only"' lib/supabase/admin.ts && echo "✅" || echo "❌"
# Result: ✅

# Verify all 5 unprotected routes now have auth
grep -l "checkAdminAuth" \
  app/api/admin/agents/[id]/route.ts \
  app/api/admin/agents/stats/route.ts \
  app/api/admin/agents/[id]/link-whatsapp/route.ts \
  app/api/admin/agents/[id]/link-telegram/route.ts \
  app/api/admin/agents/import/route.ts | wc -l
# Result: 5 ✅

# Verify migration file has correct syntax
grep -q "CREATE INDEX.*idx_listing_uploads_agent_phone" \
  supabase/migrations/20260227_listing_uploads_agent_phone_index.sql && echo "✅" || echo "❌"
# Result: ✅
```

## Self-Check: PASSED ✅

All created files exist. All commits present. All verification commands pass.

## Impact & Next Steps

### Immediate Impact
- **Security:** Service role key can no longer leak to client bundle (build-time guard)
- **Security:** All admin API routes now require authentication
- **Security:** Mutating operations require admin role (principle of least privilege)
- **Performance:** Upload history queries will use index scan instead of sequential scan (after migration applied)

### Required Follow-up
1. **Apply migration** — Run migration SQL via Supabase SQL Editor or MCP to create index
2. **Test auth** — Verify unauthenticated requests return 401
3. **Test roles** — Verify analysts can read but not modify, admins can do both
4. **Monitor queries** — Check Supabase dashboard for query performance improvement after index applied

### Monitoring
- Track admin API 401/403 responses in logs (expect increase initially if unauthorized access was happening)
- Monitor query performance on `listing_uploads` table (should drop from >100ms to <10ms)
- Check build logs for any `server-only` violations (should be zero)

## Lessons Learned

1. **Replace-all can create subtle bugs** — The `supabase` → `getAdminSupabase()` replace-all created invalid import paths. Always verify after bulk edits.

2. **Lazy-init > singleton for server-only code** — Even though singleton is faster, lazy-init with `import "server-only"` provides stronger guarantees against accidental client-side imports.

3. **Auth checks are easy to miss** — 5 routes had zero auth because they were created before the auth system. Audit should include grep for routes missing `checkAdminAuth()`.

4. **Database indexes are invisible until they're not** — Upload history query worked fine with 10 rows, but would degrade badly at scale. Always index foreign keys and frequently queried columns.

## Related Documentation

- Security audit results: `AI-PRODUCTION-AUDIT.md`
- Admin auth system: `lib/auth/admin.ts`
- Admin API routes: `app/api/admin/`
- Supabase admin client: `lib/supabase/admin.ts`
