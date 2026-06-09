# Phase 1 Plan — Read-only port

## Overview
Vendor-copy the LIVE sophiainvoice app (the `redesign/` tree, not legacy `InvoiceDashboard`) into sofiatesting under `lib/invoices/**`, `components/invoices/**`, and `app/(admin)/admin/invoices/`. Rewrite `@/`-absolute imports to the new namespace, repoint the Supabase service client at the invoice DB via NEW env vars, and inherit the existing admin auth gate. Acceptance = typecheck + build green and `/admin/invoices` renders.

## Key facts from recon
- sophiainvoice entry: `src/app/page.tsx` → `@/components/redesign/App` (redesign IS the live UI). Legacy `InvoiceDashboard.tsx` etc. are superseded but harmless to port.
- sophiainvoice `@/*` → `src/*`. sofiatesting `@/*` → repo root. So `src/lib/x` ported to `lib/invoices/x` is imported as `@/lib/invoices/x`.
- **Env collision:** `src/lib/supabase/server.ts` reads `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — sofiatesting's own (vceeheaxcrhmpqueudqx). MUST rewrite to `INVOICE_SUPABASE_URL` + `INVOICE_SUPABASE_SERVICE_ROLE` (tijadsdysuxkxrpdlecq).
- Auth: `app/(admin)/admin/layout.tsx` already gates everything under `/admin` (session + `adminUserRole` by email). `/admin/invoices` inherits it — no new role in P1.
- Nav: `components/admin/sidebar.tsx` `navigationItems` array. Add `{ name: "Invoices", href: "/admin/invoices", icon: Receipt, requiredPermission: null }`.
- sofiatesting app data = Drizzle; invoicing stays supabase-js on its own DB. Coexist.

## Waves

### Wave 1 — mechanical port (deterministic shell)
#### `P1-T1` — Copy source trees (exclude tests)
- Files: `lib/invoices/**`, `components/invoices/**`
- Action:
  - `lib/invoices/` ← `sophiainvoice/src/lib/**` (all `.ts`/`.tsx` except `*.test.*`)
  - `lib/invoices/types/` ← `sophiainvoice/src/types/**`
  - `lib/invoices/data/` ← `sophiainvoice/src/data/**`
  - `lib/invoices/actions/` ← `sophiainvoice/src/app/actions/**`
  - `components/invoices/` ← `sophiainvoice/src/components/**` (except `*.test.*`)
- Validation: `find lib/invoices components/invoices -name '*.test.*' | wc -l` = 0; trees exist.

#### `P1-T2` — Rewrite `@/` imports across ported files (ordered sed)
- Files: all ported `.ts`/`.tsx`
- Action (apply in THIS order, global):
  1. `@/lib/` → `@/lib/invoices/`
  2. `@/types/` → `@/lib/invoices/types/`
  3. `@/data/` → `@/lib/invoices/data/`
  4. `@/app/actions/` → `@/lib/invoices/actions/`
  5. `@/components/` → `@/components/invoices/`
- Validation: `grep -rE "@/(lib|components|types|data|app/actions)/" lib/invoices components/invoices | grep -v "@/lib/invoices\|@/components/invoices" ` returns nothing (no un-rewritten absolute imports).

### Wave 2 — wiring (hand edits, depend on Wave 1)
#### `P1-T3` — Repoint the Supabase service client (env namespacing)
- Files: `lib/invoices/supabase/server.ts`
- Action: replace `NEXT_PUBLIC_SUPABASE_URL` → `INVOICE_SUPABASE_URL`; replace the obfuscated `SUPABASE_SERVICE_ROLE_KEY` lookup → `INVOICE_SUPABASE_SERVICE_ROLE`. Keep the fallback-mode behavior.
- Validation: `grep -c "INVOICE_SUPABASE" lib/invoices/supabase/server.ts` ≥ 2; `grep -c "NEXT_PUBLIC_SUPABASE_URL\|SUPABASE_SERVICE_ROLE_KEY" lib/invoices/supabase/server.ts` = 0.
- Owner input: `INVOICE_SUPABASE_SERVICE_ROLE` value (live verification only).

#### `P1-T4` — Route page + scoped styles
- Files: `app/(admin)/admin/invoices/page.tsx`, `app/(admin)/admin/invoices/invoices.css`
- Action: create server page mirroring sophiainvoice `page.tsx` but importing `@/lib/invoices/actions/documents`, `@/components/invoices/redesign/App`, `@/lib/invoices/redesign/adapter`. Copy `sophiainvoice/src/app/globals.css` → `invoices.css`, import it in the page. Name the export `InvoicesPage`.
- Validation: file exists; `npx tsc --noEmit` resolves its imports.

#### `P1-T5` — Sidebar nav item
- Files: `components/admin/sidebar.tsx`
- Action: add `Receipt` to the lucide import; add `{ name: "Invoices", href: "/admin/invoices", icon: Receipt, requiredPermission: null }` after the Listings entry.
- Validation: `grep -c "/admin/invoices" components/admin/sidebar.tsx` = 1.

#### `P1-T6` — Import-boundary lint rule
- Files: `eslint.config.mjs`
- Action: add `no-restricted-imports` forbidding `@/lib/invoices/supabase/server` (and `server-only` leak) from client files, OR (simpler) rely on the existing `server-only` import already at the top of the ported client. Minimum: confirm `lib/invoices/supabase/server.ts` keeps `import "server-only"`.
- Validation: `grep -c 'server-only' lib/invoices/supabase/server.ts` = 1; eslint runs clean.

#### `P1-T7` — Env scaffolding
- Files: `.env.example` (+ local `.env.local` at verify time)
- Action: add `INVOICE_SUPABASE_URL=https://tijadsdysuxkxrpdlecq.supabase.co` and `INVOICE_SUPABASE_SERVICE_ROLE=` to `.env.example`. Real key into `.env.local` at verification (from sophiainvoice/.env.local or `vercel env`).
- Validation: keys present in `.env.example`.

### Wave 3 — green gate
#### `P1-T8` — Typecheck + build, fix fallout
- Action: `npx tsc --noEmit` then `npx next build`. Fix import/type fallout (missing deps, css module issues, `server-only` in a client file, etc.). Likely deps to check: none beyond `@supabase/supabase-js` + `lucide-react` (both already in sofiatesting).
- Validation: both commands exit 0.

## Owner input required
- `INVOICE_SUPABASE_SERVICE_ROLE` (tijadsdysuxkxrpdlecq service-role key) — needed only for live data verification, not for build. Available in `sophiainvoice/.env.local`.

## Risks
- Legacy components (`InvoiceDashboard` etc.) may pull deps the redesign dropped; if they break typecheck, delete the legacy root components (redesign supersedes them).
- `globals.css` `:root` OKLCH vars may clash with sofiatesting tokens → visual only, defer to Handoff polish.
- sophiainvoice may use TS features/`tsconfig` strictness differing from sofiatesting; resolve per-error.
- `@supabase/supabase-js` version skew (sofiatesting vs sophiainvoice) — both ^2.x, low risk.

## Acceptance (maps to ROADMAP P1 success criteria)
- [ ] `lib/invoices/**`, `components/invoices/**`, `app/(admin)/admin/invoices/page.tsx` exist (P1-T1, T4)
- [ ] `lib/invoices/supabase/server.ts` uses `INVOICE_SUPABASE_*`, never the shared names; keeps `server-only` (P1-T3, T6)
- [ ] NextAuth admin gate covers `/admin/invoices/**` (inherited from `(admin)` layout) (P1-T4)
- [ ] `npx tsc --noEmit` + `npx next build` pass (P1-T8)
- [ ] `/admin/invoices` lists documents from tijadsdysuxkxrpdlecq (verify with key)
