# SOPHIA Prompt Optimization Guide

## Current State Analysis

| Metric | Value | Problem |
|--------|-------|---------|
| **Total Size** | 182KB / 4,500 lines | Extremely large context window usage |
| **CRITICAL/MUST/NEVER** | 228 occurrences | Emphasis overload (model ignores when everything is "critical") |
| **Template Definitions** | 39 templates | All loaded even when not needed |
| **Examples** | 222 examples | Many redundant, can be deduplicated |
| **Estimated Tokens** | ~45,000 tokens | Sent with EVERY message |

**Cost Impact:** At $0.075/M input tokens (Gemini), 45K tokens × 200 messages/day = ~$0.68/day just for the system prompt.

---

## Optimization Strategies

### 1. Prompt Caching (Highest Impact - 75% cost reduction)

**How it works:** LLM providers (Anthropic, Google, OpenAI) cache the beginning of prompts. If the same prefix is sent repeatedly, cached tokens cost 10-25% of normal.

**Action Items:**
- [ ] Move ALL static content to the TOP of the prompt
- [ ] Keep dynamic content (agent list, current date) at the END
- [ ] Structure as: `[Static Rules] → [Templates] → [Knowledge] → [Dynamic Context]`

**Current Problem:**
```
// BAD: Dynamic content mixed throughout
SYSTEM_PROMPT = `
  ... rules ...
  Current date: ${new Date()}  // Dynamic - breaks cache
  ... more rules ...
  Agent: ${agentName}  // Dynamic - breaks cache
  ... templates ...
`
```

**Fixed:**
```
// GOOD: Static first, dynamic last
SYSTEM_PROMPT = `
  ... all static rules ...
  ... all templates ...
  ... all knowledge ...

  ---
  CURRENT CONTEXT (dynamic):
  Date: ${new Date()}
  Agent: ${agentName}
`
```

### 2. Template Lazy Loading (60% size reduction)

**Problem:** All 39 templates are loaded in every request, but users only need 1-2 per conversation.

**Solution:** Load templates on-demand based on user intent.

```typescript
// Instead of one massive prompt:
const SYSTEM_PROMPT = `... 45K tokens with all templates ...`;

// Split into:
const BASE_PROMPT = `... 5K tokens of core rules ...`;
const TEMPLATES = {
  seller_registration: `... template 01 ...`,
  viewing_form: `... template 09 ...`,
  // etc.
};

// At runtime:
const detectIntent = (message: string): string[] => {
  if (message.includes('viewing') || message.includes('form')) return ['viewing_form'];
  if (message.includes('registration') || message.includes('seller')) return ['seller_registration'];
  return [];
};

const buildPrompt = (message: string) => {
  const neededTemplates = detectIntent(message);
  return BASE_PROMPT + neededTemplates.map(t => TEMPLATES[t]).join('\n');
};
```

### 3. Reduce Emphasis Overload

**Problem:** 228 uses of CRITICAL/MUST/NEVER/ALWAYS. When everything is critical, nothing is.

**Psychology:** Models weight instructions based on emphasis. Overuse causes the model to ignore emphasis entirely.

**Action Items:**
- [ ] Reserve 🔴🔴🔴 for truly critical rules (max 3-5 in entire prompt)
- [ ] Use MUST/NEVER for important rules (max 20)
- [ ] Use regular text for standard instructions
- [ ] Remove duplicate emphasis (same rule stated multiple times)

**Example Cleanup:**
```
// BEFORE (4 lines saying the same thing):
🚨🚨🚨 CRITICAL: NEVER HALLUCINATE 🚨🚨🚨
*NEVER guess, assume, or invent ANY information*
CRITICAL: Do not make up information
🔴 IMPORTANT: Always ask if unsure 🔴

// AFTER (1 clear rule):
🔴 ANTI-HALLUCINATION: Never invent information. If data is missing, ask the user.
```

### 4. Deduplicate Examples

**Problem:** 222 examples, many showing the same pattern.

**Action Items:**
- [ ] Keep 1 example per pattern type
- [ ] Remove redundant "WRONG vs RIGHT" examples after the first
- [ ] Use references: "Follow the format shown in Section 2.1"

### 5. Structured Output Format

**Problem:** Natural language instructions are verbose.

**Solution:** Use structured formats for repetitive content.

```
// BEFORE (verbose):
"When the user asks for a seller registration, you need to collect the following fields:
- The seller's full name (this is mandatory)
- The property registration number (also mandatory)
- The district where the property is located
- The municipality within that district
..."

// AFTER (structured):
TEMPLATE: seller_registration
REQUIRED: seller_name, reg_number, district, municipality
OPTIONAL: property_link, notes
FORMAT: email
```

