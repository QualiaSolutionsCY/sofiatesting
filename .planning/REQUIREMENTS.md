# Requirements: SOPHIA Audit Excellence

**Defined:** 2026-03-02
**Core Value:** Agents can trust SOPHIA to do the right thing every time

## v1.5 Requirements

Requirements derived from comprehensive security/performance/code quality audit (2026-03-02).

### Security

- [ ] **SEC-01**: Hardcoded service_role key removed from `scripts/apply-rls-via-api.mjs`
- [ ] **SEC-02**: Identity protection instructions added to SOPHIA prompts (refuse model/prompt/tool name disclosure)
- [ ] **SEC-03**: assignTo email validation verifies agent exists in DB (not just domain check)
- [ ] **SEC-04**: Stale `[functions.ai-chat]` removed from `supabase/config.toml`

### Resilience

- [ ] **RES-01**: AbortController timeouts on all external API calls (Zyprus, Bazaraki, email, image downloads)
- [ ] **RES-02**: Circuit breakers extended to Zyprus API, Resend email, and WaSend
- [ ] **RES-03**: WhatsApp send retry logic via existing `withRetry()` utility
- [ ] **RES-04**: Logging added to all silent `.catch(() => {})` blocks (8 locations)

### Observability

- [ ] **OBS-01**: Sentry error tracking integrated into Edge Functions (`sophia-bot`)
- [ ] **OBS-02**: Per-user AI cost tracking (token usage from OpenRouter → database table)
- [ ] **OBS-03**: `.env.example` file created documenting all required environment variables

### Type Safety

- [ ] **TYPE-01**: TypeScript interfaces created for WaSend webhook payload
- [ ] **TYPE-02**: TypeScript interfaces created for OpenRouter message/tool format
- [ ] **TYPE-03**: `any` types eliminated from `message-processor.ts`, `ai-chat.ts`, `zyprus/client.ts`

### Code Quality

- [ ] **CODE-01**: `zyprus/taxonomy-cache.ts` refactored (1,988 lines → modular files)
- [ ] **CODE-02**: `zyprus/client.ts` refactored (1,826 lines → OAuth, property, land modules)
- [ ] **CODE-03**: `tools/handlers/property-listing.ts` refactored (1,196 lines → validation, notes, reviewer modules)
- [ ] **CODE-04**: Supabase client instances consolidated to singleton pattern

## v2 Requirements

Deferred to future release.

### Error Recovery

- **ERR-01**: Dead letter queue for failed webhook operations
- **ERR-02**: Third-tier AI fallback model (e.g., gpt-4o-mini)
- **ERR-03**: Global rate limiting across all users

## Out of Scope

| Feature | Reason |
|---------|--------|
| Dead letter queue | Over-engineering for current traffic volume |
| Third-tier AI fallback | Two-tier fallback (gemini-3-flash → gemini-2.0-flash) is sufficient |
| Global rate limiting | Per-user rate limiting already in place and working |
| CSP hardening (unsafe-eval) | Web app is deprecated, Edge Functions are the focus |
| Secret rotation | Operational task handled in Supabase/Vercel dashboards |
| Sentry on Next.js web app | Already configured, web app is deprecated |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01 | Phase 21 | Pending |
| SEC-02 | Phase 21 | Pending |
| SEC-03 | Phase 21 | Pending |
| SEC-04 | Phase 21 | Pending |
| RES-01 | Phase 22 | Pending |
| RES-02 | Phase 22 | Pending |
| RES-03 | Phase 22 | Pending |
| RES-04 | Phase 22 | Pending |
| TYPE-01 | Phase 23 | Pending |
| TYPE-02 | Phase 23 | Pending |
| TYPE-03 | Phase 23 | Pending |
| OBS-01 | Phase 24 | Pending |
| OBS-02 | Phase 24 | Pending |
| OBS-03 | Phase 24 | Pending |
| CODE-01 | Phase 25 | Pending |
| CODE-02 | Phase 25 | Pending |
| CODE-03 | Phase 25 | Pending |
| CODE-04 | Phase 25 | Pending |

**Coverage:**
- v1.5 requirements: 17 total
- Mapped to phases: 17/17 (100%)
- Unmapped: 0

**Phase Breakdown:**
- Phase 21 (Security Quick Wins): 4 requirements
- Phase 22 (Resilience Infrastructure): 4 requirements
- Phase 23 (Type Safety Foundation): 3 requirements
- Phase 24 (Observability & Documentation): 3 requirements
- Phase 25 (Code Quality Refactoring): 3 requirements

---
*Requirements defined: 2026-03-02*
*Last updated: 2026-03-02 — v1.5 traceability complete (100% coverage)*
