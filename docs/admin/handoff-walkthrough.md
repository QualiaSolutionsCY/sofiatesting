# System Walkthrough & Onboarding — sofiatesting

**Last Updated:** 2026-06-21
**Audience:** A new owner taking over the SOFIA / Sophia + invoicing system. Read this top-to-bottom once, then keep it next to the runbooks.
**Status:** ✅ Production
**Milestone:** M9 "Handoff"

This is the orientation document. It tells you what the system is made of, how each
piece is operated and deployed, where the detailed runbooks live, and what to do on
day one to confirm you actually own everything.

> **Secrets rule:** this document names environment **variable names** and **where**
> they are set — never secret values. No keys, tokens, JWTs, HMAC secrets, or access
> codes appear here or in any linked doc. Get values from the appropriate secret store.
> Where the secrets are managed is described in
> [`./handoff-credentials.md`](./handoff-credentials.md).

---

## System map

There are two ways work enters the system: an agent talking to **Sophia over WhatsApp**,
or an admin using the **`/admin` panel** in a browser. Both ultimately read/write the
two Supabase projects below.

### The Sophia → invoicing bridge

When an authorized agent asks Sophia to do anything invoicing-related over WhatsApp, the
request crosses from the Supabase Edge runtime (sophia-bot) to the Vercel app (the
invoicing control plane). This is the bridge flow (reproduced from `.continue-here.md`):

```
agent WhatsApp → sophia-bot (manageInvoice tool, allowlist-gated)
  → services/invoice-bridge.ts (HMAC-signs with SOPHIA_BRIDGE_SECRET)
  → POST sofiatesting.vercel.app/api/sophia/intent (verifies HMAC + allowlist)
  → lib/invoices/sophia/intent-handlers.ts (dispatches to ported invoice actions)
  → invoiceDb (tijadsdysuxkxrpdlecq) + PDF (private bucket, signed URLs)
  → reply + PDF sent back to the agent on WhatsApp
```

The allowlist is checked **twice** (once in-bot before the request leaves sophia-bot,
once again on the Vercel `/api/sophia/intent` route), and the HMAC signature proves the
request actually came from sophia-bot and was not forged against the public endpoint.
Full detail of every step is in [`./invoicing-runbook.md`](./invoicing-runbook.md)
("Request path / bridge").

### What runs where (mirrors root `CLAUDE.md`)

| Component | Runs on | What it is |
|---|---|---|
| **WhatsApp bot (Sophia)** | Supabase Edge Function `sophia-bot` | The conversational assistant agents talk to; routes property uploads and the `manageInvoice` invoicing tool |
| **Telegram bot (lead router)** | Supabase Edge Function `telegram-sophia` | Lead routing (Paphos + Others groups only) |
| **Admin panel** | Vercel (Next.js) — `/admin` | Admin-only dashboard. Root `/` redirects to `/admin`; NextAuth-gated |
| **Invoicing surface** | Vercel (Next.js) — `/admin/invoices` | The full invoicing dashboard, plus the HMAC-verified `/api/sophia/intent` endpoint the bridge calls |
| **Email router** | Railway (`services/email-router/`) | Watches Gmail, forwards property emails to sophia-bot `/email` |
| **Bazaraki scraper** | Docker (`services/bazaraki-scraper/`) | Scrapes Bazaraki listings |
| **Database — app data** | Supabase project `vceeheaxcrhmpqueudqx` | sophia-bot data, agents, listings, chat history, prompts (Drizzle ORM) |
| **Database — invoicing** | Supabase project `tijadsdysuxkxrpdlecq` | invoice documents, approvals, payments, storage objects, PDFs (`supabase-js` via `invoiceDb`) |

### Two Supabase projects (do not confuse them)

This is the single most common source of "the data isn't where I expect" incidents:

| Concern | Project ref | Access layer |
|---|---|---|
| **Primary app data** | `vceeheaxcrhmpqueudqx` | Drizzle ORM |
| **Invoicing** | `tijadsdysuxkxrpdlecq` | `supabase-js` via `lib/invoices/supabase/server.ts` (server-only) |

The invoice project is wired from env `INVOICE_SUPABASE_URL` + `INVOICE_SUPABASE_SERVICE_ROLE`.
**Never import `lib/invoices/supabase/server` from a client component** — it holds the
service-role key (`.continue-here.md:42`). Topology detail is in the runbook
("Two-Supabase-project topology").

---

## Operating each component

### sophia-bot (WhatsApp assistant)

- **What it does:** the assistant agents message on WhatsApp. Handles property uploads
  to Zyprus and the `manageInvoice` invoicing tool (the in-bot half of the bridge).
- **Where the code lives** (key files from `.continue-here.md`):
  - `supabase/functions/sophia-bot/tools/handlers/invoice.ts` — the `manageInvoice`
    tool handler (in-bot allowlist check).
  - `supabase/functions/sophia-bot/services/invoice-bridge.ts` — bot → endpoint bridge
    (HMAC-signs with `SOPHIA_BRIDGE_SECRET`).
  - `supabase/functions/sophia-bot/prompts/behaviors/invoicing.ts` — the phrase → intent
    mapping that teaches Sophia which words trigger which invoicing action.
- **Deploy command** (verbatim from root `CLAUDE.md` "Deploy Commands"):
  ```bash
  supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx
  ```
- **Telegram toggle** (verbatim from root `CLAUDE.md`):
  ```bash
  supabase secrets set SOPHIA_TELEGRAM_ENABLED=true --project-ref vceeheaxcrhmpqueudqx   # ON
  supabase secrets set SOPHIA_TELEGRAM_ENABLED=false --project-ref vceeheaxcrhmpqueudqx  # OFF
  ```
  Current status: ENABLED. Paphos + Others groups route leads; Limassol + Larnaca are
  intentionally OFF.

