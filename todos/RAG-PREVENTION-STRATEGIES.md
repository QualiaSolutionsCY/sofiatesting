# RAG Prevention Strategies
## Preventing Recurrence of 6 Critical Issues in Supabase Edge Functions

This document provides actionable prevention strategies for issues that were fixed in this codebase. Each strategy includes code review checklists, automated checks, and best practices.

---

## Issue 1: API Keys in URL Query Parameters (Security)

### What Went Wrong
API keys exposed in URL query parameters instead of HTTP headers, logging query strings, or passing them through unsecured channels.

### Prevention Checklist for Code Review
- [ ] **API calls**: Verify all `fetch()` calls use `Authorization` header, NOT query parameters
- [ ] **Headers check**: Confirm sensitive headers set in `fetch()` headers object
- [ ] **Logging audit**: Search for `console.log` containing `?`, `=`, `key`, `token`, `secret` - redact if present
- [ ] **Environment vars**: Check all `Deno.env.get()` / `process.env` are used in headers only
- [ ] **URL construction**: No template literals in URLs with secrets: `https://api.com?key=${SECRET}` ❌
- [ ] **Error messages**: Ensure error responses don't echo back auth headers or secrets
- [ ] **Network logs**: Verify Sentry/logging doesn't capture full request objects with headers

### Automated Checks (Lint Rules)
```typescript
// .biome.json or custom lint rule
// ESLint plugin option:
{
  "rules": {
    // Flag URL literals containing env vars
    "no-env-in-urls": {
      "level": "error",
      "patterns": ["process.env", "Deno.env", "${.*API", "${.*KEY", "${.*SECRET"]
    },
    // Flag query parameter assignments with secrets
    "no-secret-in-query": {
      "level": "error",
      "patterns": ["\\?.*=.*API", "\\?.*=.*KEY", "\\?.*=.*SECRET"]
    },
    // Flag fetch calls without Authorization header
    "fetch-auth-header-required": {
      "level": "warning"
    }
  }
}
```

### Best Practice Pattern
```typescript
// CORRECT: Secrets in headers only
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");

const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${OPENROUTER_API_KEY}`, // ✅ Headers only
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ /* ... */ })
});

