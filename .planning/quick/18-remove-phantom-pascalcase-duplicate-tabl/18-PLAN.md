---
phase: quick-18
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/db/schema.ts
  - lib/agents/identifier.ts
  - scripts/seed-agents.ts
  - scripts/check-agents.ts
  - lib/db/apply-migration-0017.ts
autonomous: true

must_haves:
  truths:
    - "TypeScript compilation succeeds with no type errors"
    - "All code references use snake_case table mappings (supabaseAgent, not zyprusAgent)"
    - "Phantom PascalCase duplicate definitions removed from schema.ts"
    - "AgentChatSession completely removed (phantom, unused)"
  artifacts:
    - path: "lib/db/schema.ts"
      provides: "Clean schema with only snake_case table definitions"
      min_lines: 520
      exports: ["supabaseAgent", "supabaseTelegramGroup", "supabaseTelegramLead", "supabaseLeadForwardingRotation", "SupabaseAgent", "SupabaseTelegramGroup", "SupabaseTelegramLead", "SupabaseLeadForwardingRotation"]
  key_links:
    - from: "lib/agents/identifier.ts"
      to: "supabaseAgent"
      via: "import from schema"
      pattern: "import.*supabaseAgent.*from.*schema"
    - from: "scripts/seed-agents.ts"
      to: "supabaseAgent"
      via: "import from schema"
      pattern: "import.*supabaseAgent.*from.*schema"
---

<objective>
Remove 5 phantom PascalCase duplicate table definitions from lib/db/schema.ts and migrate all code references to use the existing snake_case mappings (supabaseAgent, supabaseTelegramGroup, supabaseTelegramLead, supabaseLeadForwardingRotation).

Purpose: Eliminate schema/DB mismatch identified in quick-16. The PascalCase tables (ZyprusAgent, TelegramGroup, TelegramLead, LeadForwardingRotation) never existed in production — only the snake_case versions (agents, telegram_groups, telegram_leads, lead_forwarding_rotation) exist.

Output: Clean schema.ts with no duplicate definitions, all code using correct snake_case mappings, TypeScript compilation succeeding.
</objective>

<execution_context>
@/home/qualia/.claude/get-shit-done/workflows/execute-plan.md
@/home/qualia/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/quick/16-repair-supabase-migration-history-and-re/16-FINDINGS.md
@lib/db/schema.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove 5 phantom PascalCase duplicate table definitions from schema.ts</name>
  <files>lib/db/schema.ts</files>
  <action>
Remove the following 5 phantom table definitions from lib/db/schema.ts:

1. **ZyprusAgent** (lines 413-460) — includes table definition + type export
2. **AgentChatSession** (lines 463-505) — includes table definition + type export
3. **TelegramGroup** (lines 512-538) — includes table definition + type export
4. **TelegramLead** (lines 541-610) — includes table definition + type export
5. **LeadForwardingRotation** (lines 613-631) — includes table definition + type export

**CRITICAL:** Do NOT remove the snake_case versions (lines 681-771):
- supabaseAgent (line 681) — KEEP
- supabaseTelegramGroup (line 699) — KEEP
- supabaseTelegramLead (line 714) — KEEP
- supabaseTelegramGroupMessage (line 740) — KEEP
- supabaseLeadForwardingRotation (line 756) — KEEP

Keep the comment on line 408-406 explaining removed analytics tables.

After removal, the schema should flow: adminUserRole (line 385) → comment about analytics → ZYPRUS AGENT REGISTRY section header → supabaseAgent definition (currently line 681).
  </action>
  <verify>
