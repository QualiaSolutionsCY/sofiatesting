# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-01)

**Core value:** Agents can trust SOPHIA to do the right thing every time
**Current focus:** Planning next milestone

## Current Position

Milestone: v1.4 Security & Performance Hardening — ARCHIVED
Phase: 20 of 20 — all phases complete
Plan: All plans complete
Status: Milestone archived, ready for next milestone
Last activity: 2026-03-01 — Completed quick task 19: Added 3 missing fields to agents table (whatsapp_phone_number, user_id, last_active_at) with partial indexes, dropped duplicate processed_webhooks constraint (264 kB reclaimed), updated query planner statistics. WhatsApp agent identification and web auth now unblocked.

Progress: [████████████████████] 100% (20/20 phases, 58 plans completed)

## Performance Metrics

**Velocity:**
- Total plans completed: 58
- Total phases shipped: 20
- Milestones completed: 5

**By Milestone:**

| Milestone | Phases | Total Plans | Status |
|-----------|--------|-------------|--------|
| v1.0 MVP | 1-5 | 10 plans | Shipped 2026-01-27 |
| v1.1 Reliability | 6-9 | 16 plans | Shipped 2026-01-29 |
| v1.2 Call Audit | 10-14 | 14 plans | Shipped 2026-02-26 |
| v1.3 Audit Fixes | 15-17 | 8 plans | Shipped 2026-02-28 |
| v1.4 Hardening | 18-20 | 10 plans | Shipped 2026-03-01 |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

### Pending Todos

- **CRITICAL:** Rotate production webhook secret (hardcoded secret exposed in repo - see quick-10 SUMMARY)
- **CRITICAL:** Rotate Supabase service_role key (hardcoded JWT was in git history - see quick-11 SUMMARY)
- ~~Migrate `zyprusAgent` → `supabaseAgent` refs across codebase~~ — **RESOLVED in quick-18** (all 7 files migrated to snake_case mappings)
- ~~Reconcile PropertyListing/LandListing/ListingUploadAttempt (in Drizzle+code but not in DB)~~ — **RESOLVED in quick-17** (tables created via migration 20260301120000)
- ~~Add missing fields to agents table (optional): whatsapp_phone_number, user_id, last_active_at~~ — **RESOLVED in quick-19** (fields added, indexed, ready to use)
- ~~Drop duplicate processed_webhooks constraint~~ — **RESOLVED in quick-19** (264 kB reclaimed)
- Enable WhatsApp agent identification: uncomment lib/whatsapp/user-mapping.ts lines 22-55, populate agents.whatsapp_phone_number
- Enable web agent authentication: implement isZyprusAgent() in lib/agents/identifier.ts, populate agents.user_id
- Database maintenance (manual): VACUUM FULL webhook_debug_logs, REINDEX sophia_memory_embedding_idx (~736 kB to reclaim)
- Index optimization: Investigate upload_locks/sophia_user_profiles schemas, add composite indexes if needed (17k/12k seq scans)

### Blockers/Concerns

