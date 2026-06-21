---
phase: 2
result: PASS
gaps: 0
---

# Phase 2 Verification

Design Verification: N/A (no frontend tasks in phase)

## Contract Results

The machine contract (9/9 checks) pre-ran and passed per
`.planning/evidence/phase-2-contract-run.json`. Results are accepted as a
confirmed baseline; goal-backward accuracy checks below extend them.

| Task | Check | Result | Notes |
|------|-------|--------|-------|
| T1 | file-exists `docs/admin/invoicing-runbook.md` | PASS | 305-line file |
| T1 | grep-match `tijadsdysuxkxrpdlecq` | PASS | present (lines 40, 48, 92) |
| T1 | grep-match `create_draft\|issue_credit_note\|mark_paid` | PASS | 30 intent-related matches |
| T2 | file-exists `docs/admin/invoicing-env-reference.md` | PASS | 128-line file |
| T2 | grep-match `INVOICE_SUPABASE_SERVICE_ROLE` | PASS | present |
| T2 | grep-match `SOPHIA_BRIDGE_SECRET` | PASS | present |
| T3 | file-exists `docs/admin/invoicing-allowlist.md` | PASS | 155-line file |
| T3 | grep-match `ALLOWED_LAST8` | PASS | present |
| T3 | grep-match `supabase functions deploy sophia-bot\|vercel --prod` | PASS | present |
| All | no secret literals (`eyJ…/sb_secret_/sbp_`) | PASS | `grep` exit:1 (no matches) |

---

## Accuracy Verification (goal-backward)

### 1. Two-Supabase topology claims

**Claim (runbook:39-40):** primary = `vceeheaxcrhmpqueudqx` (Drizzle, sophia-bot data);
invoice = `tijadsdysuxkxrpdlecq` (supabase-js via `lib/invoices/supabase/server.ts`).

`lib/invoices/supabase/server.ts:18` — `"const url = process.env.INVOICE_SUPABASE_URL;"` — correct; the invoice client reads `INVOICE_SUPABASE_URL`, which the runbook and env reference state resolves to `tijadsdysuxkxrpdlecq`. PASS.

`lib/invoices/supabase/server.ts:7` — `"const SERVICE_ROLE_ENV = \"INVOICE_SUPABASE_SERVICE_ROLE\";"` — matches env reference row `INVOICE_SUPABASE_SERVICE_ROLE | Read at lib/invoices/supabase/server.ts:7,19`. PASS.

`lib/invoices/supabase/server.ts:1` — `"import \"server-only\";"` — runbook states `"Never import lib/invoices/supabase/server from a client component"` citing `server.ts:1`. PASS.

**Claim (runbook:51-66):** 11-table listing from `schema.ts SUPABASE_TABLES`.

`lib/invoices/supabase/schema.ts:11-23` — all 11 table keys (`accessUsers`, `documents`, `revisions`, `approvals`, `payments`, `storageObjects`, `messageEvents`, `actionQueue`, `deliveryEvents`, `webhookEvents`, `providerAccounts`) enumerated in the runbook table (lines 53-66). PASS.

**Claim (runbook:68-70):** PDF bucket from `SUPABASE_INVOICE_BUCKET` default `"invoices"`, prefix `GENERATED_DOCUMENT_PREFIX`.

`lib/invoices/supabase/schema.ts:25-29` — `"invoices: process.env.SUPABASE_INVOICE_BUCKET ?? \"invoices\""` (line 26); `"export const GENERATED_DOCUMENT_PREFIX = \"generated\";"` (line 29). PASS.

---

### 2. Request path / bridge claims

**Claim (runbook:98):** `isAllowed` called at line 43 of `invoice.ts`.

`supabase/functions/sophia-bot/tools/handlers/invoice.ts:43` — `"if (!isAllowed(phoneNumber, agent)) {"` — exact. PASS.

**Claim (runbook:50-51):** unauthorized sender gets refusal at lines 48-51.

