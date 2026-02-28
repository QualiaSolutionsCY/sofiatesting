# Agent Handoff: Upload System Fixes

## Context

You're picking up from an audit of the SOPHIA bot's property listing upload system. SOPHIA is a WhatsApp AI assistant that helps real estate agents upload property listings to the Zyprus platform (a Drupal-based CMS with a JSON:API backend).

The full audit with all findings, root causes, and exact file:line references is at:
**`docs/UPLOAD-AUDIT-2026-02-28.md`** — read this first.

The Postman source-of-truth for how the Zyprus API works is at:
**`docs/UPLOAD-LISTINGS-EXTENSIVE-INFO/source-of-truth-postman/`** — 7 files covering property uploads, land uploads, file uploads, locations, taxonomy, and users.

Business context from meetings with Zyprus team is at:
**`docs/UPLOAD-LISTINGS-EXTENSIVE-INFO/FROM-MEETINGS/`** — 13 files, most important are `00_CHEAT_SHEET.md`, `05_REQUIRED_FIELDS.md`, `11_WORKFLOW_STEPS.md`, and `12_API_INTEGRATION.md`.

---

## What's Broken

The upload system works end-to-end (listings DO get created on Zyprus), but the quality is bad:

1. **Same property gets uploaded 3-4 times** because the duplicate checker detects duplicates but intentionally never blocks them (comment literally says "informational only - never blocks"). The upload lock is also per-agent not per-property, so after 2 minutes the same property can be re-uploaded.

2. **Street addresses appear as property locations** ("Apostolou Pavlou Ave, Paphos" instead of an area like "Kato Paphos"). The street detector exists but has gaps — "Michali" isn't caught because suffix "i" is missing from the Greek name endings list.

3. **Lauren (the main user) has zero chat history** — image-only WhatsApp messages exit early in the webhook handler and never save to `chat_history`. The AI starts every conversation with her from scratch.

4. **Land listings use wrong field name** — code sends `field_property_notes` but the Zyprus API expects `field_notes` for land nodes. Notes are probably silently dropped.

5. **No listing notifications are sent** — this is actually by design (notifier waits for reviewers to manually publish on Zyprus dashboard), but no listings have been published by reviewers yet. This is an operational issue, not a code bug.

---

## What You Need to Fix

### P0 — Fix these first

**Fix 1: Make duplicate checker block uploads**
- File: `supabase/functions/sophia-bot/tools/handlers/property-listing.ts`
- Lines 89-120: The duplicate check section
- Currently sets `potentialDuplicateNote` string but never returns/blocks
- Change it to return `{ needsInput: true, question: "..." }` when a duplicate is found within 24 hours (currently only checks 2 hours)
- Also extend the window from 2 hours to 24 hours

**Fix 2: Change upload lock to per-property fingerprint**
- File: `supabase/functions/sophia-bot/tools/handlers/property-listing.ts`
- Line 74: `const propertyLockKey = \`upload:${agentPhone}\``
- Change to: `\`upload:${agentPhone}:${(args.location as string || '').toLowerCase()}:${args.price}:${(args.ownerPhone as string || '').slice(-6)}\``
- This makes the lock specific to the property, not just the agent

**Fix 3: Fix land field_notes**
- File: `supabase/functions/sophia-bot/zyprus/client.ts`
- Line 1288: `attributes.field_property_notes = listing.myNotes;`
- Change to use the correct field name per Postman spec: `field_notes`
- Check the Postman spec for the exact format (may need `{ value: listing.myNotes }` wrapper)

### P1 — Fix these next

**Fix 4: Save chat history for image-only messages**
- File: `supabase/functions/sophia-bot/handlers/webhook.ts`
- Lines 561-568: The `isImageOnlyMessage` early return
- Add a call to save the message to chat_history before returning
- Look at how `addMessage()` is called elsewhere in the same file for the correct pattern

**Fix 5: Improve street address detection**
- File: `supabase/functions/sophia-bot/tools/validators/location.ts`
- Line 153: Add `'i'` to the Greek name suffix endings array
- Also add a known streets blocklist before the suffix check:
  ```
  const knownStreets = [
    "apostolou pavlou", "michali sougioul", "georgiou griva",
    "archbishop makarios", "spyrou kyprianou", "makarios iii"
  ];
  ```

### P2 — Nice to have