// WRONG patterns to avoid:
// ❌ await fetch(`https://api.com?key=${API_KEY}`)
// ❌ console.log(`API_KEY=${OPENROUTER_API_KEY}`)
// ❌ throw new Error(`Failed with key: ${API_KEY}`)
```

### Implementation Guide
1. **Pre-commit hook**: Add hook to block commits containing `?.*=${` patterns
2. **CI check**: Scan all merged PRs for secrets using `truffleHog` or `detect-secrets`
3. **Supabase secrets audit**: Run `supabase secrets list` monthly; verify they're never in logs
4. **Log redaction middleware**: Wrap all `console.log` to redact Authorization headers

---

## Issue 2: Sequential Blocking Operations (Performance)

### What Went Wrong
Multiple API calls executed sequentially with `await`, blocking execution. Example: DOCX generation waiting for Supabase storage upload before sending to WhatsApp.

### Prevention Checklist for Code Review
- [ ] **Promise chains**: Look for `await X; await Y;` where Y doesn't depend on X
- [ ] **Fire-and-forget**: Identify non-blocking operations that should use `.catch()` or `Promise.allSettled()`
- [ ] **Response timing**: Verify webhook handlers return 200 OK quickly (<100ms), not after processing
- [ ] **Database calls**: Check for parallel DB calls being executed sequentially
- [ ] **External APIs**: Confirm calls to non-critical APIs (logging, analytics) are non-blocking
- [ ] **Memory operations**: Non-critical context building should be fire-and-forget
- [ ] **Timeout checks**: Verify long-running operations don't exceed webhook timeout (30-60s)

### Automated Checks (Performance Tests)
```typescript
// tests/performance/blocking-operations.test.ts
describe('No sequential blocking operations', () => {
  test('WebhookHandler returns <100ms before processing', async () => {
    const start = Date.now();
    const response = await handleWebhook(testPayload);
    const elapsed = Date.now() - start;

    expect(response.status).toBe(200);
    expect(elapsed).toBeLessThan(100); // Must return quickly
  });

  test('Memory storage is fire-and-forget', async () => {
    const storePromise = storeMemory(userId, "user", message, { importance: 0.8 });

    // Should NOT await - operation continues in background
    expect(storePromise).toBeInstanceOf(Promise);
    // Main flow completes independently
  });
});
```

### Best Practice Pattern
```typescript
// WRONG: Sequential blocking
async function processRequest(userId: string, message: string) {
  await addMessage(userId, "user", message);
  const response = await callAI(message); // Blocks on DB write
  await addMessage(userId, "model", response); // Blocks on AI response
  await uploadDocx(docxContent); // Blocks on DB write
  // Total time: T_db + T_ai + T_db + T_upload
}

// CORRECT: Non-blocking operations
async function processRequest(userId: string, message: string) {
  // Critical path: only essential operations
  const response = await callAI(message);

  // Fire-and-forget: non-blocking operations
  addMessage(userId, "user", message).catch(err =>
    logger.error("Async user message store failed", err)
  );

  addMessage(userId, "model", response).catch(err =>
    logger.error("Async AI message store failed", err)
  );

  // Return webhook response immediately (200 OK)
  return new Response("OK", { status: 200 });

  // Continue in background after response sent
  await uploadDocx(docxContent); // Non-blocking
}

// ALTERNATIVE: Promise.allSettled for parallel operations
const [dbResult, memoryResult] = await Promise.allSettled([
  addMessage(userId, "user", message),
  storeMemory(userId, "user", message, { importance: 0.8 })
]);
```

### Implementation Guide
1. **Hook: block `await` chains**: Flag consecutive `await` statements for review
2. **Performance budgets**: Webhook handlers must return <100ms; AI responses <30s
3. **Timeout warnings**: Log if any operation exceeds 50% of timeout budget
4. **Background job queue**: Use Redis/Bull for operations that can run after response

---

## Issue 3: Dead/Unused Code Accumulation (Maintainability)

### What Went Wrong
Deprecated functions (`isMessageProcessed`, `markMessageProcessed`) left in codebase, causing confusion and maintenance burden. Multiple similar implementations of the same feature.

### Prevention Checklist for Code Review
- [ ] **Deprecated functions**: All `@deprecated` annotations have removal date or migration path
- [ ] **Unused exports**: No functions exported but never imported (check with IDE)
- [ ] **Dead code in functions**: No unreachable code after early returns or throws
- [ ] **Duplicate logic**: No more than 2 similar implementations of same feature
- [ ] **Old patterns**: No fallback to older versions when new pattern exists
- [ ] **Test coverage**: Dead code should be removed, not just have 0% coverage
- [ ] **Comments age**: Code with comments >6 months old should be reviewed for removal

### Automated Checks (Dead Code Detection)
```bash
#!/bin/bash
# scripts/check-dead-code.sh

# Tool 1: Find unused exports with ast-grep
ast-grep --pattern 'export function $name($$$) { $$$ }' --lang typescript

# Tool 2: Find deprecated without removal plan
rg '@deprecated' --no-heading | while read line; do
  if ! grep -q "removal\|migrate\|2026\|2027" <<< "$line"; then
    echo "❌ Deprecated without removal plan: $line"
    exit 1
  fi
done

# Tool 3: Find unused variables
rg '^\s+(const|let|var) \w+' | \
  awk '{print $NF}' | while read var; do
    if ! rg -q "$var" -- --type-not=comments; then
      echo "⚠️  Potentially unused: $var"
    fi
  done
```

### Best Practice Pattern
```typescript
// WRONG: Deprecated without migration path
/** @deprecated Use claimMessageForProcessing() instead */
export async function isMessageProcessed(messageKey: string): Promise<boolean> {
  // Still works, might be used by unknown callers
}

// CORRECT: Deprecated with clear removal plan
/**
 * @deprecated REMOVED Feb 2026 - use claimMessageForProcessing() for atomic operations
 *
 * Migration path:
 * OLD: if (await isMessageProcessed(key)) return;
 * NEW: if (!await claimMessageForProcessing(key)) return;
 */
export async function isMessageProcessed(messageKey: string): Promise<boolean> {
  console.warn("[DEPRECATED] isMessageProcessed is removed - use claimMessageForProcessing()");
  // Implementation removed - will throw if accidentally called
  throw new Error("isMessageProcessed() was removed. Use claimMessageForProcessing() instead.");
}

// Or remove entirely if safe:
// (Nothing - removed from codebase after Jan 2026)
```

### Implementation Guide
1. **Add to CLAUDE.md**: Document removal dates for deprecated functions
2. **Pre-commit hook**: Block code with `@deprecated` but no removal date
3. **Quarterly cleanup**: Review and remove deprecated code >3 months old
4. **GitHub Actions**: Detect dead code in CI, report with removal suggestions
5. **IDE configuration**: Enable "unused code" warnings; flag unused imports

---

## Issue 4: Multiple Database Client Instances (Architecture)

### What Went Wrong
Multiple Supabase client instances created in different parts of Edge Function, causing connection pool exhaustion or inconsistent state. Example: Creating new Supabase client per request instead of reusing singleton.

### Prevention Checklist for Code Review
- [ ] **Singleton pattern**: Database clients are initialized once at module level
- [ ] **No clients in functions**: No `new Supabase()` or `createClient()` inside function bodies
- [ ] **Imports verified**: All files import the same singleton instance
- [ ] **Connection pooling**: Pool size configured correctly in `deno.json` or env
- [ ] **Credentials scoped**: Service role key used only where needed; JWT tokens for user operations
- [ ] **Environment setup**: Verify Supabase URL and keys set once at startup, not per request
- [ ] **Error handling**: Connection errors logged with retry strategy, not swallowed

### Automated Checks (Enforce Singleton)
```typescript
// scripts/enforce-singleton-clients.sh
# Flag any instantiation of database clients inside functions
rg 'new Supabase|createClient|new PrismaClient|new MongoClient' \
  --type ts --type tsx \
  --not -l 'supabase.ts|client.ts|db.ts' \
  && echo "❌ Database client instantiated outside of singleton!"

# Flag multiple Supabase imports from different sources
rg 'import.*supabase|from.*supabase|from.*Supabase' \
  --type ts --type tsx | \
  awk -F: '{print $1}' | sort | uniq -d \
  && echo "⚠️  Multiple client initialization files detected"
```

### Best Practice Pattern
```typescript
// CORRECT: Singleton client
// lib/supabase.ts - ONE place to create client
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase credentials");
}