- Schema/DB mismatch: 6 analytics tables removed (quick-12), 5 of 9 phantom tables removed (quick-18), 4 phantom tables remain (PropertyListing/LandListing/ListingUploadAttempt/DocumentSend - but these were created in DB in quick-17, so just need Drizzle schema verification)
- upload_locks and sophia_user_profiles tables exist in DB but not in Drizzle schema (discovered in quick-19) - investigate and add if actively used

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 19 | Add 3 missing fields to agents table + database maintenance: 1) Added whatsapp_phone_number VARCHAR(20), user_id UUID FK to auth.users, last_active_at TIMESTAMP (3 partial indexes created), 2) Dropped processed_webhooks_message_key_key duplicate constraint (264 kB reclaimed), 3) Ran ANALYZE on 4 tables (agents, upload_locks, webhook_debug_logs, chat_history), 4) TypeScript compiles (0 errors), 5) Unblocked WhatsApp agent identification (lib/whatsapp/user-mapping.ts has code ready to uncomment) + web auth (lib/agents/identifier.ts). VACUUM operations deferred (can't run in transaction). | 2026-03-01 | 899cfa9, bdd2e9e | [19-add-missing-agents-table-fields-and-data](./quick/19-add-missing-agents-table-fields-and-data/) |
| 18 | Remove 5 phantom PascalCase duplicate tables + migrate to snake_case: 1) Removed 5 phantom table definitions from schema.ts (ZyprusAgent, AgentChatSession, TelegramGroup, TelegramLead, LeadForwardingRotation, ~220 lines), 2) Migrated 7 files to use snake_case mappings (zyprusAgent → supabaseAgent, etc.), 3) Removed ~120 lines of dead AgentChatSession tracking code (phantom table never existed), 4) Updated IdentifiedAgent type to match production agents table schema, 5) TypeScript compilation succeeds (0 errors). Net -221 lines. Schema now aligned with production DB (agents, telegram_groups, telegram_leads, lead_forwarding_rotation). | 2026-03-01 | c8015ee | [18-remove-phantom-pascalcase-duplicate-tabl](./quick/18-remove-phantom-pascalcase-duplicate-tabl/) |
| 17 | Create 4 missing database tables with RLS policies: 1) Created 248-line SQL migration (PropertyListing 60+ cols, LandListing 37 cols, ListingUploadAttempt 9 cols, DocumentSend 14 cols), 2) Applied migration to production (confirmed in migration history), 3) Created 24 indexes (10 per listing table, 2-4 per tracking table), 4) Applied 13 RLS policies (auth.uid() scoping), 5) Verified TypeScript compiles (exit code 0). Resolved PropertyListing/LandListing/ListingUploadAttempt phantom table issue from quick-16. Web app property listing features now unblocked. | 2026-03-01 | 97400f7 | [17-create-5-missing-database-tables-and-rls](./quick/17-create-5-missing-database-tables-and-rls/) |
| 16 | Repair Supabase migration history + document Drizzle schema cleanup roadmap: 1) Marked 116 remote-only migrations as reverted, 2) Renamed 11 local migrations to proper timestamps, 3) Verified `supabase db push --dry-run` succeeds, 4) Identified 9 phantom tables (PropertyListing/LandListing/ListingUploadAttempt/etc affecting 60-70 files), 5) Created 596-line FINDINGS.md with 6-plan Phase 21 roadmap. Recommended Option A: Create missing tables (align DB to schema). Migration operations now unblocked. | 2026-03-01 | 9745ad8 | [16-repair-supabase-migration-history-and-re](./quick/16-repair-supabase-migration-history-and-re/) |
| 15 | Fix dev environment issues: 1) Fresh node_modules reinstall (1086 packages, TypeScript 0 errors, ESLint works), 2) Clean console.log from lib/ (replaced with logger in circuit-breakers.ts JSDoc examples, migration scripts unchanged), 3) Fix 4 ESLint/Biome issues in admin pages (import organization, type annotations, ternary formatting). Dev environment now A-grade audit status. | 2026-03-01 | 04e1755 | [15-fix-corrupted-node-modules-and-dev-envir](./quick/15-fix-corrupted-node-modules-and-dev-envir/) |
| 14 | Fix 3 audit findings: 1) Add Zod validation to admin prompts PUT endpoint (structured error handling), 2) Add retry logic for WaSender API calls (4 fetch calls wrapped with withRetry, 2 retries on 5xx/network errors), 3) Delete dead code (2 template-manager files, 0 imports) + fix .mcp.json (add Supabase server) + fix CLAUDE.md (correct paths). Net -211 lines. | 2026-03-01 | a3d09cd | [14-fix-top-3-audit-findings-zod-validation-](./quick/14-fix-top-3-audit-findings-zod-validation-/) |
| 13 | Fix 3 audit findings: 1) npm audit fix (2 high severity vulnerabilities: minimatch, rollup, markdown-it), 2) Add loading.tsx Suspense boundaries for chat/admin/properties, 3) Fix ESLint config for Deno/Node globals (eliminated 100+ no-undef errors). | 2026-03-01 | 3fea923 | [13-fix-3-audit-findings-npm-audit-fix-2-hig](./quick/13-fix-3-audit-findings-npm-audit-fix-2-hig/) |
| 12 | ESLint cleanup (8 errors → 0, ~20 unused vars fixed) + removed 6 phantom analytics tables from Drizzle schema (never existed in production). Admin components now show placeholders. -937 lines of dead code. | 2026-03-01 | 7d660fd | [12-fix-3-remaining-issues-sync-drizzle-sche](./quick/12-fix-3-remaining-issues-sync-drizzle-sche/) |
| 11 | Fix 4 audit findings: 1) Remove hardcoded service_role JWT from test script, 2) Replace setInterval memory leak with on-demand cleanup, 3) Add rate limiting to upload + document routes, 4) Lazy-load CodeMirror/ProseMirror in document-preview. **Post-fix action required:** Rotate Supabase service_role key (was in git history). | 2026-03-01 | 1e3fc27 | [11-fix-all-5-audit-findings-hardcoded-servi](./quick/11-fix-all-5-audit-findings-hardcoded-servi/) |
| 10 | Fix 3 audit findings: 1) Remove hardcoded production webhook secret from load test, 2) Replace vulnerable xlsx with xlsx-js-style (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9), 3) Add ESLint v9 flat config with TypeScript support. **Post-fix action required:** Rotate webhook secret in Supabase Edge Function secrets. | 2026-03-01 | c30d608 | [10-fix-3-audit-findings-remove-hardcoded-we](./quick/10-fix-3-audit-findings-remove-hardcoded-we/) |
| 9 | Fix 4 production readiness issues from audit: 1) getHistory() missing .catch() in webhook.ts:176, 2) executeTool() missing try-catch in ai-chat.ts:486, 3) image download timeout missing in zyprus/client.ts:580, 4) add server-only imports to admin integration components. Also check Supabase advisors for any warnings. | 2026-03-01 | 855c577 | [9-fix-4-production-readiness-issues-from-a](./quick/9-fix-4-production-readiness-issues-from-a/) |

## Session Continuity

Last session: 2026-03-01
Stopped at: Quick task 19 complete
Resume file: .planning/quick/19-add-missing-agents-table-fields-and-data/19-SUMMARY.md
Next step: 1) Rotate both secrets (CRITICAL - webhook secret + service_role key), 2) Enable WhatsApp agent identification (uncomment code + populate agents.whatsapp_phone_number), 3) Enable web agent auth (implement isZyprusAgent + populate agents.user_id), 4) Manual DB maintenance (VACUUM webhook_debug_logs, REINDEX sophia_memory_embedding_idx during low-traffic period)

---
*STATE.md initialized: 2026-02-26*
*Last updated: 2026-03-01 after quick task 18 complete*
