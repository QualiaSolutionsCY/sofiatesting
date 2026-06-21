# Credentials & Reference Handoff

**Last Updated**: 2026-06-21
**Audience**: A new owner / operator taking over the running system
**Status**: Production handoff reference

> **Security note (per `rules/security.md`).** This document records variable
> **NAMES**, their purpose, and **WHERE** they live (which runtime / how they are
> managed). It deliberately contains **no secret VALUES** — no API keys, tokens,
> access codes, service-role JWTs, webhook secrets, or HMAC secrets appear
> anywhere in this file. To inspect or set a value, use the management surfaces
> named below (`vercel env` for Vercel, `supabase secrets` for Supabase Edge),
> never this doc.

The system spans **three managed projects**: two Supabase projects (primary app
data + a separate invoicing database) and one Vercel project (the admin panel).
Secrets live in two places only — **Vercel environment variables** (the Next.js
web app) and **Supabase Edge secrets** (the `sophia-bot` and sibling Edge
functions). Every name below was confirmed present in code; any name expected but
not found is flagged as such.

---

## 1. Hosting & data projects

| Project | Ref / Name | Dashboard / URL | What it holds |
|---------|-----------|-----------------|---------------|
| **Supabase — primary (app data)** | `vceeheaxcrhmpqueudqx` | https://supabase.com/dashboard/project/vceeheaxcrhmpqueudqx | Sophia bot data, agents, leads, RLS-protected app tables, all Edge Functions (`sophia-bot`, `telegram-sophia`, `telegram-indexer`, `listing-notifier`, `draft-cleanup`, `prompt-optimizer`, `call-audit`). |
| **Supabase — invoicing** | `tijadsdysuxkxrpdlecq` | https://supabase.com/dashboard/project/tijadsdysuxkxrpdlecq | Invoicing database only — drives `/admin/invoices`. Accessed via the service-role `invoiceDb` client (`lib/invoices/supabase/server.ts`). **Separate from the primary DB** — do not confuse the two. |
| **Vercel — web app** | `sofiatesting` | https://sofiatesting.vercel.app | **ADMIN PANEL ONLY.** Next.js app: `/admin`, `/admin/invoices`, the access gate at `/access`, and the `/api/sophia/intent` bridge receiver. Root `/` redirects to `/admin`. |

> The two Supabase projects are intentionally separate: app data lives on
> `vceeheaxcrhmpqueudqx`; invoicing lives on `tijadsdysuxkxrpdlecq`. Keep their
> credentials distinct and never cross-import their clients.

---

## 2. Edge Function secrets (Supabase, ref `vceeheaxcrhmpqueudqx`)

These are read by the Edge Functions via `Deno.env.get(...)`. The names below are
grounded in the actual `Deno.env.get` call sites under `supabase/functions/`.

