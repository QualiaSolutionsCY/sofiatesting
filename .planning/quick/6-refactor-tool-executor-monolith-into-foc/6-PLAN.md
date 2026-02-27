---
phase: quick-6
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/functions/sophia-bot/tools/executor.ts
  - supabase/functions/sophia-bot/tools/handlers/property-listing.ts
  - supabase/functions/sophia-bot/tools/handlers/calculators.ts
  - supabase/functions/sophia-bot/tools/handlers/data-retrieval.ts
  - supabase/functions/sophia-bot/tools/handlers/email.ts
  - supabase/functions/sophia-bot/tools/validators/location.ts
  - supabase/functions/sophia-bot/tools/validators/upload-lock.ts
autonomous: true

must_haves:
  truths:
    - "All existing tool calls (createPropertyListing, sendEmail, calculators, etc.) work identically"
    - "Main executor.ts is < 300 lines (from 1,929)"
    - "Each handler module has single responsibility"
    - "No runtime errors in sophia-bot Edge Function"
  artifacts:
    - path: "supabase/functions/sophia-bot/tools/executor.ts"
      provides: "Main tool router (delegates to handlers)"
      max_lines: 300
    - path: "supabase/functions/sophia-bot/tools/handlers/property-listing.ts"
      provides: "handleCreatePropertyListing implementation"
      exports: ["handleCreatePropertyListing"]
    - path: "supabase/functions/sophia-bot/tools/handlers/calculators.ts"
      provides: "Calculator tool handlers"
      exports: ["handleCalculateVAT", "handleCalculateTransferFees", "handleCalculateCapitalGains"]
    - path: "supabase/functions/sophia-bot/tools/handlers/data-retrieval.ts"
      provides: "Data retrieval handlers"
      exports: ["handleGetZyprusData", "handleGetRegionalAgents", "handleExtractFromBazaraki"]
    - path: "supabase/functions/sophia-bot/tools/handlers/email.ts"
      provides: "Email sending handler"
      exports: ["handleSendEmail"]
    - path: "supabase/functions/sophia-bot/tools/validators/location.ts"
      provides: "Location validation utilities"
      exports: ["extractAreaFromGoogleMapsUrl", "isCityOnlyLocation", "isStreetAddress", "isLocationAStreetInUrl"]
    - path: "supabase/functions/sophia-bot/tools/validators/upload-lock.ts"
      provides: "Upload lock management"
      exports: ["acquireUploadLock"]
  key_links:
    - from: "supabase/functions/sophia-bot/services/ai-chat.ts"
      to: "executeTool"
      via: "import from tools/executor.ts"
      pattern: "import.*executeTool.*from.*tools/executor"
    - from: "supabase/functions/sophia-bot/tools/executor.ts"
      to: "handlers/*"
      via: "import and delegate"
      pattern: "import.*from.*handlers/"
---

<objective>
Refactor the 1,929-line tool executor monolith into focused modules with single responsibilities.

**Purpose:** Improve maintainability and reduce cognitive load by breaking down a massive file into logical handler modules.

**Output:** Clean executor.ts (< 300 lines) that routes to handler modules, preserving all functionality.
</objective>

<execution_context>
@/home/qualia/.claude/get-shit-done/workflows/execute-plan.md
@/home/qualia/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/home/qualia/Desktop/Projects/aiagents/sofiatesting/supabase/functions/sophia-bot/tools/executor.ts
@/home/qualia/Desktop/Projects/aiagents/sofiatesting/supabase/functions/sophia-bot/services/ai-chat.ts
@/home/qualia/Desktop/Projects/aiagents/sofiatesting/CLAUDE.md

# Key Constraints
- Deno Edge Function runtime (import maps, not node_modules)
- Must maintain exact export signatures: executeTool, ToolResult, ToolCall
- Service is LIVE in production (sophia-bot Edge Function)
- No behavior changes allowed - pure refactor
</context>

<tasks>

<task type="auto">
  <name>Extract location validators to dedicated module</name>
  <files>
    supabase/functions/sophia-bot/tools/validators/location.ts
    supabase/functions/sophia-bot/tools/validators/upload-lock.ts
  </files>
  <action>