// Create once, export singleton
export const supabase = createClient(supabaseUrl, supabaseKey);

// All other files import the singleton
// database.ts
import { supabase } from "./lib/supabase.ts";

export async function getHistory(userId: string) {
  return supabase.from('chat_history').select('*');
}

// WRONG: Multiple instances
// ❌ Don't do this in functions:
async function processRequest() {
  const client = new Supabase(Deno.env.get("SUPABASE_URL")!); // ❌ WRONG
}

// ❌ Don't do this in imports:
// file1.ts: import { supabase } from "@supabase/supabase-js";
// file2.ts: import { createClient } from "@supabase/supabase-js";
```

### Implementation Guide
1. **Audit existing code**: Run script above to find all client instantiations
2. **Consolidate clients**: Move all to single `lib/supabase.ts` or `lib/db.ts`
3. **Connection pooling**: Use `SUPABASE_POOL_SIZE=10` in Edge Function secrets
4. **Health check**: Add startup validation that singleton is created correctly
5. **CI check**: Fail builds if multiple client files detected

---

## Issue 5: PII Leakage to AI Providers (Privacy/GDPR)

### What Went Wrong
Personally identifiable information (PII) passed directly to OpenRouter/Gemini API, violating data minimization and GDPR principles. Examples: full phone numbers, full names, email addresses in system prompts.

### Prevention Checklist for Code Review
- [ ] **PII in system prompt**: No phone numbers, emails, full names in SYSTEM_PROMPT
- [ ] **User context check**: Verify personalization is masked/anonymized (use hashes or IDs)
- [ ] **Message inspection**: Chat history sent to AI doesn't contain sensitive fields
- [ ] **Error messages**: No PII in error logs sent to Sentry
- [ ] **Database values**: User identification uses UUID/internal ID, not email/phone
- [ ] **Logging audit**: Search for `console.log.*email|console.log.*phone|console.log.*name`
- [ ] **API payloads**: Inspect `JSON.stringify()` of requests to AI providers

### Automated Checks (PII Detection)
```bash
#!/bin/bash
# scripts/check-pii-in-ai-calls.sh

