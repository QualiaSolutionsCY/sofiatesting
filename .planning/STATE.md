# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-02)

**Core value:** Agents can trust SOPHIA to do the right thing every time
**Current focus:** v1.6 Upload Pipeline Production Hardening

## Current Position

Milestone: v1.6 Upload Pipeline Production Hardening — IN PROGRESS
Phase: 27 (Business Rules & Cleanup) — EXECUTED
Plan: 27-01-PLAN.md (5 steps, 4 FRs + 1 false positive) — all complete
Status: Ready to deploy and verify
Last activity: 2026-03-20 — Phases 26+27 executed (11 FRs total across both phases)

Progress: [                         ] 0% (2 phases planned)

## Performance Metrics

**Velocity:**
- Total plans completed: 72
- Total phases shipped: 25
- Milestones completed: 6

**By Milestone:**

| Milestone | Phases | Total Plans | Status |
|-----------|--------|-------------|--------|
| v1.0 MVP | 1-5 | 10 plans | Shipped 2026-01-27 |
| v1.1 Reliability | 6-9 | 16 plans | Shipped 2026-01-29 |
| v1.2 Call Audit | 10-14 | 14 plans | Shipped 2026-02-26 |
| v1.3 Audit Fixes | 15-17 | 8 plans | Shipped 2026-02-28 |
| v1.4 Hardening | 18-20 | 10 plans | Shipped 2026-03-01 |
| v1.5 Audit Excellence | 21-25 | 14 plans | Shipped 2026-03-02 |
| v1.6 Upload Hardening | 26-27 | TBD | In Progress |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

### Review Findings (v1.6 source)

17 issues from 2026-03-20 `/review --ai`:
- 4 CRITICAL: lock leak, listingType missing, email follow-up broken, parser regex fragile
- 6 HIGH: double clearImages, bedrooms deleted, poolType parse corruption, Michelle reassignment dropped, bedrooms Zod default, titleDeedStatus double default
- 4 MEDIUM: broad upload intent detection, missing email patterns, 47KB prompt size, condition field dropped
- 3 LOW: dedup copy-paste, ToolResult interface duplication, random taxonomy fallback

### Pending Todos

- **CRITICAL:** Rotate production webhook secret (hardcoded secret exposed in repo)
- **CRITICAL:** Rotate Supabase service_role key (hardcoded JWT was in git history)
- **OPERATIONAL:** Set SENTRY_DSN secret via `supabase secrets set`
- **OPERATIONAL:** Verify Sentry dashboard captures errors with context
- **OPERATIONAL:** Sync identity prompt Security Boundaries section to sophia_prompts DB table

### Blockers/Concerns

- upload_locks and sophia_user_profiles tables exist in DB but not in Drizzle schema

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 21 | Fix title deed attachment failure + image ordering bug | 2026-03-04 | 119266d | [21-fix-title-deed-patch-attachment-failure-](./quick/21-fix-title-deed-patch-attachment-failure-/) |
| 22 | Gmail email router — poll info@zyprus.com, forward + draft | 2026-03-09 | b01860f | [22-add-gmail-email-router-poll-info-zyprus-](./quick/22-add-gmail-email-router-poll-info-zyprus-/) |
| 23 | Email listing upload via sophia@zyprus.com — full AI pipeline via email | 2026-03-11 | ebfeead | [23-email-listing-upload-replicate-whatsapp-](./quick/23-email-listing-upload-replicate-whatsapp-/) |
| 24 | Fix email upload parity — HTML replies, image validation, sender guard, rate limiting | 2026-03-12 | 5b9ef56 | [24-fix-email-upload-parity-markdown-to-html](./quick/24-fix-email-upload-parity-markdown-to-html/) |
| 25 | Email upload retest — 10 scenarios, server-side parser, arg override, 8/10 pass | 2026-03-16 | pending | [25-email-upload-retest-10-scenarios-with-au](./quick/25-email-upload-retest-10-scenarios-with-au/) |
| 26 | Upload pipeline deep audit — 5 critical fixes (email sanitization, land lock, SSRF, dedup field) | 2026-03-23 | pending | — |

## Session Continuity

Last session: 2026-03-23
Stopped at: Applied 5 critical/high fixes from deep upload pipeline audit
Next step: Deploy sophia-bot + verify, then tackle remaining HIGH findings

---
*STATE.md initialized: 2026-02-26*
*Last updated: 2026-03-23 — 5 critical/high upload fixes applied*