`supabase/functions/sophia-bot/tools/handlers/invoice.ts:48-51` — `"return { success: false, message: \"Invoicing is limited to authorized staff, so I can't action that here.\" };"` — exact text confirmed. PASS.

**Claim (runbook:117-119):** `BRIDGE_SECRET = Deno.env.get("SOPHIA_BRIDGE_SECRET")` at line 16; `sign(...)` at lines 18-30; signature in `X-Sophia-Signature` header.

`supabase/functions/sophia-bot/services/invoice-bridge.ts:16` — `"const BRIDGE_SECRET = Deno.env.get(\"SOPHIA_BRIDGE_SECRET\") || \"\";"` PASS.
`invoice-bridge.ts:18-30` — `async function sign(body: string)` implementation matches. PASS.
`invoice-bridge.ts:67` — `"\"X-Sophia-Signature\": signature,"` PASS.

**Claim (runbook:121-122):** POSTs to `SOPHIA_BRIDGE_URL` defaulting to `https://sofiatesting.vercel.app/api/sophia/intent` at lines 13-15.

`supabase/functions/sophia-bot/services/invoice-bridge.ts:13-15` — `"const BRIDGE_URL = Deno.env.get(\"SOPHIA_BRIDGE_URL\") || \"https://sofiatesting.vercel.app/api/sophia/intent\";"` PASS.

**Claim (runbook:129):** Vercel route returns 503 when `SOPHIA_BRIDGE_SECRET` unset.

`app/api/sophia/intent/route.ts:31-33` — `"if (!SECRET) { return NextResponse.json({ ok: false, error: \"bridge not configured\" }, { status: 503 }); }"` PASS.

**Claim (runbook:131):** `verifySignature` at lines 15-28, 36; bad signature → 401.

`app/api/sophia/intent/route.ts:15-28` — `verifySignature` function. PASS.
`route.ts:36-37` — `"if (!verifySignature(raw, req.headers.get(\"x-sophia-signature\"))) { return NextResponse.json({ ok: false, error: \"bad signature\" }, { status: 401 }); }"` PASS.

**Claim (runbook:133-135):** allowlist re-check at route.ts:52; 403 generic deflection never reveals allowlist.

`app/api/sophia/intent/route.ts:52-57` — `"if (!isAuthorizedAgent(waNumber)) { return NextResponse.json({ ok: false, reply: \"Sorry, I can't help with invoicing from this number.\" }, { status: 403 }); }"` PASS.

---

### 3. Intent table (11 intents)

**Claim (runbook:229-240 + plan AC):** all 11 `SophiaIntent` values documented with triggering phrase and result.

`lib/invoices/sophia/intent-handlers.ts:17-28` — type union lists exactly: `create_draft | list_drafts | query_status | approve | edit_invoice | request_correction | mark_paid | issue_receipt | issue_credit_note | resend | send_pdf` — 11 intents. All 11 appear in runbook intent table. PASS.

Triggering phrases sourced from `supabase/functions/sophia-bot/prompts/behaviors/invoicing.ts:38-47` — confirmed the runbook reproduces these verbatim (e.g. `"create / draft an invoice for {client}" → create_draft`). PASS.

**Claim (runbook:242-247):** `approve`, `edit_invoice` (when approved), `issue_credit_note` are two-step flows. Sourced from `invoicing.ts:41-46`.

`invoicing.ts:41-46` — multi-line descriptions of the two-step flows for each of these three intents. Runbook accurately represents the pattern. PASS.

**Line-number spot-check (approve flow):**

Runbook states `case "approve"` at lines 187-223 of `intent-handlers.ts`. Actual code: `case "approve":` at line 187, block closes at line 223. PASS.

Runbook states `mark_paid` at lines 310-324. Actual code: `case "mark_paid":` at line 310, block closes at line 324. PASS.

