# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-26)

**Core value:** Agents can trust SOPHIA to do the right thing every time
**Current focus:** v1.2 complete — planning next milestone

## Current Position

Milestone: v1.2 3CX Call Log Audit — SHIPPED 2026-02-26
Status: All code complete. Pending operational setup (credentials + migration).
Last activity: 2026-02-26 — v1.2 milestone archived

Progress: [█████████████████████████] 100% (v1.2)

## Performance Metrics

**Velocity:**
- Total plans completed: 37
- Average duration: 2-3min (v1.2 plans)
- Total execution time: ~4 hours (v1.0 + v1.1) + 20min (v1.2)

**By Milestone:**

| Milestone | Phases | Total Plans | Status |
|-----------|--------|-------------|--------|
| v1.0 MVP | 1-5 | 10 plans | Shipped 2026-01-27 |
| v1.1 Reliability | 6-9 | 16 plans | Shipped 2026-01-29 |
| v1.2 Call Audit | 10-14 | 14 plans | Shipped 2026-02-26 |

**Recent Trend:**
- v1.0: ~10 plans in 1 day
- v1.1: 16 plans in 2 days
- Trend: Stable velocity

*Metrics will update after each v1.2 plan completion*

## Accumulated Context

### Decisions

Recent decisions from PROJECT.md and v1.2 execution:

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
- 3-arg cron.schedule + UPDATE timezone (safest cross-version pg_cron approach)
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

None yet (v1.2 just started).

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
- Confirm Cyprus timezone handling (EEST/EET with DST transitions)
- Verify pg_cron is available on Supabase project

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Fix all things blocking Sophia from uploading a listing | 2026-02-26 | c630845 | [1-fix-all-things-blocking-sophia-from-uplo](./quick/1-fix-all-things-blocking-sophia-from-uplo/) |

## Session Continuity

Last activity: 2026-02-26 - v1.2 milestone completed and archived
Stopped at: Milestone complete — ready for `/gsd:new-milestone`
Resume file: N/A

**Recent work:**
- v1.2 milestone archived (5 phases, 14 plans, 57 commits)
- Phases 10-14: Call tracking, 3CX, Telegram, Alerting, Scheduling

---
*STATE.md initialized: 2026-02-26*