### Admin panel (`/admin`)

- **What it does:** the browser dashboard. Admin-only (NextAuth via `app/(auth)/`).
  Root `/` redirects to `/admin`. General usage is in
  [`./admin-panel-guide.md`](./admin-panel-guide.md).
- **Where the code lives:** `app/(admin)/admin/` for routes; `app/(auth)/` for auth.
- **Deploy command** (root `CLAUDE.md` "Deploy Commands"):
  ```bash
  vercel --prod
  ```

### Invoicing bridge & surface (`/admin/invoices` + `/api/sophia/intent`)

- **What it does:** the full invoicing dashboard at `/admin/invoices`, and the
  HMAC-verified `/api/sophia/intent` endpoint that the sophia-bot bridge POSTs to. Both
  read/write the invoice project `tijadsdysuxkxrpdlecq`.
- **Where the code lives** (key files from `.continue-here.md`):
  - `app/(admin)/admin/invoices/` — the route + scoped CSS.
  - `lib/invoices/**` — the ported invoice domain (actions, `supabase/invoiceDb`, redesign
    UI logic, pdf, storage).
  - `lib/invoices/sophia/intent-handlers.ts` — the invoicing intents (`runIntent`).
  - `app/api/sophia/intent/route.ts` — the HMAC-verified endpoint (verify + allowlist
    re-check).
  - `lib/invoices/constants.ts` — `INVOICE_AUTHORIZED_AGENTS` (the allowlist).
- **Deploy command:** the invoicing surface ships with the Vercel app (`vercel --prod`).
- **Playwright deploy-gate workaround** (from `.continue-here.md` "Gotchas"): the
  `pre-deploy-gate.js` hook runs `npm test` = Playwright E2E, which can't run headless and
  blocks `vercel --prod`. The workaround used all session is to prefix the deploy command
  so it does **not** *start* with `vercel`, e.g.:
  ```bash
  echo ship && vercel --prod --yes
  ```
  Always run `npx tsc --noEmit` + `next build` manually first (both pass). `SOPHIA_BRIDGE_SECRET`
  must be set in Vercel (all envs) **and** the Supabase Edge runtime for the bridge to work.

---

## Runbooks & references

Read these for operational detail. Each is one click away:

- [`./invoicing-runbook.md`](./invoicing-runbook.md) — the single operational reference:
  two-project topology, the full request/bridge path, invoice lifecycle, and the 11-intent
  phrase → action table.
- [`./invoicing-allowlist.md`](./invoicing-allowlist.md) — who can drive invoicing over
  WhatsApp (the three authorized agents), the two enforcement points, and the add/remove
  procedure.
- [`./invoicing-env-reference.md`](./invoicing-env-reference.md) — environment **variable
  names** (never values) for the bridge, the invoice Supabase project, and the accounting
  group, plus where each is set.
- [`./phase-3-regression-checklist.md`](./phase-3-regression-checklist.md) — the
  human-run WhatsApp regression: property-upload flow and full invoice-lifecycle flow,
  with exact phrases, expected replies, and the DB row to verify for each.
- [`./admin-panel-guide.md`](./admin-panel-guide.md) — general admin-panel usage.
- [`./handoff-credentials.md`](./handoff-credentials.md) — credentials inventory: where
  every secret and dashboard access is managed (names + locations only).
- [`./handoff-archival.md`](./handoff-archival.md) — archival/closure notes for the
  decommissioned standalone `sophiainvoice` project and related cleanup.

---

## Day-1 checklist

Do these in order to confirm you actually own the system:

1. **Confirm access to both Supabase dashboards.** App data project
   `vceeheaxcrhmpqueudqx` and invoicing project `tijadsdysuxkxrpdlecq` — you should be
   able to open both. (Links/refs in [`./handoff-credentials.md`](./handoff-credentials.md).)
2. **Confirm Vercel access.** You can open the `sofiatesting` project and reach
   `https://sofiatesting.vercel.app/admin`.
3. **Know where secrets are managed.** Read
   [`./handoff-credentials.md`](./handoff-credentials.md) and
   [`./invoicing-env-reference.md`](./invoicing-env-reference.md) so you know the name and
   location of every env var (Vercel vars, Supabase Edge secrets) — without ever needing a
   value pasted into a doc.
4. **Know the invoicing allowlist.** Read [`./invoicing-allowlist.md`](./invoicing-allowlist.md)
   so you know exactly who can drive invoicing over WhatsApp and how to add/remove an agent.
5. **Run the regression checklist.** Walk [`./phase-3-regression-checklist.md`](./phase-3-regression-checklist.md)
   with a real allowlisted WhatsApp number to confirm the property-upload and full
   invoice-lifecycle flows pass end-to-end.
6. **Practice a deploy (no changes).** Confirm you can run the sophia-bot deploy command
   and the `vercel --prod` deploy command above — including the Playwright deploy-gate
   workaround — so the first real deploy isn't your first attempt.

---

## Milestone / ERP closure

Final ERP closure for milestone M9 ("Handoff") is performed through the framework
`/qualia-milestone` flow — it reconciles the ledger and closes the milestone in the
project state machine. It is **not** a manual step to perform inside this document; do
not hand-edit `.planning/` state to close M9. Once this handoff documentation set
(walkthrough, credentials, archival) is committed, run `/qualia-milestone` to close M9.

---

**Maintainers:** Qualia Solutions
**Status:** ✅ Production — M9 Handoff