```bash
# Verify phantom tables removed
! grep -n "export const zyprusAgent = pgTable" lib/db/schema.ts
! grep -n "export const agentChatSession = pgTable" lib/db/schema.ts
! grep -n "export const telegramGroup = pgTable" lib/db/schema.ts
! grep -n "export const telegramLead = pgTable" lib/db/schema.ts
! grep -n "export const leadForwardingRotation = pgTable" lib/db/schema.ts

# Verify phantom types removed
! grep -n "export type ZyprusAgent = " lib/db/schema.ts
! grep -n "export type AgentChatSession = " lib/db/schema.ts
! grep -n "export type TelegramGroup = " lib/db/schema.ts
! grep -n "export type TelegramLead = " lib/db/schema.ts
! grep -n "export type LeadForwardingRotation = " lib/db/schema.ts

# Verify snake_case tables still exist
grep -q "export const supabaseAgent = pgTable" lib/db/schema.ts
grep -q "export const supabaseTelegramGroup = pgTable" lib/db/schema.ts
grep -q "export const supabaseTelegramLead = pgTable" lib/db/schema.ts
grep -q "export const supabaseLeadForwardingRotation = pgTable" lib/db/schema.ts

echo "✓ Phantom tables removed, snake_case tables preserved"
```
  </verify>
  <done>
Schema.ts contains only snake_case table definitions (supabaseAgent, supabaseTelegramGroup, supabaseTelegramLead, supabaseLeadForwardingRotation). All 5 PascalCase duplicates removed.
  </done>
</task>

<task type="auto">
  <name>Task 2: Migrate all code references from phantom tables to snake_case mappings</name>
  <files>
lib/agents/identifier.ts
scripts/seed-agents.ts
scripts/check-agents.ts
lib/db/apply-migration-0017.ts
  </files>
  <action>
Update imports and references in 4 files:

