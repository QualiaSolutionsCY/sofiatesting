# Quick Task 12: ESLint Cleanup + Schema Sync (Partial)

## What Changed

### ESLint Errors Fixed (8 → 0)
- Empty interfaces → type aliases (`bulk-action-dialogs.tsx`)
- Unnecessary escape chars (`audit-response-handler.ts`)
- `let` → `const` (`listing/rate-limit.ts`)
- Added eslint-disable comments for config issues (`diff.js`, `providers.ts`, `multimodal-input.tsx`)

### Unused Variables Fixed (~20)
- Removed unused imports across 22 files
- Prefixed destructured params with `_`
- Removed dead constants and assignments

### no-explicit-any Suppressed (2 files)
- `lib/zyprus/client.ts` — file-level disable (untyped external Zyprus API)
- `lib/zyprus/taxonomy-cache.ts` — file-level disable (same)

### Schema Cleanup: 6 Phantom Analytics Tables Removed
Tables that were defined in Drizzle but never created in production DB:
- `SystemHealthLog`
- `AgentExecutionLog`
- `CalculatorUsageLog`
- `AdminAuditLog`
- `DocumentGenerationLog`
- `UserActivitySummary`

Admin components referencing these tables now show placeholders.
User delete/export routes cleaned up.

### Commit: `7d660fd`

## NOT Fixed (Needs Proper Phase)

### ZyprusAgent / Phantom Table Duplication
`zyprusAgent` Drizzle variable maps to `"ZyprusAgent"` table which doesn't exist in production.
The live `agents` table is mapped by `supabaseAgent` with different column names.
**Files affected:** `lib/agents/identifier.ts`, `lib/whatsapp/user-mapping.ts`, scripts
**Risk:** These queries silently fail at runtime (Edge Function handles the flow instead)
**Fix requires:** Migrating all column refs from camelCase to snake_case across multiple files

### PropertyListing / LandListing / ListingUploadAttempt
Used in `lib/db/queries.ts` and web app routes but tables don't exist in production.
Web app listing features are non-functional (Edge Function handles uploads via WhatsApp).

### Migration History Mismatch
Local migration files don't match `supabase_migrations.schema_migrations`.
`supabase db push` won't work until reconciled.

## Verification
- `npx tsc --noEmit` — PASS
- `npm run build` — PASS
- `npx next lint` errors: 0 (down from 8)
- Deploy: PASS (HTTP 200)
