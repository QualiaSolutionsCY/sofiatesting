# Feature Landscape: Reliability Hardening

**Domain:** Production AI Assistant (WhatsApp bot for real estate agents)
**Researched:** 2026-01-28
**Context:** SOPHIA serves 30 agents daily with prompt-driven behavior, image uploads, and document generation

---

## Current State Assessment

Before defining features, here's what SOPHIA already has:

| Category | Existing | Gaps |
|----------|----------|------|
| Prompt Management | DB loading with file fallbacks, priority ordering | No versioning, no rollback, no A/B testing |
| Cache Management | 5-min TTL (currently disabled), manual invalidation | No automatic invalidation, no metrics |
| Error Handling | Try/catch, fail-open webhook deduplication | No retry logic, no circuit breakers, no graceful degradation |
| Observability | console.log statements, webhook_debug_logs table | No structured logging, no metrics, no alerts |

---

## Prompt Management Features

### Table Stakes

Features users/operators expect. Missing = system feels incomplete.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| **Prompt versioning** | Track what changed and when | Low | Add `version` column to `sophia_prompts` | Industry standard - "Prompts need version control like code" [LaunchDarkly](https://launchdarkly.com/blog/prompt-versioning-and-management/) |
| **Prompt history** | See previous versions | Low | Add `sophia_prompt_history` table | Auto-insert on UPDATE trigger |
| **One-click rollback** | Fix broken prompts fast | Medium | Requires version history | "Rollback should take less than 5 minutes" [n8n](https://blog.n8n.io/best-practices-for-deploying-ai-agents-in-production/) |
| **Conflict detection** | Warn when same keyword in multiple prompts | Low | Query at load time | Root cause of Jan 2026 callback bug |
| **Prompt diff view** | Compare versions side-by-side | Low | UI in Supabase Dashboard or admin | Essential for debugging |

### Differentiators

Features that would make SOPHIA's prompt system exceptional.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **Staged deployment** | Test prompts in dev before prod | High | Environment column, routing logic | "Changes should flow through environments" [Braintrust](https://www.braintrust.dev/articles/best-prompt-versioning-tools-2025) |
| **A/B testing** | Compare prompt variants with real traffic | High | Traffic splitting, metrics collection | Requires observability first |
| **Automated regression tests** | Catch prompt regressions before deploy | Medium | Test cases table, evaluation pipeline | "Regression testing is foundation of reliable prompt development" [KumoHQ](https://www.kumohq.co/blog/prompt-engineering-best-practices) |
| **Semantic conflict analysis** | AI-powered detection of conflicting instructions | High | LLM call during save | Beyond keyword matching |

### Anti-Features

Features to deliberately NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Per-agent prompt customization** | Complexity explosion, inconsistent behavior | Use agent context injection (already exists) |
| **Visual prompt builder** | Over-engineering for 7 prompts | Keep text editing in Dashboard |
| **Prompt marketplace/templates** | SOPHIA is domain-specific, not general | Maintain curated prompts |
| **AI auto-optimization** | Black box behavior, loses control | Manual tuning with metrics guidance |

---

## Cache Management Features

### Table Stakes

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| **Cache status endpoint** | Know if cache is stale | Low | Already partially exists (`getCacheStatus`) | Expose via admin endpoint |
| **Manual cache invalidation API** | Force refresh without redeploy | Low | `invalidateCache()` exists, needs endpoint | Currently only callable from code |
| **TTL configuration** | Adjust without code change | Low | Move to env var or DB setting | Currently hardcoded (and disabled) |
| **Cache hit/miss logging** | Basic debugging | Low | Add structured log on cache access | Already logging "Using cached prompts" |

### Differentiators

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **Auto-invalidate on DB change** | Zero-delay prompt updates | Medium | Supabase realtime subscription or webhook | "Assign unique identifier to each prompt version, automate cache clearing" [Instructor](https://python.useinstructor.com/blog/2023/11/26/python-caching-llm-optimization/) |
| **Cache warming** | Pre-load prompts on deploy | Low | Call `loadSystemPrompt` on function start | Prevents first-request latency |
| **Multi-level caching** | L1 memory + L2 Redis | Medium | Redis integration | "Multi-level caching for optimal performance" [Prodjex](https://www.prodjex.com/2025/11/mastering-ai-response-caching-in-langchain/) |
| **Version-tagged cache keys** | Automatic invalidation on version bump | Low | Include version in cache key | Eliminates stale cache issues |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Response caching (semantic)** | Agents need fresh, personalized responses | Cache prompts/config only, not responses |
| **Distributed cache sync** | Single Edge Function, no need | Stay with in-memory + DB |
| **Complex cache topology** | Over-engineering for 7 prompts | Simple TTL + manual invalidation |

---

## Error Handling Features

### Table Stakes

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| **Exponential backoff retry** | Handle transient failures | Low | Utility function | "Dependency failures should always be caught and retried with capped exponential backoff" [GoCodeo](https://www.gocodeo.com/post/error-recovery-and-fallback-strategies-in-ai-agent-development) |
| **Categorized errors** | Distinguish retryable vs permanent | Low | Error type classification | Don't retry 400s, do retry 503s |
| **Graceful user messaging** | User sees helpful error, not stack trace | Low | Error-to-message mapping | Already partially done |
| **Webhook idempotency** | No duplicate processing | Low | Already exists (`claimMessageForProcessing`) | Uses DB unique constraint |

### Differentiators

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **Circuit breaker pattern** | Stop hammering failing services | Medium | State machine (open/half-open/closed) | "Circuit Breaker Pattern prevents repeatedly calling a failing service" [SparkCo](https://sparkco.ai/blog/mastering-retry-logic-agents-a-deep-dive-into-2025-best-practices) |
| **Fallback to simpler responses** | Maintain partial functionality | Medium | Tier definitions, fallback logic | "Tier 1: full functionality, Tier 2: core only, Tier 3: basic responses" [PraisonAI](https://docs.praison.ai/docs/best-practices/graceful-degradation) |
| **Dead letter queue** | Capture failed messages for retry | Medium | DB table for failed payloads | Enables manual recovery |
| **Health check endpoint** | Monitor system status | Low | `/health` endpoint with dependency checks | Standard for production systems |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Infinite retries** | Resource exhaustion, user frustration | Cap at 3 retries with exponential backoff |
| **Silent failures** | Debugging nightmare | Always log errors, surface to user when appropriate |
| **Complex recovery orchestration** | Over-engineering for chat bot | Simple retry + fallback + log |

---

## Observability Features

### Table Stakes

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| **Structured logging** | Machine-parseable logs | Low | JSON log format | Current: unstructured console.log |
| **Request correlation IDs** | Trace full request lifecycle | Low | Generate UUID, pass through | Essential for debugging |
| **Error rate tracking** | Know when system is unhealthy | Low | Count errors per time window | "Track error rates, latency" [Braintrust](https://www.braintrust.dev/articles/best-ai-observability-tools-2026) |
| **Response latency tracking** | Identify performance issues | Low | Timestamp start/end | Basic SLA monitoring |

### Differentiators

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **Full request tracing** | See every step in processing | Medium | Trace context, span logging | "Capture logs at every stage" [UptimeRobot](https://uptimerobot.com/knowledge-hub/observability/ai-observability-the-complete-guide/) |
| **AI-specific metrics** | Token usage, prompt load times | Low | Instrument AI calls | Cost monitoring |
| **Dashboard/alerting** | Proactive issue detection | Medium | Grafana/Datadog integration | "38% say lack of advanced insights is blocking observability goals" [Middleware](https://middleware.io/blog/how-ai-based-insights-can-change-the-observability/) |
| **Prompt effectiveness metrics** | Track which prompts work | High | User feedback, task success | Requires evaluation framework |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Full conversation logging** | Privacy concerns, storage costs | Log metadata, not content (or redact) |
| **Real-time streaming dashboards** | Overkill for 30 users | Batch metrics, periodic review |
| **AI-powered log analysis** | Complexity, cost | Simple alerting on error thresholds |

---

## Feature Dependencies

```
Prompt Versioning ─────────────────┐
         │                         │
         v                         v
Prompt History ──────────> One-Click Rollback
         │
         v
Prompt Conflict Detection

Cache Status Endpoint ─────> Manual Invalidation API
         │
         v
Cache Hit/Miss Logging ────> Auto-Invalidate on DB Change

Structured Logging ────────> Request Correlation IDs
         │                            │
         v                            v
Error Rate Tracking ───────> Health Check Endpoint
         │
         v
Circuit Breaker (requires error tracking)
```

---

## MVP Recommendation

For reliability hardening MVP, prioritize:

### Phase 1: Foundation (Table Stakes)
1. **Prompt versioning** - Add version column, history table
2. **Structured logging** - JSON format with correlation IDs
3. **Exponential backoff retry** - For Zyprus API, OpenRouter calls
4. **Cache status endpoint** - Expose current state

### Phase 2: Recovery (Table Stakes + 1 Differentiator)
5. **One-click rollback** - UI or API to restore previous version
6. **Health check endpoint** - `/health` with dependency status
7. **Error rate tracking** - Basic counter per hour
8. **Circuit breaker** (differentiator) - For external APIs

### Defer to Post-MVP
- A/B testing (requires evaluation infrastructure)
- Staged deployment (only 7 prompts, low risk)
- Full request tracing (structured logging is sufficient for now)
- Dashboard/alerting (manual log review adequate for 30 users)

---

## Complexity Estimates

| Feature | Effort | Risk |
|---------|--------|------|
| Prompt versioning | 2-3 hours | Low |
| Prompt history table | 1-2 hours | Low |
| One-click rollback | 3-4 hours | Low |
| Structured logging | 2-3 hours | Low |
| Retry with backoff | 2-3 hours | Low |
| Cache status endpoint | 1 hour | Low |
| Health check endpoint | 2 hours | Low |
| Circuit breaker | 4-6 hours | Medium |
| Auto-cache invalidation | 4-6 hours | Medium |
| Full request tracing | 8+ hours | Medium |

---

## Sources

**Prompt Management:**
- [Prompt Versioning Guide - LaunchDarkly](https://launchdarkly.com/blog/prompt-versioning-and-management/)
- [Best Practices for Deploying AI Agents - n8n](https://blog.n8n.io/best-practices-for-deploying-ai-agents-in-production/)
- [Prompt Engineering Best Practices - KumoHQ](https://www.kumohq.co/blog/prompt-engineering-best-practices)
- [Best Prompt Versioning Tools - Braintrust](https://www.braintrust.dev/articles/best-prompt-versioning-tools-2025)

**Cache Management:**
- [Python Caching LLM Optimization - Instructor](https://python.useinstructor.com/blog/2023/11/26/python-caching-llm-optimization/)
- [Mastering AI Response Caching - Prodjex](https://www.prodjex.com/2025/11/mastering-ai-response-caching-in-langchain/)
- [Ultimate Guide to LLM Caching - Latitude](https://latitude-blog.ghost.io/blog/ultimate-guide-to-llm-caching-for-low-latency-ai/)

**Error Handling:**
- [Error Recovery and Fallback Strategies - GoCodeo](https://www.gocodeo.com/post/error-recovery-and-fallback-strategies-in-ai-agent-development)
- [Graceful Degradation Patterns - PraisonAI](https://docs.praison.ai/docs/best-practices/graceful-degradation)
- [Mastering Retry Logic Agents - SparkCo](https://sparkco.ai/blog/mastering-retry-logic-agents-a-deep-dive-into-2025-best-practices)
- [Building Reliable AI Agents - MagicFactory](https://magicfactory.tech/artificial-intelligence-developers-error-handling-guide/)

**Observability:**
- [AI Observability Tools 2026 - Braintrust](https://www.braintrust.dev/articles/best-ai-observability-tools-2026)
- [AI Observability Complete Guide - UptimeRobot](https://uptimerobot.com/knowledge-hub/observability/ai-observability-the-complete-guide/)
- [How AI Insights Change Observability - Middleware](https://middleware.io/blog/how-ai-based-insights-can-change-the-observability/)

**WhatsApp/Webhooks:**
- [Scalable Webhook Architecture - ChatArchitect](https://www.chatarchitect.com/news/building-a-scalable-webhook-architecture-for-custom-whatsapp-solutions)
- [Webhook Best Practices - InventiveHQ](https://inventivehq.com/blog/webhook-best-practices-guide)
