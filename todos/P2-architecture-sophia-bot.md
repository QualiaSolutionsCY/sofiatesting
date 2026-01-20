# P2 Architecture: sophia-bot Edge Function

**Priority**: P2 (Important)
**Source**: architecture-strategist review
**Created**: 2026-01-11

## Findings

### 1. God Object: index.ts (1839 lines)
**File**: `/tmp/sophia-deploy/supabase/functions/sophia-bot/index.ts`
**Issue**: Violates Single Responsibility Principle

The main handler file contains:
- Webhook handling
- Message deduplication
- Session management
- AI conversation loop
- Tool execution orchestration
- Response formatting
- Error handling

**Recommended Decomposition**:
```
index.ts (entry point, ~100 lines)
├── handlers/
│   ├── webhook.ts      # Request validation, signature check
│   ├── message.ts      # Message deduplication, history
│   └── conversation.ts # AI loop, tool calling
├── messaging/
│   ├── wasend.ts       # WaSend API client
│   └── formatter.ts    # Response formatting
└── ai/
    ├── openrouter.ts   # OpenRouter API client
    └── context.ts      # System prompt, agent context
```

### 2. Missing Abstractions

**Messaging**: Direct API calls scattered throughout. Should have a unified messaging interface:
```typescript
interface MessagingClient {
  sendText(chatId: string, text: string): Promise<void>;
  sendDocument(chatId: string, url: string, filename: string): Promise<void>;
}
```

**AI Provider**: OpenRouter calls are inline. Should be abstracted:
```typescript
interface AIProvider {
  chat(messages: Message[], tools?: Tool[]): Promise<AIResponse>;
}
```

### 3. Inconsistent Error Handling

Some errors return JSON responses, others throw exceptions. Need unified error handling:
```typescript
// Current: Mixed patterns
if (error) return new Response("Error", { status: 500 });
throw new Error("Something failed");

// Better: Consistent error type
class SophiaError extends Error {
  constructor(message: string, public code: string, public statusCode: number) {}
}
```

### 4. Prompts.ts Coupling

The prompts file imports business rules that should be injected, not hardcoded.

## Action Items

- [ ] Extract webhook handling to handlers/webhook.ts
- [ ] Extract message handling to handlers/message.ts
- [ ] Extract AI conversation loop to handlers/conversation.ts
- [ ] Create unified MessagingClient interface
- [ ] Create unified AIProvider interface
- [ ] Standardize error handling with custom error class
- [ ] Reduce index.ts to entry point only (~100 lines)

## Benefits

- Easier testing (mock interfaces)
- Better maintainability (clear boundaries)
- Easier onboarding (smaller, focused files)
- Enables future channel additions (Telegram, web)
