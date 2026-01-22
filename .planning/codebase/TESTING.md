# Testing Patterns

**Analysis Date:** 2026-01-23

## Test Framework

**Unit Tests:**
- Runner: Node.js built-in test runner via tsx
- Config: No config file (uses tsx for TypeScript execution)
- Assertion: `node:assert/strict`

**E2E/Integration:**
- Runner: Playwright 1.57.0
- Config: `playwright.config.ts`
- Browsers: Desktop Chrome (Firefox/WebKit commented out)

**Run Commands:**
```bash
pnpm test:unit                    # All unit tests (tsx --test)
pnpm test:unit:parallel-uploads   # Specific unit test file
pnpm test                         # E2E tests (requires PLAYWRIGHT=True)
PLAYWRIGHT=True pnpm exec playwright test tests/e2e/chat.test.ts  # Single E2E
pnpm exec tsx --test tests/unit/your-file.test.ts  # Single unit test
```

## Test File Organization

**Location:**
- Unit tests: `tests/unit/*.test.ts`
- E2E tests: `tests/e2e/*.test.ts`
- Integration tests: `tests/integration/*.test.ts`
- Route tests: `tests/routes/*.test.ts`
- Manual tests: `tests/manual/*.ts` (no `.test.ts` suffix)

**Naming:**
- Pattern: `{feature}.test.ts`
- Examples: `conversation-pruning.test.ts`, `whatsapp-webhook.test.ts`

**Structure:**
```
tests/
├── unit/                  # Pure function tests (Node.js test runner)
│   ├── conversation-pruning.test.ts
│   ├── whatsapp-webhook.test.ts
│   ├── whatsapp-session.test.ts
│   ├── parallel-image-uploads.test.ts
│   └── models.test.ts
├── e2e/                   # Browser tests (Playwright)
│   ├── chat.test.ts
│   ├── session.test.ts
│   └── ...
├── integration/           # Service integration tests
│   └── circuit-breaker.test.ts
├── routes/                # API route tests
│   ├── chat.test.ts
│   └── document.test.ts
├── manual/                # Manual test scripts (not automated)
│   ├── test-zyprus-api.ts
│   ├── test-ai-models.ts
│   └── ...
├── fixtures.ts            # Playwright test fixtures
├── helpers.ts             # Shared test utilities
└── pages/                 # Page objects for E2E
    └── chat.ts
```

## Test Structure

**Unit Test Pattern (Node.js test runner):**
```typescript
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { functionToTest } from "@/lib/module";

describe("Feature Name", () => {
  let originalEnv: string | undefined;

  before(() => {
    originalEnv = process.env.SOME_VAR;
  });

  after(() => {
    if (originalEnv !== undefined) {
      process.env.SOME_VAR = originalEnv;
    } else {
      process.env.SOME_VAR = undefined;
    }
  });

  describe("functionToTest", () => {
    it("should do something when condition", () => {
      const result = functionToTest(input);
      assert.strictEqual(result, expected);
    });

    it("should handle edge case", () => {
      process.env.SOME_VAR = "test-value";
      const result = functionToTest(input);
      assert.deepStrictEqual(result, expected);
    });
  });
});
```

**E2E Test Pattern (Playwright):**
```typescript
import { expect, test } from "../fixtures";
import { ChatPage } from "../pages/chat";

test.describe("Feature Name", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    chatPage = new ChatPage(page);
    await chatPage.createNewChat();
  });

  test("should perform user action", async () => {
    await chatPage.sendUserMessage("Test message");
    await chatPage.isGenerationComplete();

    const message = await chatPage.getRecentAssistantMessage();
    expect(message.content).toContain("expected text");
  });
});
```

**Setup/Teardown:**
- Unit: `before()` / `after()` from `node:test`
- E2E: `test.beforeEach()` / `test.afterEach()` from Playwright
- Restore environment variables after tests

## Mocking

**Unit Test Mocking (Node.js):**
```typescript
import { mock } from "node:test";

// Mock fetch with type assertion
const mockFetch = mock.fn(async (url: string) => {
  if (url.includes("success")) {
    return new Response(JSON.stringify({ data: "ok" }), { status: 200 });
  }
  return new Response("Not found", { status: 404 });
});

// Use mock in test
const result = await functionUnderTest(mockFetch as any);

// Verify mock calls
assert.strictEqual(mockFetch.mock.calls.length, 2);
```

**E2E Mocking (Playwright):**
- Mock models in `tests/unit/models.test.ts` using `MockLanguageModelV2`
- Fixtures in `tests/fixtures.ts` for authenticated contexts
- API responses mocked via test server (see Playwright config)

**Mock Helpers Pattern:**
```typescript
function createMockImageFetchResponse(): Response {
  const blob = new Blob(["fake-image-data"], { type: "image/jpeg" });
  return new Response(blob, {
    status: 200,
    headers: { "content-type": "image/jpeg" },
  });
}

function createMockUploadResponse(imageId: string): Response {
  return new Response(
    JSON.stringify({ data: { type: "file--file", id: imageId } }),
    { status: 201, headers: { "content-type": "application/vnd.api+json" } }
  );
}

function createMockErrorResponse(status: number, message: string): Response {
  return new Response(message, { status });
}
```

**What to Mock:**
- External API calls (fetch, HTTP requests)
- Time-sensitive operations (Date.now)
- Environment variables

**What NOT to Mock:**
- Pure functions being tested
- Simple data transformations
- Business logic