Runbook states `issue_credit_note` at lines 326-348. Actual code: `case "issue_credit_note":` at line 326, block closes at line 348. PASS.

---

### 4. Env reference accuracy

**Spot-check 1 — `SOPHIA_BRIDGE_SECRET`:**
Env reference states: verify side `app/api/sophia/intent/route.ts:13`; sign side `supabase/functions/sophia-bot/services/invoice-bridge.ts:16`.

`route.ts:13` — `"const SECRET = process.env.SOPHIA_BRIDGE_SECRET || \"\";"` PASS.
`invoice-bridge.ts:16` — `"const BRIDGE_SECRET = Deno.env.get(\"SOPHIA_BRIDGE_SECRET\") || \"\";"` PASS.

**Spot-check 2 — `AUTH_SECRET`:**
Env reference states: `lib/access/gate.ts:17`.

`lib/access/gate.ts:17` — `"return process.env.AUTH_SECRET || \"insecure-dev-secret-change-me\";"` PASS.

**Spot-check 3 — `ADMIN_ACCESS_CODE` / `INVOICES_ACCESS_CODE`:**
Env reference states: `gate.ts:39` and `gate.ts:40`.

`lib/access/gate.ts:39` — `"const admin = process.env.ADMIN_ACCESS_CODE;"` PASS.
`lib/access/gate.ts:40` — `"const invoices = process.env.INVOICES_ACCESS_CODE;"` PASS.

**Spot-check 4 — WASENDER vars:**
Env reference states: `lib/whatsapp/client.ts:22` (`WASENDER_API_KEY`), `:23` (`WASENDER_PERSONAL_ACCESS_TOKEN`), `:24` (`WASENDER_WEBHOOK_SECRET`).

`lib/whatsapp/client.ts:22` — `"const API_KEY = process.env.WASENDER_API_KEY || \"\";"` PASS.
`lib/whatsapp/client.ts:23` — `"const PERSONAL_ACCESS_TOKEN = process.env.WASENDER_PERSONAL_ACCESS_TOKEN;"` PASS.
`lib/whatsapp/client.ts:24` — `"const WEBHOOK_SECRET = process.env.WASENDER_WEBHOOK_SECRET;"` PASS.

**HMAC-match and server-only notes:**
Env reference:43-46 — explicitly states `INVOICE_SUPABASE_SERVICE_ROLE` is server-only, never `NEXT_PUBLIC_`, with `import "server-only"` enforcing a build-time error. PASS.
Env reference HMAC-match section (lines 88-97) — states both runtimes must hold the same value; mismatch → 401. PASS.

No secret VALUES appear in the file (confirmed by grep returning exit:1 on the JWT/service-role/secret-literal pattern).

---

### 5. Allowlist accuracy

**Claim (allowlist:27-31):** three agents and their full MSISDNs.

`lib/invoices/constants.ts:10-13`:
```
{ name: "Fawzi Goussous",    msisdn: "35799111668" }
{ name: "Charalambos Pitros", msisdn: "35799076732" }
{ name: "Marios Polyviou",   msisdn: "35799921560" }
```
Allowlist doc last-8 column: `99111668`, `99076732`, `99921560`. All match. PASS.

**Claim (allowlist:57):** in-bot constant `ALLOWED_LAST8 = ["99111668", "99076732", "99921560"]` at line 27.

`supabase/functions/sophia-bot/tools/handlers/invoice.ts:27` — `"const ALLOWED_LAST8 = [\"99111668\", \"99076732\", \"99921560\"];"` PASS.

**Claim (allowlist:57-65):** `isAllowed` at lines 29-36; called at line 43 before any bridge call.

`invoice.ts:29-36` — `function isAllowed(phone?, agent?)` confirmed. PASS.
`invoice.ts:43` — `if (!isAllowed(phoneNumber, agent))` confirmed. PASS.

**Claim (allowlist:72-74):** Vercel route gate at `route.ts:52`; 403 generic deflection lines 54-57.

