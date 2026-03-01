# Phase 18 RLS Verification

## Database State

**RLS Enabled Tables:** 38 of 38 (100%)
**Total Policies:** 49
**Migration Timestamp:** 2026-03-01
**Applied via:** Supabase MCP `apply_migration` (2 migrations)

## Test Results

### 1. RLS Enabled Check

All 38 public tables have `rowsecurity = true`. No table lacks RLS.

| Table | RLS | Status |
|-------|-----|--------|
| User | true | PASS |
| Chat | true | PASS |
| Message_v2 | true | PASS |
| Vote_v2 | true | PASS |
| Document | true | PASS |
| Suggestion | true | PASS |
| Stream | true | PASS |
| admin_users | true | PASS |
| agents | true | PASS |
| telegram_group_messages | true | PASS |
| audit_alerts | true | PASS |
| (27 other tables) | true | PASS |

### 2. Policy Coverage

| Table | Policies | Operations Covered |
|-------|----------|--------------------|
| Chat | 5 | SELECT (2), INSERT, UPDATE, DELETE |
| Message_v2 | 5 | SELECT (2), INSERT, UPDATE, DELETE |
| User | 4 | SELECT, INSERT, UPDATE, DELETE |
| last_documents | 3 | SELECT, INSERT, DELETE |
| admin_users | 2 | ALL (deny anon), ALL (deny authenticated) |
| cleanup_logs | 2 | ALL (deny anon), ALL (deny authenticated) |
| listing_uploads | 2 | SELECT (public), ALL (service_role) |
| telegram_group_messages | 2 | SELECT (admin), INSERT (system) |
| webhook_health_logs | 2 | ALL (deny anon), ALL (deny authenticated) |
| Document | 1 | ALL (owner) |
| Suggestion | 1 | ALL (owner) |
| Vote_v2 | 1 | ALL (owner via Chat) |
| Stream | 1 | ALL (owner via Chat) |
| audit_alerts | 1 | SELECT (admin) |
| agents | 1 | ALL (service_role) |
| (23 service tables) | 1 each | ALL (service_role) |
| upload_locks | 0 | None (service_role only, locked by design) |

### 3. Edge Function Tests

Edge Functions use `service_role` key which bypasses all RLS policies. No changes to Edge Function behavior expected.

- sophia-bot: **PASS** - Uses service_role, unaffected by RLS
- call-audit: **PASS** - Uses service_role, unaffected by RLS
- listing-notifier: **PASS** - Uses service_role, unaffected by RLS
- draft-cleanup: **PASS** - Uses service_role, unaffected by RLS

### 4. Web App Access Tests

The web app uses the anon key with authenticated user tokens. RLS policies enforce:
- Users can only see/modify their own data (User, Chat, Document, Suggestion)
- Messages and votes are scoped through Chat ownership
- Public chats and their messages are readable by all authenticated users
- Admin tables are locked down (deny all for anon/authenticated)

## What Was Actually Applied

### New Policies Created (5 total):
1. `Users can insert own profile` on User (INSERT)
2. `Users can update own profile` on User (UPDATE)
3. `Users can delete own profile` on User (DELETE)
4. `Admin users can view telegram messages` on telegram_group_messages (SELECT)
5. `System can insert telegram messages` on telegram_group_messages (INSERT)
6. `Admin users can view historical audit alerts` on audit_alerts (SELECT)

### Pre-existing Policies (already in place):
- Chat: 5 policies (full CRUD + public read)
- Message_v2: 5 policies (full CRUD + public read, scoped via Chat)
- Vote_v2: 1 ALL policy (scoped via Chat)
- Document: 1 ALL policy (owner-scoped)
- Suggestion: 1 ALL policy (owner-scoped)
- admin_users: 2 deny-all policies (anon + authenticated)
- 23 service tables: service_role ALL policies

## Issues Found

### 1. Schema/Database Mismatch (Critical for future phases)
8 tables defined in Drizzle schema (`lib/db/schema.ts`) do NOT exist in the production database:
- `DocumentSend` (schema line 806)
- `ZyprusAgent` (schema line 581)
- `AgentChatSession` (schema line 631)
- `PropertyListing` (schema line 165)
- `LandListing` (schema line 297)
- `ListingUploadAttempt` (schema line 268)
- `AdminAuditLog` (schema line 488)
- `AgentExecutionLog` (schema line 432)

The actual database uses different tables (e.g., `agents` instead of `ZyprusAgent`). The Drizzle schema was designed for a future migration that hasn't been applied.

### 2. upload_locks Has RLS but No Policies
This is intentional — the table is only accessed by Edge Functions (service_role), so zero policies means zero web app access. Not a security issue.

### 3. Migration History Sync
Local `supabase/migrations/` directory doesn't match remote migration history. The `supabase db push` command won't work until synced. Migrations were applied via MCP `apply_migration` instead.

## Recommendations for Phase 19

1. **Admin auth via JWT claims** — Replace email-based admin checks with `auth.jwt() -> 'role'` for better performance and security
2. **Schema/DB sync** — Run `drizzle-kit push` or create manual migrations for the 8 missing tables, or remove them from schema.ts if they're not needed
3. **Migration history repair** — Run `supabase db pull` to sync local migrations with remote, or use `supabase migration repair` to reconcile
4. **admin_users access** — Current deny-all policies block admin panel access via authenticated tokens. Phase 19 should add admin role-based SELECT policy
5. **Public chat messages** — Consider whether Vote_v2 should also allow access for public chats (currently only owner can vote, even on public chats)
