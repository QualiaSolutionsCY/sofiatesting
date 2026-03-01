---
phase: quick-16
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true
must_haves:
  truths:
    - "Migration history is reconciled (local ↔ remote)"
    - "supabase db push runs without warnings"
    - "Actual DB table inventory is documented"
    - "Drizzle schema discrepancies are mapped for future cleanup"
  artifacts:
    - path: ".planning/quick/16-repair-supabase-migration-history-and-re/16-SUMMARY.md"
      provides: "Migration repair results + table inventory"
      min_lines: 30
    - path: ".planning/quick/16-repair-supabase-migration-history-and-re/FINDINGS.md"
      provides: "Drizzle schema cleanup roadmap"
      min_lines: 40
  key_links:
    - from: "supabase CLI"
      to: "remote migration metadata"
      via: "migration repair --status reverted"
      pattern: "supabase migration repair"
    - from: "SQL query"
      to: "information_schema.tables"
      via: "psql or supabase db query"
      pattern: "SELECT.*FROM information_schema\\.tables"
---

<objective>
Repair Supabase migration history to resolve local/remote mismatch and document Drizzle schema discrepancies for future cleanup.

Purpose: Unblock `supabase db push` by reconciling 59 missing remote migrations and create cleanup roadmap for 37+ files referencing phantom Drizzle tables.
Output: Repaired migration history + findings document for future Drizzle schema migration phase.
</objective>

<execution_context>
@/home/qualia/.claude/get-shit-done/workflows/execute-plan.md
@/home/qualia/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@lib/db/schema.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Repair migration history</name>
  <files>N/A (CLI operations only)</files>
  <action>
**Step 1:** Mark all 59 remote-only migrations as reverted (per Supabase docs):

```bash
supabase migration repair --status reverted \
  20250101000000 20250103000000 20250104000000 20250105000000 \
  20250105123500 20250105234500 20250106000000 20250107000000 \
  20250108000000 20250109000000 20250110000000 20250111000000 \
  20250112000000 20250113000000 20250113162800 20250114000000 \
  20250115000000 20250116000000 20250116112300 20250117000000 \
  20250118000000 20250119000000 20250120000000 20250121000000 \
  20250122000000 20250123000000 20250124000000 20250124000001 \
  20250125000000 20250125123400 20250126000000 20250127000000 \
  20250128000000 20250128123400 20250129000000 20250129173000 \
  20250130000000 20250131000000 20250201000000 20250202000000 \
  20250203000000 20250203234500 20250204000000 20250205000000 \
  20250205234500 20250206000000 20250207000000 20250208000000 \
  20250209000000 20250210000000 20250210123000 20250211000000 \
  20250212000000 20250212234500 20250213000000 20250214000000 \
  20250215000000 20250217000000 20250217182200 20260301125122 \
  --project-ref vceeheaxcrhmpqueudqx
```

**Step 2:** Verify repair succeeded:
```bash
supabase migration repair --status applied --project-ref vceeheaxcrhmpqueudqx
```

**Step 3:** Pull remote schema into new migration file:
```bash
supabase db pull --project-ref vceeheaxcrhmpqueudqx
```

This creates a new migration file capturing current remote state.

**Step 4:** Verify `supabase db push --dry-run` no longer warns about missing migrations:
```bash
supabase db push --dry-run --project-ref vceeheaxcrhmpqueudqx
```

**Note:** Do NOT run `supabase db push` (without --dry-run) in this task. Just verify the warning is gone.
  </action>
  <verify>
1. `supabase migration repair --status applied` shows all local migrations applied
2. `supabase/migrations/` contains new migration file from `db pull`
3. `supabase db push --dry-run` completes without "Remote migration versions not found" warnings
  </verify>
  <done>Migration history reconciled; db push dry-run succeeds without warnings</done>
</task>

<task type="auto">
  <name>Task 2: Query remote DB for actual table inventory</name>
  <files>N/A (SQL query only)</files>
  <action>
**Step 1:** List all tables in production database:

```bash
supabase db query "
SELECT
  table_schema,
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'auth', 'storage', 'extensions', 'pgbouncer', 'vault', 'pgsodium', 'graphql', 'graphql_public', 'net', 'cron')
ORDER BY table_schema, table_name;
" --project-ref vceeheaxcrhmpqueudqx
```

**Step 2:** Check for PascalCase tables specifically mentioned in planning context:

```bash
supabase db query "
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'ZyprusAgent'
) as zyprus_agent_exists,
EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'PropertyListing'
) as property_listing_exists,
EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'LandListing'
) as land_listing_exists,
EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'ListingUploadAttempt'
) as listing_upload_attempt_exists,
EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'AgentChatSession'
) as agent_chat_session_exists,
EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'TelegramGroup'
) as telegram_group_exists,
EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'TelegramLead'
) as telegram_lead_exists,
EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'LeadForwardingRotation'
) as lead_forwarding_rotation_exists,
EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'DocumentSend'
) as document_send_exists;
" --project-ref vceeheaxcrhmpqueudqx
```

