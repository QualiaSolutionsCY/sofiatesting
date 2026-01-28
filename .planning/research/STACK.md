# Stack Research: Reliability Hardening

**Project:** SOPHIA WhatsApp Bot
**Researched:** 2026-01-28
**Runtime:** Supabase Edge Functions (Deno)
**Overall Confidence:** HIGH (verified against existing codebase + current documentation)

---

## 1. Prompt Management

### Current State Analysis

SOPHIA's prompt system has a fundamental architecture problem: **priority conflicts across prompt sections**.

```
Current Architecture:
DB (sophia_prompts) + File Fallbacks → Merged by prompt-loader.ts → Single system prompt

Problem: Both safety_rules (priority 20) and document_routing (priority 30) can contain
conflicting instructions. AI follows the lower priority number.
```

The January 2026 incident documented in CLAUDE.md illustrates this:
- `safety_rules` (priority 20): "Ask for callback fields in 2 separate messages"
- `document_routing` (priority 30): "Ask for ALL callback fields in ONE message"
- Result: AI followed safety_rules, ignoring document_routing

### Recommended Pattern: Single Source of Truth Per Behavior

**DO NOT** use external prompt versioning tools (PromptLayer, Langfuse) for this project. The added complexity isn't worth it for a single-bot system.

**DO** restructure prompts with these principles:

#### Pattern 1: Behavior Ownership

Each behavior should be owned by exactly ONE prompt section:

```typescript
// prompts/behaviors/field-collection.ts
export const FIELD_COLLECTION = `## Field Collection Rules

### Universal Rule
When collecting information for ANY template or document:
- Ask for ALL missing fields in ONE message
- Use bold for field names: **Field Name**
- Wait for user response before generating

### Per-Template Requirements
[Template-specific fields defined here, nowhere else]
`;
```

#### Pattern 2: Conflict Detection Script

Add a build-time check that detects duplicate instructions:

```typescript
// scripts/check-prompt-conflicts.ts
const CONFLICT_PATTERNS = [
  /ask.*field/i,
  /collect.*information/i,
  /send.*email/i,
  /upload.*property/i,
];

function detectConflicts(prompts: Map<string, string>): string[] {
  const conflicts: string[] = [];
  const patternMatches: Map<string, string[]> = new Map();

  for (const [key, content] of prompts) {
    for (const pattern of CONFLICT_PATTERNS) {
      const matches = content.match(new RegExp(pattern, 'gi'));
      if (matches) {
        const existing = patternMatches.get(pattern.source) || [];
        existing.push(`${key}: "${matches[0]}"`);
        patternMatches.set(pattern.source, existing);
      }
    }
  }

  for (const [pattern, sources] of patternMatches) {
    if (sources.length > 1) {
      conflicts.push(`Potential conflict for "${pattern}":\n  ${sources.join('\n  ')}`);
    }
  }

  return conflicts;
}
```

#### Pattern 3: Prompt Section Headers with Priority

Make priority visible in the prompt itself for debugging:

```typescript
// Each prompt section starts with metadata comment
export const SAFETY_RULES = `<!-- SECTION: safety_rules | PRIORITY: 20 | OWNS: email-sending, tool-verification -->
## Safety Rules
...
`;
```

### Caching Strategy for Prompts

The current 5-minute TTL cache is appropriate. The issue isn't the cache duration, it's the lack of cache invalidation feedback.

**Add cache status endpoint for debugging:**

```typescript
// Add to index.ts - diagnostic endpoint
if (req.method === 'GET' && url.pathname.endsWith('/health')) {
  const cacheStatus = getCacheStatus();
  return new Response(JSON.stringify({
    status: 'ok',
    cache: cacheStatus,
    timestamp: new Date().toISOString(),
  }), { headers: { 'Content-Type': 'application/json' } });
}
```

**Confidence:** HIGH - Based on analysis of existing prompt-loader.ts and documented incidents in CLAUDE.md.

---

## 2. Caching Strategies for Edge Functions

### Current State

The prompt-loader.ts uses simple in-memory caching:

```typescript
let cachedPromptSections: Map<string, string> | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // Currently set to 0 for testing
```

This works but has limitations:
- Cache doesn't persist across cold starts
- No visibility into cache state
- No way to invalidate remotely

