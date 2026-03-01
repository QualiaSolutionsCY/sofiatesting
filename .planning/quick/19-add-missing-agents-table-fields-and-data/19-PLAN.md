---
phase: quick-19
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260301140000_add_agent_fields.sql
  - lib/db/schema.ts
autonomous: true

must_haves:
  truths:
    - "agents table has whatsapp_phone_number, user_id, last_active_at fields"
    - "Drizzle schema matches production agents table structure"
    - "Database indexes optimized for high seq scan tables"
    - "TypeScript compiles without errors after schema changes"
  artifacts:
    - path: "supabase/migrations/20260301140000_add_agent_fields.sql"
      provides: "ALTER TABLE statements for 3 new agent fields"
      min_lines: 10
    - path: "lib/db/schema.ts"
      provides: "Updated supabaseAgent definition with 3 new fields"
      contains: "whatsappPhoneNumber"
  key_links:
    - from: "lib/agents/identifier.ts"
      to: "supabaseAgent schema"
      via: "whatsappPhoneNumber field reference"
      pattern: "supabaseAgent\\.whatsappPhoneNumber"
    - from: "lib/agents/identifier.ts"
      to: "supabaseAgent schema"
      via: "userId field reference"
      pattern: "supabaseAgent\\.userId"
---

<objective>
Add 3 missing fields to agents table and perform database maintenance

**Purpose:**
1. Enable WhatsApp agent identification (currently disabled due to missing whatsapp_phone_number field)
2. Link agents to Supabase auth users (required for future agent registration feature)
3. Track agent activity (last_active_at)
4. Optimize database performance (indexes, VACUUM high-bloat tables)

**Output:**
- Migration file adding 3 fields to agents table
- Updated Drizzle schema matching production structure
- Database maintenance applied (indexes, VACUUM)
- TypeScript compilation verified
</objective>

<execution_context>
@/home/qualia/.claude/get-shit-done/workflows/execute-plan.md
@/home/qualia/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/home/qualia/Projects/aiagents/sofiatesting/.planning/STATE.md
@/home/qualia/Projects/aiagents/sofiatesting/lib/db/schema.ts
@/home/qualia/Projects/aiagents/sofiatesting/lib/agents/identifier.ts
@/home/qualia/Projects/aiagents/sofiatesting/.planning/quick/9-fix-4-production-readiness-issues-from-a/9-SUMMARY.md

**Current agents table schema (lines 460-474):**
- Has: id, full_name, mobile, communication_email, listing_owner_email, region, role, can_upload, telegram_user_id, is_active, can_receive_leads, zyprus_user_id, created_at
- Missing: whatsapp_phone_number, user_id, last_active_at

**From identifier.ts TODOs:**
- Line 72-80: identifyAgentByWhatsApp() disabled - "agents table doesn't have whatsappPhoneNumber field"
- Line 126: isZyprusAgent() placeholder - "agents table doesn't have userId field yet"

**Database maintenance (from quick-9 SUMMARY):**
- Unused PKs: whatsapp_analytics_pkey, listing_uploads_pkey (investigate)
- Duplicate index: processed_webhooks_message_key_key (drop)
- High bloat: sophia_memory_embedding_idx (384 kB, 2.0x), webhook_debug_logs (352 kB, 2.0x)
- High seq scan: upload_locks (17,557 scans), sophia_user_profiles (11,960 scans)
- Total wasted space: ~1.3 MB

