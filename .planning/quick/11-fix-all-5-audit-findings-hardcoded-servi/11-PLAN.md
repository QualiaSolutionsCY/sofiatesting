---
phase: 11
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - tests/manual/check-my-notes-logs.ts
  - lib/rate-limit.ts
  - app/api/listings/upload/route.ts
  - app/api/documents/generate/route.ts
  - components/document-preview.tsx
autonomous: true

must_haves:
  truths:
    - "No hardcoded service_role JWT exists in codebase"
    - "setInterval memory leak removed from rate-limit.ts"
    - "Upload and document routes have rate limiting"
    - "Document preview uses dynamic imports for heavy editors"
  artifacts:
    - path: "tests/manual/check-my-notes-logs.ts"
      provides: "Test script using env var, not hardcoded key"
      min_lines: 80
    - path: "lib/rate-limit.ts"
      provides: "Rate limiter with on-demand cleanup"
      min_lines: 35
    - path: "app/api/listings/upload/route.ts"
      provides: "Upload route with rate limit check"
      contains: "rateLimit"
    - path: "app/api/documents/generate/route.ts"
      provides: "Document generation route with rate limit check"
      contains: "rateLimit"
    - path: "components/document-preview.tsx"
      provides: "Document preview with dynamic editor imports"
      contains: "next/dynamic"
  key_links:
    - from: "app/api/listings/upload/route.ts"
      to: "lib/rate-limit.ts"
      via: "rateLimit function import"
      pattern: "import.*rateLimit.*from.*rate-limit"
    - from: "app/api/documents/generate/route.ts"
      to: "lib/rate-limit.ts"
      via: "rateLimit function import"
      pattern: "import.*rateLimit.*from.*rate-limit"
    - from: "components/document-preview.tsx"
      to: "next/dynamic"
      via: "dynamic import for editors"
      pattern: "import dynamic from.*next/dynamic"
---

<objective>
Fix 4 security and performance audit findings from deep project audit.

Purpose: Address hardcoded secrets, memory leaks, missing rate limits, and bundle size issues
Output: Secure, efficient codebase with no critical audit findings
</objective>

<execution_context>
@/home/qualia/.claude/get-shit-done/workflows/execute-plan.md
@/home/qualia/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

# Source files to modify
@tests/manual/check-my-notes-logs.ts
@lib/rate-limit.ts
@app/api/listings/upload/route.ts
@app/api/documents/generate/route.ts
@components/document-preview.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove hardcoded service_role JWT from test script</name>
  <files>tests/manual/check-my-notes-logs.ts</files>
  <action>
Remove hardcoded service_role JWT (line 14) and its usage (line 16):
- Delete line 14: `const correctServiceKey = "eyJ..."`
- Delete line 16: `const supabase = createClient(supabaseUrl, correctServiceKey);`
- Replace with: `const supabase = createClient(supabaseUrl, supabaseKey);`
- Add early exit if key is missing: After line 11, add:
  ```ts
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  ```

This uses the already-declared `supabaseKey` variable from env (line 11) instead of hardcoded JWT.
  </action>
  <verify>
- `grep -n "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" tests/manual/check-my-notes-logs.ts` returns empty
- `grep -n "correctServiceKey" tests/manual/check-my-notes-logs.ts` returns empty
- `grep -n "createClient(supabaseUrl, supabaseKey)" tests/manual/check-my-notes-logs.ts` finds usage
- File still compiles: `npx tsc --noEmit`
  </verify>
  <done>Hardcoded JWT removed, test script uses env var, early exit added for missing keys</done>
</task>

<task type="auto">
  <name>Task 2: Fix setInterval memory leak in rate-limit.ts</name>
  <files>lib/rate-limit.ts</files>
  <action>
Remove setInterval block (lines 37-44) and add on-demand cleanup at start of `rateLimit` function.

Delete lines 37-44:
```ts
// Periodic cleanup to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of rateLimitMap.entries()) {
    if (now >= entry.resetAt) {
      rateLimitMap.delete(userId);
    }
  }
}, 5 * 60 * 1000);
```

At the start of the `rateLimit` function (after line 14), add on-demand cleanup:
```ts
  const now = Date.now();

  // On-demand cleanup of expired entries
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now >= entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }

  const entry = rateLimitMap.get(userId);
```

Remove the old `const now = Date.now();` and `const entry = rateLimitMap.get(userId);` (lines 14-15).
  </action>
  <verify>
