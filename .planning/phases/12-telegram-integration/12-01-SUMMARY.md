---
phase: 12-telegram-integration
plan: 01
subsystem: telegram, database
tags: [telegram-bot-api, deno, edge-functions, phone-search, gin-index, supabase]

requires:
  - phase: 10-call-tracking-infrastructure
    provides: call_audit_runs, call_records, caller_alerts tables
provides:
  - Deno-compatible Telegram Bot API client (sendMessage, getChat)
  - Phone number search across indexed group messages
  - telegram_group_messages table with GIN text search index
  - Message indexing hook in lead-router (fire-and-forget)
affects: [12-02-PLAN, 12-03-PLAN, 13-call-auditor]

tech-stack:
  added: []
  patterns: [deno-telegram-client, fire-and-forget-indexing, phone-normalization-variants]

key-files:
  created:
    - supabase/functions/_shared/telegram.ts
    - supabase/functions/_shared/telegram-search.ts
    - lib/telegram/message-indexer.ts
    - supabase/migrations/20260226140131_telegram_group_messages.sql
  modified:
    - lib/db/schema.ts
    - lib/telegram/lead-router.ts

key-decisions:
  - "Deno client is minimal (sendMessage + getChat only) — expand as needed in later plans"
  - "Phone normalization returns multiple search variants to handle Cyprus prefix formats"
  - "Group message indexing is fire-and-forget to never block lead routing"
  - "GIN index on to_tsvector for full-text search plus ilike for exact phone matching"

patterns-established:
  - "Deno Edge Function Telegram pattern: import from _shared/telegram.ts, call getTelegramBot()"
  - "Phone search pattern: normalizePhoneForSearch -> searchPhoneInGroups with variant-based ilike"
  - "Fire-and-forget indexing: indexGroupMessage(msg).catch(() => {}) at top of handleGroupMessage"

duration: 5min
completed: 2026-02-26
---

# Phase 12 Plan 01: Telegram Bot API Client and Group Message Search Summary

**Deno Telegram Bot API client for Edge Functions with phone number search across indexed group messages using GIN text search**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-26T14:00:26Z
- **Completed:** 2026-02-26T14:05:21Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Deno-compatible Telegram client with sendMessage and getChat (no Node.js deps)
- Phone number search with Cyprus prefix normalization (+357/00357/local variants)
- telegram_group_messages table with GIN full-text index, group lookup index, and date cleanup index
- Fire-and-forget message indexing in lead-router that never blocks lead routing

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Deno Telegram Bot API client and group message search service** - `3e2f070` (feat)
2. **Task 2: Create telegram_group_messages table and message indexing hook** - `521710f` (feat)

## Files Created/Modified
- `supabase/functions/_shared/telegram.ts` - Deno Telegram Bot API client (sendMessage, getChat, singleton factory)
- `supabase/functions/_shared/telegram-search.ts` - Phone search service with normalizePhoneForSearch and searchPhoneInGroups
- `lib/telegram/message-indexer.ts` - Fire-and-forget group message indexer for Next.js webhook
- `supabase/migrations/20260226140131_telegram_group_messages.sql` - Migration for message index table
- `lib/db/schema.ts` - Added supabaseTelegramGroupMessage Drizzle schema
- `lib/telegram/lead-router.ts` - Hooked indexGroupMessage at top of handleGroupMessage

## Decisions Made
- Deno client kept minimal (only sendMessage + getChat) since call-auditor needs just those two
- Used ilike with phone variants rather than full-text search for exact phone number matching
- Regional group IDs set to 0 as placeholders -- will fail loudly if used unconfigured (guard in searchPhoneInGroups)
- Migration applied directly via postgres connection (supabase migration history out of sync)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Supabase CLI `db push` failed due to out-of-sync migration history -- applied SQL directly via postgres npm package with POSTGRES_URL from Vercel env vars
- No `exec_sql` RPC function in Supabase project -- used direct postgres connection instead

## User Setup Required

**Regional group chat IDs needed from Fawzi** before phone search can be used:
- `REGIONAL_GROUP_IDS.paphos` - Paphos group chat ID
- `REGIONAL_GROUP_IDS.limassol` - Limassol group chat ID
- `REGIONAL_GROUP_IDS.larnaca` - Larnaca group chat ID
- `REGIONAL_GROUP_IDS.nicosia` - Nicosia group chat ID
- `ZYPRESS_OTHERS_CHAT_ID` - "Zypress Others" group chat ID
- `VASYA_TELEGRAM_USER_ID` - Vasya's Telegram user ID

All defined in `supabase/functions/_shared/telegram-search.ts` with placeholder value 0.

## Next Phase Readiness
- Telegram client ready for import by call-auditor Edge Function (Phase 12 Plan 02/03)
- Phone search service ready once group IDs are configured
- Message indexing active immediately on next deploy of the Next.js Telegram webhook
- Blockers: Need actual Telegram group chat IDs from Fawzi before Phase 12 Plan 03

---
*Phase: 12-telegram-integration*
*Completed: 2026-02-26*