## Fixtures and Factories

**Test Data Helpers:**
```typescript
// Helper to create mock messages
function createMockMessage(id: number): ChatMessage {
  return {
    id: `msg-${id}`,
    role: id % 2 === 0 ? "user" : "assistant",
    parts: [{ type: "text", text: `Message ${id}` }],
  };
}

// Generate test arrays
const messages = Array.from({ length: 15 }, (_, i) => createMockMessage(i));
```

**E2E Fixtures (`tests/fixtures.ts`):**
```typescript
import { expect as baseExpect, test as baseTest } from "@playwright/test";
import { createAuthenticatedContext, type UserContext } from "./helpers";

type Fixtures = {
  adaContext: UserContext;
  babbageContext: UserContext;
};

export const test = baseTest.extend<object, Fixtures>({
  adaContext: [
    async ({ browser }, use, workerInfo) => {
      const ada = await createAuthenticatedContext({
        browser,
        name: `ada-${workerInfo.workerIndex}-${getUnixTime(new Date())}`,
      });
      await use(ada);
      await ada.context.close();
    },
    { scope: "worker" },
  ],
});

export const expect = baseExpect;
```

**Location:**
- Fixtures: `tests/fixtures.ts`
- Helpers: `tests/helpers.ts`
- Page objects: `tests/pages/*.ts`

## Coverage

**Requirements:** Not enforced (no coverage thresholds configured)

**View Coverage:**
```bash
# Not configured in package.json
# Would need to add: npx c8 pnpm test:unit
```

**Current Coverage Areas:**
- Unit tests: WhatsApp webhook, session, conversation pruning, parallel uploads
- E2E: Chat flow, user messages, voting, tool calls
- Integration: Circuit breaker state transitions

## Test Types

**Unit Tests:**
- Pure functions tested in isolation
- Files: `tests/unit/*.test.ts`
- Run: `pnpm test:unit`
- Focus: Business logic, data transformations, utility functions

**Integration Tests:**
- Service integrations (circuit breaker, external APIs)
- Files: `tests/integration/*.test.ts`
- Run: Part of Playwright test suite

**E2E Tests:**
- Full browser automation
- Files: `tests/e2e/*.test.ts`
- Run: `PLAYWRIGHT=True pnpm test`
- Requires dev server running

**Manual Tests:**
- Not automated, run manually for debugging
- Files: `tests/manual/*.ts` (no `.test.ts`)
- Run: `pnpm exec tsx tests/manual/test-file.ts`
- Examples: API connectivity, webhook testing, production verification

## Common Patterns

**Async Testing:**
```typescript
test("should handle async operation", async () => {
  const result = await asyncFunction();
  assert.strictEqual(result.success, true);
});

// With timeout/wait
await new Promise((resolve) => setTimeout(resolve, 100));
```

**Error Testing:**
```typescript
test("should reject invalid input", () => {
  const result = functionThatMightFail("invalid");
  assert.strictEqual(result, false);
});

// For thrown errors (Playwright)
try {
  await breaker.fire();
  expect.fail("Should have thrown");
} catch (error) {
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain("expected text");
}
```

**Timing Tests:**
```typescript
test("should execute in parallel, not sequentially", async () => {
  const startTime = Date.now();
  await parallelOperation();
  const totalTime = Date.now() - startTime;

  // Parallel: ~200ms, Sequential: ~600ms
  assert.ok(totalTime < 500, `Should be parallel, took ${totalTime}ms`);
});
```

**Console Capture:**
```typescript
test("should log correctly", async () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: any[]) => logs.push(args.join(" "));

  await functionThatLogs();

  console.log = originalLog;  // Always restore!

  const completionLog = logs.find((log) => log.includes("expected"));
  assert.ok(completionLog, "Should log completion");
});
```

## Page Object Pattern (E2E)

**Page Object (`tests/pages/chat.ts`):**
```typescript
export class ChatPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get sendButton() {
    return this.page.getByTestId("send-button");
  }

  async createNewChat() {
    await this.page.goto("/");
  }

  async sendUserMessage(message: string) {
    await this.multimodalInput.click();
    await this.multimodalInput.fill(message);
    await this.sendButton.click();
  }

  async isGenerationComplete() {
    const response = await this.page.waitForResponse((r) =>
      r.url().includes("/api/chat")
    );
    await response.finished();
  }

  async getRecentAssistantMessage() {
    const elements = await this.page.getByTestId("message-assistant").all();
    const last = elements.at(-1);
    // ... return message object with methods
  }
}
```

## Playwright Configuration

**Key Settings (`playwright.config.ts`):**
```typescript
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  retries: 0,
  workers: process.env.CI ? 2 : 8,
  timeout: 240 * 1000,  // 4 minutes per test
  expect: { timeout: 240 * 1000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: `http://localhost:${PORT}/ping`,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "e2e", testMatch: /e2e\/.*.test.ts/ },
    { name: "routes", testMatch: /routes\/.*.test.ts/ },
    { name: "integration", testMatch: /integration\/.*.test.ts/ },
  ],
});
```

## Test Biome Ignore Pattern

When mock functions don't actually await but return Response:
```typescript
// biome-ignore lint/suspicious/useAwait: mock function returns Promise-like Response
const mockFetch = mock.fn(async (url: string) => {
  return new Response(data, { status: 200 });
});
```

---

*Testing analysis: 2026-01-23*