| Secret name | Purpose | In code |
|-------------|---------|---------|
| `OPENROUTER_API_KEY` | OpenRouter API key — all LLM calls (Sophia's AI). | Found |
| `WASEND_API_KEY` | WaSenderAPI session key — sends WhatsApp messages from the bot. | Found |
| `WASEND_WEBHOOK_SECRET` | Verifies inbound WaSenderAPI webhook signatures. | Found |
| `RESEND_API_KEY` | Resend API key — outbound email. | Found |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token — lead-router / private chat bot. | Found |
| `TELEGRAM_WEBHOOK_SECRET` | Verifies inbound Telegram webhook requests. | Found |
| `CX3_BASE_URL` | 3CX telephony base URL (call-audit integration). | Found |
| `CX3_USERNAME` | 3CX API username. | Found |
| `CX3_PASSWORD` | 3CX API password. | Found |
| `CX3_PROXY_SECRET` | Shared secret for the 3CX proxy (call-audit). | Found (also present) |
| `ZYPRUS_CLIENT_ID` | Zyprus API OAuth client ID — property uploads. | Found |
| `ZYPRUS_CLIENT_SECRET` | Zyprus API OAuth client secret. | Found |
| `ZYPRUS_API_URL` | Zyprus API base URL. | Found |
| `ZYPRUS_SITE_URL` | Zyprus site URL (upload target). | Found (also present) |
| `SOPHIA_ADMIN_SECRET` | Shared secret authenticating the email-router → `sophia-bot` `/email` endpoint (`X-Admin-Secret`). | Found |
| `SOPHIA_BRIDGE_SECRET` | HMAC-SHA256 key signing the WhatsApp→invoicing bridge. **Must match the Vercel copy** — see [invoicing-env-reference.md](./invoicing-env-reference.md). | Found |
| `SOPHIA_BRIDGE_URL` | Bridge endpoint the Edge function posts to (defaults to the Vercel `/api/sophia/intent`). | Found (also present) |
| `SENTRY_DSN` | Sentry DSN — error reporting from Edge Functions. | Found |
| `FIRECRAWL_API_KEY` | Firecrawl API key — web scraping. | Found |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key for the primary DB (Edge runtime, auto-provided). | Found (also present) |
| `SUPABASE_URL` | Primary Supabase URL (Edge runtime, auto-provided). | Found (also present) |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | Google / Gemini API keys (auxiliary AI paths). | Found (also present) |
| `BAZARAKI_SCRAPER_SECRET` / `BAZARAKI_SCRAPER_URL` | Auth + URL for the Bazaraki scraper service. | Found (also present) |
| `SOPHIA_TELEGRAM_ENABLED` | Toggle flag (not a secret) for the Telegram bot. | Found (toggle, not secret) |

> Names marked **"Found (also present)"** appeared in the `Deno.env.get` grep
> beyond the task's minimum list and are recorded for completeness. Every name in
> this table was confirmed in `supabase/functions/`.

### Managing Edge secrets

```bash
# list Edge secret names (names only — values are never printed)
supabase secrets list --project-ref vceeheaxcrhmpqueudqx

# set / rotate a secret
supabase secrets set SENTRY_DSN=... --project-ref vceeheaxcrhmpqueudqx
```

> **A secret change does not take effect until the function is redeployed.** After
> `supabase secrets set ...`, redeploy the affected function (most commonly
> `sophia-bot`):
>
> ```bash
> supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx
> ```

---

## 3. Vercel environment variables (web app)

The web app's **invoicing + Sophia-bridge** variables (the
`INVOICE_SUPABASE_*`, `SOPHIA_BRIDGE_*`, `WASENDER_*`, access-code, and bucket
vars) are documented in full — with read sites, the HMAC-match requirement, and a
rotation procedure — in **[invoicing-env-reference.md](./invoicing-env-reference.md)**.
That table is the source of truth for the invoicing/bridge surface; it is **not
duplicated here**.

The broader web-app env var NAMES (confirmed via `process.env` grep across
`app/` and `lib/`):

| Variable name | Purpose | In code |
|---------------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Primary Supabase URL exposed to the browser. | Found |
| `SUPABASE_SERVICE_ROLE_KEY` | Primary DB service-role key. **Server-only** — never `NEXT_PUBLIC_`, never imported into a client component. | Found |
| `AUTH_SECRET` | HMAC key signing the access-gate cookie (`lib/access/gate.ts`). | Found |
| `NEXTAUTH_URL` | Base URL for NextAuth / invite links. | Found |
| `ADMIN_ACCESS_CODE` | Code that unlocks the admin panel at `/access`. | Found |
| `INVOICES_ACCESS_CODE` | Code that unlocks the invoices page at `/access`. | Found |
| `RESEND_API_KEY` | Resend API key — outbound email from the web app. | Found |
| `ZYPRUS_CLIENT_ID` | Zyprus API OAuth client ID (web-app upload paths). | Found |
| `ZYPRUS_CLIENT_SECRET` | Zyprus API OAuth client secret. | Found |
| `ZYPRUS_API_URL` | Zyprus API base URL. | Found |
| `ZYPRUS_SITE_URL` | Zyprus site URL. | Found |
| `OPENROUTER_API_KEY` | OpenRouter API key (web-app AI paths). | Found |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` | Telegram bot token + webhook secret (web-app paths). | Found |
| `WASENDER_API_KEY` / `WASENDER_PERSONAL_ACCESS_TOKEN` / `WASENDER_WEBHOOK_SECRET` | WaSenderAPI keys for web-app WhatsApp delivery (see invoicing-env-reference.md). | Found |
| `CRON_SECRET` | Shared secret guarding scheduled `/api/cron` routes. | Found |
| `ADMIN_API_KEY` | Shared secret for admin API routes. | Found |
| `INVITE_FROM_EMAIL` | From-address for agent invite emails. | Found |
| `NEXT_PUBLIC_APP_URL` | Public base URL of the app. | Found |

> Note: the **Edge** runtime uses the names `WASEND_API_KEY` /
> `WASEND_WEBHOOK_SECRET`, while the **Vercel** web app uses
> `WASENDER_API_KEY` / `WASENDER_WEBHOOK_SECRET` (different spelling — they are
> distinct variables in distinct runtimes). Set each in its own surface.

### Managing Vercel env vars

```bash
# inspect which vars are set (names only — values are masked / Sensitive)
vercel env ls

