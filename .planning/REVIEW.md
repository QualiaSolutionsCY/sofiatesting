---
date: 2026-03-17 10:30
mode: ai
scope: Bazaraki link extraction flow
critical_count: 1
high_count: 3
medium_count: 2
low_count: 1
status: has_blockers
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

## Fixes Applied This Session

1. `formatBazarakiSummary` — replaced hardcoded "Still needed" with dynamic missing-field list that tells AI to check agent's message first
2. `extractFromUrl` type patterns — reordered so `semi-detached` matches before `detached`, and `house` matches last
3. `handleExtractFromBazaraki` — strip imageUrls from tool result (Bazaraki CDN blocks external access)
4. Cleared Lauren's broken chat_history so AI won't repeat old patterns
5. Deployed sophia-bot edge function (2x deploys)

## Remaining Work

- **Scraper reliability**: Replace `fetch()` with Firecrawl or accept URL-only extraction and optimize the prompt for that reality
- **Area regex**: Fix to extract indoor area specifically, not first number on page
- **Veranda field**: Add to BazarakiListing interface and extraction logic

---

# Review — 2026-03-16

## Test Results (10 scenarios, post-review fixes)

| # | Scenario | Result | Verified |
|---|----------|--------|----------|
| 1 | Apartment, no "for sale" text | **PASS** | listingType defaulted to "sale", 2 bed apt in Geroskipou |
| 2 | Rental apartment | **PASS** | "For rent" detected, reviewer = agent (rental rule) |
| 3 | Villa, 2,500,000 euro sign price | **PASS** | 2.5M parsed correctly from "2,500,000" |
| 4 | Townhouse in "Gardens Complex" | **PASS** | "garden" feature NOT false-triggered by building name |
| 5 | Land in Drousia | **PASS** | createLandListing, 2000m2, 95k, Drousia correctly |
| 6 | Maisonette with provisions | **PASS** | "provision for A/C", "provision for central heating" |
| 7 | Studio (0 bedrooms) | **PASS** | "studio in Kato Paphos", bedrooms stripped |
| 8 | Semi-detached house | **PASS** | 4 bed semi-detached, all features correct |
| 9 | Region rejection (Larnaca from Paphos) | **PASS** | "not allowed to market outside your region" |
| 10 | No Google Maps link | **PASS** | "Could you please send me the Google Maps link?" |

**Score: 10/10 PASS**

## Blockers (CRITICAL + HIGH)

None.

## Recommendations (MEDIUM + LOW)

- [email-parser.ts:372] "garden" regex still uses negative lookahead which could fail on certain patterns like "rooftop garden bar" (MEDIUM)
- [ai-chat.ts:575] Transient Gemini timeouts ~10% — fallback to gemini-2.0-flash mitigates but doesn't eliminate (LOW)
- [email-parser.ts:152] Price "1.2m" detection uses `< 100` guard to avoid "582m2" — edge case: a property priced at exactly "100m" (100 million) would be missed (LOW)