**Step 1:** Create `validators/location.ts`:
- Move functions: extractAreaFromGoogleMapsUrl (lines 32-116), isCityOnlyLocation (122-135), isStreetAddress (141-193), isLocationAStreetInUrl (200-232), isDocumentUrl (238-258)
- Export all five functions
- Add JSDoc comments at module level

**Step 2:** Create `validators/upload-lock.ts`:
- Move function: acquireUploadLock (lines 265-312)
- Move UPLOAD_LOCK_DURATION_MS import from config/business-rules.ts
- Export acquireUploadLock
- Keep Supabase client creation logic intact

**Why:** These are pure utility functions with no business logic coupling - ideal for extraction.
  </action>
  <verify>
```bash
# Verify exports exist
grep -q "export function extractAreaFromGoogleMapsUrl" supabase/functions/sophia-bot/tools/validators/location.ts
grep -q "export async function acquireUploadLock" supabase/functions/sophia-bot/tools/validators/upload-lock.ts

# Verify no syntax errors (Deno check)
deno check supabase/functions/sophia-bot/tools/validators/location.ts
deno check supabase/functions/sophia-bot/tools/validators/upload-lock.ts
```
  </verify>
  <done>
- validators/location.ts exists with 5 exported functions
- validators/upload-lock.ts exists with acquireUploadLock export
- No TypeScript errors in either file
  </done>
</task>

<task type="auto">
  <name>Extract handler functions to focused modules</name>
  <files>
    supabase/functions/sophia-bot/tools/handlers/property-listing.ts
    supabase/functions/sophia-bot/tools/handlers/calculators.ts
    supabase/functions/sophia-bot/tools/handlers/data-retrieval.ts
    supabase/functions/sophia-bot/tools/handlers/email.ts
  </files>
  <action>
**Step 1:** Create `handlers/property-listing.ts`:
- Move handleCreatePropertyListing function (lines 442-1341)
- Import ToolResult type from ../executor.ts (temporarily, will be in types later)
- Import all dependencies: Agent, validators, services, Zyprus client, business rules
- Import location validators from ../validators/location.ts
- Import acquireUploadLock from ../validators/upload-lock.ts
- Export handleCreatePropertyListing

**Step 2:** Create `handlers/calculators.ts`:
- Move functions: handleCalculateVAT (1510-1580), calculateBandedFee (1586-1594), handleCalculateTransferFees (1601-1649), handleCalculateCapitalGains (1655-1701)
- Import ToolResult type
- Export all three handle* functions (calculateBandedFee is internal helper)

**Step 3:** Create `handlers/data-retrieval.ts`:
- Move functions: handleGetZyprusData (1430-1493), handleGetRegionalAgents (1346-1381), handleExtractFromBazaraki (1386-1425)
- Import ToolResult, logger, taxonomy loaders, agent identifier
- Export all three functions

**Step 4:** Create `handlers/email.ts`:
- Move handleSendEmail function (lines 1708-1928)
- Import ToolResult, Agent, logger, getLastDocument from _shared/db.ts
- Export handleSendEmail

**Critical:** Preserve all imports, helper functions, and business logic exactly. Do NOT simplify or "improve" - this is a pure extraction refactor.
  </action>
  <verify>
```bash
# Verify all handlers exist with correct exports
grep -q "export async function handleCreatePropertyListing" supabase/functions/sophia-bot/tools/handlers/property-listing.ts
grep -q "export function handleCalculateVAT" supabase/functions/sophia-bot/tools/handlers/calculators.ts
grep -q "export async function handleGetZyprusData" supabase/functions/sophia-bot/tools/handlers/data-retrieval.ts
grep -q "export async function handleSendEmail" supabase/functions/sophia-bot/tools/handlers/email.ts

# Verify no syntax errors
deno check supabase/functions/sophia-bot/tools/handlers/property-listing.ts
deno check supabase/functions/sophia-bot/tools/handlers/calculators.ts
deno check supabase/functions/sophia-bot/tools/handlers/data-retrieval.ts
deno check supabase/functions/sophia-bot/tools/handlers/email.ts
```
  </verify>
  <done>
- All four handler modules exist with proper exports
- No TypeScript compilation errors
- All dependencies correctly imported
  </done>
</task>

<task type="auto">
  <name>Refactor executor.ts into slim router</name>
  <files>
    supabase/functions/sophia-bot/tools/executor.ts
  </files>
  <action>