echo "Checking for PII in system prompts..."
rg '\+\d{2,}|\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b|[A-Z][a-z]+ [A-Z][a-z]+' \
  --type ts --glob '**/prompts.ts' \
  && echo "⚠️  Potential PII found in prompts - review manually"

echo "Checking for PII in AI API calls..."
rg 'fetch.*openrouter|fetch.*googleapis' --type ts -A 20 | \
  rg 'phoneNumber|email|fullName|name:' \
  && echo "❌ PII detected in AI API call body"

echo "Checking console.log with sensitive fields..."
rg 'console\.(log|error).*\$\{.*(phone|email|name)' --type ts \
  && echo "❌ PII in console logs"
```

### Best Practice Pattern
```typescript
// WRONG: PII sent to AI
const systemPrompt = `
You are talking to ${user.fullName} at ${user.phoneNumber}.
Email: ${user.email}
...generate documents for this person...
`;

const response = await fetch(OPENROUTER_URL, {
  body: JSON.stringify({
    messages: [
      { role: "user", content: `Generate a document for ${user.email}` }
    ]
  })
});

// CORRECT: PII masked/anonymized
const systemPrompt = `
You are talking to User ID: ${user.id}.
(This is an internal reference - no actual PII sent to AI)
...generate documents...
`;

// If personalization needed, use hashing:
const userId = crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(user.email)
).then(hash => btoa(String.fromCharCode(...new Uint8Array(hash))));

const response = await fetch(OPENROUTER_URL, {
  body: JSON.stringify({
    messages: [
      { role: "user", content: `For user context, use ID: ${userId}` }
    ]
  })
});

// For user context, pass ANONYMIZED data:
interface UserContext {
  internalId: string;      // UUID, not email/phone
  messageCount: number;     // Statistical data only
  interactionDuration: number; // Duration in ms, not timestamps
  preferredLanguage: string; // No PII
}
```

### Implementation Guide
1. **Data minimization**: Only send necessary fields to AI (use allowlist approach)
2. **Hashing for identification**: Use UUID or SHA-256 hashes instead of email/phone
3. **Audit data processor agreements**: Verify AI provider's DPA covers EU/GDPR
4. **Pre-commit hook**: Block commits with email/phone patterns in prompts
5. **Sanitization middleware**: Strip PII from all AI API requests before sending

---

## Issue 6: Missing Caching for Repeated API Calls (Performance/Cost)

### What Went Wrong
Same taxonomy data or AI model configurations fetched repeatedly, wasting API quota and increasing latency. No Redis caching for expensive repeated operations.

### Prevention Checklist for Code Review
- [ ] **Caching strategy**: Check for repeated calls to same external APIs (Zyprus, OpenRouter)
- [ ] **Cache TTL**: Verify cached data has appropriate time-to-live (1h for taxonomy, 24h for prompts)
- [ ] **Cache invalidation**: Ensure cache is cleared on relevant data updates
- [ ] **Fallback logic**: Cache misses have graceful fallback (in-memory or hardcoded defaults)
- [ ] **Cache metrics**: Track hit/miss rates; monitor cache effectiveness
- [ ] **Duplicate prevention**: No two functions doing the same expensive lookup
- [ ] **Database queries**: Reuse query results instead of re-querying in loops

### Automated Checks (Cache Coverage)
```bash
#!/bin/bash
# scripts/check-caching-opportunity.sh

echo "Checking for repeated external API calls..."
rg 'await fetch|await supabase|await client' \
  --type ts | awk '{print $1}' | sort | uniq -c | \
  awk '$1 > 1 {print "⚠️  Repeated call in " $2}' | \
  grep -v test | head -20

echo "Checking for cache misses in tight loops..."
rg 'for.*\{.*fetch|forEach.*fetch' --type ts \
  && echo "❌ Fetch inside loop detected - add caching!"

echo "Checking for missing Redis initialization..."
rg 'Redis|cache|Cache' --type ts -c | \
  head -1 | grep -q '^0' \
  && echo "⚠️  No caching detected - consider Redis for taxonomy/configs"
