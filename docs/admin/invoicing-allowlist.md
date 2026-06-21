# Invoicing Allowlist — Authorized Agents & Maintenance Procedure

**Last Updated**: 2026-06-21
**Audience**: Admins / maintainers only
**Status**: ✅ Production

## Overview

Only three named agents may drive invoicing (create / list / approve / mark-paid /
credit-note / receipt) through Sophia over WhatsApp. That restriction is enforced by a
**hardcoded allowlist that lives in TWO places** which must be kept in sync. Updating one
location and not the other creates a silent authorization mismatch — an agent who looks
authorized in one gate but is rejected by the other.

This doc names the current allowlist, identifies both enforcement points, and gives the
exact step-by-step procedure to add or remove an agent.

See also:
- Operational runbook: [`./invoicing-runbook.md`](./invoicing-runbook.md)
- Environment / secrets reference: [`./invoicing-env-reference.md`](./invoicing-env-reference.md)

## Who is on the allowlist

The authoritative list is `INVOICE_AUTHORIZED_AGENTS` in
[`lib/invoices/constants.ts`](../../lib/invoices/constants.ts) (lines 10–14):

| Name | MSISDN | Last 8 digits |
|------|--------|---------------|
| Fawzi Goussous | `35799111668` | `99111668` |
| Charalambos Pitros | `35799076732` | `99076732` |
| Marios Polyviou | `35799921560` | `99921560` |

### How matching works (last-8 comparison)

`isAuthorizedAgent(phone)` (`constants.ts` lines 20–25) does **not** compare the full
number. It:

1. Normalizes the incoming value to digits only via `normalizeMsisdn` (strips `+`, `00`,
   spaces, WhatsApp JID suffixes — `(input).replace(/\D/g, "")`).
2. Rejects anything shorter than 8 digits.
3. Takes the **last 8 digits** of the caller and compares them to the last 8 digits of
   each entry in `INVOICE_AUTHORIZED_AGENTS`.

Comparing the last 8 digits tolerates the many shapes the same Cyprus mobile arrives in:
`+357 99 111668`, `0035799111668`, `35799111668`, or a WhatsApp JID. The `35799111668`
stored value and a caller sending `99111668` both reduce to `99111668` and match.

## Two enforcement points (keep in sync)

> **The constant in `constants.ts` and the `ALLOWED_LAST8` array in `invoice.ts` encode
> the SAME three agents and MUST be updated together.** Drift between them is the footgun
> this document exists to prevent.

### 1. In-bot gate (FIRST gate, runs inside sophia-bot)

- **File**: [`supabase/functions/sophia-bot/tools/handlers/invoice.ts`](../../supabase/functions/sophia-bot/tools/handlers/invoice.ts)
- **Constant**: `ALLOWED_LAST8 = ["99111668", "99076732", "99921560"]` (line 27)
- **Check**: `isAllowed(phone, agent)` (lines 29–36) normalizes the caller's phone (and the
  agent record's `mobile`) and tests whether the last 8 digits are in `ALLOWED_LAST8`.
- **Where it runs**: `handleManageInvoice` calls `isAllowed` (line 43) **before** any
  bridge call leaves the bot. An unauthorized sender gets a generic refusal
  (`"Invoicing is limited to authorized staff, so I can't action that here."`, lines
  48–51) and the request never reaches the Vercel route.

This is the **first** gate — it stops an unauthorized request before it leaves the bot.

### 2. Vercel route gate (defense-in-depth re-check)

- **Constant file**: [`lib/invoices/constants.ts`](../../lib/invoices/constants.ts) —
  `INVOICE_AUTHORIZED_AGENTS`.
- **Check site**: [`app/api/sophia/intent/route.ts`](../../app/api/sophia/intent/route.ts)
  line 52 — `isAuthorizedAgent(waNumber)`. On a miss the route returns a **generic
  deflection** with HTTP 403 (lines 54–57):
  `"Sorry, I can't help with invoicing from this number."` — it **never reveals the
  allowlist** (no names, no numbers).
- **Also consumed by**:
  [`lib/invoices/actions/documents.ts`](../../lib/invoices/actions/documents.ts) line 130
  — `INVOICE_AUTHORIZED_AGENTS.find((agent) => agent.name === "Marios Polyviou")` to look
  up Marios for the WhatsApp review/approval send. If you rename Marios in `constants.ts`,
  that lookup breaks (it matches on the literal name `"Marios Polyviou"`).

