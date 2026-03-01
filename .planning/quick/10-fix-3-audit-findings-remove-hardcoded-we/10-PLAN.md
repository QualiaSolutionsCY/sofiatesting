---
phase: quick-10
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - tests/load/edge-function-load.test.ts
  - package.json
  - app/api/admin/agents/import/route.ts
  - scripts/seed-agents-standalone.ts
  - scripts/seed-agents.ts
  - components/admin/import-agents-modal.tsx
  - eslint.config.js
autonomous: true

must_haves:
  truths:
    - "Hardcoded webhook secret removed from test file"
    - "Vulnerable xlsx package replaced with safe alternative"
    - "ESLint v9 flat config exists with TypeScript support"
  artifacts:
    - path: "tests/load/edge-function-load.test.ts"
      provides: "Load test without hardcoded secret"
      pattern: "WEBHOOK_SECRET.*process\\.env\\.WASEND_WEBHOOK_SECRET(?!.*\\|\\|)"
    - path: "package.json"
      provides: "Dependencies without xlsx"
      pattern: "\"xlsx-js-style\"|\"@sheet/core\""
    - path: "eslint.config.js"
      provides: "ESLint v9 flat config"
      min_lines: 20
  key_links:
    - from: "tests/load/edge-function-load.test.ts"
      to: "process.env.WASEND_WEBHOOK_SECRET"
      via: "environment variable"
      pattern: "process\\.env\\.WASEND_WEBHOOK_SECRET"
    - from: "app/api/admin/agents/import/route.ts"
      to: "xlsx replacement"
      via: "import statement"
      pattern: "import.*from.*['\"]xlsx"
---

<objective>
Fix 3 security and quality audit findings: remove hardcoded production webhook secret, replace vulnerable xlsx package, add ESLint v9 config.

Purpose: Address critical security exposure (hardcoded secret in public repo), eliminate known vulnerabilities (xlsx prototype pollution + ReDoS), and add missing linting infrastructure.

Output: Secure test file, safe Excel parsing dependency, ESLint v9 flat config with TypeScript support.
</objective>

<execution_context>
@/home/qualia/.claude/get-shit-done/workflows/execute-plan.md
@/home/qualia/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/home/qualia/Projects/aiagents/sofiatesting/.planning/PROJECT.md
@/home/qualia/Projects/aiagents/sofiatesting/.planning/STATE.md
@/home/qualia/Projects/aiagents/sofiatesting/CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove hardcoded webhook secret from load test</name>
  <files>tests/load/edge-function-load.test.ts</files>
  <action>
Remove the hardcoded fallback value from line 19:

BEFORE:
```typescript
const WEBHOOK_SECRET = process.env.WASEND_WEBHOOK_SECRET || "6cdb014dc4124e23095525f05fc3acfa";
```

AFTER:
```typescript
const WEBHOOK_SECRET = process.env.WASEND_WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) {
  throw new Error("WASEND_WEBHOOK_SECRET environment variable is required for webhook tests");
}
```

This ensures the test fails fast if the environment variable is not set, preventing accidental use of a hardcoded secret. The hardcoded value "6cdb014dc4124e23095525f05fc3acfa" is the real production secret and must be rotated in Supabase Edge Function secrets after this fix is deployed.

Add a note in the file header comment after line 11:
```typescript
 * NOTE: Requires WASEND_WEBHOOK_SECRET env var (not hardcoded for security)
```
  </action>
  <verify>
```bash
grep -n "6cdb014dc4124e23095525f05fc3acfa" tests/load/edge-function-load.test.ts
# Should return: no matches

grep -n "throw new Error.*WASEND_WEBHOOK_SECRET" tests/load/edge-function-load.test.ts
# Should return: line number showing the new error check
```
  </verify>
  <done>
- Hardcoded secret "6cdb014dc4124e23095525f05fc3acfa" removed from file
- Test throws error if WASEND_WEBHOOK_SECRET env var not set
- File header comment updated to document env var requirement
  </done>
</task>

<task type="auto">
  <name>Task 2: Replace vulnerable xlsx with safe alternative</name>
  <files>
package.json
app/api/admin/agents/import/route.ts
scripts/seed-agents-standalone.ts
scripts/seed-agents.ts
components/admin/import-agents-modal.tsx
  </files>
  <action>
Replace xlsx (vulnerable to GHSA-4r6h-8v6p-xvw6 prototype pollution and GHSA-5pgg-2g8v-p4x9 ReDoS) with `xlsx-js-style` (actively maintained fork without known vulnerabilities).

**Step 1 — Update package.json:**
```bash
npm uninstall xlsx
npm install xlsx-js-style@^1.1.0
```

**Step 2 — Update imports in all 4 files:**

Files to update:
- app/api/admin/agents/import/route.ts
- scripts/seed-agents-standalone.ts
- scripts/seed-agents.ts
- components/admin/import-agents-modal.tsx

BEFORE:
```typescript
import * as XLSX from 'xlsx';
```

AFTER:
```typescript
import * as XLSX from 'xlsx-js-style';
```

**API compatibility:** xlsx-js-style is a drop-in replacement — all existing XLSX.read(), XLSX.utils.sheet_to_json() calls work unchanged. No code logic changes needed beyond the import statement.

**Why xlsx-js-style:** Actively maintained fork with styling support, no known CVEs, compatible API, same MIT license.
  </action>
  <verify>
