# Coding Conventions

**Analysis Date:** 2026-01-23

## Naming Patterns

**Files:**
- kebab-case for all `.ts` files: `conversation-pruning.ts`, `webhook-utils.ts`
- Tool files: `calculate-vat.ts`, `create-listing.ts`, `upload-listing.ts`
- Config files: `template-config.json`, `drizzle.config.ts`
- Test files: `*.test.ts` suffix (not `.spec.ts`)

**Functions:**
- camelCase: `getMaxConversationMessages()`, `pruneConversationHistory()`
- Arrow functions preferred over function declarations
- Exported const arrow functions: `export const verifyWebhookSignature = (...) => {}`

**Variables:**
- camelCase for regular variables: `maxMessages`, `imageIds`
- SCREAMING_SNAKE_CASE for constants: `DEFAULT_MAX_MESSAGES`, `API_URL`
- Descriptive names: `originalCount`, `prunedCount`, `avgTokensPerMessage`

**Types:**
- PascalCase: `ChatMessage`, `DBMessage`, `UserContext`
- Prefix with `I` NOT used (no `IUser`, just `User`)
- Use `type` keyword, not `interface` (enforced by Ultracite)
- Suffix type-only imports with `type`: `import type { ChatMessage } from "@/lib/types"`

## Code Style

**Formatting:**
- Tool: Ultracite (wraps Biome 2.2.2)
- Commands: `pnpm lint` (check), `pnpm format` (auto-fix)
- No Prettier or ESLint config files (Ultracite handles all)

**Key Ultracite Rules:**
```typescript
// Use arrow functions (not function declarations)
export const myFunction = (param: string): Result => { ... }

// Use for...of (not forEach)
for (const message of messages) { ... }

// Use at() for array access
messages.at(-1)  // Not messages[messages.length - 1]

// Use import type for types
import type { ChatMessage } from "@/lib/types";

// Use as const (not enums)
const ROLES = ["user", "assistant", "system"] as const;

// Use === (not ==)
if (result === true) { ... }
```

**Linting:**
- Ultracite with strict settings
- No `any` type allowed
- No unused variables/imports
- No `console.log` in production (use console.error for errors)
- Always include `type` attribute on button elements

## Import Organization

**Order:**
1. Node.js built-ins with `node:` prefix: `import crypto from "node:crypto";`
2. External packages: `import { z } from "zod";`
3. Internal aliases `@/`: `import { db } from "@/lib/db/client";`
4. Relative imports: `import { createHmacSignature } from "./webhook-utils";`

**Path Aliases:**
- `@/*` maps to project root (`./`)
- Use `@/lib/`, `@/components/`, `@/app/` for cross-directory imports

**Example:**
```typescript
import crypto from "node:crypto";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { chat, user } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";

import { createHmacSignature } from "./webhook-utils";
```

## Error Handling

**Patterns:**
- Custom error class: `ChatSDKError` for API responses (`lib/errors.ts`)
- Error codes: `"error_type:surface"` format (e.g., `"not_found:chat"`)
- Always provide user-friendly error messages

**Usage:**
```typescript
// API route errors
return new ChatSDKError("bad_request:api", "Validation failed").toResponse();

// Tool errors - return string with fallback
return result.error?.fallback_url
  ? `Error: ${result.error.message}\n\nFallback: ${result.error.fallback_url}`
  : `Error: ${result.error?.message || "Unknown error"}`;

// Try/catch with typed errors
try {
  const result = await apiCall();
  return result;
} catch (error) {
  return {
    success: false,
    error: error instanceof Error ? error.message : "Calculation error",
  };
}
```

**Error Types:**
- `bad_request`, `unauthorized`, `forbidden`, `not_found`, `rate_limit`, `offline`
- Surfaces: `chat`, `auth`, `api`, `stream`, `database`, `document`

## Logging

**Framework:** Native `console` with conditional logging

