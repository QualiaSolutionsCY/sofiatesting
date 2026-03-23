---
date: 2026-03-23 14:30
mode: ai
scope: Property upload pipeline (WhatsApp + Email) — full deep audit
critical_count: 8
high_count: 13
medium_count: 15
low_count: 10
status: has_blockers
---

# Upload Pipeline Deep Review — 2026-03-23

4 parallel Opus agents audited WhatsApp upload, email upload, reviewer/post-upload flow, and AI prompt system.

---

## CRITICAL (8) — Must fix before next deploy

### C1. No input/output sanitization on email webhook
**email-webhook.ts** — WhatsApp path calls `sanitizeUserInput()` and `sanitizeAiOutput()`. Email path does neither. Raw email body goes straight to AI prompt; AI response stored unsanitized. Prompt injection via email is wide open.

### C2. No email deduplication in sophia@ handler
**services/email-router/src/sophia-handler.ts:126-247** — The info@ flow has dedup via `isEmailProcessed()`. The sophia@ flow has zero dedup. If `markSophiaEmailAsRead` fails, the email is reprocessed on next 5-min poll, creating duplicate uploads.

### C3. No email body size limit
**email-webhook.ts:70-75** — No size check on incoming email body. A 10K+ word email hits regex parsing, gets prepended with extraction prefix, and goes entirely to AI. Could exceed token limits, cause timeouts, or spike costs.

### C4. Zod schema marks required fields as optional
**schemas.ts:62-64** — `propertyType`, `price`, `location`, `coveredArea` are `.optional()` in Zod despite being in the tool's `required` array. Zod validation passes without these fields. Secondary check in `validateRequiredFields()` catches it, but defense-in-depth is broken.

### C5. Land listing upload lock is per-agent, not per-property
**land-listing.ts:105** — Lock key is `upload:${agentPhone}` (agent-level). Property listing uses per-property fingerprint. An agent uploading two different land plots within 30 seconds gets falsely blocked on the second.

### C6. Land listing doesn't release upload lock on image validation failure
**land-listing.ts:511-516** — When `hasEnoughImages` returns false, function returns without releasing the lock. Agent locked out for 30 seconds despite no upload in progress. Property listing (property-listing.ts:82-86) handles this correctly.

### C7. `imageUrls` not enforced in server-side required field validation
**special-cases.ts:155-180, schemas.ts:125-128** — `validateRequiredFields()` doesn't check `imageUrls`. Zod defaults it to `[]`. If `pending_images` is also empty, upload proceeds with zero images.

### C8. No content moderation on uploaded images
**image-classifier.ts:94-115** — Classifier only categorizes room types. No NSFW/inappropriate content detection. Compromised account could upload inappropriate images directly to Zyprus drafts.

---

## HIGH (13) — Fix soon

### H1. SSRF bypass on floor plan and title deed downloads
**property-api.ts:634-750** — `uploadFloorPlans` and `uploadTitleDeedFiles` fetch URLs without calling `validateImageUrl()`. Internal service URLs (169.254.x.x) could be accessed.

### H2. No upper bound on parallel image uploads to Zyprus
**property-api.ts:601-629** — `Promise.all` on up to 100 images. Could OOM Edge Function or timeout. No batching/concurrency limit.

### H3. Chat history limited to 10 messages — no truncation warning
**_shared/db.ts:44-78** — Complex uploads span 15+ messages. AI loses early context. Prompt says "re-read EVERY message" but AI physically can't see older messages. Causes re-asking for already-provided info.

### H4. 3 fields collected but silently dropped (yearRenovated, condition, orientation)
**definitions.ts:142-162, 240-243** — AI asks agents for these values, validates them, then never includes them in Zyprus API payload.

### H5. Duplicate checker searches wrong Drupal field
**duplicate-checker.ts:116, 177** — Searches `field_my_notes` but property-api now writes to `field_property_notes`. Duplicate detection may be entirely broken for new listings.

### H6. htmlBody never used for email parsing
**email-webhook.ts:79, 141, 149** — If agent sends HTML-only email, parser gets empty string, extracts nothing. AI gets empty message with "use these pre-extracted values" prefix.

### H7. Pending images cross-contamination between WhatsApp and email
**email-webhook.ts:184-203** — Images keyed by agent phone. Email upload clears all pending images for that phone, destroying any in-progress WhatsApp upload's images.

### H8. Fragile reply detection (Re: prefix only)
**email-webhook.ts:241** — Misses non-English prefixes (AW:, SV:), forwarded emails, subjects starting with "Re:" that are new submissions.

### H9. No retry logic in email pipeline
**sophia-handler.ts:91-119** — Sophia-bot endpoint errors: logged, generic error reply sent, email marked read, never retried. Transient failures = lost emails.

### H10. Bazaraki scraper accepts any bazaraki.com URL
**schemas.ts:304-312** — No path validation. Non-listing URLs get scraped, returning garbage data.

### H11. Image classification skips single-image uploads
**image-classifier.ts:131-134** — Single title deed or floor plan photo won't be detected, ends up in gallery.

### H12. Stale test assertions after Lauren email change
**reviewer-assignment.test.ts** — Still expects `listings@zyprus.com` but code uses `zyprus@zyprus.com` since commit 2e7909e.

