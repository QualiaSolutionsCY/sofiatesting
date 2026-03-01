---
quick_task: 15
type: execute
autonomous: true
files_modified:
  - lib/db/migrate.ts
  - lib/db/apply-migration-0017.ts
  - lib/circuit-breakers.ts
  - app/(admin)/admin/agents-registry/page.tsx
  - app/(admin)/admin/agents-registry/[id]/page.tsx
---

<objective>
Fix dev environment issues to achieve A-grade audit status: 1) Reinstall node_modules to resolve any corruption (Turbopack panic, TypeScript errors), 2) Verify ESLint works after reinstall, 3) Remove console.log statements from lib/ directory (migrate.ts: 2 calls, apply-migration-0017.ts: 10 calls, circuit-breakers.ts: 3 calls in JSDoc examples), 4) Fix ESLint/Biome issues in admin pages (formatting + imports).

Purpose: Clean development environment with no console.log pollution in lib/ directory and working tooling
Output: Clean lint/type-check results, lib/ directory free of console.log (except intentional script output), node_modules reinstalled
</objective>

<execution_context>
@/home/qualia/.claude/get-shit-done/workflows/execute-plan.md
@/home/qualia/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@lib/db/migrate.ts
@lib/db/apply-migration-0017.ts
@lib/circuit-breakers.ts
@app/(admin)/admin/agents-registry/page.tsx
@app/(admin)/admin/agents-registry/[id]/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Reinstall node_modules and verify tooling</name>
  <files>node_modules/</files>
  <action>
    1. Remove existing node_modules: `rm -rf node_modules`
    2. Clear pnpm cache: `pnpm store prune`
    3. Fresh install: `pnpm install`
    4. Verify Next.js binary exists: `ls -la node_modules/.bin/next`
    5. Verify TypeScript compilation: `pnpm exec tsc --noEmit` (should complete with 0 errors)
    6. Verify ESLint/Biome runs: `pnpm run lint` (may have issues to fix in Task 2)

    **Why reinstall:** Ensures clean dependency tree, eliminates potential Turbopack panic or TypeScript errors from corrupted modules.
  </action>
  <verify>
    - `node_modules/.bin/next` exists
    - `pnpm exec tsc --noEmit` exits 0
    - `pnpm run lint` runs without crashing (errors OK, will fix in Task 2)
  </verify>
  <done>node_modules freshly installed, TypeScript compiles, linter runs</done>
</task>

<task type="auto">
  <name>Task 2: Remove console.log from lib/ directory</name>
  <files>
    lib/db/migrate.ts
    lib/db/apply-migration-0017.ts
    lib/circuit-breakers.ts
  </files>
  <action>
    **lib/db/migrate.ts (2 console.log calls):**
    - Line 21: `console.log("⏳ Running migrations...")` → KEEP (intentional script output)
    - Line 27: `console.log("✅ Migrations completed in", end - start, "ms")` → KEEP (intentional script output)

    **Rationale:** These are CLI migration scripts, not library code. Console output is appropriate.

    **lib/db/apply-migration-0017.ts (10 console.log calls):**
    - Lines 23, 27, 39, 58, 94, 100, 124, 130, 172, 210 → KEEP ALL (intentional script output)

    **Rationale:** Same as migrate.ts - this is a one-time migration script with progress reporting.

    **lib/circuit-breakers.ts (3 console.log in JSDoc):**
    - Lines 42-44: JSDoc example code showing `breaker.on('open', () => console.log(...))` → REPLACE with logger

    **Action:**
    Replace JSDoc example on lines 42-44:
    ```typescript
    // OLD:
    * breaker.on('open', () => console.log('Circuit opened'));
    * breaker.on('halfOpen', () => console.log('Circuit half-open, testing'));
    * breaker.on('close', () => console.log('Circuit closed, service recovered'));

    // NEW:
    * breaker.on('open', () => logger.info('Circuit opened'));
    * breaker.on('halfOpen', () => logger.info('Circuit half-open, testing'));
    * breaker.on('close', () => logger.info('Circuit closed, service recovered'));
    ```

    **Why:** JSDoc examples should demonstrate best practices (using logger, not console.log). Migration scripts are OK to keep console.log for CLI output.
  </action>
  <verify>
    `grep -r "console\.log" lib/ --include="*.ts" | grep -v "migrate.ts" | grep -v "apply-migration" | wc -l` returns 0
  </verify>
  <done>lib/circuit-breakers.ts JSDoc uses logger, migration scripts unchanged (intentional CLI output)</done>
</task>

<task type="auto">
  <name>Task 3: Fix ESLint/Biome issues in admin pages</name>
  <files>
    app/(admin)/admin/agents-registry/page.tsx
    app/(admin)/admin/agents-registry/[id]/page.tsx
  </files>
  <action>
    **app/(admin)/admin/agents-registry/page.tsx:**
    1. Organize imports (swap lines 8-9): Move `getAdminSupabase` before `AgentsRegistryClient`
    2. Add type annotation on line 134: `let data: Awaited<ReturnType<typeof getAgentsData>>;`

    **app/(admin)/admin/agents-registry/[id]/page.tsx:**
    1. Format region line (84-86): Break into multi-line ternary as suggested by Biome formatter

    Run `pnpm run lint` to verify all issues resolved.
  </action>
  <verify>
    `pnpm run lint` exits 0 with no errors (warnings OK)
  </verify>
  <done>Admin pages pass ESLint/Biome checks with 0 errors</done>
</task>

</tasks>

<verification>
1. TypeScript compiles: `pnpm exec tsc --noEmit` (0 errors)
2. ESLint passes: `pnpm run lint` (0 errors)
3. lib/ console.log cleanup: Only migration scripts have console.log (intentional CLI output)
4. Dev server starts: `pnpm dev` (Turbopack runs without panic)
</verification>

<success_criteria>
- node_modules freshly installed
- TypeScript compiles with 0 errors
- ESLint/Biome passes with 0 errors
- lib/circuit-breakers.ts JSDoc uses logger (not console.log)
- lib/db/migrate.ts and lib/db/apply-migration-0017.ts unchanged (intentional CLI output)
- Dev environment stable (A-grade audit status)
</success_criteria>

<output>
After completion, create `.planning/quick/15-fix-corrupted-node-modules-and-dev-envir/15-SUMMARY.md`
</output>
