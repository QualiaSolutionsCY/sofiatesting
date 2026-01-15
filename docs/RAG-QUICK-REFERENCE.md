# RAG Prevention Quick Reference Card

Print this or bookmark it. Use it when coding or reviewing.

---

## The 6 Issues at a Glance

| # | Issue | Impact | Prevention | Check Command |
|---|-------|--------|-----------|---|
| 1 | API Keys in URLs | Security Breach | Use headers only | `grep -r '?.*KEY\|Bearer.*\${' app/` |
| 2 | Blocking Ops | Timeout | Fire-and-forget | `grep -B2 'for' index.ts \| grep 'await'` |
| 3 | Dead Code | Confusion | Add removal date | `grep '@deprecated' \| grep -v '202[6-9]'` |
| 4 | Multiple Clients | Pool exhaustion | Use singleton | `grep 'new Supabase' \| grep -v 'lib/'` |
| 5 | PII Leakage | GDPR breach | Use UUID/hash | `grep -r '@.*\|phone' prompts.ts` |
| 6 | No Caching | Quota waste | Cache expensive ops | `grep -c 'redis.get\|cache'` |

---

## Before Each Commit

```bash
./scripts/check-rag-issues.sh
```

If fails: Fix the issue(s) (see patterns below)

---

## Code Patterns to Avoid & Use

### Issue 1: API Keys
```typescript
// ❌ WRONG - Secret in URL
fetch(`https://api.com?key=${API_KEY}`)

// ✅ CORRECT - Secret in header
fetch("https://api.com", {
  headers: { "Authorization": `Bearer ${API_KEY}` }
})
```

### Issue 2: Blocking Operations
```typescript
// ❌ WRONG - Sequential blocking
await addMessage(userId, msg);
await sendNotification(userId);
return new Response("OK");

// ✅ CORRECT - Non-blocking for non-critical
sendNotification(userId).catch(log);
return new Response("OK");
```

### Issue 3: Deprecated Code
```typescript
// ❌ WRONG - No removal plan
/** @deprecated Use newFunc() */
export function oldFunc() { ... }

// ✅ CORRECT - Has removal date
/** @deprecated REMOVED Feb 2026 - use newFunc() */
export function oldFunc() { ... }
```

### Issue 4: Database Clients
```typescript
// ❌ WRONG - Multiple instances
async function query() {
  const db = createClient(url, key);
}

// ✅ CORRECT - Singleton
// lib/supabase.ts
export const supabase = createClient(url, key);

// any_file.ts
import { supabase } from "@/lib/supabase";
```

### Issue 5: PII in Prompts
```typescript
// ❌ WRONG - PII in prompt
const prompt = `User: ${user.email}, Phone: ${user.phone}`;

// ✅ CORRECT - UUID only
const prompt = `User ID: ${user.id}`;
```

### Issue 6: Caching
```typescript
// ❌ WRONG - No caching
async function getTaxonomy() {
  return fetch("https://api.com/taxonomy");
}

// ✅ CORRECT - Cached with fallback
async function getTaxonomy() {
  const cached = await redis.get("taxonomy");
  if (cached) return JSON.parse(cached);

  const data = await fetch("https://api.com/taxonomy");
  await redis.setex("taxonomy", 3600, JSON.stringify(data));
  return data;
}
```

---

## Code Review Checklist (1 min)

When reviewing PR:

```bash
# Check Issue 1: Secrets
grep -n '?.*[A-Z_]*KEY\|Bearer.*\${' <files>

# Check Issue 2: Blocking (look at webhook handlers)
grep -A10 'serve\|webhook' index.ts | grep 'await'

# Check Issue 3: Deprecated
grep '@deprecated' <files> | grep -v '202[6-9]\|removal'

# Check Issue 4: Clients
grep -r 'new Supabase' <files> | grep -v 'lib/supabase'