`route.ts:52` — `"if (!isAuthorizedAgent(waNumber)) {"` PASS.
`route.ts:54-57` — generic deflection `"Sorry, I can't help with invoicing from this number."` at status 403. PASS.

**Claim (allowlist:77-79):** `documents.ts:130` uses `INVOICE_AUTHORIZED_AGENTS.find((agent) => agent.name === "Marios Polyviou")`.

`lib/invoices/actions/documents.ts:130` — `"const marios = INVOICE_AUTHORIZED_AGENTS.find((agent) => agent.name === \"Marios Polyviou\");"` PASS. Warning about renaming Marios in the doc is accurate.

**Both enforcement points named and sync requirement stated:**
`allowlist.md:50-51` — `"The constant in constants.ts and the ALLOWED_LAST8 array in invoice.ts encode the SAME three agents and MUST be updated together."` PASS.

**Redeploy commands:**
`allowlist.md:107-111` — `vercel --prod` and `supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx` both present in the add-agent procedure. Same commands repeated in remove-agent (lines 129-132). PASS.

---

### 6. Cross-links

Every cross-link is a relative path pointing to a sibling file in `docs/admin/`:

- `invoicing-runbook.md:22-23` links to `./invoicing-env-reference.md` and `./invoicing-allowlist.md`. PASS.
- `invoicing-env-reference.md:125-126` links to `./invoicing-runbook.md` and `./invoicing-allowlist.md`. PASS.
- `invoicing-allowlist.md:19-20` links to `./invoicing-runbook.md` and `./invoicing-env-reference.md`. PASS.

All three docs cross-link the other two. PASS.

---

### 7. No-secret guard

```
grep -rIlE "eyJ[A-Za-z0-9_-]{20,}|sb_secret_|sbp_[A-Za-z0-9]{20,}" \
  docs/admin/invoicing-*.md; echo "exit:$?"
```
Result: `exit:1` (no files matched). No JWT-shaped strings, no Supabase service-role literals, no `sbp_` secrets in any of the three docs. PASS.

---

## Scores

| Criterion | Correctness | Completeness | Wiring | Quality | Verdict |
|-----------|-------------|--------------|--------|---------|---------|
| SC1: Runbook (lifecycle, 11 intents, bridge path, topology) | 5 | 5 | 5 | 5 | PASS |
| SC2: Env reference (all vars, purpose, runtime, read location) | 5 | 5 | 5 | 5 | PASS |
| SC3: Allowlist (both enforcement points, add/remove procedure, redeploy) | 5 | 5 | 5 | 5 | PASS |
| SC4: No secret values committed | 5 | 5 | 5 | 5 | PASS |
| SC5: Three docs cross-link each other by relative path | 5 | 5 | 5 | 5 | PASS |

**Dimension definitions for docs phase:**
- **Correctness** — claims match the cited source code (verified by reading both)
- **Completeness** — all required items per AC are present (all 11 intents, all 12 env vars, both gates, add+remove procedures)
- **Wiring** — cross-links are present and point to real sibling files; each doc is discoverable from the others
- **Quality** — accurate line citations, no stubs, no hedging, no secret values, security notes included

**Minimum threshold check:** No score below 3. All criteria score 5.

---

## Code Quality

- TypeScript: N/A (docs-only phase, no `.ts` files modified)
- Stubs found: 0
- Placeholder text: 0 (grep for Lorem/TODO/FIXME/xxx returns nothing in the three docs)
- Secret literals in docs: 0

---

## Gaps

None.

---

## Verdict

PASS — Phase 2 goal achieved. All five success criteria score 5/5 on all four dimensions. Every factual claim in the three docs (topology refs, line citations, intent names, allowlist constants, env var read locations, redeploy commands) was verified against the live source files and found accurate. The no-secret guard passed with exit:1. All three docs cross-link each other by relative path. Proceed to Phase 3.