```

### Best Practice Pattern
```typescript
// WRONG: No caching - repeated calls
async function getPropertyTaxonomy() {
  // Called 10 times per conversation = 10 API calls
  const { data } = await fetch("https://zyprus.com/api/taxonomy");
  return data;
}

async function createListing(property: PropertyData) {
  const taxonomy = await getPropertyTaxonomy(); // ❌ No caching
  // ... use taxonomy ...
}

// CORRECT: Redis cache with fallback
const TAXONOMY_CACHE_TTL = 3600; // 1 hour

async function getPropertyTaxonomy() {
  // Try cache first
  const cached = await redis.get('zyprus:taxonomy');
  if (cached) {
    console.log("[Cache] Taxonomy hit");
    return JSON.parse(cached);
  }

  // Cache miss - fetch and store
  console.log("[Cache] Taxonomy miss - fetching...");
  try {
    const response = await fetch("https://zyprus.com/api/taxonomy");
    const data = await response.json();

    // Store with TTL
    await redis.setex('zyprus:taxonomy', TAXONOMY_CACHE_TTL, JSON.stringify(data));
    return data;
  } catch (error) {
    // Fallback to in-memory cache if Redis fails
    console.error("[Cache] Fetch failed, using fallback:", error);
    return IN_MEMORY_TAXONOMY_FALLBACK;
  }
}

// Invalidate on updates
async function updateTaxonomy() {
  await fetch("https://zyprus.com/api/taxonomy", { method: "POST" });
  await redis.del('zyprus:taxonomy'); // Clear cache
}

// Pattern: Cache decorators for common APIs
class CachedAPIClient {
  private cache = new Map();

  async cachedFetch(key: string, fetcher: () => Promise<T>, ttl: number = 3600) {
    if (this.cache.has(key)) {
      const { data, expiry } = this.cache.get(key);
      if (Date.now() < expiry) return data;
    }

    const data = await fetcher();
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttl * 1000
    });
    return data;
  }
}
```

### Implementation Guide
1. **Redis setup**: Add Redis (Upstash) to Supabase Edge Function secrets
2. **Cache layer**: Create `lib/cache.ts` with standardized get/set functions
3. **Cache metrics**: Add monitoring to track hit/miss rates
4. **TTL strategy**: Document appropriate TTLs for each cached resource
5. **Invalidation strategy**: Define when to clear cache (on creation, updates, errors)
6. **Fallback data**: Maintain in-memory fallback for critical data (taxonomies)

---

## Cross-Issue Prevention Framework

### 1. Pre-commit Hooks (Block Before Commit)
```bash
# .husky/pre-commit
#!/bin/bash

echo "Running pre-commit checks..."

# Check 1: No secrets in URLs
if grep -r '\?.*[A-Z_]*KEY\|Bearer.*\${\|Authorization.*process.env' \
  --include="*.ts" --include="*.js" app/ lib/ supabase/; then
  echo "❌ Potential secrets in URLs detected"
  exit 1
fi

# Check 2: No console.log with secrets
if grep -r 'console\.(log|error).*[A-Z_]*KEY\|console\.(log|error).*Bearer' \
  --include="*.ts" --include="*.js" app/ lib/ supabase/; then
  echo "❌ Secrets in console.log detected"
  exit 1
fi

# Check 3: No deprecated without removal plan
if grep -r '@deprecated' --include="*.ts" | \
  grep -v 'removal\|migrate\|202[6-9]\|203'; then
  echo "⚠️  Deprecated without removal plan - add migration path or removal date"
fi

echo "✅ Pre-commit checks passed"
```

### 2. GitHub Actions CI Pipeline
```yaml
# .github/workflows/rag-prevention.yml
name: RAG Prevention Checks