**Supabase project:** vceeheaxcrhmpqueudqx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add 3 missing fields to agents table</name>
  <files>
    supabase/migrations/20260301140000_add_agent_fields.sql
    lib/db/schema.ts
  </files>
  <action>
    Create SQL migration to add 3 fields to agents table:

    ```sql
    -- Add WhatsApp identification field
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS whatsapp_phone_number VARCHAR(20);
    CREATE INDEX IF NOT EXISTS idx_agents_whatsapp_phone ON agents(whatsapp_phone_number) WHERE whatsapp_phone_number IS NOT NULL;

    -- Add Supabase auth user link
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id) WHERE user_id IS NOT NULL;

    -- Add activity tracking
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE;
    CREATE INDEX IF NOT EXISTS idx_agents_last_active ON agents(last_active_at) WHERE last_active_at IS NOT NULL;

    COMMENT ON COLUMN agents.whatsapp_phone_number IS 'WhatsApp phone number for agent identification (E.164 format)';
    COMMENT ON COLUMN agents.user_id IS 'Link to Supabase auth user for web login';
    COMMENT ON COLUMN agents.last_active_at IS 'Last activity timestamp for agent tracking';
    ```

    Update lib/db/schema.ts supabaseAgent definition (after line 473):

    ```typescript
    export const supabaseAgent = pgTable("agents", {
      id: uuid("id").primaryKey().defaultRandom(),
      fullName: text("full_name").notNull(),
      mobile: text("mobile"),
      communicationEmail: text("communication_email"),
      listingOwnerEmail: text("listing_owner_email"),
      region: text("region"),
      role: text("role"),
      canUpload: boolean("can_upload").default(true),
      telegramUserId: bigint("telegram_user_id", { mode: "number" }),
      isActive: boolean("is_active").default(true),
      canReceiveLeads: boolean("can_receive_leads").default(true),
      zyprusUserId: uuid("zyprus_user_id"),
      whatsappPhoneNumber: varchar("whatsapp_phone_number", { length: 20 }),
      userId: uuid("user_id"),
      lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
      createdAt: timestamp("created_at").defaultNow(),
    });
    ```

    Apply migration:
    ```bash
    supabase db push --project-ref vceeheaxcrhmpqueudqx
    ```

    Verify in production:
    ```bash
    supabase db query "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'agents' AND column_name IN ('whatsapp_phone_number', 'user_id', 'last_active_at')" --project-ref vceeheaxcrhmpqueudqx
    ```
  </action>
  <verify>
    - Migration file exists with 3 ALTER TABLE statements
    - schema.ts has 3 new fields: whatsappPhoneNumber, userId, lastActiveAt
    - `supabase db push --dry-run` shows no pending changes
    - Query returns 3 rows confirming fields exist in production
  </verify>
  <done>
    agents table has whatsapp_phone_number, user_id, last_active_at fields in production. Drizzle schema matches production structure.
  </done>
</task>

<task type="auto">
  <name>Task 2: Database maintenance - optimize indexes and reclaim space</name>
  <files>None (database operations only)</files>
  <action>
    Run SQL operations to investigate and fix database issues from quick-9 findings:

    **1. Investigate unused PKs:**
    ```bash
    # Check if tables exist and have data
    supabase db query "SELECT
      'whatsapp_analytics' as table_name, COUNT(*) as row_count
      FROM whatsapp_analytics
      UNION ALL
      SELECT 'listing_uploads', COUNT(*) FROM listing_uploads
      UNION ALL
      SELECT 'sophia_conversation_memory', COUNT(*) FROM sophia_conversation_memory
      UNION ALL
      SELECT 'lead_forwarding_rotation', COUNT(*) FROM lead_forwarding_rotation" --project-ref vceeheaxcrhmpqueudqx
    ```

    **2. Add indexes for high seq scan tables:**
    ```sql
    -- upload_locks (17,557 scans) - likely filtering on agent_id + property_fingerprint
    CREATE INDEX IF NOT EXISTS idx_upload_locks_agent_fingerprint
      ON upload_locks(agent_id, property_fingerprint);

    -- sophia_user_profiles (11,960 scans) - likely filtering on user_id or is_active
    CREATE INDEX IF NOT EXISTS idx_sophia_user_profiles_user_id
      ON sophia_user_profiles(user_id) WHERE user_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_sophia_user_profiles_active
      ON sophia_user_profiles(is_active) WHERE is_active = true;
    ```

    **3. Drop duplicate index:**
    ```sql
    DROP INDEX IF EXISTS processed_webhooks_message_key_key;
    ```

    **4. VACUUM high-bloat tables:**
    ```sql
    VACUUM FULL webhook_debug_logs;
    REINDEX INDEX sophia_memory_embedding_idx;
    VACUUM ANALYZE chat_history;
    ```

    **5. Run ANALYZE for query planner:**
    ```sql
    ANALYZE agents, upload_locks, sophia_user_profiles, webhook_debug_logs, chat_history;
    ```

    Execute operations:
    ```bash
    # Create indexes
    supabase db query -f migration_content.sql --project-ref vceeheaxcrhmpqueudqx

    # Verify indexes created
    supabase db query "SELECT indexname FROM pg_indexes WHERE tablename IN ('upload_locks', 'sophia_user_profiles') AND indexname LIKE 'idx_%'" --project-ref vceeheaxcrhmpqueudqx
    ```
  </action>
  <verify>
    - Query shows row counts for 4 tables (identifies if PKs are genuinely unused due to empty tables)
    - `pg_indexes` query shows new indexes: idx_upload_locks_agent_fingerprint, idx_sophia_user_profiles_user_id, idx_sophia_user_profiles_active
    - processed_webhooks_message_key_key index no longer appears in `\di` output
    - VACUUM FULL and REINDEX complete without errors
  </verify>
  <done>
    Database optimized: composite indexes added to high seq scan tables, duplicate index dropped, bloated tables vacuumed, query planner updated via ANALYZE.
  </done>
