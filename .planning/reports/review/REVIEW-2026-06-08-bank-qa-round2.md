# Review — Lauren's Bank QA Round 2 (2026-06-08)

Evidence: Lauren's WhatsApp QA screenshot + live chat_history + listing_uploads (tests 43208 Altia, Altamira(no id), 43209 Gordian, 43210 REMU, created 05:25–05:50 UTC — i.e. AFTER my round-1 deploy at 21:59 UTC the night before). So these failures are against my deployed code.

## Fixed this round (deployed + pushed `d032fd7`)

| # | Finding | Severity | Fix |
|---|---------|----------|-----|
| R1 | **Double confirmation on publish** — agents got WhatsApp **and** email. Lauren wants WhatsApp only. This was a regression I introduced in round 1. | HIGH | Reverted the email send in `listing-notifier`; kept the detection + queue fixes. WhatsApp-only now. |
| R2 | **Altia/Altamira owner not auto-assigned** — `isBankListing` used `rules/bank-detection.ts` (no Altia pattern; Altamira only `-amc/-npl`), so `marketplace.altia.com.cy` and `altamirarealestate.com.cy` weren't recognised as bank listings. | HIGH | Switched to `portal-scraper.isBankPortalUrl` (recognises all real domains) in `field-validation.ts` + `land-listing.ts`. |
| R3 | **chat_history poisoning** — "she keeps putting Agios Nektarios as a default" is the AI copying a stale wrong-location pattern (the string is nowhere in code). I skipped the documented "clear chat_history after prompt changes" step in round 1. | MEDIUM | Cleared the 2 active test threads (153 rows). |

## Diagnosed but NOT patched blind (needs a dedicated extraction pass + live re-test)

These are **Firecrawl extraction-quality + AI-behaviour** issues that differ per portal. Round 1 patched from the PDF *descriptions* and several didn't land because the real question is *whether Firecrawl returns the data for each specific SPA portal* — only verifiable by running the actual scrape against the live pages and re-testing per portal. Blind patching is what produced these round-2 failures, so I stopped.

| Finding | Severity | Why it needs live iteration |
|---------|----------|------------------------------|
| **Price not extracted** (Altia €32,891 wrong; Altamira "price wasn't found") | HIGH | Each portal renders price differently; the extraction schema/regex must be tuned against the live page DOM, not guessed. |
| **Location pin wrong / coords inaccurate** (Altia, Gordian, REMU "no google link") | HIGH | When a portal doesn't expose coords to Firecrawl, the handler falls back to a city/area centroid (`DEFAULT_COORDINATES`) → wrong pin. Needs per-portal coordinate extraction verified live. chat_history clear (R3) should reduce the "default" repetition. |
| **Altamira image 404 aborts the whole listing** ("None of the images could be uploaded") | HIGH | Scraped image URLs 404 (hotlink/expiry). Bypassing the min-1-image gate risks the Zyprus API rejecting the draft — must confirm Zyprus behaviour before changing `property-listing.ts:267` / `land-listing.ts:774`. |
| **Wrong photos** (REMU) | MEDIUM | Need to see which URLs the scraper returned for that page vs the real gallery. |
| **Title deed wrong** (defaults to "pending"; bank shows separate deed) | MEDIUM | `data-retrieval` rule #4 hardcodes `pending`; should extract from the page instead. |
| **Feature hallucination** ("common pool" on Gordian — none on page) | MEDIUM | AI inventing amenities; needs a "only features explicitly on the page" guard + live check. |
| **Missing fields** (Year of Build, etc.) | LOW | Add to extraction schema, verify Firecrawl returns them. |

## Verdict
**PARTIAL.** The two clear production bugs (double-email, Altia/Altamira owner) are fixed and live. The extraction-quality cluster is real and needs a focused, live, per-portal pass — I will not claim it fixed without running the actual scrapes and a re-test.

## Recommended next step
1. **Ask Lauren to re-run the 4 tests now** (history cleared + detection fixed) — this tells us how much was poisoning vs. genuine extraction gaps, and narrows the per-portal work.
2. Then a dedicated extraction pass with live Firecrawl against each portal's real pages: price + coordinates + gallery + title-deed selectors, portal by portal, re-tested after each.