The route re-checks **independently** of the bot. This is intentional defense-in-depth:
the `/api/sophia/intent` endpoint is HMAC-signed (`x-sophia-signature`, verified in
`route.ts` lines 15–28, 36–38), but a forged direct call that somehow presented a valid
HMAC would still be stopped by `isAuthorizedAgent` at line 52 even if the in-bot gate were
bypassed.

## Add an agent

1. **Get the agent's mobile.** Read the `mobile` column for that agent from the `agents`
   table in Supabase project `vceeheaxcrhmpqueudqx`. Store/compare the full MSISDN (e.g.
   `35799XXXXXX`); only the last 8 digits are used for matching.
2. **Vercel constant.** Add a `{ name, msisdn }` entry to `INVOICE_AUTHORIZED_AGENTS` in
   [`lib/invoices/constants.ts`](../../lib/invoices/constants.ts) — use the full MSISDN.
3. **In-bot gate.** Add the **last 8 digits** of that mobile to `ALLOWED_LAST8` in
   [`supabase/functions/sophia-bot/tools/handlers/invoice.ts`](../../supabase/functions/sophia-bot/tools/handlers/invoice.ts).
4. **(Optional) Sophia prompt awareness.** If the new agent should be named in Sophia's
   self-awareness so she never improvises a refusal, update the **"Authorized staff"** line
   in the DB `invoicing` prompt (Supabase Dashboard → `sophia_prompts` WHERE
   `key = 'invoicing'`, then POST `/admin/prompts/invalidate` to clear the cache). Mirror
   the same change in the fallback file
   [`supabase/functions/sophia-bot/prompts/behaviors/invoicing.ts`](../../supabase/functions/sophia-bot/prompts/behaviors/invoicing.ts)
   line 28 (the `**Authorized staff:**` line). Authorization is still enforced by the gates
   in steps 2–3; the prompt only affects Sophia's tone, not who is allowed.
5. **Deploy BOTH targets** (commands from the root `CLAUDE.md` Deploy Commands section):
   ```bash
   # Vercel web app — picks up the new INVOICE_AUTHORIZED_AGENTS constant
   vercel --prod

   # sophia-bot Edge Function — picks up the new ALLOWED_LAST8 + prompt fallback
   supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx
   ```

## Remove an agent

Do the same three code/prompt locations **in reverse**, then redeploy both targets. Remove
from **BOTH** gates — see the warning below.

1. **In-bot gate.** Remove the agent's last-8 digits from `ALLOWED_LAST8` in
   [`supabase/functions/sophia-bot/tools/handlers/invoice.ts`](../../supabase/functions/sophia-bot/tools/handlers/invoice.ts).
2. **Vercel constant.** Remove the agent's `{ name, msisdn }` entry from
   `INVOICE_AUTHORIZED_AGENTS` in
   [`lib/invoices/constants.ts`](../../lib/invoices/constants.ts).
3. **Sophia prompt.** Remove the agent's name from the **"Authorized staff"** line in the
   DB `invoicing` prompt (and the fallback file
   [`supabase/functions/sophia-bot/prompts/behaviors/invoicing.ts`](../../supabase/functions/sophia-bot/prompts/behaviors/invoicing.ts)
   line 28), then POST `/admin/prompts/invalidate` to clear the cache.
4. **Deploy BOTH targets:**
   ```bash
   vercel --prod
   supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx
   ```

> **Why remove from BOTH gates.** Removing the agent from only one gate leaves them
> partially authorized. The in-bot gate is the effective day-to-day block (it runs first),
> but leaving the agent in `INVOICE_AUTHORIZED_AGENTS` means a forged **direct** call to
> `/api/sophia/intent` that presented a valid HMAC signature would still pass the Vercel
> re-check at `route.ts:52`. Always remove from both `ALLOWED_LAST8` and
> `INVOICE_AUTHORIZED_AGENTS`.

## Security notes

- **No secrets here.** The MSISDNs above are public code constants already in the repo.
  Never paste HMAC secrets (`SOPHIA_BRIDGE_SECRET`), service-role keys, or access codes
  into this doc — see [`./invoicing-env-reference.md`](./invoicing-env-reference.md) for
  where those live.
- **Generic deflection only.** Both gates return a generic refusal to unauthorized
  callers. Keep it that way — the allowlist (names and numbers) must never be echoed back
  to a caller in a response.

---

**Maintainers**: Qualia Solutions
**Status**: ✅ Production
