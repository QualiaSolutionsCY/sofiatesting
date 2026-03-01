---
phase: quick-13
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - package-lock.json
  - eslint.config.mjs
  - app/(chat)/chat/loading.tsx
  - app/(admin)/admin/loading.tsx
  - app/properties/loading.tsx
autonomous: true

must_haves:
  truths:
    - "npm audit shows 0 high severity vulnerabilities"
    - "Chat, admin, and properties routes display loading skeleton while page loads"
    - "ESLint runs without 'no-undef' errors on Edge Function files"
  artifacts:
    - path: "package-lock.json"
      provides: "Updated dependencies with security fixes"
      contains: "minimatch"
    - path: "app/(chat)/chat/loading.tsx"
      provides: "Chat loading skeleton"
      min_lines: 10
    - path: "app/(admin)/admin/loading.tsx"
      provides: "Admin dashboard loading skeleton"
      min_lines: 10
    - path: "app/properties/loading.tsx"
      provides: "Properties listing loading skeleton"
      min_lines: 10
    - path: "eslint.config.mjs"
      provides: "Deno/Node globals for Edge Functions"
      contains: "globals"
  key_links:
    - from: "eslint.config.mjs"
      to: "supabase/functions/**/*.ts"
      via: "global declarations"
      pattern: "globals.*console|fetch"
---

<objective>
Fix 3 audit findings to improve security, UX, and developer experience.

Purpose: Address remaining audit items from v1.4 milestone
Output: Security patches applied, loading states added, ESLint errors resolved
</objective>

<execution_context>
@/home/qualia/.claude/get-shit-done/workflows/execute-plan.md
@/home/qualia/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md

@eslint.config.mjs
@app/(chat)/chat/page.tsx
@app/(admin)/admin/page.tsx
@app/properties/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix npm audit vulnerabilities</name>
  <files>package.json, package-lock.json</files>
  <action>
Run `npm audit fix` to resolve 11 vulnerabilities (2 high: minimatch ReDoS CVE-2024-4067, rollup path traversal; 9 moderate: esbuild dev server request bypass).

These are dev/build-time dependencies (not runtime), so applying automated fixes is safe.

Verify post-fix:
- `npm audit` shows 0 high severity vulns
- Dev server still runs (`npm run dev`)
- Build succeeds (`npm run build`)
  </action>
  <verify>
```bash
npm audit fix
npm audit | grep -E "high|critical|vulnerabilities"
npm run build
```
  </verify>
  <done>High severity vulnerabilities eliminated, build passes</done>
</task>

<task type="auto">
  <name>Task 2: Add loading.tsx Suspense boundaries</name>
  <files>app/(chat)/chat/loading.tsx, app/(admin)/admin/loading.tsx, app/properties/loading.tsx</files>
  <action>
Create 3 loading skeleton components for Next.js Suspense boundaries:

**app/(chat)/chat/loading.tsx** — Chat interface skeleton
- Container with header skeleton (40px height)
- Message list skeleton (3-4 message bubbles with shimmer animation)
- Input box skeleton at bottom
- Use Tailwind `animate-pulse` for shimmer

**app/(admin)/admin/loading.tsx** — Admin dashboard skeleton
- Header with title skeleton
- Grid layout (2x2 cards on desktop, stacked on mobile)
- Card skeletons with header + content areas
- Stats bar skeleton at top

**app/properties/loading.tsx** — Properties listing skeleton
- Search bar skeleton at top
- Grid of property card skeletons (3 cols on lg, 1 on mobile)
- Each card: image placeholder (aspect-ratio-video), title/price/location text lines

All skeletons should:
- Be server components (default export)
- Match parent page layout structure
- Use `animate-pulse` for loading effect
- Have semantic class names for debugging
  </action>
  <verify>
```bash
# Files created
ls app/\(chat\)/chat/loading.tsx
ls app/\(admin\)/admin/loading.tsx
ls app/properties/loading.tsx

# Verify they're valid React components
grep -l "export default" app/\(chat\)/chat/loading.tsx app/\(admin\)/admin/loading.tsx app/properties/loading.tsx

# Build check (ensures no syntax errors)
npm run build
```
  </verify>
  <done>3 loading.tsx files exist, build passes, skeletons render during page load</done>
</task>

<task type="auto">
  <name>Task 3: Fix ESLint config for Deno/Edge Function globals</name>
  <files>eslint.config.mjs</files>
  <action>
Add global declarations to ESLint config to eliminate 104 `no-undef` errors on Edge Function files.

**Problem:** Edge Functions run in Deno (not Node), and scripts/lib files use Node globals. ESLint doesn't recognize `console`, `fetch`, `process`, `__dirname`, `require` without explicit globals.

**Solution:** Add `languageOptions.globals` object to the main config block:

```typescript
import globals from 'globals'; // Add import at top

{
  files: ['**/*.ts', '**/*.tsx'],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { /* existing */ },
    globals: {
      ...globals.node,      // Node globals for scripts/lib
      ...globals.browser,   // Browser globals for client components
      fetch: 'readonly',    // Deno global
      Deno: 'readonly',     // Deno namespace
    },
  },
  rules: { /* existing */ }
}
```

**Why both Node + Browser:** Edge Functions use Deno (Web APIs like `fetch`), scripts use Node (`process`, `require`), client components use browser APIs.

Run `npm install globals` if not already installed.

Verify:
- `npx eslint supabase/functions/sophia-bot/index.ts` shows 0 `no-undef` errors
- `npx eslint scripts/check-db-sync.ts` shows 0 `no-undef` errors
  </action>
  <verify>
```bash
# Install globals package if needed
npm install --save-dev globals

# Test ESLint on Edge Function file
npx eslint supabase/functions/sophia-bot/index.ts 2>&1 | grep -c "no-undef" || echo "0 no-undef errors"

# Test on script file
npx eslint scripts/check-db-sync.ts 2>&1 | grep -c "no-undef" || echo "0 no-undef errors"

# Full lint check
npm run lint
```
  </verify>
  <done>ESLint recognizes Deno and Node globals, no 'no-undef' errors on Edge Function or script files</done>
</task>

</tasks>

<verification>
**Security:** `npm audit` shows 0 high severity vulnerabilities
**UX:** Navigate to /chat, /admin, /properties — loading skeleton appears during page load
**DX:** `npm run lint` completes without 'no-undef' errors in Edge Functions or scripts
</verification>

<success_criteria>
- [ ] npm audit shows 0 high severity vulnerabilities (minimatch + rollup fixed)
- [ ] 3 loading.tsx files created with Suspense-compatible skeletons
- [ ] ESLint config includes Deno + Node globals
- [ ] `npm run lint` passes with 0 'no-undef' errors
- [ ] `npm run build` succeeds
- [ ] All changes committed to git
</success_criteria>

<output>
After completion, create `.planning/quick/13-fix-3-audit-findings-npm-audit-fix-2-hig/13-SUMMARY.md`
</output>