# add or update a variable for an environment
vercel env add AUTH_SECRET production
```

Managed via the Vercel dashboard (Project Settings → Environment Variables) or the
CLI above. Some are marked **Sensitive** in Vercel and pull empty on
`vercel env pull` — that is expected.

---

## 4. Third-party services

Where to obtain or rotate each provider's key. The **NAME** column is the env var
the system reads; rotation means generating a new value at the provider and
updating the corresponding env var / Edge secret (Sections 2–3).

| Service | Used for | Key NAME(s) | Where to obtain / rotate |
|---------|----------|-------------|--------------------------|
| **OpenRouter** | All LLM / AI calls (Sophia) | `OPENROUTER_API_KEY` | openrouter.ai dashboard → API keys. (Qualia: ask Fawzi for a key.) |
| **WaSenderAPI** | WhatsApp send/receive | `WASEND_API_KEY`, `WASEND_WEBHOOK_SECRET` (Edge); `WASENDER_API_KEY`, `WASENDER_PERSONAL_ACCESS_TOKEN`, `WASENDER_WEBHOOK_SECRET` (Vercel) | WaSenderAPI account dashboard → session / API keys. |
| **3CX (telephony / call audit)** | Call tracking via `call-audit` function | `CX3_BASE_URL`, `CX3_USERNAME`, `CX3_PASSWORD`, `CX3_PROXY_SECRET` | 3CX admin console. (Telnyx is the Qualia-standard SIP carrier, but the code references the 3CX integration, not a Telnyx API key — no `TELNYX_*` var is present in code.) |
| **Resend** | Outbound email | `RESEND_API_KEY` | resend.com dashboard → API keys. Domain is verified. |
| **Zyprus API** | Property uploads | `ZYPRUS_CLIENT_ID`, `ZYPRUS_CLIENT_SECRET`, `ZYPRUS_API_URL`, `ZYPRUS_SITE_URL` | Zyprus API provider (OAuth client credentials). See `docs/ZYPRUS_API_REFERENCE.md`. |
| **Sentry** | Error reporting | `SENTRY_DSN` | sentry.io project settings → Client Keys (DSN). |
| **Firecrawl** | Web scraping | `FIRECRAWL_API_KEY` | firecrawl.dev dashboard → API keys. |
| **Telegram Bot API** | Lead-router / private chat bot | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | Telegram @BotFather (token); webhook secret is operator-chosen and set on both `setWebhook` and the env var. |

> Telnyx note: per Qualia infrastructure, Telnyx is the standard SIP/telephony
> carrier, but this codebase's call-audit path integrates **3CX** (`CX3_*`). A
> `TELNYX_*` env var is **expected by convention but not found in code** — record
> only the 3CX names above.

---

## 5. Related docs

- [Invoicing + Sophia-Bridge environment reference](./invoicing-env-reference.md) — full invoicing/bridge variable table, the HMAC-match requirement, and the rotation procedure.
- [Invoicing runbook](./invoicing-runbook.md) — day-to-day invoicing operational flow.
- [Invoicing allowlist](./invoicing-allowlist.md) — which WhatsApp numbers may drive invoicing.
- [Handoff walkthrough](./handoff-walkthrough.md) — end-to-end orientation for a new owner.
</content>
</invoke>
