---
phase: quick-14
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/api/admin/prompts/route.ts
  - app/api/documents/generate/route.ts
  - supabase/functions/sophia-bot/utils/wasend.ts
  - .mcp.json
  - CLAUDE.md
autonomous: true

must_haves:
  truths:
    - Admin prompt creation with invalid data returns 400 with validation errors
    - WaSend API calls automatically retry on 5xx errors and network failures
    - Dead code files are removed from codebase
    - MCP config includes all three servers (Supabase, Postman, Railway)
    - CLAUDE.md references correct file paths
  artifacts:
    - path: app/api/admin/prompts/route.ts
      provides: Zod validation for POST endpoint
      contains: "z.object"
    - path: supabase/functions/sophia-bot/utils/wasend.ts
      provides: withRetry wrapper around WaSend calls
      contains: "withRetry"
    - path: .mcp.json
      provides: Complete MCP server config
      contains: "supabase-mcp-server"
  key_links:
    - from: app/api/admin/prompts/route.ts
      to: zod
      via: safeParse validation
      pattern: "\\.safeParse\\("
    - from: supabase/functions/sophia-bot/utils/wasend.ts
      to: supabase/functions/sophia-bot/utils/retry.ts
      via: withRetry import
      pattern: "import.*withRetry.*from.*retry"
---

<objective>
Fix top 3 audit findings from deep project audit (2026-03-01): add Zod validation to unvalidated admin endpoints (SECURITY), add retry logic for WaSender API calls (RESILIENCE), and cleanup dead code + fix documentation (CODE QUALITY).

Purpose: Harden production security, improve reliability of WhatsApp messaging, remove technical debt
Output: Validated admin endpoints, resilient WaSend client, cleaner codebase, accurate documentation
</objective>

<execution_context>
@/home/qualia/.claude/get-shit-done/workflows/execute-plan.md
@/home/qualia/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md

# Reference implementations
@app/api/admin/agents/route.ts
@lib/zyprus/client.ts
@supabase/functions/sophia-bot/utils/retry.ts

# Files to modify
@app/api/admin/prompts/route.ts
@app/api/documents/generate/route.ts
@supabase/functions/sophia-bot/utils/wasend.ts
@.mcp.json
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Zod validation to admin API endpoints</name>
  <files>
    app/api/admin/prompts/route.ts
    app/api/documents/generate/route.ts
  </files>
  <action>
**Fix 1: app/api/admin/prompts/route.ts**
Currently the POST handler (if it exists) has NO Zod validation. Add:

1. Import zod: `import { z } from "zod"`
2. Create schema BEFORE the POST handler:
   ```typescript
   const promptSchema = z.object({
     key: z.string().min(1, "Key is required"),
     content: z.string().min(1, "Content is required"),
     priority: z.number().int().optional(),
     category: z.string().optional(),
   });
   ```
3. In POST handler (if exists, otherwise skip this file):
   - Parse request body: `const body = await request.json()`
   - Validate: `const result = promptSchema.safeParse(body)`
   - If validation fails: return `NextResponse.json({ error: "Validation failed", details: result.error.flatten() }, { status: 400 })`
   - If valid: use `result.data` for DB insert

Mirror the exact pattern from `app/api/admin/agents/route.ts` which uses `createAgentSchema.safeParse()`.

**Fix 2: app/api/documents/generate/route.ts**
Check if this file already has Zod validation:
- If it has `z.object()` and `.safeParse()` → skip (already validated)
- If NOT → add Zod schema for all accepted fields (inspect the route to see what fields it accepts from request body)

Return 400 with validation errors on failure, following the same pattern as admin/agents.
  </action>
  <verify>
1. Grep for safeParse in both files: `grep -n "safeParse" app/api/admin/prompts/route.ts app/api/documents/generate/route.ts`
2. Check TypeScript compiles: `npx tsc --noEmit`
3. Verify validation returns 400 for invalid input (test if possible, or inspect code logic)
  </verify>
  <done>
- Both files have Zod schemas defined
- Both files use `.safeParse()` to validate request bodies
- Invalid requests return 400 with error details
- TypeScript compilation passes
  </done>
</task>

<task type="auto">
  <name>Task 2: Add retry logic for WaSender API calls</name>
  <files>supabase/functions/sophia-bot/utils/wasend.ts</files>
  <action>
Currently WaSender calls are fire-and-forget. Wrap them with the existing `withRetry()` utility from `supabase/functions/sophia-bot/utils/retry.ts`.

**Steps:**

1. **Import withRetry at top of file:**
   ```typescript
   import { withRetry } from "./retry.ts";
   ```

2. **Wrap the fetch call in sendTextMessage() (line ~28-38):**
   Replace the direct fetch with:
   ```typescript
   const sendRes = await withRetry(
     () => fetch(sendUrl, {
       method: "POST",
       headers: {
         "Authorization": `Bearer ${WASEND_API_KEY}`,
         "Content-Type": "application/json",
       },
       body: JSON.stringify({
         to: phoneNumber,
         text: text,
       }),
     }),
     { maxRetries: 2, baseDelayMs: 1000, maxDelayMs: 5000 },
     "wasend-send-text"
   );
   ```

3. **Wrap the fetch call in sendDocxFile() (line ~189-201):**
   Same pattern:
   ```typescript
   const sendRes = await withRetry(
     () => fetch(sendUrl, { /* same config */ }),
     { maxRetries: 2, baseDelayMs: 1000, maxDelayMs: 5000 },
     "wasend-send-docx"
   );
   ```