# Check Issue 5: PII
grep -r '@.*\|[0-9]{10,}' supabase/functions/*/prompts.ts

# Check Issue 6: Caching
grep -c 'redis\|cache' <files>
```

---

## When to REJECT a PR

- ❌ Secrets in URLs
- ❌ Multiple DB client instances
- ❌ PII (email/phone) in prompts
- ❌ Webhook handler doesn't return <100ms

## When to REQUEST CHANGES

- ⚠️ Deprecated without removal date
- ⚠️ Sequential awaits without justification
- ⚠️ No caching for expensive API calls

## When to APPROVE

- ✅ All grep checks return nothing for Issues 1, 4, 5
- ✅ No blocking operations in critical paths
- ✅ All deprecated code has removal dates
- ✅ Caching strategy documented

---

## Handy Commands

```bash
# Find all API keys in code
grep -r 'API_KEY\|OPENROUTER\|RESEND\|WASEND' app/ lib/ supabase/ | \
  grep -v node_modules | grep -v '// ' | head -20

# Find all fetch calls
grep -r 'fetch(' app/ lib/ supabase/ | grep -v node_modules | wc -l

# Find deprecated functions
grep -r '@deprecated' app/ lib/ supabase/ | grep -v node_modules

# Find database queries
grep -r 'supabase.from\|db.query' app/ lib/ | grep -v node_modules | wc -l

# Find all promises
grep -r 'Promise\|async\|await' app/ lib/ | grep -v node_modules | wc -l

# Find console.log in production code
grep -r 'console\.' app/ lib/ supabase/ | grep -v node_modules | grep -v test

# Find unhandled promises
grep -r 'then(\|catch(\|finally(' app/ lib/ | grep -v node_modules
```

---

## Architecture Overview

```
┌─────────────────────────────────────────┐
│      Developer (You)                    │
│  ✓ Run: ./scripts/check-rag-issues.sh  │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│    Pre-commit Hook (.husky)             │
│  ✓ Blocks commits with RAG issues      │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│    GitHub (PR / Push)                   │
│  ✓ Runs GitHub Actions checks          │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│    Code Review                          │
│  ✓ Use RAG-PREVENTION-CHECKLIST.md    │
│  ✓ Run grep commands                   │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│    Merge to Main                        │
│  ✓ All checks passed                   │
└─────────────────────────────────────────┘
```

---

## Real Example: What NOT to Do

```typescript
// BAD CODE - Multiple violations
async function handleWhatsApp(req: Request) {
  // Issue 1: Secret in URL
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  const response = await fetch(`https://openrouter.ai/api?key=${apiKey}`, {

    // Issue 5: PII in body
    body: JSON.stringify({
      user: { email: req.user.email, phone: req.user.phone }
    })
  });

  // Issue 2: Blocking operations - NO parallel
  await saveToDb(response);
  await notifyUser(response);

  // Issue 4: Multiple client instances
  const db1 = new Supabase(url, key);
  const db2 = createClient(url, key);

  // Issue 3: Deprecated without plan
  /** @deprecated Use newFunction() */
  const oldResult = await legacyFunction();

  // Issue 6: No caching
  for (const item of items) {
    const taxonomy = await fetch("/api/taxonomy"); // N API calls!
  }

  return new Response("OK");
}
```

### Fixed Version
```typescript
// GOOD CODE - All issues resolved
async function handleWhatsApp(req: Request) {
  // Issue 1: Secret in header
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`
    },
    // Issue 5: UUID only
    body: JSON.stringify({ userId: req.user.id })
  });

  // Issue 2: Return quickly, non-blocking ops
  saveToDb(response).catch(err => console.error("Async save failed", err));
  notifyUser(response).catch(err => console.error("Async notify failed", err));

  // Issue 4: Use singleton
  const { data } = await supabase.from('messages').insert({ ... });

  // Issue 3: Deprecated with removal date
  /** @deprecated REMOVED Feb 2026 - use newFunction() */
  async function legacyFunction() { ... }

  // Issue 6: Batch load with caching
  const taxonomy = await getCachedTaxonomy(); // Cached, single call
  for (const item of items) {
    processItem(item, taxonomy);
  }

  return new Response("OK", { status: 200 }); // Return early
}

async function getCachedTaxonomy() {
  const cached = await redis.get("taxonomy");
  if (cached) return JSON.parse(cached);

  const fresh = await fetch("/api/taxonomy");
  await redis.setex("taxonomy", 3600, JSON.stringify(fresh));
  return fresh;
}
```

---

## Emergency Contacts

Need help?

- **RAG Strategies**: `/docs/RAG-PREVENTION-STRATEGIES.md`
- **Code Review Guide**: `/docs/RAG-PREVENTION-CHECKLIST.md`
- **Full README**: `/docs/RAG-PREVENTION-README.md`
- **Run checks**: `./scripts/check-rag-issues.sh`

---

## Remember

1. **Security first** - No secrets in URLs or logs
2. **Performance matters** - Webhook handlers must return <100ms
3. **Clean code** - No deprecated code without removal dates
4. **Architecture** - Use singletons, not multiple instances
5. **Privacy** - Use UUIDs/hashes, never PII in prompts
6. **Cost** - Cache expensive operations

**Always run**: `./scripts/check-rag-issues.sh` before committing

