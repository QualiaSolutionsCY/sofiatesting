# Invoicing + Sophia-Bridge — Environment Reference

**Last Updated**: 2026-06-21
**Audience**: Operators / admins setting up a new environment or rotating a key
**Status**: Production reference

> **Security note (per `rules/security.md`).** This document records variable
> **NAMES**, their purpose, and **WHERE** they live (which runtime / how they are
> managed). It deliberately contains **no secret VALUES** — no keys, tokens,
> access codes, service-role JWTs, or HMAC secrets appear anywhere in this file.
> To inspect or set a value, use the management surfaces named in
> [Where these live](#where-these-live), never this doc.

The invoicing system spans **two runtimes**:

- **Vercel** — the Next.js app (`/admin/invoices`, the access gate, the
  `/api/sophia/intent` bridge receiver, all `lib/invoices/*` server code). These
  vars are Vercel **environment variables**.
- **Supabase Edge** — the `sophia-bot` Edge Function that signs and sends the
  WhatsApp→invoicing bridge request. These vars are Supabase **Edge secrets**.

One variable — `SOPHIA_BRIDGE_SECRET` — must be present and **identical in both
runtimes** (see [HMAC-match requirement](#hmac-match-requirement)).

---

## Variable table

| Variable | Purpose | Runtime | Required | Read at |
|----------|---------|---------|----------|---------|
| `INVOICE_SUPABASE_URL` | Invoice database URL for the service-role Supabase client. | Vercel env | Required | `lib/invoices/supabase/server.ts:18` (also probed at `:14`) |
| `INVOICE_SUPABASE_SERVICE_ROLE` | Invoice DB service-role key. **Server-only** — grants full DB access, bypasses RLS. | Vercel env | Required | `lib/invoices/supabase/server.ts:7,19` |
| `SOPHIA_BRIDGE_SECRET` | HMAC-SHA256 shared secret signing the WhatsApp→invoicing bridge. **MUST match in both runtimes.** | Vercel env **+** Supabase Edge secret | Required | Verify side: `app/api/sophia/intent/route.ts:13`. Sign side: `supabase/functions/sophia-bot/services/invoice-bridge.ts:16` |
| `SOPHIA_BRIDGE_URL` | Bridge endpoint the Edge function posts to. Defaults to `https://sofiatesting.vercel.app/api/sophia/intent`. | Supabase Edge secret | Optional | `supabase/functions/sophia-bot/services/invoice-bridge.ts:14` |
| `ADMIN_ACCESS_CODE` | Shared code that unlocks the admin panel at `/access`. | Vercel env | Required | `lib/access/gate.ts:39` |
| `INVOICES_ACCESS_CODE` | Shared code that unlocks the invoices page at `/access`. | Vercel env | Required | `lib/access/gate.ts:40` |
| `AUTH_SECRET` | HMAC key signing the access-gate cookie so it can't be forged client-side. | Vercel env | Required | `lib/access/gate.ts:17` |
| `INVOICE_ACCOUNTING_GROUP_MSISDN` | Accounting WhatsApp group JID for invoice / credit-note delivery. | Vercel env | Required for group send | `lib/invoices/actions/whatsapp-status.ts:25` |
| `SUPABASE_INVOICE_BUCKET` | Storage bucket name for generated PDFs. Defaults to `invoices`. | Vercel env | Optional | `lib/invoices/supabase/schema.ts:26` |
| `WASENDER_API_KEY` | WaSenderAPI session API key — sends invoices / receipts / credit notes over WhatsApp. | Vercel env | Required for WhatsApp delivery | `lib/whatsapp/client.ts:22` |
| `WASENDER_PERSONAL_ACCESS_TOKEN` | WaSenderAPI account-level PAT (advanced session operations). | Vercel env | Optional | `lib/whatsapp/client.ts:23` |
| `WASENDER_WEBHOOK_SECRET` | Secret used to verify inbound WaSenderAPI webhook signatures. | Vercel env | Required for WhatsApp delivery | `lib/whatsapp/client.ts:24` |

> `INVOICE_SUPABASE_SERVICE_ROLE` is **server-only**. It must **never** be
> prefixed `NEXT_PUBLIC_` and must **never** be imported into a client component.
> Its read sites live behind `import "server-only";` (`lib/invoices/supabase/server.ts:1`),
> which makes a client import a build-time error.

---

## Where these live

### Vercel environment variables

Managed via the Vercel dashboard (Project Settings → Environment Variables) or
the CLI:

```bash
# inspect which vars are set (names only — values are masked / Sensitive)
vercel env ls

# add or update a variable for an environment
vercel env add INVOICE_SUPABASE_SERVICE_ROLE production
```

All `lib/*` and `app/*` read sites above run on Vercel.

### Supabase Edge secrets

The `sophia-bot` Edge function reads its env via `Deno.env.get(...)`. Edge
secrets are managed with the Supabase CLI against the project ref
(`vceeheaxcrhmpqueudqx`, per root `CLAUDE.md`):

```bash
# set an Edge secret
supabase secrets set SOPHIA_BRIDGE_SECRET=... --project-ref vceeheaxcrhmpqueudqx

# list Edge secret names (names only)
supabase secrets list --project-ref vceeheaxcrhmpqueudqx
```

After changing a secret the function must be redeployed for it to take effect:

```bash
supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx
```

### HMAC-match requirement

`SOPHIA_BRIDGE_SECRET` is the shared HMAC-SHA256 key for the bridge. The
Edge function **signs** the request body with it
(`supabase/functions/sophia-bot/services/invoice-bridge.ts:16`) and the Vercel
receiver **verifies** the signature with it
(`app/api/sophia/intent/route.ts:13`). If the two values differ, the computed
signature won't match and the bridge rejects the request with **401 bad
signature** (`app/api/sophia/intent/route.ts:37`). The two copies **must hold the
same value**.

---

## Rotation note

Rotating `SOPHIA_BRIDGE_SECRET` touches **two runtimes** and is not atomic across
them. While the values differ, every bridge call fails the signature check and
returns **401** (`app/api/sophia/intent/route.ts:36-37`), so Sophia cannot drive
invoicing during the window.

To rotate with minimal disruption:

1. Set the new value as the Vercel env var (`vercel env add SOPHIA_BRIDGE_SECRET production`) and the Supabase Edge secret (`supabase secrets set SOPHIA_BRIDGE_SECRET=... --project-ref vceeheaxcrhmpqueudqx`) as close together as possible.
2. Redeploy the Edge function so the new secret loads (`supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx`).
3. Redeploy / confirm the Vercel app picked up the new env var.
4. Verify a Sophia invoicing intent succeeds (no 401) end to end.

Rotating the other Vercel-only secrets (`INVOICE_SUPABASE_SERVICE_ROLE`,
`AUTH_SECRET`, `ADMIN_ACCESS_CODE`, `INVOICES_ACCESS_CODE`, the `WASENDER_*`
vars) is single-runtime: update the Vercel env var and redeploy. Note that
rotating `AUTH_SECRET` invalidates all existing access-gate cookies, so every
operator must re-enter their code at `/access`.

---

## Related docs

- [Invoicing runbook](./invoicing-runbook.md) — day-to-day operational flow.
- [Invoicing allowlist](./invoicing-allowlist.md) — which WhatsApp numbers may drive invoicing.
- [Admin panel guide](./admin-panel-guide.md) — broader admin panel reference.