### H13. No pg_cron migrations for listing-notifier and draft-cleanup
**listing-notifier/, draft-cleanup/** — Cron schedules set manually, not in migrations. DB recreation would lose scheduling.

---

## MEDIUM (15)

| # | Finding | File |
|---|---------|------|
| M1 | `draftExpiresAt` not set in Edge Function upload handlers (only legacy web) — draft-cleanup never cleans WhatsApp/email uploads | property-listing.ts, land-listing.ts |
| M2 | Conflicting prompt: "assume fitted kitchen for modern" vs "NEVER assume features" | property-upload.ts:605 vs :386 |
| M3 | `coveredVeranda` required in prompt but optional in Zod + not in validateRequiredFields | property-upload.ts:45, schemas.ts:79-82 |
| M4 | `buildingDensity` capped at 100 in Zod but Cyprus allows >100% | schemas.ts:205 |
| M5 | No PII protection in listing descriptions (owner phone could leak) | property-upload.ts |
| M6 | No cancellation/abort flow in upload prompts | property-upload.ts |
| M7 | Price allows 0.01 EUR — no minimum floor | schemas.ts:63 |
| M8 | `ownerPhone` only checks length 4-40, no format validation | schemas.ts:88 |
| M9 | Hardcoded NAME_TO_EMAIL in email handler may drift from upload tool | email-webhook.ts:397-429 |
| M10 | No analytics/Sentry tracking for email channel | email-webhook.ts |
| M11 | Memory/personalization system skipped for email | email-webhook.ts |
| M12 | No image count limit in email-router | sophia-handler.ts:152-193 |
| M13 | No duplicate notification guard in listing-notifier | listing-notifier/index.ts |
| M14 | WhatsApp-only notification, no fallback for missing phone | listing-notifier/index.ts |
| M15 | listing_uploads table has no creation migration (only manual SQL) | db.ts:442-460 |

---

## LOW (10)

| # | Finding |
|---|---------|
| L1 | Forwarded email headers not stripped — could confuse field extraction |
| L2 | Greek/non-Latin text not parsed by email parser |
| L3 | Bazaraki links intentionally blocked in email (parity gap) |
| L4 | Unknown email senders get automated reply (info disclosure) |
| L5 | No DOCX generation in email path |
| L6 | `landType` schema missing "commercial" and "industrial" values from prompt |
| L7 | No confidence threshold on image classification |
| L8 | False-positive title deed guard drops legitimate deeds in 25+ image batches |
| L9 | 404 from Zyprus treated as "not published" instead of "expired" |
| L10 | `kamares` appears in both paphos and larnaca region lists |

---

## Top 5 Actionable Fixes (Priority Order)

1. **Add sanitization to email webhook** (C1) — Copy `sanitizeUserInput()` / `sanitizeAiOutput()` calls from WhatsApp path
2. **Fix land listing upload lock** (C5+C6) — Use per-property fingerprint + release lock on image failure
3. **Add email dedup + size limit** (C2+C3) — Track processed message IDs, cap body at 10K chars
4. **Fix SSRF on floor plan/title deed uploads** (H1) — Add `validateImageUrl()` call before fetch
5. **Fix duplicate checker field** (H5) — Change `field_my_notes` to `field_property_notes` in search queries

---

## Architecture Notes (Positive)

The agents noted several well-designed defenses:
- Upload lock prevents concurrent duplicate listings (property path)
- SSRF protection on regular image classification (just missing on floor plans/title deeds)
- Zod validation on all tool inputs
- Server-side email parser overrides AI-hallucinated values
- `assignTo` stripped from non-management agents server-side
- Regional access enforced server-side, not just in prompts
- Property upload prompt is exceptionally thorough (~628 lines of anti-hallucination rules)

---

# Review — 2026-03-17 — Bazaraki Link Flow

## Blockers (CRITICAL + HIGH)

- [bazaraki-scraper.ts:149-181] Scraper is fundamentally broken — Cloudflare blocks fetch() from edge functions ~100% of the time. The HTML extraction phase never succeeds. Every Bazaraki upload requires agents to provide all details manually. Consider Firecrawl or removing dead code. (CRITICAL)
- [bazaraki-scraper.ts:237-240] Area regex `(\d+)\s*(?:m2|sq)` grabs FIRST number on page — often plot size, not indoor area. Would produce wrong coveredArea on the rare occasion scrape succeeds. (HIGH) — UNFIXED
- [bazaraki-scraper.ts:121-122] `detached` regex matched before `semi-detached`, making semi-detached unreachable. (HIGH) — FIXED
- [data-retrieval.ts:170] Bazaraki image URLs passed to AI despite prompt saying "NEVER use Bazaraki image URLs". Creates confusion ("Images found: 12" but "send your own photos"). (HIGH) — FIXED

## Recommendations (MEDIUM + LOW)

- [bazaraki-scraper.ts:306-308] formatBazarakiSummary hardcoded "Still needed: Owner name, Owner phone, Title deed status" regardless of what agent already provided. AI followed this instruction and re-asked for info already given. (MEDIUM) — FIXED
- [bazaraki-scraper.ts] BazarakiListing interface has no coveredVeranda field. Veranda can never be extracted even if scrape succeeds. Not in missing-field detection either. (MEDIUM) — UNFIXED
- [bazaraki-scraper.ts:204] Price parsing strips ALL commas/dots — would break on `350,000.00` format (parses as 35000000). Edge case. (LOW)

## Fixes Applied 2026-03-17

1. `formatBazarakiSummary` — replaced hardcoded "Still needed" with dynamic missing-field list
2. `extractFromUrl` type patterns — reordered so `semi-detached` matches before `detached`
3. `handleExtractFromBazaraki` — strip imageUrls from tool result
4. Cleared Lauren's broken chat_history
5. Deployed sophia-bot edge function (2x deploys)