**Patterns:**
```typescript
// Development-only logging
if (process.env.NODE_ENV === "development") {
  console.log(`[Feature] Debug info: ${data}`);
}

// Error logging (always allowed)
console.error("API call failed:", error);

// Warning logging
console.warn(`Invalid config: ${value}, using default`);
```

**Prefixes:**
- Use bracketed feature names: `[Conversation Pruning]`, `[TokenLens]`
- Include context in logs: file counts, success rates, timing

## Comments

**When to Comment:**
- JSDoc for exported functions with complex logic
- Inline comments for non-obvious business rules
- Reference links for external specs (e.g., Cyprus tax rules)

**JSDoc Pattern:**
```typescript
/**
 * Prune conversation history to prevent unbounded token growth
 *
 * @param messages - All conversation messages (including current message)
 * @returns Pruned messages maintaining context quality
 *
 * Examples:
 * - 5 messages, limit 10  → Keep all 5 (no pruning)
 * - 15 messages, limit 10 → Keep first + last 9 = 10 total
 */
export function pruneConversationHistory(messages: ChatMessage[]): ChatMessage[]
```

**Reference Comments:**
```typescript
/**
 * VAT Calculator for Cyprus Primary Residence Tool
 * Source: Cyprus Tax Department VAT 5% calculation tool
 * References:
 * - https://www.mof.gov.cy/mof/tax/taxdep.nsf/vathousecalc_gr/...
 * - VAT Circular 11/2023: Post-reform rules
 */
```

## Function Design

**Size:**
- Keep functions under 50 lines when possible
- Extract helper functions for complex operations

**Parameters:**
- Use object parameters for functions with 3+ parameters
- Provide sensible defaults: `avgTokensPerMessage = 150`
- Required parameters first, optional with defaults last

**Return Values:**
- Prefer returning objects for multiple values: `{ success: boolean, data?: T, error?: string }`
- Use `null` over `undefined` for missing values
- Return early for edge cases

**Example:**
```typescript
export function estimatePruningSavings(
  originalCount: number,
  prunedCount: number,
  avgTokensPerMessage = 150  // Optional with default
): number {
  const messagesSaved = originalCount - prunedCount;
  return messagesSaved * avgTokensPerMessage;
}
```

## Module Design

**Exports:**
- Named exports preferred: `export const functionName = ...`
- One main export per file when possible
- Group related functions in same file

**File Structure:**
```typescript
// 1. Imports
import type { ... } from "...";

// 2. Constants
const DEFAULT_VALUE = 10;

// 3. Types (if small, otherwise separate file)
type Config = { ... };

// 4. Helper functions (private)
const helperFunction = () => { ... };

// 5. Main exports
export const mainFunction = () => { ... };
export function anotherFunction() { ... }
```

**Barrel Files:**
- Not used extensively in this codebase
- Direct imports to specific files preferred

## TypeScript Specifics

**Strict Mode:**
- `strict: true` and `strictNullChecks: true` in tsconfig
- No implicit `any`

**Type Inference:**
- Let TypeScript infer when obvious
- Explicit return types on exported functions
- Use `as const` for literal types

**Utility Types:**
- Use `Partial<T>`, `Pick<T, K>`, `Omit<T, K>` appropriately
- Drizzle ORM: `InferSelectModel<typeof table>`

## AI Tool Conventions

**Tool Structure:** `lib/ai/tools/*.ts`
```typescript
import { tool } from "ai";
import { z } from "zod";

export const myTool = tool({
  description: "Clear description for AI. ALWAYS USE THIS TOOL for X.",
  inputSchema: z.object({
    param: z.number().positive().describe("Human-readable param description"),
  }),
  execute: async ({ param }) => {
    try {
      const result = await doWork(param);
      return result.formatted_output;
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : "Unknown"}`;
    }
  },
});
```

**Dual Registration Required:**
Both in `app/(chat)/api/chat/route.ts`:
```typescript
experimental_activeTools: ["myTool", ...],
tools: { myTool: myTool, ... }
```

---

*Convention analysis: 2026-01-23*