### 6. Knowledge Base Externalization

**Problem:** 1000+ lines of Cyprus real estate knowledge embedded in prompt.

**Solution:** Move to RAG (Retrieval-Augmented Generation).

```typescript
// Instead of embedding all knowledge:
const KNOWLEDGE = `
  VAT rates in Cyprus...
  Transfer fees calculation...
  Capital gains rules...
  Planning zones...
  // 1000+ lines
`;

// Use vector search:
const relevantKnowledge = await searchKnowledge(userMessage);
const prompt = BASE_PROMPT + `\nRelevant context:\n${relevantKnowledge}`;
```

**Note:** SOPHIA already has `memory/sophia-memory.ts` with embeddings - extend this!

### 7. Model Selection

**Problem:** Using same model for all tasks.

**Solution:** Route simple tasks to cheaper models.

| Task | Current | Recommended | Savings |
|------|---------|-------------|---------|
| Greetings | Gemini Flash | Gemini Flash Lite | 50% |
| Simple Q&A | Gemini Flash | Gemini Flash Lite | 50% |
| Document Generation | Gemini Flash | Gemini Flash | 0% |
| Complex Analysis | Gemini Flash | Gemini Pro | -50% (but better quality) |

---

## Implementation Roadmap

### Phase 1: Quick Wins (1-2 days, 30% savings)
1. [ ] Audit and remove duplicate rules
2. [ ] Reduce emphasis markers to max 20
3. [ ] Move dynamic content to end of prompt
4. [ ] Remove redundant examples

### Phase 2: Restructuring (1 week, 50% savings)
1. [ ] Split prompt into BASE + TEMPLATES
2. [ ] Implement intent detection for template loading
3. [ ] Convert verbose instructions to structured format
4. [ ] Add prompt caching headers

### Phase 3: Advanced (2-4 weeks, 70% savings)
1. [ ] Externalize knowledge to RAG system
2. [ ] Implement model routing
3. [ ] Fine-tune smaller model for common tasks
4. [ ] Add response caching for repeated queries

---

## Prompt Structure Template

```
# SOPHIA AI - Core System Prompt

## Identity (50 tokens)
You are SOPHIA, AI assistant for Zyprus Property Group.

## Critical Rules (200 tokens) - MAX 5 RULES WITH 🔴
🔴 ANTI-HALLUCINATION: Never invent data. Ask if missing.
🔴 TOOL VERIFICATION: Only report success after tool returns URL.
🔴 AGENT AUTO-FILL: Use sender's phone to auto-fill agent details.

## Capabilities (100 tokens)
1. Document generation (40 templates)
2. Property listings (upload to zyprus.com)
3. Calculators (VAT, transfer fees, capital gains)
4. Knowledge Q&A (Cyprus real estate)

## Response Format (200 tokens)
- WhatsApp: Use *bold* for emphasis
- Emails: Subject line + body
- Documents: Full content for DOCX generation

## Template Reference (loaded dynamically)
${LOADED_TEMPLATES}

## Knowledge Context (loaded via RAG)
${RELEVANT_KNOWLEDGE}

## Current Context
Date: ${DATE}
Agent: ${AGENT_NAME} (${AGENT_PHONE})
```

**Target:** 5,000 tokens base + 2,000 tokens per loaded template = 7-10K tokens vs current 45K

---

## Monitoring

Track these metrics after optimization:

```typescript
// Add to sophia-bot/index.ts
console.log(`[Metrics] Prompt tokens: ${promptTokens}`);
console.log(`[Metrics] Response tokens: ${responseTokens}`);
console.log(`[Metrics] Templates loaded: ${loadedTemplates.join(', ')}`);
console.log(`[Metrics] Cache hit: ${cacheHit}`);
```

---

## Sources

- [LLM Cost Optimization Guide](https://ai.koombea.com/blog/llm-cost-optimization)
- [Prompt Caching Infrastructure](https://introl.com/blog/prompt-caching-infrastructure-llm-cost-latency-reduction-guide-2025)
- [Token Optimization Strategies](https://www.glukhov.org/post/2025/11/cost-effective-llm-applications/)
- [Reduce LLM Costs - PromptLayer](https://blog.promptlayer.com/how-to-reduce-llm-costs/)
- [4 Techniques to Optimize Prompts](https://towardsdatascience.com/4-techniques-to-optimize-your-llm-prompts-for-cost-latency-and-performance/)
