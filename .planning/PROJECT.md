# SOPHIA Production Hardening

## What This Is

Production-ready fixes for SOPHIA AI assistant — fixing template generation issues, Telegram lead routing bugs, property listing upload problems, and system reliability issues. This brings SOPHIA to zero-mistake production quality for Zyprus Property Group agents.

## Core Value

**Agents can trust SOPHIA to do the right thing every time** — correct templates, correct routing, correct uploads, no manual intervention needed.

## Current Milestone: v1.1 Reliability & Hardening

**Goal:** Eliminate system fragility — consolidate prompts, validate image URLs, improve cache management, harden the system.

**Target features:**
- Prompt consolidation (eliminate conflicts, single source of truth)
- Image URL validation (reject hallucinated URLs, validate before upload)
- Cache management (faster propagation, admin invalidation)
- System reliability (webhook dedup verification, error handling)
- Complete WhatsApp image upload (carried from v1.0)

## Requirements

### Validated (v1.0)

- ✓ **TMPL-01**: SOPHIA never mentions template numbers to users — Phase 1
- ✓ **TMPL-02**: Single reservation template only (official version with witness) — Phase 2
- ✓ **TMPL-03**: Email auto-sends to speaking agent's email without asking — Phase 1
- ✓ **TMPL-04**: No asterisks visible in WhatsApp messages — Phase 1
- ✓ **TMPL-05**: Non-Exclusive Marketing Agreement has proper signature spacing — Phase 2
- ✓ **TMPL-06**: Non-Exclusive Marketing Agreement has correct border/frame — Phase 2
- ✓ **LEAD-01**: "Others" group routes based on property region — Phase 3
- ✓ **LEAD-02**: Nicosia leads go to Ivan (regional manager) — Phase 3
- ✓ **LEAD-03**: Famagusta leads go to Narine (regional manager) — Phase 3
- ✓ **LIST-01**: Listing Reviewer 1 correct (Lauren for sales, agent for rentals) — Phase 4
- ✓ **LIST-02**: Listing Reviewer 2 correct (regional manager for sales) — Phase 4
- ✓ **LIST-03**: Listing Owner correct (special email mappings honored) — Phase 4
- ✓ **LIST-04**: My Notes populated with owner details — Phase 4
- ✓ **LIST-05**: Google Maps pin at neutral location (2-3 streets away) — Phase 4

### Active (v1.1)

#### Carried from v1.0
- [ ] **LIST-06**: WhatsApp phone gallery images can be uploaded (not just URLs)

#### Prompt System
- [ ] **PRMT-01**: All prompt sections consolidated — no duplicate instructions across files
- [ ] **PRMT-02**: Single source of truth for each behavior (DB or file, not both with conflicts)
- [ ] **PRMT-03**: Priority ordering documented and enforced

#### Image Handling
- [ ] **IMG-01**: AI-generated URLs validated before use (reject hallucinations)
- [ ] **IMG-02**: Image persistence reliable (Supabase Storage fallback)
- [ ] **IMG-03**: Clear error messages when image upload fails

#### Cache & Performance
- [ ] **CACHE-01**: Prompt changes propagate within 1 minute (not 5)
- [ ] **CACHE-02**: Admin can force cache invalidation
- [ ] **CACHE-03**: Cache status visible for debugging

#### System Reliability
- [ ] **REL-01**: Webhook deduplication verified under load
- [ ] **REL-02**: Error handling improved (graceful degradation)
- [ ] **REL-03**: Logging improved for debugging production issues

### Out of Scope

- New features beyond fixing existing functionality
- UI/web app changes (this is Edge Function fixes only)
- Telegram bot enable/disable (currently disabled by design)
- Major architectural changes (refactoring for its own sake)

## Context

**Current State:**
- SOPHIA runs as Supabase Edge Function `sophia-bot`
- WhatsApp integration via WaSenderAPI
- Prompt system uses DB (sophia_prompts) + file fallbacks
- Cache TTL currently disabled (0) for testing
- Image persistence service exists but needs verification

**Key Documentation:**
- Prompt system: `sophia-bot/services/prompt-loader.ts`
- Image handling: `sophia-bot/services/image-persistence.ts`, `media-decryptor.ts`
- Tools: `sophia-bot/tools/definitions.ts`, `executor.ts`

**Known Issues:**
- Same instruction in multiple prompts causes conflicts (lower priority wins)
- AI sometimes hallucinates image URLs
- 5-minute cache delay can confuse during development

## Constraints

- **Deployment**: Supabase Edge Functions only (no Vercel)
- **WhatsApp**: WaSenderAPI for media handling
- **Testing**: Must test with real agent phone numbers from `agents` table
- **Backwards Compatible**: Changes must not break existing functionality

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Single reservation template | Reduce confusion, use official version | ✓ Good |
| Auto-detect agent for email | Better UX, agents shouldn't specify their own email | ✓ Good |
| Region-based "Others" routing | Leads must go to correct regional manager | ✓ Good |
| DB prompts take precedence over files | Allows live editing without deploy | ✓ Good |
| Reuse documents bucket for WhatsApp images | Avoid creating new bucket | — Pending |

---
*Last updated: 2026-01-28 after milestone v1.1 initialization*