- `grep -n "setInterval" lib/rate-limit.ts` returns empty
- `grep -n "On-demand cleanup" lib/rate-limit.ts` finds the new cleanup code
- File still compiles: `npx tsc --noEmit`
  </verify>
  <done>setInterval removed, on-demand cleanup added, no memory leak in serverless</done>
</task>

<task type="auto">
  <name>Task 3: Add rate limiting to upload and document routes</name>
  <files>app/api/listings/upload/route.ts, app/api/documents/generate/route.ts</files>
  <action>
**For app/api/listings/upload/route.ts:**
- Add import at top: `import { rateLimit } from "@/lib/rate-limit";`
- After auth check (after line 34, before parsing body), add:
  ```ts
  // Rate limiting
  const { allowed, remaining, resetAt } = rateLimit(session.user.id);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': new Date(resetAt).toISOString(),
        }
      }
    );
  }
  ```

**For app/api/documents/generate/route.ts:**
- Add import at top: `import { rateLimit } from "@/lib/rate-limit";`
- After auth check (after line 22, before parsing body), add:
  ```ts
  // Rate limiting
  const { allowed, remaining, resetAt } = rateLimit(session.user.id);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': new Date(resetAt).toISOString(),
        }
      }
    );
  }
  ```

Both routes now have 10 requests/minute per user rate limit.
  </action>
  <verify>
- `grep -n "import.*rateLimit" app/api/listings/upload/route.ts` finds import
- `grep -n "import.*rateLimit" app/api/documents/generate/route.ts` finds import
- `grep -n "rateLimit(session.user.id)" app/api/listings/upload/route.ts` finds usage
- `grep -n "rateLimit(session.user.id)" app/api/documents/generate/route.ts` finds usage
- `grep -n "429" app/api/listings/upload/route.ts` finds status code
- `grep -n "429" app/api/documents/generate/route.ts` finds status code
- File still compiles: `npx tsc --noEmit`
  </verify>
  <done>Both routes have rate limiting (10 req/min), return 429 when exceeded</done>
</task>

<task type="auto">
  <name>Task 4: Optimize bundle size with dynamic imports in document-preview.tsx</name>
  <files>components/document-preview.tsx</files>
  <action>
Replace static imports (lines 17 and 23) with dynamic imports to reduce initial bundle size.

At top of file (after existing imports around line 12), add:
```ts
import dynamic from "next/dynamic";
```

Replace line 17:
```ts
import { CodeEditor } from "./code-editor";
```
With:
```ts
const CodeEditor = dynamic(
  () => import("./code-editor").then((mod) => ({ default: mod.CodeEditor })),
  { ssr: false }
);
```

Replace line 23:
```ts
import { Editor } from "./text-editor";
```
With:
```ts
const Editor = dynamic(
  () => import("./text-editor").then((mod) => ({ default: mod.Editor })),
  { ssr: false }
);
```

This defers loading of CodeMirror (~500KB) and ProseMirror (~1.3MB) until components are actually rendered.
  </action>
  <verify>
- `grep -n "import dynamic from" components/document-preview.tsx` finds import
- `grep -n "dynamic(" components/document-preview.tsx | wc -l` returns 2 (two dynamic imports)
- `grep -n 'import { CodeEditor }' components/document-preview.tsx` returns empty (removed)
- `grep -n 'import { Editor }' components/document-preview.tsx` returns empty (removed)
- File still compiles: `npx tsc --noEmit`
  </verify>
  <done>Heavy editors (CodeMirror, ProseMirror) now lazy-loaded, reducing initial bundle size</done>
</task>

</tasks>

<verification>
Run comprehensive checks:
```bash
# 1. No hardcoded JWTs in codebase
grep -r "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" tests/ --include="*.ts" --include="*.tsx"

# 2. No setInterval in rate-limit.ts
grep "setInterval" lib/rate-limit.ts

# 3. Rate limiting present in both routes
grep "rateLimit" app/api/listings/upload/route.ts
grep "rateLimit" app/api/documents/generate/route.ts

# 4. Dynamic imports in document-preview
grep "next/dynamic" components/document-preview.tsx

# 5. TypeScript compilation
npx tsc --noEmit
```
</verification>

<success_criteria>
- [ ] No hardcoded service_role JWTs found in codebase
- [ ] No setInterval memory leak in rate-limit.ts
- [ ] Both upload and document routes return 429 when rate limit exceeded
- [ ] Document preview uses dynamic imports for CodeEditor and Editor
- [ ] All TypeScript files compile without errors
- [ ] Each fix has its own atomic commit
</success_criteria>

<output>
After completion, create `.planning/quick/11-fix-all-5-audit-findings-hardcoded-servi/11-SUMMARY.md`
</output>
