# Architecture

**Analysis Date:** 2026-01-23

## Pattern Overview

**Overall:** Dual-Runtime Multi-Channel AI Assistant Architecture

**Key Characteristics:**
- Live system runs on Supabase Edge Functions (Deno runtime) - NOT Next.js
- WhatsApp is the primary channel via `sophia-bot` Edge Function
- Web UI exists but is NOT DEPLOYED - treat as future/reference only
- Shared code in `lib/` is NOT used by live bot (bot has its own copies)
- Tool-based AI architecture: definitions.ts + executor.ts pattern

## Layers

**Edge Function Layer (LIVE - Deno):**
- Purpose: Handles all live WhatsApp interactions
- Location: `supabase/functions/sophia-bot/`
- Contains: Webhook handler, AI orchestration, tool execution, DOCX generation
- Depends on: OpenRouter API, Supabase Database, WaSender API, Zyprus API
- Used by: WhatsApp webhook from WaSender

**Shared Edge Function Code:**
- Purpose: Reusable code across Edge Functions
- Location: `supabase/functions/_shared/`
- Contains: Database client, calculators, prompts, Zyprus API, services
- Depends on: Supabase client, Deno runtime
- Used by: sophia-bot and other Edge Functions

**Next.js App Layer (NOT DEPLOYED):**
- Purpose: Future web chat interface
- Location: `app/`
- Contains: Auth, chat UI, admin dashboard, API routes
- Depends on: lib/ folder, Drizzle ORM, AI SDK
- Used by: Future web deployment (currently unused)

**Lib Layer (NOT USED BY LIVE BOT):**
- Purpose: Shared utilities for Next.js (web only)
- Location: `lib/`
- Contains: AI providers, tools, DB schema, Zyprus client
- Depends on: npm packages, Drizzle ORM
- Used by: app/ routes only - NOT by Edge Functions

## Data Flow

**WhatsApp Message Flow (LIVE):**

1. User sends WhatsApp message
2. WaSender webhook calls `sophia-bot` Edge Function
3. `extractMessage()` parses webhook payload, handles image decryption
4. `identifyAgentByPhone()` matches sender to `agents` table
5. `getHistory()` loads last 10 messages from `chat_history` table
6. OpenRouter API called with system prompt + history + user message
7. AI may call tools via function calling (createPropertyListing, calculateVAT, etc.)
8. `executeTool()` dispatches to appropriate handler
9. Response formatted via `formatForWhatsApp()` or DOCX generation
10. WaSender API sends response back to user
11. Messages saved to `chat_history` table

**Tool Execution Flow:**

1. AI returns tool_calls in response
2. `executeTool()` dispatches based on tool name
3. Handler performs action (e.g., `handleCreatePropertyListing`)
4. Result returned to AI for formatting response
5. Final response sent to user

**State Management:**
- Conversation history: Supabase `chat_history` table (last 10 messages per user)
- Agent identification: `agents` table (phone number matching)
- Message deduplication: `processed_webhooks` table (atomic claim pattern)
- Taxonomy cache: In-memory within Edge Function (loaded per invocation)

## Key Abstractions

**Agent:**
- Purpose: Represents a Zyprus real estate agent
- Examples: `supabase/functions/sophia-bot/agents/identifier.ts`
- Pattern: Phone-based identification from `agents` table

**Tool:**
- Purpose: AI function calling capabilities
- Examples: `supabase/functions/sophia-bot/tools/definitions.ts`, `tools/executor.ts`
- Pattern: Definition schema + executor function (OpenRouter function calling)

**Template:**
- Purpose: DOCX document templates for Cyprus real estate
- Examples: `supabase/functions/sophia-bot/docx/templates/*.ts`
- Pattern: TypeScript functions returning `docx` Document objects

**TaxonomyCache:**
- Purpose: Zyprus API vocabulary data (locations, property types, features)
- Examples: `supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts`
- Pattern: In-memory cache with UUID lookup fallbacks

## Entry Points

**WhatsApp Webhook (LIVE):**
- Location: `supabase/functions/sophia-bot/index.ts`
- Triggers: WaSender webhook (messages.received event)
- Responsibilities: Parse webhook, authenticate, process message, send response

**AI Chat API (NOT DEPLOYED):**
- Location: `app/(chat)/api/chat/route.ts`
- Triggers: Web chat POST request
- Responsibilities: Auth, rate limiting, AI streaming, tool execution

**Telegram Webhook (DISABLED):**
- Location: `supabase/functions/telegram-webhook/` (if exists)
- Triggers: Telegram bot updates
- Responsibilities: Lead routing, group monitoring (currently disabled)

## Error Handling

**Strategy:** Fail-open with logging for critical path, fail-closed for security

**Patterns:**
- Tool execution: Try-catch with error returned to AI for natural language response
- Webhook deduplication: Atomic INSERT (fail-open on other errors to avoid blocking)
- Rate limiting: Returns 429 with retry guidance
- Invalid images: Validation errors returned with helpful tips
- SSRF prevention: URL validation before external fetches

## Cross-Cutting Concerns

**Logging:** Console logging with tagged prefixes (`[ToolExecutor]`, `[Zyprus]`, `[Email]`)

**Validation:**
- Webhook: HMAC signature verification (`WASEND_WEBHOOK_SECRET`)
- Phone numbers: Normalization and format validation
- URLs: SSRF prevention for external fetches
- Images: HEAD/GET validation before upload

**Authentication:**
- Edge Functions: Service role key for Supabase
- Zyprus API: OAuth2 client credentials (cached token)
- WhatsApp: Agent identification via phone number match

**Security:**
- HMAC webhook verification
- SSRF URL validation
- Input sanitization
- Rate limiting per phone number
- Regional access control for property uploads
- Assignment restricted to @zyprus.com emails

---

*Architecture analysis: 2026-01-23*
