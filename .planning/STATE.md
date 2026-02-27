# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-27)

**Core value:** Agents can trust SOPHIA to do the right thing every time
**Current focus:** v1.3 Production Audit Fixes

## Current Position

Milestone: v1.3 Production Audit Fixes
Phase: Phase 15 (Critical Security Fixes) — COMPLETE
Status: Phase 15 verified, ready for Phase 16
Last activity: 2026-02-27 — Phase 15 complete (4/4 requirements verified)

Progress: ████████░░░░░░░░░░░░░░░░░ 33% (v1.3 - Phase 15/17 complete, 2/6 plans done)

## Performance Metrics

**Velocity:**
- Total plans completed: 40
- Average duration: 2-3min (v1.2 plans)
- Total execution time: ~4 hours (v1.0 + v1.1) + 20min (v1.2)

**By Milestone:**

| Milestone | Phases | Total Plans | Status |
|-----------|--------|-------------|--------|
| v1.0 MVP | 1-5 | 10 plans | Shipped 2026-01-27 |
| v1.1 Reliability | 6-9 | 16 plans | Shipped 2026-01-29 |
| v1.2 Call Audit | 10-14 | 14 plans | Shipped 2026-02-26 |
| v1.3 Audit Fixes | 15-17 | TBD | Roadmap created |

**Recent Trend:**
- v1.0: ~10 plans in 1 day
- v1.1: 16 plans in 2 days
- v1.2: 14 plans in 1 day
- Trend: Stable velocity (~10-15 plans/day)

## Accumulated Context

### Decisions

Recent decisions from PROJECT.md and v1.2 execution:

**Phase 15 Plan 01 (Database Security):**
- Password column expanded to varchar(255) to accommodate all bcrypt variants and future hash formats
- onConflictDoNothing() for chat creation leverages existing PRIMARY KEY constraint for race-safe idempotent inserts

**Phase 15 Plan 02 (Configuration Security):**
- Environment variable with fallback instead of production URL default (maintains backward compatibility while alerting ops team)
- Documentation-only fix for guest endpoint (endpoint not vulnerable, but docs prevent future mistakes)

**v1.3 Roadmap Structure:**
- 3 phases derived from audit severity grouping (critical → validation → reliability)
- Phase 15: 4 critical/quick security fixes (password hash, chat race, env var, registration)
- Phase 16: 3 validation hardening fixes (tool args, SQL audit, admin input limits)
- Phase 17: 3 reliability improvements (cache race, upload rate limiting, N+1 queries)
- Success criteria: 3-4 observable behaviors per phase (system-level, not user-facing)
- 100% coverage: All 10 v1.3 requirements mapped to exactly one phase

**Phase 11 (3CX Integration):**
- Dual authentication support: v18+ REST API with web client API fallback for maximum 3CX version compatibility
- Multi-endpoint call log extraction: v18+ REST, legacy POST, web client APIs with graceful fallback
- Cyprus timezone handling: Europe/Nicosia with DST awareness for accurate date range calculation
- Phone number normalization: Cyprus local/prefixed/international formats → consistent +357/+country format
- External caller filtering: inbound calls only to target 22032770, exclude internal extensions [70,64,99,801,900]
- Resilient API parsing: dynamic field mapping for different 3CX response formats (CallerNumber vs caller_number, etc.)
- Testing modes: ?dry-run=true for auth testing, ?date= for historical queries

**Phase 10 (Call Tracking Infrastructure):**
- Use unique constraint on audit_date to prevent duplicate daily runs
- Use unique constraint on (caller_phone, audit_run_id) to prevent duplicate alerts
- Atomic claiming pattern: INSERT + SELECT single, handle 23505 → return null (not error)
- Status-based timestamp logic: alerted_at set when status=alerted, resolved_at when status=resolved/ignored

**Phase 12 (Telegram Integration):**
- Deno Telegram client kept minimal (sendMessage + getChat) -- expand as needed
- Phone normalization returns multiple variant strings for ilike search
- Fire-and-forget indexing pattern: indexGroupMessage(msg).catch(() => {})
- Regional group IDs as placeholders (0) with loud failure guard
- Alert persistence: send Telegram first, then persist with message_id (non-blocking)
- Duplicate alert dedup: unique constraint on (phone+date+type) + 23505 catch
- Batch rate limiting: 1s delay between same-group messages
- Response parsing priority: phone number > found keyword > not_found keyword > unknown
- Dual-runtime pattern: Deno service + Node.js mirror for response tracking
- Graceful skip on unconfigured VASYA_TELEGRAM_USER_ID (0 -> return false)
- Alert response check runs before lead routing in handleGroupMessage

**Phase 14 (Scheduling & Orchestration):**
- invoke_call_audit() wrapper function for execution logging instead of inline SQL
- pg_net fire-and-forget; actual result tracking stays in call_audit_runs table
- 3-arg cron.schedule (pg_cron 1.6.4 on Supabase lacks timezone column; use UTC schedule instead)
- 30-day log retention with weekly cleanup job
- x-cron header convention for distinguishing automated vs manual invocations