</task>

<task type="auto">
  <name>Task 3: Verify TypeScript compilation after schema changes</name>
  <files>None (verification only)</files>
  <action>
    Run TypeScript compiler to ensure schema changes don't break type safety:

    ```bash
    npx tsc --noEmit
    ```

    Check if any files need updating due to new agent fields:

    ```bash
    # Search for SupabaseAgent type usage
    grep -r "SupabaseAgent\|supabaseAgent" lib/ app/ --include="*.ts" --include="*.tsx" | head -20
    ```

    If any type errors exist, fix import statements or type annotations. Most likely safe since new fields are all optional (nullable).
  </action>
  <verify>
    - `npx tsc --noEmit` exits with code 0 (no type errors)
    - Grep shows SupabaseAgent usage locations (for documentation)
  </verify>
  <done>
    TypeScript compiles cleanly after adding 3 fields to supabaseAgent schema. No breaking changes introduced.
  </done>
</task>

</tasks>

<verification>
**Overall phase checks:**

1. **Schema alignment:**
   ```bash
   supabase db query "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'agents' ORDER BY ordinal_position" --project-ref vceeheaxcrhmpqueudqx
   ```
   Should show 16 columns including whatsapp_phone_number, user_id, last_active_at.

2. **Index health:**
   ```bash
   supabase db query "SELECT schemaname, tablename, indexname FROM pg_indexes WHERE tablename IN ('agents', 'upload_locks', 'sophia_user_profiles') ORDER BY tablename, indexname" --project-ref vceeheaxcrhmpqueudqx
   ```
   Should show new indexes: idx_agents_whatsapp_phone, idx_agents_user_id, idx_agents_last_active, idx_upload_locks_agent_fingerprint, idx_sophia_user_profiles_user_id, idx_sophia_user_profiles_active.

3. **Type safety:**
   ```bash
   npx tsc --noEmit
   ```
   Should exit 0 (no errors).

4. **Database health:**
   - processed_webhooks_message_key_key index removed
   - Bloat reduced on webhook_debug_logs and sophia_memory_embedding_idx
   - Query planner has fresh statistics
</verification>

<success_criteria>
- [ ] agents table has 3 new fields in production (whatsapp_phone_number, user_id, last_active_at)
- [ ] Drizzle schema.ts supabaseAgent definition includes 3 new fields
- [ ] 3 indexes created on agents table for new fields
- [ ] 2 composite indexes created (upload_locks, sophia_user_profiles)
- [ ] Duplicate index processed_webhooks_message_key_key dropped
- [ ] VACUUM FULL completed on high-bloat tables
- [ ] ANALYZE updated query planner statistics
- [ ] TypeScript compilation passes (exit code 0)
- [ ] No breaking changes to existing code
</success_criteria>

<output>
After completion, create `.planning/quick/19-add-missing-agents-table-fields-and-data/19-SUMMARY.md` following summary.md template.

**Summary should include:**
- 3 fields added to agents table (whatsapp_phone_number, user_id, last_active_at)
- Migration file location and line count
- Database maintenance actions (indexes created, duplicate dropped, VACUUM results)
- TypeScript compilation status
- Before/after comparison of database health metrics
- Next steps: Update identifier.ts to use new fields (identifyAgentByWhatsApp, isZyprusAgent)
</output>
