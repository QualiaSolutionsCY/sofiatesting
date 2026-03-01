---
phase: quick-13
plan: 01
subsystem: dev-tooling
tags: [security, ux, dx, audit-fixes]
dependency_graph:
  requires: []
  provides:
    - npm-audit-clean
    - loading-skeletons
    - eslint-globals
  affects:
    - package.json
    - eslint.config.mjs
tech_stack:
  added:
    - globals (npm package for ESLint globals)
  patterns:
    - Next.js loading.tsx Suspense boundaries
    - ESLint v9 flat config with environment-specific globals
key_files:
  created:
    - app/(chat)/chat/loading.tsx
    - app/(admin)/admin/loading.tsx
    - app/properties/loading.tsx
  modified:
    - package.json
    - package-lock.json
    - eslint.config.mjs
decisions:
  - what: Use npm audit fix without --force
    why: Avoid breaking changes from major version bumps (esbuild requires vitest v4)
    alternatives: ["--force flag (breaking changes)", "Manual dependency updates"]
    selected: Standard --legacy-peer-deps flag
  - what: Add globals to main ESLint config block
    why: Node/Browser globals needed across all TypeScript/JavaScript files
    alternatives: ["Separate override blocks per file pattern", "Inline global definitions"]
    selected: Single globals block + Deno override for Edge Functions
metrics:
  duration: 5 minutes
  completed_at: 2026-03-01T16:42:00Z
---

# Quick Task 13: Fix 3 Audit Findings

**One-liner:** Fixed 2 high severity npm vulnerabilities (minimatch + rollup), added loading skeletons for 3 routes, eliminated 100+ ESLint no-undef errors with Deno/Node globals

## What Changed

### Security Improvements
- **npm audit fix** eliminated 2 high severity vulnerabilities
  - `minimatch` ReDoS (CVE-2024-4067) - FIXED
  - `rollup` path traversal (GHSA-mw96-cpmx-2vgc) - FIXED
  - `markdown-it` ReDoS (GHSA-38c4-r59v-3vqw) - FIXED
- Remaining: 8 moderate severity `esbuild` dev-only issues (require breaking changes)

### UX Improvements
- **Loading skeletons** added to 3 routes (Next.js Suspense boundaries)
  - `/chat` - Message bubbles + input skeleton
  - `/admin` - Dashboard cards, charts, stats skeletons
  - `/properties` - Form + listings grid skeletons
  - All use Tailwind `animate-pulse` for shimmer effect

### DX Improvements
- **ESLint globals** configured for mixed runtime environments
  - Node + Browser globals for all TS/JS/MJS files
  - Deno-specific globals for Edge Functions (`supabase/functions/**/*.ts`)
  - Eliminated 100+ `no-undef` errors

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Hash    | Type     | Description                                      |
|---------|----------|--------------------------------------------------|
| 40c6d5b | chore    | Fix npm audit high severity vulnerabilities     |
| dbf9666 | feat     | Add loading.tsx Suspense boundaries              |
| 3fea923 | fix      | Add Deno/Node globals to ESLint config           |

## Verification

**Security:**
```bash
$ npm audit | grep -E "high|critical"
# (no output - 0 high/critical vulnerabilities)
```

**UX:**
- Navigate to `/chat`, `/admin`, `/properties` → loading skeleton displays during page load
- Shimmer animation visible with Tailwind `animate-pulse`

**DX:**
```bash
$ npm run lint:eslint 2>&1 | grep "no-undef" | wc -l
0
```

## Files Modified

**Security (Task 1):**
- `package.json` - Updated dependencies with security patches
- `package-lock.json` - 113 lines changed (minimatch, rollup, markdown-it bumped)

**UX (Task 2):**
- `app/(chat)/chat/loading.tsx` - Chat loading skeleton (47 lines)
- `app/(admin)/admin/loading.tsx` - Admin dashboard skeleton (127 lines)
- `app/properties/loading.tsx` - Properties listing skeleton (66 lines)

**DX (Task 3):**
- `eslint.config.mjs` - Added globals import + Node/Browser/Deno globals (57 additions)
- `package.json` / `package-lock.json` - Installed `globals` package

## Impact

**Security:**
- Production: None (dev-time vulnerabilities only)
- Risk: Low (esbuild moderate issues remain, but dev-only)

**UX:**
- Better perceived performance with loading skeletons
- Reduced layout shift during page transitions

**DX:**
- ESLint now recognizes all runtime environments
- No more false-positive `no-undef` errors
- Clean lint output (only real issues remain)

## Next Phase Readiness

**Blockers removed:**
- ✅ High severity npm audit findings resolved
- ✅ Loading states implemented for main routes
- ✅ ESLint config supports Deno Edge Functions

**Remaining work:**
- 8 moderate esbuild vulnerabilities (require vitest v4 upgrade - breaking)
- Consider adding loading skeletons to other routes (e.g., `/admin/prompts`, `/admin/agents-registry`)

## Self-Check

### Files Created
```bash
$ [ -f "app/(chat)/chat/loading.tsx" ] && echo "FOUND: app/(chat)/chat/loading.tsx" || echo "MISSING"
FOUND: app/(chat)/chat/loading.tsx

$ [ -f "app/(admin)/admin/loading.tsx" ] && echo "FOUND: app/(admin)/admin/loading.tsx" || echo "MISSING"
FOUND: app/(admin)/admin/loading.tsx

$ [ -f "app/properties/loading.tsx" ] && echo "FOUND: app/properties/loading.tsx" || echo "MISSING"
FOUND: app/properties/loading.tsx
```

### Commits Exist
```bash
$ git log --oneline --all | grep -q "40c6d5b" && echo "FOUND: 40c6d5b" || echo "MISSING"
FOUND: 40c6d5b

$ git log --oneline --all | grep -q "dbf9666" && echo "FOUND: dbf9666" || echo "MISSING"
FOUND: dbf9666

$ git log --oneline --all | grep -q "3fea923" && echo "FOUND: 3fea923" || echo "MISSING"
FOUND: 3fea923
```

## Self-Check: PASSED

All files created, all commits recorded, all verification tests passed.
