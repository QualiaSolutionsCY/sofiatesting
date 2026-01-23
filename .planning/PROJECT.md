# SOPHIA Production Hardening

## What This Is

Production-ready fixes for SOPHIA AI assistant — fixing template generation issues, Telegram lead routing bugs, and property listing upload problems. This brings SOPHIA to zero-mistake production quality for Zyprus Property Group agents.

## Core Value

**Agents can trust SOPHIA to do the right thing every time** — correct templates, correct routing, correct uploads, no manual intervention needed.

## Requirements

### Validated

(None yet — ship to validate)

### Active

#### Templates & Responses
- [ ] **TMPL-01**: SOPHIA never mentions template numbers to users (no "Template 11", "Template 12")
- [ ] **TMPL-02**: Single reservation template only — use official `RESERVATION FEE_with witness` version
- [ ] **TMPL-03**: Email sending auto-detects agent and sends to their email without asking
- [ ] **TMPL-04**: No asterisks visible in WhatsApp messages — clean text formatting
- [ ] **TMPL-05**: Non-Exclusive Marketing Agreement has proper signature spacing
- [ ] **TMPL-06**: Non-Exclusive Marketing Agreement has correct border/frame styling

#### Telegram Lead Routing
- [ ] **LEAD-01**: "Others" group routes to correct regional manager based on property region
- [ ] **LEAD-02**: Nicosia leads go to Ivan (not Narine/Famagusta)
- [ ] **LEAD-03**: Each region routes to its designated regional manager

#### Listing Uploads
- [ ] **LIST-01**: Listing Reviewer 1 assigned correctly per spec (Lauren for sales, agent for rentals)
- [ ] **LIST-02**: Listing Reviewer 2 assigned correctly (regional manager for sales)
- [ ] **LIST-03**: Listing Owner assigned correctly (special cases: Marios→azinas@, Michelle→michelle@, etc.)
- [ ] **LIST-04**: My Notes field populated with owner details when provided
- [ ] **LIST-05**: Google Maps pin placed 2-3 streets away at neutral location
- [ ] **LIST-06**: WhatsApp phone gallery images can be uploaded (not just URLs)

### Out of Scope

- New features beyond fixing existing functionality
- UI/web app changes (this is Edge Function fixes only)
- Telegram bot enable/disable (currently disabled by design)

## Context

**Current State:**
- SOPHIA runs as Supabase Edge Function `sophia-bot`
- WhatsApp integration via WaSenderAPI
- Telegram lead routing exists but has bugs
- Property uploads work but have assignment issues
- Templates work but have formatting/UX issues

**Key Documentation:**
- Upload spec: `UPLOAD-LISTINGS-EXTENSIVE-INFO/FROM-MEETINGS/`
- Lead routing: `lib/telegram/lead-router.ts` and `routing-constants.ts`
- Templates: Live in Edge Function `sophia-bot/docx/templates/`

**Official Reservation Template:**
- `/home/qualia/Downloads/RESERVATION FEE_with witness and more official than standard (4).docx`

## Constraints

- **Deployment**: Supabase Edge Functions only (no Vercel)
- **WhatsApp**: WaSenderAPI for media handling
- **Testing**: Must test with real agent phone numbers from `agents` table

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Single reservation template | Reduce confusion, use official version | — Pending |
| Auto-detect agent for email | Better UX, agents shouldn't specify their own email | — Pending |
| Region-based "Others" routing | Leads must go to correct regional manager | — Pending |

---
*Last updated: 2025-01-23 after initialization*