**Step 1:** Update imports in executor.ts:
- Remove all handler function implementations (they're now in handlers/*)
- Import validators from ./validators/location.ts and ./validators/upload-lock.ts
- Import handlers: `import { handleCreatePropertyListing } from "./handlers/property-listing.ts";`
- Import calculators: `import { handleCalculateVAT, handleCalculateTransferFees, handleCalculateCapitalGains } from "./handlers/calculators.ts";`
- Import data retrieval: `import { handleGetZyprusData, handleGetRegionalAgents, handleExtractFromBazaraki } from "./handlers/data-retrieval.ts";`
- Import email: `import { handleSendEmail } from "./handlers/email.ts";`

**Step 2:** Delete extracted code:
- Remove lines 32-312 (validators and upload lock - now in validators/*)
- Remove lines 442-1928 (all handler implementations - now in handlers/*)
- Keep only: interfaces (ToolResult, ToolCall), executeTool function

**Step 3:** Verify executeTool switch statement still delegates correctly:
- createPropertyListing → handleCreatePropertyListing
- getZyprusData → handleGetZyprusData
- calculateVAT → handleCalculateVAT
- calculateTransferFees → handleCalculateTransferFees
- calculateCapitalGains → handleCalculateCapitalGains
- getRegionalAgents → handleGetRegionalAgents
- extractFromBazaraki → handleExtractFromBazaraki
- sendEmail → handleSendEmail

**Result:** executor.ts should be ~200-250 lines (interfaces + executeTool router + analytics tracking).

**Why import location validators:** Some validation logic might still be referenced in executor.ts error handling or logging - keep imports to prevent breakage.
  </action>
  <verify>
```bash
# Verify executor.ts is now small
lines=$(wc -l < supabase/functions/sophia-bot/tools/executor.ts)
if [ "$lines" -lt 350 ]; then
  echo "✓ executor.ts reduced to $lines lines"
else
  echo "✗ executor.ts still $lines lines (target: < 300)"
  exit 1
fi

# Verify exports are intact
grep -q "export interface ToolResult" supabase/functions/sophia-bot/tools/executor.ts
grep -q "export interface ToolCall" supabase/functions/sophia-bot/tools/executor.ts
grep -q "export async function executeTool" supabase/functions/sophia-bot/tools/executor.ts

# Verify TypeScript compilation
deno check supabase/functions/sophia-bot/tools/executor.ts

# CRITICAL: Verify ai-chat.ts still imports correctly
deno check supabase/functions/sophia-bot/services/ai-chat.ts
```
  </verify>
  <done>
- executor.ts is < 300 lines
- Exports ToolResult, ToolCall, executeTool interfaces unchanged
- All handler imports work correctly
- ai-chat.ts compiles without errors (dependency chain intact)
  </done>
</task>

</tasks>

<verification>
**Structural checks:**
```bash
# Verify new module structure
ls -lh supabase/functions/sophia-bot/tools/validators/
ls -lh supabase/functions/sophia-bot/tools/handlers/

# Verify line count reduction
echo "Before: 1,929 lines"
echo "After: $(wc -l < supabase/functions/sophia-bot/tools/executor.ts) lines"

# Verify all TypeScript compiles
deno check supabase/functions/sophia-bot/tools/executor.ts
deno check supabase/functions/sophia-bot/services/ai-chat.ts
```

**Integration test (if possible):**
```bash
# Deploy to Supabase (test environment if available)
# supabase functions deploy sophia-bot --project-ref vceeheaxcrhmpqueudqx
```
</verification>

<success_criteria>
**Code structure:**
- [ ] executor.ts reduced from 1,929 to < 300 lines
- [ ] Six new modules created (2 validators, 4 handlers)
- [ ] All exports (ToolResult, ToolCall, executeTool) unchanged
- [ ] No TypeScript compilation errors

**Functional integrity:**
- [ ] ai-chat.ts still imports executeTool successfully
- [ ] All tool switch cases route to correct handlers
- [ ] No runtime errors when running deno check

**Documentation:**
- [ ] Each new module has clear JSDoc explaining its purpose
</success_criteria>

<output>
After completion, create `.planning/quick/6-refactor-tool-executor-monolith-into-foc/6-SUMMARY.md`
</output>