**Phase 13 (Alerting Logic) - All Plans:**
- Pipeline orchestration with per-caller error isolation
- Graceful degradation on unconfigured Telegram IDs (skip with warning)
- Atomic audit run claiming with duplicate detection (23505 → return null)
- Pipeline handles all errors internally, always returns JSON result
- Rate limiting: 1s delay between alert sends for Telegram API compliance
- Follow-up threshold: 24 hours (balances urgency with avoiding spam)
- Follow-ups run AFTER completing audit (Step 7) so current day's stats are saved
- Individual follow-up send failures don't abort batch (maximize delivery)
- ?follow-up-only=true endpoint for independent testing/debugging
- Call time flow: 3CX entries → callTimeMap → MissingCallerInfo (display) + caller_alerts (storage)
- Store call_time as nullable TIMESTAMPTZ in caller_alerts (allows NULL for historical alerts)
- Keep earliest call time per phone when multiple calls exist (most relevant timestamp)
- Format call times as HH:MM in Cyprus timezone for display (business hours context)
- Fallback to current timestamp if call time unavailable (better than "Unknown")
- **Response tracking unification (Plan 05):** Single-table alert state (caller_alerts owns full lifecycle)
- Map audit_alerts "pending" → caller_alerts "alerted" (NOT "pending" which means pre-alert)
- Store alert_message_id as TEXT (not BIGINT) consistent with caller_alerts schema
- telegram-alerts.ts contains only formatting + sending functions (zero DB operations)
- Both Deno and Node.js response trackers write to caller_alerts with identical field mapping
- chat_id column added to caller_alerts for response lookup by (alert_message_id, chat_id) pair

**Previous milestones:**
- v1.1: DB prompts take precedence over files (enables live editing)
- v1.1: Structured logging with correlation IDs (will help debug audit runs)
- v1.0: Region-based routing (pattern to reuse for Telegram group search)

Full decision log in PROJECT.md Key Decisions table.

### Pending Todos

**v1.3 Execution:**
- Plan Phase 15 (Critical Security Fixes)
- Execute Phase 15 plans
- Plan Phase 16 (Validation Hardening)
- Execute Phase 16 plans
- Plan Phase 17 (Reliability Improvements)
- Execute Phase 17 plans

### Blockers/Concerns

**Before Phase 11 (3CX Integration):**
- ~~Apply database migration~~ — DONE (applied via MCP 2026-02-26)
- Need 3CX credentials and web interface URL from Fawzi
- Need confirmation of target phone number (22032770) and internal extensions list
- May need to test 3CX web scraping approach on live system

**Before Phase 12 (Telegram Integration):**
- Need Telegram group chat IDs for 4 regional groups
- Need "Zypress Others" group chat ID for alerts
- Need Vasya's Telegram user ID for response tracking

**Before Phase 14 (Scheduling):**
- ~~Confirm Cyprus timezone handling (EEST/EET with DST transitions)~~ — DONE (pg_cron 1.6.4 lacks timezone; using UTC schedule)
- ~~Verify pg_cron is available on Supabase project~~ — DONE (pg_cron 1.6.4 + pg_net enabled)

**3CX Integration:**
- 3CX server SSL certificate EXPIRED — prevents Edge Function from connecting
- Once cert is renewed, run: `curl -s "https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/call-audit?dry-run=true"`

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Fix all things blocking Sophia from uploading a listing | 2026-02-26 | c630845 | [1-fix-all-things-blocking-sophia-from-uplo](./quick/1-fix-all-things-blocking-sophia-from-uplo/) |
| 2 | Set up 3CX credentials and pg_cron for call-audit | 2026-02-26 | 95b0e14 | [2-set-up-3cx-credentials-and-pg-cron-for-a](./quick/2-set-up-3cx-credentials-and-pg-cron-for-a/) |
| 3 | Fix top 5 critical issues & re-enable prompt caching | 2026-02-27 | dfacc18 | [3-fix-top-5-critical-issues-re-enable-prom](./quick/3-fix-top-5-critical-issues-re-enable-prom/) |
| 4 | Fix 3 security issues (service role key, auth, index) | 2026-02-27 | 3de3c93 | [4-fix-3-security-issues-service-role-key-s](./quick/4-fix-3-security-issues-service-role-key-s/) |
| 5 | Fix tool execution timeout budget and add tests | 2026-02-27 | f505bf5 | [5-fix-tool-execution-timeout-budget-and-ad](./quick/5-fix-tool-execution-timeout-budget-and-ad/) |
| 6 | Refactor tool executor monolith into focused modules | 2026-02-27 | 2c7e028 | [6-refactor-tool-executor-monolith-into-foc](./quick/6-refactor-tool-executor-monolith-into-foc/) |
| 7 | Implement land listing support (createLandListing) | 2026-02-27 | d3fbc40 | [7-implement-land-listing-support-createlan](./quick/7-implement-land-listing-support-createlan/) |

## Session Continuity

Last activity: 2026-02-27 - Completed Phase 15 Plan 01
Stopped at: .planning/phases/15-critical-security-fixes/15-01-SUMMARY.md
Resume file: .planning/phases/15-critical-security-fixes/15-01-SUMMARY.md

**Recent work:**
- Phase 15 Plan 01: Database security fixes (2min, 2 commits, password hash + chat race condition)
- Phase 15 Plan 02: Configuration security fixes (1min, 2 commits, 2 files modified)
- v1.3 Roadmap: 3 phases (15-17) mapped from 10 requirements with 100% coverage
- Quick task 7: Land listing support (8 min, 3 commits, 1,680 lines added, 7 files modified)
- Quick task 6: Tool executor refactor (7 min, 3 commits, 1,929 → 139 lines, sophia-bot deployed)
- Quick task 5: Time budget tracking + 40 tests (2 min, 2 commits, sophia-bot deployed)
- Quick task 4: 3 security fixes (6 min, 3 commits, 23 files modified)
- Quick task 3: 5 critical fixes + 51 tests (4 min, 2 commits, 2 Edge Functions deployed)
- Quick task 2: 3CX credentials + pg_cron scheduling (10 min, 2 commits)
- Quick task 1: Fix Sophia listing upload blocking issues
- v1.2 milestone archived (5 phases, 14 plans, 57 commits)

---
*STATE.md initialized: 2026-02-26*
*Last updated: 2026-02-27 after Phase 15 Plan 01 completion*