**1. lib/agents/identifier.ts** (currently uses zyprusAgent, agentChatSession):
- Line 4: Change `import { agentChatSession, zyprusAgent }` → `import { supabaseAgent }`
- Remove agentChatSession entirely (phantom, not needed — this file tracks sessions via web app's chat table, not this phantom table)
- Replace all `zyprusAgent` variable refs → `supabaseAgent`
- Functions affected: identifyAgentByTelegram, identifyAgentByWhatsApp, identifyAgentByEmail, identifyAgentByUserId (all use zyprusAgent.select/update)
- **Remove entire agentChatSession tracking logic** (lines 177-296): trackAgentSession, updateAgentSessionStats, endAgentSession functions reference phantom table that doesn't exist in DB
- Keep IdentifiedAgent type as-is (interface, not tied to table)

**2. scripts/seed-agents.ts** (currently uses zyprusAgent):
- Line 4: Change `import { zyprusAgent }` → `import { supabaseAgent }`
- Line 128: Change `.insert(zyprusAgent)` → `.insert(supabaseAgent)`
- Line 130: Change `.returning({ id: zyprusAgent.id, email: zyprusAgent.email })` → `.returning({ id: supabaseAgent.id, email: supabaseAgent.email })`

**3. scripts/check-agents.ts** (defines own inline table schema):
- This file has its own inline `zyprusAgent` pgTable definition (lines 12-31) mapping to "ZyprusAgent" table name
- Change line 12: `pgTable("ZyprusAgent", {` → `pgTable("agents", {`
- Change all PascalCase column names to snake_case:
  - `userId` → `user_id`
  - `fullName` → `full_name`
  - `phoneNumber` → `phone_number` (but this field doesn't exist in agents table — use `mobile`)
  - `canReceiveLeads` → `can_receive_leads`
  - `telegramUserId` → `telegram_user_id`
  - `whatsappPhoneNumber` → `whatsapp_phone_number` (doesn't exist in agents table — remove)
  - `lastActiveAt` → `last_active_at` (doesn't exist — remove)
  - `registeredAt` → `registered_at` (doesn't exist — remove)
  - `inviteSentAt` → `invite_sent_at` (doesn't exist — remove)
  - `inviteToken` → `invite_token` (doesn't exist — remove)
  - `createdAt` → `created_at`
  - `updatedAt` → `updated_at` (doesn't exist — remove)
- Actual agents table schema (from supabase): id, full_name, mobile, communication_email, listing_owner_email, region, role, can_upload, telegram_user_id, is_active, can_receive_leads, zyprus_user_id, created_at
- **Simplify to only select fields that exist:** id, full_name, communication_email, mobile, region, role, telegram_user_id, is_active, can_receive_leads
- Update console.log output to use correct field names

**4. lib/db/apply-migration-0017.ts** (SQL migration referencing "ZyprusAgent" table):
- This is a migration script that was already applied — it references "ZyprusAgent" table name in SQL strings
- **DO NOT modify** — migration scripts are historical records and shouldn't be changed after application
- Add comment at top: `// NOTE: This migration references "ZyprusAgent" table (old PascalCase name). Table was later renamed to "agents" (snake_case).`

**Verification approach:**
After edits, run `npx tsc --noEmit` to catch any broken imports or type mismatches.
  </action>
  <verify>
```bash
# Verify imports updated
grep -q "import.*supabaseAgent.*from.*schema" lib/agents/identifier.ts
grep -q "import.*supabaseAgent.*from.*schema" scripts/seed-agents.ts
! grep -q "import.*zyprusAgent" lib/agents/identifier.ts
! grep -q "import.*agentChatSession" lib/agents/identifier.ts

# Verify agentChatSession tracking removed
! grep -q "trackAgentSession" lib/agents/identifier.ts
! grep -q "updateAgentSessionStats" lib/agents/identifier.ts
! grep -q "endAgentSession" lib/agents/identifier.ts

# Verify check-agents uses correct table name
grep -q 'pgTable("agents"' scripts/check-agents.ts
! grep -q 'pgTable("ZyprusAgent"' scripts/check-agents.ts

# Verify TypeScript compiles
npx tsc --noEmit

echo "✓ All references migrated, TypeScript compiles"
```
  </verify>
  <done>
All code references migrated to snake_case mappings. lib/agents/identifier.ts uses supabaseAgent (agentChatSession tracking removed). scripts/seed-agents.ts uses supabaseAgent. scripts/check-agents.ts uses correct "agents" table name with snake_case columns. TypeScript compilation succeeds with no errors.
  </done>
</task>

</tasks>

<verification>
Overall checks after all tasks complete:

```bash
# 1. Verify phantom tables completely removed from schema
! grep -E "(zyprusAgent|agentChatSession|telegramGroup|telegramLead|leadForwardingRotation) = pgTable" lib/db/schema.ts

# 2. Verify phantom types removed
! grep -E "export type (ZyprusAgent|AgentChatSession|TelegramGroup|TelegramLead|LeadForwardingRotation) = " lib/db/schema.ts

# 3. Verify snake_case tables preserved
grep -q "export const supabaseAgent = pgTable" lib/db/schema.ts
grep -q "export type SupabaseAgent = " lib/db/schema.ts

# 4. Verify no broken imports across codebase
npx tsc --noEmit

# 5. Count references to phantom names (should be 0 in non-migration files)
echo "Remaining phantom refs (should be 0 outside migrations):"
grep -r "zyprusAgent\|agentChatSession\|ZyprusAgent\|AgentChatSession" lib/ scripts/ app/ --include="*.ts" --include="*.tsx" | grep -v "apply-migration" | wc -l
```
</verification>

<success_criteria>
1. ✅ All 5 phantom PascalCase table definitions removed from lib/db/schema.ts
2. ✅ AgentChatSession tracking functions removed from lib/agents/identifier.ts (phantom table, unused)
3. ✅ All code references migrated to snake_case mappings (supabaseAgent, supabaseTelegramGroup, supabaseTelegramLead, supabaseLeadForwardingRotation)
4. ✅ scripts/check-agents.ts uses correct "agents" table name with accurate snake_case column names
5. ✅ TypeScript compilation succeeds (`npx tsc --noEmit` exits 0)
6. ✅ No remaining references to phantom names in lib/, scripts/, app/ (excluding historical migration files)
</success_criteria>

<output>
After completion, create `.planning/quick/18-remove-phantom-pascalcase-duplicate-tabl/18-SUMMARY.md`

Document:
- Number of phantom table definitions removed (5)
- Number of phantom type exports removed (5)
- Number of files refactored (4)
- Lines of dead code removed (AgentChatSession tracking: ~120 lines)
- TypeScript compilation status (should be 0 errors)
- Impact: Schema now aligned with production DB (agents, telegram_groups, telegram_leads, lead_forwarding_rotation)
</output>