### Recommended Patterns

#### Pattern 1: Deno @std/cache for Memoization

For expensive operations like taxonomy resolution:

```typescript
import { memoize, LruCache, type MemoizationCacheResult } from "@std/cache";

// Taxonomy lookup with LRU cache (survives warm starts)
const taxonomyCache = new LruCache<string, MemoizationCacheResult<string>>(100);

const resolveTaxonomyUUID = memoize(
  async (taxonomyType: string, value: string): Promise<string> => {
    // Actual API call to Zyprus
    const uuid = await fetchTaxonomyFromAPI(taxonomyType, value);
    return uuid;
  },
  { cache: taxonomyCache }
);
```

**Source:** [Deno @std/cache documentation](https://docs.deno.com/runtime/reference/std/cache/)

#### Pattern 2: Supabase Storage as Persistent Cache

For data that should survive cold starts (like agent profiles, taxonomy mappings):

```typescript
// Using Supabase Storage as persistent cache layer
async function getCachedTaxonomy(key: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('cache')
    .download(`taxonomy/${key}.json`);

  if (error || !data) return null;

  const cached = JSON.parse(await data.text());
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    return null; // Expired
  }
  return cached.value;
}
```

#### Pattern 3: Layered Cache Strategy

Best practice for Edge Functions - combine memory + persistent:

```typescript
interface CacheLayer {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl: number): Promise<void>;
}

// Layer 1: In-memory (fastest, lost on cold start)
const memoryCache = new Map<string, { value: string; expires: number }>();

// Layer 2: Supabase table (persistent, slower)
async function getFromDB(key: string): Promise<string | null> {
  const { data } = await supabase
    .from('cache')
    .select('value, expires_at')
    .eq('key', key)
    .single();

  if (!data || new Date(data.expires_at) < new Date()) return null;
  return data.value;
}

// Unified getter
async function getCached(key: string): Promise<string | null> {
  // Try memory first
  const mem = memoryCache.get(key);
  if (mem && mem.expires > Date.now()) return mem.value;

  // Fall back to DB
  const dbValue = await getFromDB(key);
  if (dbValue) {
    memoryCache.set(key, { value: dbValue, expires: Date.now() + 60000 });
  }
  return dbValue;
}
```

### What NOT to Add

- **Deno KV**: Not available in Supabase Edge Functions (it's Deno Deploy only)
- **Redis via network**: Adds latency, Supabase DB is already available
- **Web Cache API**: Designed for HTTP responses, not arbitrary data

**Confidence:** HIGH - Verified against Supabase Edge Functions architecture documentation.

---

## 3. URL Validation (Detecting Hallucinated URLs)

### Current State

SOPHIA has robust SSRF prevention in `url-validator.ts`:
- Allowlist-based domain validation
- Private IP blocking
- Path traversal detection

But the problem is **AI-generated URL hallucinations**, not SSRF. The AI sometimes:
1. Claims to have sent an email without calling the tool
2. Invents URLs that don't exist
3. References document URLs that were never created

### Recommended Patterns

#### Pattern 1: URL Existence Verification

Before using any AI-mentioned URL, verify it exists:

```typescript
interface UrlVerification {
  exists: boolean;
  contentType?: string;
  error?: string;
}

async function verifyUrlExists(url: string): Promise<UrlVerification> {
  try {
    // Security check first
    const validation = validateImageUrl(url);
    if (!validation.valid) {
      return { exists: false, error: validation.error };
    }

    // HEAD request to check existence
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });

    return {
      exists: response.ok,
      contentType: response.headers.get('content-type') || undefined,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (err) {
    return {
      exists: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
```

#### Pattern 2: Document URL Registry

Track generated documents to verify references:

```typescript
// Store generated document URLs with session
interface GeneratedDocument {
  url: string;
  type: 'docx' | 'image' | 'other';
  createdAt: Date;
  sessionId: string;
}

// In-memory for current session
const sessionDocuments: Map<string, GeneratedDocument[]> = new Map();

function registerDocument(sessionId: string, doc: GeneratedDocument): void {
  const existing = sessionDocuments.get(sessionId) || [];
  existing.push(doc);
  sessionDocuments.set(sessionId, existing);
}

function isValidDocumentUrl(sessionId: string, url: string): boolean {
  const docs = sessionDocuments.get(sessionId) || [];
  return docs.some(d => d.url === url);
}
```

#### Pattern 3: AI Response Post-Processing

Detect hallucinated "I sent" claims:

```typescript
// Current implementation in index.ts is good - expand it
function detectUnverifiedClaims(
  aiResponse: string,
  actualToolCalls: string[]
): string[] {
  const claims: string[] = [];

  // Email sending claims
  if (/i('ve| have)? sent.*email/i.test(aiResponse)) {
    if (!actualToolCalls.includes('sendEmail')) {
      claims.push('Claims to have sent email but sendEmail tool was not called');
    }
  }

  // Property upload claims
  if (/uploaded|created.*listing/i.test(aiResponse)) {
    if (!actualToolCalls.includes('createPropertyListing')) {
      claims.push('Claims to have uploaded property but createPropertyListing was not called');
    }
  }

  // URL claims - extract URLs and verify against registry
  const urlMatches = aiResponse.match(/https?:\/\/[^\s]+/g) || [];
  for (const url of urlMatches) {
    if (!isKnownUrl(url)) {
      claims.push(`References unknown URL: ${url}`);
    }
  }

  return claims;
}
```

### What NOT to Add

- **External hallucination detection APIs** (HaluGate, GPTZero): Overkill for URL verification
- **LLM-as-judge for URL verification**: Adds latency and cost without benefit

**Confidence:** HIGH - Pattern based on analysis of existing detectEmailSendingIntent() in index.ts.

---

## 4. Logging and Debugging

### Current State

The existing `logger.ts` is well-designed:
- Structured JSON output
- PII redaction
- Log levels via environment variable

Missing capabilities:
- Request tracing (correlation IDs)
- Tool call logging
- Performance timing

### Recommended Patterns

#### Pattern 1: LogTape Integration

Replace custom logger with LogTape for better ecosystem support:

```typescript
// utils/logger.ts - upgraded
import { configure, getLogger, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: {
    console: getConsoleSink({
      formatter: (record) => JSON.stringify({
        level: record.level,
        message: record.message,
        timestamp: record.timestamp.toISOString(),
        category: record.category.join('.'),
        ...record.properties,
      }),
    }),
  },
  loggers: [
    {
      category: ["sophia"],
      sinks: ["console"],
      level: Deno.env.get("LOG_LEVEL") || "info",
    },
  ],
});

export const logger = getLogger(["sophia"]);
export const toolLogger = getLogger(["sophia", "tools"]);
export const aiLogger = getLogger(["sophia", "ai"]);
```

**Benefits:**
- Zero dependencies (5.3KB)
- Hierarchical categories for filtering
- Cross-platform (same code works in Deno, Node, edge)
- Template placeholders for efficient logging

**Source:** [LogTape documentation](https://logtape.org/)

#### Pattern 2: Request Correlation

Add correlation IDs for tracing requests through the system:

```typescript
function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// In main handler
const correlationId = req.headers.get('x-correlation-id') || generateCorrelationId();

// Pass to all operations
const requestLogger = getLogger(["sophia", "request"]);
requestLogger.info("Incoming request", {
  correlationId,
  method: req.method,
  path: url.pathname,
});

// Include in all subsequent logs
toolLogger.info("Tool called", {
  correlationId,
  tool: "createPropertyListing",
  duration: endTime - startTime,
});
```

#### Pattern 3: Tool Call Instrumentation

Wrap tool execution with logging:

```typescript
async function executeToolWithLogging<T>(
  toolName: string,
  params: unknown,
  executor: () => Promise<T>,
  correlationId: string,
): Promise<T> {
  const startTime = performance.now();

  toolLogger.info("Tool execution started", {
    correlationId,
    tool: toolName,
    params: redactSensitiveParams(params),
  });

  try {
    const result = await executor();
    const duration = performance.now() - startTime;

    toolLogger.info("Tool execution completed", {
      correlationId,
      tool: toolName,
      duration,
      success: true,
    });

    return result;
  } catch (error) {
    const duration = performance.now() - startTime;

    toolLogger.error("Tool execution failed", {
      correlationId,
      tool: toolName,
      duration,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}
```

#### Pattern 4: Supabase Logs Table for Persistence

For debugging issues after the fact:

```sql
-- Migration: create logs table
CREATE TABLE sophia_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id TEXT NOT NULL,
  level TEXT NOT NULL,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  properties JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sophia_logs_correlation ON sophia_logs(correlation_id);
CREATE INDEX idx_sophia_logs_created ON sophia_logs(created_at);

-- Auto-cleanup: delete logs older than 7 days
CREATE OR REPLACE FUNCTION cleanup_old_logs() RETURNS void AS $$
BEGIN
  DELETE FROM sophia_logs WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;
```

```typescript
// Optional: Dual-write to console + DB for important events
async function logToDB(entry: LogEntry): Promise<void> {
  // Only log errors and tool executions to DB
  if (entry.level === 'error' || entry.category.includes('tools')) {
    await supabase.from('sophia_logs').insert({
      correlation_id: entry.correlationId,
      level: entry.level,
      category: entry.category.join('.'),
      message: entry.message,
      properties: entry.properties,
    });
  }
}
```

### What NOT to Add

- **External logging services** (Datadog, Splunk, NewRelic): Adds complexity and cost
- **OpenTelemetry full stack**: Overkill for single-function debugging
- **Log aggregation**: Supabase dashboard provides realtime log streaming

**Confidence:** HIGH - LogTape verified current as of January 2026, Supabase logging verified against architecture docs.

---

## 5. Prioritized Recommendations

### Phase 1: Quick Wins (1-2 days)

| Change | Impact | Effort |
|--------|--------|--------|
| Add correlation IDs to all logs | HIGH - enables request tracing | LOW |
| Add cache status health endpoint | MEDIUM - debugging visibility | LOW |
| Document prompt ownership rules | HIGH - prevents future conflicts | LOW |

### Phase 2: Reliability Improvements (3-5 days)

| Change | Impact | Effort |
|--------|--------|--------|
| Implement URL existence verification | HIGH - catches hallucinations | MEDIUM |
| Add tool execution wrapper with timing | HIGH - performance visibility | MEDIUM |
| Create prompt conflict detection script | MEDIUM - prevents regressions | MEDIUM |

### Phase 3: Full Logging Upgrade (5-7 days)

| Change | Impact | Effort |
|--------|--------|--------|
| Migrate to LogTape | MEDIUM - better structured logging | MEDIUM |
| Add sophia_logs table | HIGH - post-incident debugging | MEDIUM |
| Implement document URL registry | MEDIUM - accurate URL verification | MEDIUM |

---

## What NOT to Add

| Tool/Pattern | Why Avoid |
|--------------|-----------|
| Langfuse/PromptLayer | Over-engineered for single-bot system |
| Deno KV | Not available in Supabase Edge Functions |
| Redis cache layer | Supabase DB is sufficient, adds latency |
| External hallucination APIs | Overkill for URL verification |
| OpenTelemetry full stack | Too complex for current needs |
| External logging services | Supabase provides sufficient visibility |

---

## Sources

### Official Documentation
- [Supabase Edge Functions Architecture](https://supabase.com/docs/guides/functions/architecture)
- [Deno @std/cache documentation](https://docs.deno.com/runtime/reference/std/cache/)
- [LogTape - Structured Logging](https://logtape.org/manual/struct)

### Best Practices
- [Prompt Versioning Best Practices - Latitude](https://latitude-blog.ghost.io/blog/prompt-versioning-best-practices/)
- [Logging in Deno/Edge Functions 2026](https://hackers.pub/@hongminhee/2026/logging-nodejs-deno-bun-2026)
- [LLMOps Guide 2026 - Redis](https://redis.io/blog/large-language-model-operations-guide/)

### Existing Codebase Analysis
- `/supabase/functions/sophia-bot/services/prompt-loader.ts` - Current caching implementation
- `/supabase/functions/sophia-bot/utils/logger.ts` - Current logging implementation
- `/supabase/functions/sophia-bot/utils/url-validator.ts` - Current SSRF prevention
- `/supabase/functions/sophia-bot/index.ts` - Email detection patterns
