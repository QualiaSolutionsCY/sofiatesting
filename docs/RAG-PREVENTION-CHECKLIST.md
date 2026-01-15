# RAG Prevention Code Review Checklist

Use this checklist when reviewing pull requests to prevent the 6 critical issues that were previously fixed.

## Issue 1: API Keys in URL Query Parameters (SECURITY)

**Why it matters**: Secrets in query parameters are logged in access logs, browser history, CDN logs, and error tracking systems.

### Code Review Checklist
- [ ] **No query parameters with secrets**: Search for `?key=`, `?token=`, `?auth=` patterns
  ```bash
  grep -n '?.*[A-Z_]*KEY\|?.*[A-Z_]*TOKEN' <file>
  ```

- [ ] **Authorization headers only**: All `fetch()` calls use `Authorization` header, not query params
  ```typescript
  // ✅ CORRECT
  headers: { "Authorization": `Bearer ${API_KEY}` }

  // ❌ WRONG
  `${url}?key=${API_KEY}`
  ```

- [ ] **No env vars in URLs**: Template literals in URLs don't contain `${Deno.env|process.env}`
  ```typescript
  // ✅ CORRECT
  const url = "https://api.com/endpoint";
  headers: { "Authorization": `Bearer ${API_KEY}` }

  // ❌ WRONG
  const url = `https://api.com/endpoint?key=${API_KEY}`;
  ```

- [ ] **Console output sanitized**: No `console.log` of full requests/responses with auth headers
  ```typescript
  // ✅ CORRECT
  console.log(`[API] Calling ${endpoint}`); // No headers logged

  // ❌ WRONG
  console.log(`[API] Request:`, fetchRequest); // Full headers visible
  ```

- [ ] **Error messages clean**: Error responses don't echo back secrets
  ```typescript
  // ✅ CORRECT
  throw new Error("API call failed");

  // ❌ WRONG
  throw new Error(`API call failed: ${error} key: ${API_KEY}`);
  ```

---

## Issue 2: Sequential Blocking Operations (PERFORMANCE)

**Why it matters**: Webhook handlers have 30-60s timeouts. Sequential `await` calls block execution and cause timeouts.

### Code Review Checklist
- [ ] **Webhook handlers return <100ms**: Returns 200 OK before processing starts
  ```typescript
  // ✅ CORRECT
  return new Response("OK", { status: 200 });
  // Then process in background

  // ❌ WRONG
  await processRequest(); // Blocks before return
  return new Response("OK", { status: 200 });
  ```

- [ ] **Non-blocking operations use fire-and-forget**:
  ```typescript
  // ✅ CORRECT: Fire-and-forget with error handling
  storeMemory(userId, "user", message).catch(err =>
    logger.error("Failed to store memory", err)
  );

  // ❌ WRONG: Blocks execution
  await storeMemory(userId, "user", message);
  ```

- [ ] **Database calls parallelized when independent**:
  ```typescript
  // ✅ CORRECT: Parallel database calls
  const [msg1, msg2] = await Promise.all([
    addMessage(userId, "user", message),
    storeMemory(userId, "user", message)
  ]);

  // ❌ WRONG: Sequential blocking
  await addMessage(userId, "user", message);
  await storeMemory(userId, "user", message);
  ```

- [ ] **No `await` chains without dependencies**:
  Look for patterns like:
  ```typescript
  // ❌ WRONG: Chain blocks each step
  await operation1();
  await operation2(); // Must wait for operation1
  await operation3(); // Must wait for operation2

  // ✅ CORRECT: Only critical path awaited
  const result1 = await criticalOperation();
  nonCriticalOp1().catch(log);
  nonCriticalOp2().catch(log);
  return result1;
  ```

- [ ] **No fetch/database calls in loops**:
  ```typescript
  // ❌ WRONG: N+1 queries
  for (const item of items) {
    await db.query(item.id); // Blocks N times
  }

  // ✅ CORRECT: Single batch query
  const results = await db.batchQuery(items.map(i => i.id));
  ```

---

## Issue 3: Dead/Unused Code (MAINTAINABILITY)

**Why it matters**: Dead code causes confusion, increases maintenance burden, and hides real bugs.

### Code Review Checklist
- [ ] **No unused exports**: Functions exported but never imported elsewhere
  ```bash
  # Check if function is used
  rg 'export function myFunc|import.*myFunc' --type ts
  ```

- [ ] **All deprecated code has removal dates**:
  ```typescript
  // ✅ CORRECT: Has removal plan
  /**
   * @deprecated REMOVED Feb 2026 - use newFunction() instead
   */
  export async function oldFunction() { ... }

  // ❌ WRONG: No removal plan
  /** @deprecated Use newFunction() */
  export async function oldFunction() { ... }
  ```

- [ ] **No unreachable code after `return` or `throw`**:
  ```typescript
  // ❌ WRONG: Unreachable
  if (error) {
    return error;
    doSomething(); // Never runs
  }

  // ✅ CORRECT
  if (error) {
    return error;
  }
  doSomething();
  ```

- [ ] **No duplicate implementations**: Check for similar logic in multiple places
  ```typescript
  // ❌ WRONG: Two ways to do same thing
  export function formatMessage(msg: string) { ... }
  export function formatMessageV2(msg: string) { ... }

  // ✅ CORRECT: Single implementation
  export function formatMessage(msg: string) { ... }
  ```

- [ ] **Deprecated comments with dates**:
  ```typescript
  // ❌ WRONG: No date
  // DEPRECATED: use X instead

  // ✅ CORRECT: With removal date
  // @deprecated REMOVED Jan 2026 - use X instead (migration: ...)
  ```

---

## Issue 4: Multiple Database Client Instances (ARCHITECTURE)

**Why it matters**: Multiple clients exhaust connection pools and cause inconsistent state.

### Code Review Checklist
- [ ] **Database clients created once, at module level**:
  ```typescript
  // ✅ CORRECT: Singleton
  // lib/supabase.ts
  export const supabase = createClient(url, key);

  // ❌ WRONG: Instantiated in function
  async function query() {
    const db = new Supabase(url, key);
  }
  ```

- [ ] **All files import the same singleton**:
  ```bash
  # Should all import from same location
  rg 'import.*supabase' --type ts
  # All should be: import { supabase } from "@/lib/supabase"
  ```

- [ ] **No `new Supabase()` or `createClient()` in function bodies**:
  ```bash
  grep -n 'new Supabase\|createClient' <file> | \
    grep -v '^[0-9]*:export\|^[0-9]*:const'
  # Should only appear at module level
  ```

- [ ] **Credentials set once at module level**:
  ```typescript
  // ✅ CORRECT: Set once
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  export const supabase = createClient(supabaseUrl, supabaseKey);

  // ❌ WRONG: Accessed in functions
  async function getDb() {
    const url = Deno.env.get("SUPABASE_URL");
    return new Supabase(url, key);
  }
  ```

- [ ] **Connection pool properly sized**:
  ```bash
  # Check deno.json or env for pool config
  grep -i 'pool\|connection' deno.json
  # Should be set to reasonable value (10-20)
  ```

---

## Issue 5: PII Leakage to AI Providers (PRIVACY/GDPR)

**Why it matters**: Sending PII to AI providers violates GDPR data minimization and may breach privacy policies.

### Code Review Checklist
- [ ] **No phone numbers in AI prompts/messages**:
  ```bash
  rg '\\+\\d{8,15}|phoneNumber|phone.*:' supabase/functions/*/prompts.ts
  # Should be empty or only in comments
  ```

- [ ] **No email addresses in AI prompts/messages**:
  ```bash
  rg '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}' supabase/functions/*/prompts.ts | \
    grep -v 'example@\|test@\|sofia@zyprus.com'
  # Should be empty
  ```

- [ ] **No full names in system prompts**:
  ```typescript
  // ❌ WRONG: PII in prompt
  You are talking to ${user.fullName} at ${user.email}.

  // ✅ CORRECT: Use ID only
  User context: ID ${userId}
  ```

- [ ] **User identification uses UUID/ID, not email/phone**:
  ```typescript
  // ✅ CORRECT: Hashed or UUID
  const userId = user.id; // UUID

  // ❌ WRONG: Direct PII
  const userId = user.email;
  ```

- [ ] **AI context anonymized**:
  ```typescript
  // ✅ CORRECT: Anonymous context
  interface UserContext {
    internalId: string;      // UUID
    messageCount: number;
    interactionDuration: number;
  }

  // ❌ WRONG: Contains PII
  interface UserContext {
    email: string;
    phone: string;
    name: string;
  }
  ```

- [ ] **Error logging doesn't include PII**:
  ```typescript
  // ✅ CORRECT
  logger.error("Query failed", { userId: user.id, query: "..." });

  // ❌ WRONG
  logger.error("Query failed", { user: user.email, phone: user.phone });
  ```

---

## Issue 6: Missing Caching for Repeated API Calls (PERFORMANCE/COST)

**Why it matters**: Uncached repeated calls waste API quota and increase latency.

### Code Review Checklist
- [ ] **Expensive operations cached**: Taxonomy, configurations, ML models
  ```typescript
  // ✅ CORRECT: Cached lookup
  async function getTaxonomy() {
    const cached = await redis.get('zyprus:taxonomy');
    if (cached) return JSON.parse(cached);

    const fresh = await fetch('https://zyprus.com/api/taxonomy');
    await redis.setex('zyprus:taxonomy', 3600, JSON.stringify(fresh));
    return fresh;
  }

  // ❌ WRONG: No caching
  async function getTaxonomy() {
    return fetch('https://zyprus.com/api/taxonomy');
  }
  ```

- [ ] **Cache TTL appropriate for data**:
  - Taxonomy: 1 hour (changes rarely)
  - System prompts: 24 hours (stable)
  - User preferences: 5 minutes (may change)
  - Listings: Real-time (frequent changes)

- [ ] **Cache invalidation documented**:
  ```typescript
  // When to clear cache
  async function updateTaxonomy(newData) {
    await saveTaxonomy(newData);
    await redis.del('zyprus:taxonomy'); // Clear on update
  }
  ```

- [ ] **Fallback when cache unavailable**:
  ```typescript
  // ✅ CORRECT: Graceful degradation
  try {
    return await redis.get('data');
  } catch (error) {
    logger.warn("Cache miss, using fallback");
    return FALLBACK_DATA;
  }

  // ❌ WRONG: Fails without cache
  const data = await redis.get('data'); // May throw
  ```

- [ ] **No database query loops**:
  ```bash
  rg 'for|forEach' supabase/functions | grep -A3 'supabase\\.from\\|execute'
  # Should use batch queries instead
  ```

- [ ] **Cache metrics tracked**:
  ```typescript
  // Log cache effectiveness
  console.log(`[Cache] Hit rate: ${hits}/${total} = ${hitRate}%`);
  // Should be >75% for optimal performance
  ```

---

## General Code Review Flow

1. **Read the PR description** - understand what changed
2. **Check issue type** - which of the 6 issues does this touch?
3. **Use grep commands** - verify no patterns from above
4. **Run scripts** - execute `scripts/check-rag-issues.sh`
5. **Test locally** - confirm perf is acceptable
6. **Approve** - only if all checks pass

---

## Quick Commands for Reviewers

```bash
# Check entire PR for all RAG issues
./scripts/check-rag-issues.sh

# Check specific issue
grep -r 'API_KEY' app/ lib/ | grep -v node_modules

# Check for blocking operations
grep -n 'for\|forEach' index.ts | grep -A5 'await'

# Check singleton pattern
grep -r 'new Supabase' --include="*.ts" | grep -v 'lib/supabase'

# Check for PII in prompts
grep -r '@[a-z]' supabase/functions/*/prompts.ts

# Check for deprecated without removal date
grep '@deprecated' app/ lib/ supabase/ | grep -v '202[6-9]\|removal'
```

---

## When to Reject a PR

Reject if:
- ❌ Secrets in URLs or query parameters
- ❌ Multiple database client instances created
- ❌ PII (email/phone/full name) sent to AI providers
- ❌ Webhook handler doesn't return 200 OK within 100ms

Request changes if:
- ⚠️ Blocking operations without justification
- ⚠️ Dead code without removal plan
- ⚠️ Missing cache for expensive operations

Approve after:
- ✅ All grep commands return nothing for Issue 1, 4, 5
- ✅ No blocking operations in critical paths
- ✅ Caching strategy documented
- ✅ Deprecated code has removal dates