```bash
# Verify xlsx removed from package.json
grep -c '"xlsx"' package.json
# Should return: 0

# Verify xlsx-js-style added
grep -c '"xlsx-js-style"' package.json
# Should return: 1

# Verify all imports updated
grep -r "from 'xlsx'" app/ scripts/ components/ --include="*.ts" --include="*.tsx"
# Should return: no matches

grep -r "from 'xlsx-js-style'" app/ scripts/ components/ --include="*.ts" --include="*.tsx"
# Should return: 4 files (route.ts, seed-agents-standalone.ts, seed-agents.ts, import-agents-modal.tsx)

# Run TypeScript compiler to verify no type errors
npx tsc --noEmit
# Should return: 0 errors
```
  </verify>
  <done>
- xlsx package uninstalled and removed from package.json
- xlsx-js-style@^1.1.0 installed as replacement
- All 4 files updated to import from 'xlsx-js-style'
- TypeScript compilation passes with no errors
- No functional changes (drop-in replacement)
  </done>
</task>

<task type="auto">
  <name>Task 3: Add ESLint v9 flat config with TypeScript support</name>
  <files>eslint.config.js</files>
  <action>
Create `eslint.config.js` in project root with ESLint v9 flat config format, TypeScript support, and Next.js best practices.

**Install ESLint packages:**
```bash
npm install --save-dev eslint@^9.0.0 @eslint/js@^9.0.0 typescript-eslint@^8.0.0 eslint-config-next@^15.0.0
```

**Create eslint.config.js:**
```javascript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from 'eslint-config-next';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      // TypeScript-specific rules
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',

      // Next.js rules (basic)
      'react/react-in-jsx-scope': 'off', // Next.js auto-imports React
      'react/prop-types': 'off', // TypeScript handles prop validation

      // General best practices
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'dist/**',
      'build/**',
      'out/**',
      '.planning/**',
      'supabase/functions/**/*.js', // Edge Functions use Deno, not Node
    ],
  }
);
```

**Add lint script to package.json:**
Add to "scripts" section:
```json
"lint": "eslint . --ext .ts,.tsx",
"lint:fix": "eslint . --ext .ts,.tsx --fix"
```

**NOTE:** This project uses Biome (@biomejs/biome) for formatting, so ESLint is focused on code quality rules, not formatting. The two tools are complementary.
  </action>
  <verify>
```bash
# Verify config file exists
ls eslint.config.js
# Should return: eslint.config.js

# Verify ESLint packages installed
grep -c '"eslint"' package.json
grep -c '"typescript-eslint"' package.json
grep -c '"eslint-config-next"' package.json
# Each should return: 1

# Verify lint scripts added
grep -c '"lint"' package.json
# Should return: at least 2 (lint and lint:fix)

# Run ESLint to verify config works
npm run lint -- --max-warnings=999
# Should execute without config errors (warnings are OK for now)
```
  </verify>
  <done>
- eslint.config.js created with ESLint v9 flat config format
- ESLint packages installed (eslint@^9, typescript-eslint@^8, eslint-config-next@^15)
- TypeScript and Next.js rules configured
- Lint and lint:fix scripts added to package.json
- Config tested and working (npx eslint runs without errors)
  </done>
</task>

</tasks>

<verification>
**Overall phase verification:**

```bash
# 1. Verify no hardcoded secrets remain
grep -r "6cdb014dc4124e23095525f05fc3acfa" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next
# Should return: no matches

# 2. Verify xlsx vulnerability eliminated
npm audit | grep xlsx
# Should return: no matches (or only xlsx-js-style if listed, which has no known CVEs)

# 3. Verify ESLint config loads
npx eslint --print-config eslint.config.js
# Should return: config object without errors

# 4. Run TypeScript compiler
npx tsc --noEmit
# Should pass with 0 errors

# 5. Verify imports compile
npm run build
# Should succeed
```
</verification>

<success_criteria>
**Phase complete when:**

1. **Hardcoded secret removed:**
   - No occurrences of "6cdb014dc4124e23095525f05fc3acfa" in codebase
   - Load test throws error if WASEND_WEBHOOK_SECRET env var missing
   - File header comment documents env var requirement

2. **xlsx vulnerability fixed:**
   - xlsx package removed from package.json and node_modules
   - xlsx-js-style installed as replacement
   - All 4 files import from 'xlsx-js-style'
   - TypeScript compilation passes
   - `npm audit` shows no xlsx-related vulnerabilities

3. **ESLint config exists:**
   - eslint.config.js file created in project root
   - ESLint v9 packages installed in devDependencies
   - Config uses flat format with TypeScript support
   - Lint scripts added to package.json
   - `npm run lint` executes without config errors

4. **Codebase still compiles:**
   - `npx tsc --noEmit` passes
   - `npm run build` succeeds
   - No breaking changes introduced
</success_criteria>

<output>
After completion, create `.planning/quick/10-fix-3-audit-findings-remove-hardcoded-we/10-SUMMARY.md` with:
- Files modified (8 total: test file, package.json, 4 xlsx imports, eslint.config.js)
- Security improvements (hardcoded secret removed, vulnerable dependency replaced)
- New infrastructure (ESLint v9 flat config)
- Post-fix requirement: Rotate WASEND_WEBHOOK_SECRET in Supabase Edge Function secrets
</output>