**Fix 6: Fix land geo_type casing**
- File: `supabase/functions/sophia-bot/zyprus/client.ts`
- Line 1296: Change `geo_type: "point"` to `geo_type: "Point"` to match property listing format and Postman spec

---

## How to Access Everything

### Supabase
- **Project ID:** `vceeheaxcrhmpqueudqx`
- **MCP tools available:** `mcp__supabase__execute_sql`, `mcp__supabase__get_logs`, etc.
- Test connection: `mcp__supabase__execute_sql` with `SELECT 1 AS test` and project_id `vceeheaxcrhmpqueudqx`

### Key Tables
```sql
-- Recent listing uploads (see the duplicates)
SELECT * FROM listing_uploads ORDER BY created_at DESC LIMIT 20;

-- Chat history (notice only Fawzi's phone has entries)
SELECT DISTINCT user_id FROM chat_history;

-- Agent info
SELECT id, full_name, mobile, region, role FROM agents;

-- Upload locks
SELECT * FROM upload_locks ORDER BY created_at DESC LIMIT 10;
```

### Deploy
After making changes to edge functions:
```bash
# Deploy sophia-bot
supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx

# Deploy listing-notifier (only if you change it)
supabase functions deploy listing-notifier --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx
```

### Verify
- Edge function logs: `mcp__supabase__get_logs` with service `edge-function`
- Test on WhatsApp: Send a message to the SOPHIA bot number and check the webhook handler processes it
- Check Zyprus listings: URLs are in format `https://dev9.zyprus.com/property/{uuid}` or `https://dev9.zyprus.com/land/{uuid}`

---

## Architecture Quick Reference

The upload flow is:
```
WhatsApp message → webhook.ts (dedup, extract images/text)
  → ai-chat.ts (Gemini AI via OpenRouter, tool calling)
    → property-listing.ts handler (validation, images, location resolution)
      → taxonomy-cache.ts (resolve names → Zyprus UUIDs)
      → client.ts (build JSON:API payload, POST to Zyprus)
      → listing_uploads table (track for notification)
```

Two AI implementations exist:
- **WhatsApp (sophia-bot):** OpenRouter → Gemini, runs as Supabase Edge Function
- **Web app:** Vercel AI SDK → OpenRouter, runs on Vercel (separate, don't touch)

### Important Files
| File | What it does |
|------|-------------|
| `supabase/functions/sophia-bot/tools/handlers/property-listing.ts` | Main upload orchestrator — validation, images, duplicate check, API call |
| `supabase/functions/sophia-bot/zyprus/client.ts` | Builds JSON:API payload and sends to Zyprus. `createDraftListing()` and `createLandListing()` |
| `supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts` | Resolves location/property type/feature names to Zyprus UUIDs |
| `supabase/functions/sophia-bot/tools/validators/location.ts` | Street address detection, Google Maps URL parsing |
| `supabase/functions/sophia-bot/tools/validators/upload-lock.ts` | DB-based upload lock (prevents concurrent uploads) |
| `supabase/functions/sophia-bot/handlers/webhook.ts` | WhatsApp webhook handler, message dedup, image processing |
| `supabase/functions/sophia-bot/services/duplicate-checker.ts` | Zyprus API duplicate search (EXISTS but NEVER CALLED) |
| `supabase/functions/sophia-bot/config/business-rules.ts` | All constants, UUIDs, timeouts, regional config |

---

## Testing After Fixes

1. **Duplicate blocking:** Try uploading the same property twice via WhatsApp within 24 hours — second attempt should be blocked with a message like "This property was already uploaded X minutes ago"
2. **Street detection:** Pass "Michali Sougioul, Limassol" as location — should be rejected and ask for area name
3. **Chat history:** Send an image-only message to SOPHIA, then check `SELECT * FROM chat_history WHERE user_id = '{phone}' ORDER BY created_at DESC LIMIT 5`
4. **Land notes:** Upload a land listing and verify the notes appear correctly on `dev9.zyprus.com/land/{uuid}`

---

## Don't Touch

- `supabase/functions/listing-notifier/` — working correctly, the notification issue is operational (reviewers not publishing), not a code bug
- `app/(chat)/` — web app AI, completely separate from WhatsApp bot
- Prompt files (`supabase/functions/sophia-bot/prompts/`) — not related to upload issues
- `docs/UPLOAD-LISTINGS-EXTENSIVE-INFO/` — reference only, don't modify
