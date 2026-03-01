---
phase: quick-9
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/functions/sophia-bot/handlers/webhook.ts
  - supabase/functions/sophia-bot/services/ai-chat.ts
  - lib/zyprus/client.ts
  - app/(admin)/admin/activity/page.tsx
  - app/(admin)/admin/page.tsx
  - app/(admin)/admin/agents-registry/regional-offices/page.tsx
  - app/(admin)/admin/agents-registry/page.tsx
  - app/(admin)/admin/agents-registry/[id]/page.tsx
  - app/(admin)/admin/prompts/page.tsx
  - app/(admin)/admin/prompts/[key]/page.tsx
  - app/(admin)/admin/prompts/[key]/history/page.tsx
autonomous: true
---

<objective>
Fix 4 production readiness issues identified in audit and verify Supabase database health.

Purpose: Eliminate error handling gaps that could cause silent failures or timeouts in production
Output: All admin components explicitly enforce server-side execution, all fetch calls have timeout protection, all critical operations have error handling
</objective>

<execution_context>
@/home/qualia/.claude/get-shit-done/workflows/execute-plan.md
@/home/qualia/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md

# Audit findings
Issues identified:
1. webhook.ts:176 - getHistory() missing .catch() handler
2. ai-chat.ts:486 & 607 - executeTool() calls missing try-catch wrapper
3. zyprus/client.ts:393 & 922 - Image download fetch() missing timeout
4. Admin components - Missing explicit "server-only" imports (already protected via lib/supabase/admin.ts but should be explicit)

# Related files
@supabase/functions/sophia-bot/handlers/webhook.ts
@supabase/functions/sophia-bot/services/ai-chat.ts
@lib/zyprus/client.ts
@lib/supabase/admin.ts
</context>

<tasks>

<task type="auto">
  <name>Fix error handling gaps and add fetch timeouts</name>
  <files>
    supabase/functions/sophia-bot/handlers/webhook.ts
    supabase/functions/sophia-bot/services/ai-chat.ts
    lib/zyprus/client.ts
  </files>
  <action>
**1. webhook.ts (line 176):**
Already has .catch() on getHistory() - verify it handles errors correctly (returns empty array or null on failure)

**2. ai-chat.ts (lines 486 & 607):**
Wrap both executeTool() calls in try-catch blocks. On error, log the failure and add error message to tool results array so AI can see what failed.

Pattern:
```typescript
try {
  const toolResult = await executeTool(...);
  toolCallResults.push(toolResult);
} catch (error) {
  logger.error(`Tool execution failed: ${toolName}`, { error, category: LogCategory.ERROR });
  toolCallResults.push({
    toolCallId: toolCall.id,
    result: `Error executing ${toolName}: ${error instanceof Error ? error.message : String(error)}`
  });
}
```

**3. zyprus/client.ts (lines 393 & 922):**
Add timeout to image download fetch calls using AbortSignal.timeout(). Use 30 seconds (reasonable for image downloads, but prevents indefinite hangs).

Pattern:
```typescript
const imageResponse = await fetch(directUrl, {
  signal: AbortSignal.timeout(30000) // 30 second timeout
});
```

Apply to both locations (property image upload ~line 393, land image upload ~line 922).
  </action>
  <verify>
```bash
# Verify error handling added
grep -A5 "executeTool" supabase/functions/sophia-bot/services/ai-chat.ts | grep -c "try"  # Should be 2+
grep -A2 "await fetch(directUrl" lib/zyprus/client.ts | grep -c "AbortSignal.timeout"  # Should be 2

# Type check
npx tsc --noEmit
```
  </verify>
  <done>
- webhook.ts getHistory() error handling verified
- Both executeTool() calls wrapped in try-catch with error logging
- Both image fetch calls have 30-second timeout protection
- TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Add explicit server-only imports to admin components</name>
  <files>
    app/(admin)/admin/activity/page.tsx
    app/(admin)/admin/page.tsx
    app/(admin)/admin/agents-registry/regional-offices/page.tsx
    app/(admin)/admin/agents-registry/page.tsx
    app/(admin)/admin/agents-registry/[id]/page.tsx
    app/(admin)/admin/prompts/page.tsx
    app/(admin)/admin/prompts/[key]/page.tsx
    app/(admin)/admin/prompts/[key]/history/page.tsx
  </files>
  <action>
Add `import "server-only";` as the first import in each admin page component that uses getAdminSupabase().

This provides defense in depth - even though lib/supabase/admin.ts already has server-only protection, explicit imports at the usage site make the constraint visible and prevent accidental client-side execution if the component is refactored.

Add as first line (before all other imports) in each file.
  </action>
  <verify>
```bash
# Verify all admin pages have server-only import
find app/\(admin\)/admin -name "page.tsx" -exec grep -L "^import \"server-only\"" {} \;  # Should be empty

# Type check
npx tsc --noEmit
```
  </verify>
  <done>
- All 8 admin page components have `import "server-only";` as first import
- Build-time protection against accidental client-side execution
- TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Check Supabase database advisors</name>
  <files></files>
  <action>
Check Supabase project advisors for any warnings or performance issues.

```bash
# Check database advisors
supabase inspect db --project-ref vceeheaxcrhmpqueudqx --db-url "postgresql://postgres.[project-id]:[password]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"
```

If no direct CLI support, check via Dashboard API or skip if blocked. Document any findings.
  </action>
  <verify>
Advisors checked, any warnings documented in summary
  </verify>
  <done>
Database advisors checked via Supabase Dashboard or CLI, results documented
  </done>
</task>

</tasks>

<verification>
- [ ] All executeTool() calls have error handling (try-catch)
- [ ] Image downloads have timeout protection (30s)
- [ ] All admin components have explicit server-only imports
- [ ] TypeScript compilation passes
- [ ] Database advisors checked
</verification>

<success_criteria>
- No unhandled promise rejections in webhook or AI chat services
- Image downloads cannot hang indefinitely
- Admin components cannot accidentally bundle on client
- Production readiness test suite identifies no new critical issues
</success_criteria>

<output>
After completion, create `.planning/quick/9-fix-4-production-readiness-issues-from-a/9-SUMMARY.md`
</output>