on: [pull_request, push]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Check for secrets in code
        run: |
          npx detect-secrets scan --baseline .secrets.baseline
          git diff HEAD~1 | npx detect-secrets scan --stdin --baseline .secrets.baseline

      - name: Check for PII patterns
        run: |
          echo "Checking for email/phone in AI prompts..."
          grep -r '@[a-z0-9]' supabase/functions/*/prompts.ts && exit 1 || true

      - name: Dead code analysis
        run: |
          npm run check:dead-code -- --fail-on-warning

      - name: Performance: Check blocking operations
        run: npm run test:performance

  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Lint with Biome
        run: npx biome lint --include-ignored

      - name: Check for duplicate clients
        run: |
          rg 'new Supabase|createClient' \
            --not -l 'supabase.ts|client.ts|db.ts' \
            --count && exit 1 || true
```

### 3. Documentation & Knowledge Base
```markdown
# RAG Prevention Checklist (Quarterly)

## Every Pull Request
- [ ] No secrets in URLs or logs (use grep patterns above)
- [ ] Webhook handlers return <100ms
- [ ] Database clients are singletons
- [ ] No PII sent to AI providers
- [ ] No new deprecated code without removal plan

## Monthly
- [ ] Review Supabase secrets list (no exposed keys)
- [ ] Run `npm run check:dead-code` and remove findings
- [ ] Cache hit rate >75% for Zyprus taxonomy

## Quarterly
- [ ] Remove all deprecated code >3 months old
- [ ] Audit database connections (verify singleton)
- [ ] Verify no blocking operations in webhook handlers
- [ ] Review PII handling in AI prompts
```

### 4. Developer Onboarding
Add to CLAUDE.md:
```markdown
## RAG Prevention Best Practices

When adding new features:
1. **Security**: No secrets in URLs, query params, or logs
2. **Performance**: Webhook handlers return <100ms; use fire-and-forget for non-critical ops
3. **Maintainability**: Remove deprecated code; use singletons for database clients
4. **Privacy**: Mask PII before sending to AI providers (use UUIDs/hashes)
5. **Cost**: Cache repeated API calls (1h for taxonomy, 24h for configs)

See RAG-PREVENTION-STRATEGIES.md for detailed patterns.
```

---

## Summary Table

| Issue | Root Cause | Prevention | Check |
|-------|-----------|-----------|-------|
| **API Keys in URLs** | Convenience > security | Use headers only; lint rule | Pre-commit hook + detect-secrets |
| **Blocking operations** | Sync-first thinking | Fire-and-forget for non-critical ops | Performance tests; timing assertions |
| **Dead code** | No removal process | Add removal date to @deprecated | Dead code analyzer in CI |
| **Multiple clients** | Local instantiation | Create singleton; import only | grep for 'new Supabase' |
| **PII leakage** | No data classification | Use UUIDs/hashes; avoid email/phone | rg for patterns in prompts |
| **Missing caches** | No cache strategy | Redis + fallback for repeated calls | Cache hit metrics |

---

## Implementation Priority

### Phase 1 (Week 1): Critical Security
1. Add pre-commit hook for secrets detection
2. Implement GitHub Actions for detect-secrets
3. Audit existing code for PII in prompts

### Phase 2 (Week 2): Code Quality
1. Consolidate database clients to singleton
2. Add dead code detection in CI
3. Document deprecated code removal dates

### Phase 3 (Week 3): Performance
1. Add performance tests for webhook timing
2. Implement Redis caching for taxonomy
3. Add cache metrics monitoring

### Phase 4 (Week 4): Documentation
1. Update CLAUDE.md with best practices
2. Add RAG prevention to PR template
3. Create developer onboarding guide

---

## Files to Create/Update

### New Files
- `scripts/check-dead-code.sh` - Find unused functions
- `scripts/enforce-singleton-clients.sh` - Detect multiple DB clients
- `scripts/check-pii-in-ai-calls.sh` - Find PII in AI prompts
- `.husky/pre-commit` - Security checks before commit
- `.github/workflows/rag-prevention.yml` - Automated checks
- `tests/performance/blocking-operations.test.ts` - Performance assertions
- `docs/RAG-PREVENTION-CHECKLIST.md` - Code review guide

### Files to Update
- `CLAUDE.md` - Add best practices section
- `package.json` - Add lint scripts
- `biome.json` - Add custom rules
- PR template - Add RAG prevention checklist

---

## References

- GDPR Data Minimization: https://gdpr-info.eu/art-5-gdpr/
- OWASP Secrets Management: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- API Security Headers: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Authorization
- Deno Best Practices: https://deno.land/manual/basics/security
- Edge Function Performance: https://supabase.com/docs/guides/functions/performance