4. **Wrap the fetch call in sendLogoImage() (line ~303-314):**
   Same pattern:
   ```typescript
   const sendRes = await withRetry(
     () => fetch(sendUrl, { /* same config */ }),
     { maxRetries: 2, baseDelayMs: 1000, maxDelayMs: 5000 },
     "wasend-send-logo"
   );
   ```

**Config rationale:**
- maxRetries: 2 (matches Zyprus API pattern in lib/zyprus/client.ts:634-657)
- Only retries on 5xx/network errors (withRetry already handles this via isRetryableError)
- Does NOT retry 429 (rate limit) — existing rate limit handling stays in place
- Logs failures after all retries exhausted (withRetry handles logging)

**Do NOT touch:**
- Existing 429 rate limit retry logic (lines 46-83, 208-225) — keep as-is
- Error handling try-catch blocks — keep as-is
  </action>
  <verify>
1. Check imports: `grep -n "import.*withRetry" supabase/functions/sophia-bot/utils/wasend.ts`
2. Verify all 3 fetch calls wrapped: `grep -n "withRetry" supabase/functions/sophia-bot/utils/wasend.ts` (should show 3 usages)
3. Deploy Edge Function: `supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx`
4. Check deployment success (no errors in output)
  </verify>
  <done>
- withRetry imported from retry.ts
- All 3 WaSend fetch calls wrapped with withRetry
- Retry config: 2 retries, exponential backoff (1s base, 5s max)
- Edge Function deployed successfully
- Rate limit handling (429) preserved as-is
  </done>
</task>

<task type="auto">
  <name>Task 3: Dead code cleanup + documentation fixes</name>
  <files>
    lib/whatsapp/template-manager.ts
    lib/ai/template-manager.ts
    .mcp.json
    CLAUDE.md
  </files>
  <action>
**3a. Delete orphaned files (0 imports found):**
```bash
rm lib/whatsapp/template-manager.ts
rm lib/ai/template-manager.ts
```

**3b. Fix .mcp.json:**
Current `.mcp.json` only has Postman + Railway. Add Supabase MCP server.

Read current `.mcp.json`, then merge in:
```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "supabase-mcp-server@latest", "--project-ref", "vceeheaxcrhmpqueudqx"]
    }
  }
}
```
Preserve existing Postman and Railway entries — don't overwrite them. Result should have all 3 servers.

**3c. Fix CLAUDE.md:**
Two fixes:

1. **Quick Reference table:** Change `docs/ARCHITECTURE.md` → `.planning/codebase/ARCHITECTURE.md` (actual location)
2. **Remove skills line:** Delete the entire line: `| Skills | sofia-debugger, cyprus-calculator |`

Those skills don't exist, so remove the reference completely.
  </action>
  <verify>
1. Confirm files deleted: `ls lib/whatsapp/template-manager.ts lib/ai/template-manager.ts 2>&1` (should show "No such file")
2. Verify .mcp.json has 3 servers: `cat .mcp.json | grep -E "(supabase|postman|railway)"`
3. Verify CLAUDE.md changes:
   - `grep "\.planning/codebase/ARCHITECTURE\.md" CLAUDE.md` (should find it)
   - `grep "sofia-debugger\|cyprus-calculator" CLAUDE.md` (should return nothing)
4. Run TypeScript check: `npx tsc --noEmit`
  </verify>
  <done>
- lib/whatsapp/template-manager.ts deleted
- lib/ai/template-manager.ts deleted
- .mcp.json includes all 3 MCP servers (Supabase, Postman, Railway)
- CLAUDE.md Quick Reference points to correct ARCHITECTURE.md path
- CLAUDE.md skills reference removed
- TypeScript compilation passes
  </done>
</task>

</tasks>

<verification>
**Post-task checks:**

1. **Security:** Admin endpoints reject invalid input with 400 + error details
2. **Resilience:** WaSender calls retry on 5xx/network errors (2 retries max)
3. **Code Quality:** Dead code removed, documentation accurate, TypeScript clean
4. **No regressions:** Existing rate limit handling (429) preserved
5. **Deployment:** Edge Function deployed successfully if wasend.ts modified
</verification>

<success_criteria>
- [ ] Zod validation in app/api/admin/prompts/route.ts returns 400 for invalid input
- [ ] Zod validation checked in app/api/documents/generate/route.ts (added if missing)
- [ ] WaSender API calls wrapped with withRetry (2 retries, exponential backoff)
- [ ] Edge Function sophia-bot deployed successfully
- [ ] lib/whatsapp/template-manager.ts and lib/ai/template-manager.ts deleted
- [ ] .mcp.json has 3 servers (Supabase, Postman, Railway)
- [ ] CLAUDE.md Quick Reference points to .planning/codebase/ARCHITECTURE.md
- [ ] CLAUDE.md skills reference removed
- [ ] `npx tsc --noEmit` passes with 0 errors
- [ ] All changes committed with descriptive messages (one commit per fix)
</success_criteria>

<output>
After completion, create `.planning/quick/14-fix-top-3-audit-findings-zod-validation-/14-SUMMARY.md`

Summary should include:
- Before/after state for each fix
- Validation example (what 400 response looks like)
- Retry config used for WaSender
- Files deleted
- Documentation corrections made
</output>