**Step 3:** Count references to each phantom table in codebase:

```bash
# Count ZyprusAgent refs (excluding schema.ts)
rg -c "ZyprusAgent" --glob "!lib/db/schema.ts" --glob "*.ts" --glob "*.tsx" | wc -l

# Count PropertyListing refs (excluding schema.ts)
rg -c "PropertyListing" --glob "!lib/db/schema.ts" --glob "*.ts" --glob "*.tsx" | wc -l

# Count LandListing refs (excluding schema.ts)
rg -c "LandListing" --glob "!lib/db/schema.ts" --glob "*.ts" --glob "*.tsx" | wc -l

# Count ListingUploadAttempt refs (excluding schema.ts)
rg -c "ListingUploadAttempt" --glob "!lib/db/schema.ts" --glob "*.ts" --glob "*.tsx" | wc -l
```

**Note:** Save all query results to SUMMARY.md for reference in Task 3.
  </action>
  <verify>
1. Query 1 returns full table list (expect ~40+ tables in public schema)
2. Query 2 returns boolean existence checks for 9 suspect PascalCase tables
3. Reference counts show how many files import each phantom table
  </verify>
  <done>Complete table inventory documented; phantom table existence confirmed/denied</done>
</task>

<task type="auto">
  <name>Task 3: Write findings document for future Drizzle cleanup</name>
  <files>.planning/quick/16-repair-supabase-migration-history-and-re/FINDINGS.md</files>
  <action>
Create structured findings document with:

**Section 1: Migration Repair Results**
- How many migrations were marked reverted
- New migration file created by `db pull` (filename)
- Current migration count (local vs remote after repair)

**Section 2: Table Inventory**
- Total tables in production (by schema)
- Public schema tables (list all ~40)
- Existence status for 9 suspect PascalCase tables (true/false for each)

**Section 3: Drizzle Schema Discrepancies**
For each phantom table (those that don't exist in DB):
- Table name (e.g., `ZyprusAgent`)
- Defined in: `lib/db/schema.ts` (yes/no)
- Exists in DB: (yes/no)
- Reference count: X files
- Impact: What breaks if removed from schema.ts

**Section 4: Cleanup Roadmap**
- Estimated effort: Number of files to refactor
- Breaking changes: Which imports fail if phantom tables removed
- Migration strategy:
  - Option A: Create missing tables in DB (align DB to schema)
  - Option B: Remove phantom tables from schema (align schema to DB)
  - Recommendation with rationale

**Section 5: Next Steps**
- [ ] Choose migration strategy (A or B)
- [ ] Create proper phase for Drizzle cleanup (not quick task)
- [ ] Update imports in 37+ affected files
- [ ] Test after cleanup
- [ ] Commit changes

**Formatting:**
- Use markdown tables for inventory
- Use checklists for next steps
- Include grep/rg commands for finding affected files
- Provide example migration for one phantom table (if recommending Option A)

**Document should be self-contained** — future Claude or Fawzi can execute cleanup phase from this doc alone.
  </action>
  <verify>
1. FINDINGS.md exists in quick task directory
2. Contains all 5 sections with actual data (not placeholders)
3. Grep commands are copy-pasteable
4. Cleanup roadmap has clear recommendation with reasoning
  </verify>
  <done>FINDINGS.md created with complete table inventory and actionable cleanup roadmap</done>
</task>

</tasks>

<verification>
After all tasks complete:

1. **Migration history clean:**
   - `supabase db push --dry-run` succeeds without warnings
   - `supabase/migrations/` has new migration file from `db pull`

2. **Table inventory complete:**
   - All production tables documented
   - Phantom table existence confirmed (expect: 0 PascalCase tables exist)

3. **Cleanup roadmap ready:**
   - FINDINGS.md provides clear path to fix schema/DB mismatch
   - Includes file counts, grep commands, migration options
</verification>

<success_criteria>
- [ ] Migration repair commands executed successfully
- [ ] `supabase db push --dry-run` runs without "Remote migration versions not found" warnings
- [ ] Table inventory query results saved to SUMMARY.md
- [ ] Phantom table existence confirmed (expect all false)
- [ ] FINDINGS.md created with 5 complete sections
- [ ] Cleanup roadmap includes effort estimate and migration strategy recommendation
- [ ] Git commit: `docs(quick-16): repair migration history + document Drizzle schema discrepancies`
</success_criteria>

<output>
After completion, create `.planning/quick/16-repair-supabase-migration-history-and-re/16-SUMMARY.md`
</output>
