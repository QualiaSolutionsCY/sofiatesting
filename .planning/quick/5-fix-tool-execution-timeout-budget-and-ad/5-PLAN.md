---
phase: quick-5
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/functions/sophia-bot/services/ai-chat.ts
  - tests/unit/edge-functions/phone-masking.test.ts
  - tests/unit/edge-functions/bank-detection.test.ts
autonomous: true
must_haves:
  truths:
    - Tool execution loop respects Edge Function timeout budget
    - Phone masking functions work correctly for all input formats
    - Bank detection functions identify all supported banks
  artifacts:
    - path: supabase/functions/sophia-bot/services/ai-chat.ts
      provides: Time budget tracking in tool execution loop
      contains: "TIME_BUDGET_MS"
    - path: tests/unit/edge-functions/phone-masking.test.ts
      provides: Comprehensive phone masking tests
      min_lines: 80
    - path: tests/unit/edge-functions/bank-detection.test.ts
      provides: Comprehensive bank detection tests
      min_lines: 80
  key_links:
    - from: supabase/functions/sophia-bot/services/ai-chat.ts
      to: "Date.now()"
      via: "Time budget check at loop start"
      pattern: "Date\\.now\\(\\) - startTime > TIME_BUDGET_MS"
    - from: tests/unit/edge-functions/phone-masking.test.ts
      to: "../../../supabase/functions/sophia-bot/rules/phone-masking.ts"
      via: "Import all functions"
      pattern: "import.*from.*phone-masking"
    - from: tests/unit/edge-functions/bank-detection.test.ts
      to: "../../../supabase/functions/sophia-bot/rules/bank-detection.ts"
      via: "Import all functions"
      pattern: "import.*from.*bank-detection"
---

<objective>
Fix tool execution timeout risk and add comprehensive tests for phone masking and bank detection rules.

Purpose: Prevent Edge Function timeouts during multi-tool execution loops and ensure critical business rules (phone masking, bank detection) are thoroughly tested.

Output:
- Time budget tracking in ai-chat.ts tool execution loop
- Phone masking test suite (8+ test cases)
- Bank detection test suite (10+ test cases)
</objective>

<execution_context>
@/home/qualia/.claude/get-shit-done/workflows/execute-plan.md
@/home/qualia/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@supabase/functions/sophia-bot/services/ai-chat.ts
@supabase/functions/sophia-bot/rules/phone-masking.ts
@supabase/functions/sophia-bot/rules/bank-detection.ts
@tests/unit/edge-functions/openrouter-timeout.test.ts
@vitest.config.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add time budget tracking to tool execution loop</name>
  <files>supabase/functions/sophia-bot/services/ai-chat.ts</files>
  <action>
Add time budget tracking to prevent Edge Function timeout during multi-tool execution loops.

**Location:** `chat()` function, starting at line 298

**Implementation:**
1. Define constant at top of function (after line 370):
   ```typescript
   // Edge Function timeout is 120s - use 90s budget with 30s buffer for response generation
   const TIME_BUDGET_MS = 90_000;
   const startTime = Date.now();
   ```

2. Add budget check at top of while loop (after line 376, before callOpenRouter):
   ```typescript
   while (toolCallCount < maxToolCalls) {
     // Check time budget before each iteration
     const elapsedMs = Date.now() - startTime;
     if (elapsedMs > TIME_BUDGET_MS) {
       logger.warn(
         `Tool execution loop exceeded time budget (${elapsedMs}ms > ${TIME_BUDGET_MS}ms) after ${toolCallCount} tool calls`,
         { category: LogCategory.GENERAL }
       );
       return {
         response: "I'm taking longer than expected to complete this task. Please try again, and I'll work more efficiently.",
         success: true, // Graceful degradation, not a failure
         toolsUsed
       };
     }

     const { message, error } = await callOpenRouter(
   ```

3. Add budget check in force retry path (after line 533, before retry callOpenRouter):
   ```typescript
   if (isPropertyUploadIntent && toolCallCount === 0 && imageUrls.length > 0) {
     // Check budget before force retry
     const elapsedMs = Date.now() - startTime;
     if (elapsedMs > TIME_BUDGET_MS) {
       logger.warn(
         `Skipping force retry - time budget exceeded (${elapsedMs}ms > ${TIME_BUDGET_MS}ms)`,
         { category: LogCategory.GENERAL }
       );
       // Return current response without retry
       return { response: aiResponse, success: true, toolsUsed };
     }

     logger.info("[FORCE TOOL] Upload intent with images but no tool call - forcing retry with required tool_choice", { category: LogCategory.GENERAL });
   ```

**Why this works:**
- Supabase Edge Function timeout: 120s
- OpenRouter timeout (from quick-3): 30s per call
- Worst case without budget: 5 × (30s OpenRouter + 30s tool execution) = 300s
- With 90s budget: Maximum ~3 iterations, leaves 30s buffer for final response generation
- Graceful degradation: Returns partial work instead of timing out

**What to avoid:**
- Don't use process.hrtime() (Node.js only, not available in Deno)
- Don't check budget AFTER operations complete (defeats purpose)
- Don't throw error (return graceful message instead)
  </action>
  <verify>
1. Read ai-chat.ts and confirm TIME_BUDGET_MS constant exists
2. Grep for budget check pattern:
   ```bash
   cd /home/qualia/Desktop/Projects/aiagents/sofiatesting
   grep -n "TIME_BUDGET_MS" supabase/functions/sophia-bot/services/ai-chat.ts
   grep -n "elapsedMs > TIME_BUDGET_MS" supabase/functions/sophia-bot/services/ai-chat.ts
   ```
3. Verify budget checks exist in both locations (main loop + force retry)
  </verify>
  <done>
- TIME_BUDGET_MS constant defined (90000)
- Budget check before callOpenRouter in main loop
- Budget check before force retry callOpenRouter
- Graceful timeout message returned when budget exceeded
- Logger warns when budget exceeded with elapsed time
  </done>
</task>

<task type="auto">
  <name>Task 2: Create phone masking test suite</name>
  <files>tests/unit/edge-functions/phone-masking.test.ts</files>
  <action>
Create comprehensive test suite for phone-masking.ts.

**File:** `tests/unit/edge-functions/phone-masking.test.ts` (new file)

**Import path:** `../../../supabase/functions/sophia-bot/rules/phone-masking.ts`

**Test structure:**
```typescript
import { describe, it, expect } from 'vitest';
import {
  maskPhoneNumber,
  maskPhoneNumberWithPrefix,
  shouldMaskPhone,
  maskEmailForLogging
} from '../../../supabase/functions/sophia-bot/rules/phone-masking.ts';

describe('phone-masking', () => {
  describe('maskPhoneNumber', () => {
    // Standard 8-digit numbers
    it('masks standard 8-digit Cyprus number', () => {
      expect(maskPhoneNumber('99123456')).toBe('99**3456');
    });

    it('masks different standard number', () => {
      expect(maskPhoneNumber('96555444')).toBe('96**5444');
    });

    // With country code prefix
    it('strips +357 prefix and masks', () => {
      expect(maskPhoneNumber('+357 99123456')).toBe('99**3456');
      expect(maskPhoneNumber('+35799123456')).toBe('99**3456');
    });

    it('strips 357 prefix (no +) and masks', () => {
      expect(maskPhoneNumber('35799123456')).toBe('99**3456');
    });

    // Non-digit character handling
    it('strips spaces and special characters', () => {
      expect(maskPhoneNumber('99 12 34 56')).toBe('99**3456');
      expect(maskPhoneNumber('99-12-34-56')).toBe('99**3456');
      expect(maskPhoneNumber('+357 (99) 123-456')).toBe('99**3456');
    });

    // Invalid inputs
    it('returns original for invalid length', () => {
      expect(maskPhoneNumber('12345')).toBe('12345'); // too short
      expect(maskPhoneNumber('123456789012')).toBe('123456789012'); // too long (no valid prefix)
    });

    it('returns original for empty string', () => {
      expect(maskPhoneNumber('')).toBe('');
    });
  });

  describe('maskPhoneNumberWithPrefix', () => {
    it('adds +357 prefix to masked number', () => {
      expect(maskPhoneNumberWithPrefix('99123456')).toBe('+357 99**3456');
    });

    it('adds +357 prefix when stripping existing prefix', () => {
      expect(maskPhoneNumberWithPrefix('+357 99123456')).toBe('+357 99**3456');
    });

    it('returns original for invalid number', () => {
      expect(maskPhoneNumberWithPrefix('12345')).toBe('12345');
    });
  });

  describe('shouldMaskPhone', () => {
    it('returns true for client context', () => {
      expect(shouldMaskPhone('client')).toBe(true);
    });

    it('returns false for agent context', () => {
      expect(shouldMaskPhone('agent')).toBe(false);
    });
  });

  describe('maskEmailForLogging', () => {
    it('masks standard email', () => {
      expect(maskEmailForLogging('john@example.com')).toBe('j***@example.com');
    });

    it('masks email with dots', () => {
      expect(maskEmailForLogging('john.doe@example.com')).toBe('j***@example.com');
    });

    it('masks single character local part', () => {
      expect(maskEmailForLogging('a@b.com')).toBe('a***@b.com');
    });

    it('handles invalid email (no @)', () => {
      expect(maskEmailForLogging('notanemail')).toBe('[invalid-email]');
    });

    it('handles invalid email (@ at start)', () => {
      expect(maskEmailForLogging('@example.com')).toBe('[invalid-email]');
    });

    it('handles empty string', () => {
      expect(maskEmailForLogging('')).toBe('[invalid-email]');
    });

    it('handles non-string input', () => {
      expect(maskEmailForLogging(null as any)).toBe('[invalid-email]');
      expect(maskEmailForLogging(undefined as any)).toBe('[invalid-email]');
    });
  });
});
```

**Coverage targets:**
- maskPhoneNumber: 10 test cases (standard, prefixes, special chars, invalid)
- maskPhoneNumberWithPrefix: 3 test cases
- shouldMaskPhone: 2 test cases
- maskEmailForLogging: 7 test cases

Total: 22 test cases minimum
  </action>
  <verify>
```bash
cd /home/qualia/Desktop/Projects/aiagents/sofiatesting
npm test -- phone-masking.test.ts
```
All tests should pass.
  </verify>
  <done>
- phone-masking.test.ts exists with 22+ test cases
- All imports resolve correctly
- npm test passes for phone-masking suite
- Coverage includes: standard numbers, prefixes, special chars, invalid inputs, email masking
  </done>
</task>

<task type="auto">
  <name>Task 3: Create bank detection test suite</name>
  <files>tests/unit/edge-functions/bank-detection.test.ts</files>
  <action>
Create comprehensive test suite for bank-detection.ts.

**File:** `tests/unit/edge-functions/bank-detection.test.ts` (new file)

**Import path:** `../../../supabase/functions/sophia-bot/rules/bank-detection.ts`

**Test structure:**
```typescript
import { describe, it, expect } from 'vitest';
import {
  detectBankFromUrl,
  isBankPropertyUrl,
  isValidBankName,
  getSupportedBanks,
  VALID_BANK_NAMES
} from '../../../supabase/functions/sophia-bot/rules/bank-detection.ts';

describe('bank-detection', () => {
  describe('detectBankFromUrl', () => {
    // REMU - both domains
    it('detects REMU from remuproperties.com', () => {
      expect(detectBankFromUrl('https://remuproperties.com/property/123')).toBe('REMU');
      expect(detectBankFromUrl('remuproperties.com')).toBe('REMU');
    });

    it('detects REMU from remu.com.cy', () => {
      expect(detectBankFromUrl('https://remu.com.cy/listings')).toBe('REMU');
      expect(detectBankFromUrl('remu.com.cy')).toBe('REMU');
    });

    // Altamira - both domains
    it('detects Altamira from altamira-amc.com', () => {
      expect(detectBankFromUrl('https://altamira-amc.com/property/456')).toBe('Altamira');
      expect(detectBankFromUrl('altamira-amc.com')).toBe('Altamira');
    });

    it('detects Altamira from altamira-npl.com', () => {
      expect(detectBankFromUrl('https://altamira-npl.com/listings')).toBe('Altamira');
      expect(detectBankFromUrl('altamira-npl.com')).toBe('Altamira');
    });

    // Gordian - both domains
    it('detects Gordian from gogordian.com', () => {
      expect(detectBankFromUrl('https://gogordian.com/property/789')).toBe('Gordian');
      expect(detectBankFromUrl('gogordian.com')).toBe('Gordian');
    });

    it('detects Gordian from gordian.com.cy', () => {
      expect(detectBankFromUrl('https://gordian.com.cy/listings')).toBe('Gordian');
      expect(detectBankFromUrl('gordian.com.cy')).toBe('Gordian');
    });

    // Bank of Cyprus - both domains
    it('detects Bank of Cyprus from bankofcyprus.com', () => {
      expect(detectBankFromUrl('https://bankofcyprus.com/property/321')).toBe('Bank of Cyprus');
      expect(detectBankFromUrl('bankofcyprus.com')).toBe('Bank of Cyprus');
    });

    it('detects Bank of Cyprus from boc.com.cy', () => {
      expect(detectBankFromUrl('https://boc.com.cy/listings')).toBe('Bank of Cyprus');
      expect(detectBankFromUrl('boc.com.cy')).toBe('Bank of Cyprus');
    });

    // Hellenic Bank - both domains
    it('detects Hellenic Bank from hellenic-bank.com', () => {
      expect(detectBankFromUrl('https://hellenic-bank.com/property/654')).toBe('Hellenic Bank');
      expect(detectBankFromUrl('hellenic-bank.com')).toBe('Hellenic Bank');
    });

    it('detects Hellenic Bank from hellenicbank.com', () => {
      expect(detectBankFromUrl('https://hellenicbank.com/listings')).toBe('Hellenic Bank');
      expect(detectBankFromUrl('hellenicbank.com')).toBe('Hellenic Bank');
    });

    // Case insensitivity
    it('detects banks case-insensitively', () => {
      expect(detectBankFromUrl('REMUPROPERTIES.COM')).toBe('REMU');
      expect(detectBankFromUrl('ALTAMIRA-AMC.COM')).toBe('Altamira');
      expect(detectBankFromUrl('GOGORDIAN.COM')).toBe('Gordian');
    });

    // Full URLs
    it('detects banks from full URLs with paths', () => {
      expect(detectBankFromUrl('https://www.remuproperties.com/property/123?ref=abc')).toBe('REMU');
      expect(detectBankFromUrl('https://www.altamira-amc.com/en/property/456#details')).toBe('Altamira');
    });

    // Invalid inputs
    it('returns null for non-bank URL', () => {
      expect(detectBankFromUrl('https://google.com')).toBeNull();
      expect(detectBankFromUrl('https://example.com')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(detectBankFromUrl('')).toBeNull();
    });

    it('returns null for invalid input', () => {
      expect(detectBankFromUrl(null as any)).toBeNull();
      expect(detectBankFromUrl(undefined as any)).toBeNull();
    });
  });

  describe('isBankPropertyUrl', () => {
    it('returns true for bank URLs', () => {
      expect(isBankPropertyUrl('https://remuproperties.com/property/123')).toBe(true);
      expect(isBankPropertyUrl('https://altamira-amc.com')).toBe(true);
    });

    it('returns false for non-bank URLs', () => {
      expect(isBankPropertyUrl('https://google.com')).toBe(false);
      expect(isBankPropertyUrl('')).toBe(false);
    });
  });

  describe('isValidBankName', () => {
    it('returns true for valid bank names', () => {
      expect(isValidBankName('REMU')).toBe(true);
      expect(isValidBankName('Altamira')).toBe(true);
      expect(isValidBankName('Gordian')).toBe(true);
      expect(isValidBankName('Bank of Cyprus')).toBe(true);
      expect(isValidBankName('Hellenic Bank')).toBe(true);
    });

    it('returns false for invalid bank names', () => {
      expect(isValidBankName('Unknown Bank')).toBe(false);
      expect(isValidBankName('')).toBe(false);
      expect(isValidBankName('remu')).toBe(false); // case-sensitive
    });
  });

  describe('getSupportedBanks', () => {
    it('returns all 5 supported banks', () => {
      const banks = getSupportedBanks();
      expect(banks).toHaveLength(5);
      expect(banks).toContain('REMU');
      expect(banks).toContain('Altamira');
      expect(banks).toContain('Gordian');
      expect(banks).toContain('Bank of Cyprus');
      expect(banks).toContain('Hellenic Bank');
    });

    it('returns readonly array', () => {
      const banks = getSupportedBanks();
      expect(banks).toBe(VALID_BANK_NAMES); // Same reference
    });
  });
});
```

**Coverage targets:**
- detectBankFromUrl: 19 test cases (each bank × 2 domains, case sensitivity, full URLs, invalid)
- isBankPropertyUrl: 2 test cases
- isValidBankName: 2 test cases
- getSupportedBanks: 2 test cases

Total: 25 test cases minimum
  </action>
  <verify>
```bash
cd /home/qualia/Desktop/Projects/aiagents/sofiatesting
npm test -- bank-detection.test.ts
```
All tests should pass.
  </verify>
  <done>
- bank-detection.test.ts exists with 25+ test cases
- All imports resolve correctly
- npm test passes for bank-detection suite
- Coverage includes: all 5 banks, both domain variants, case insensitivity, full URLs, invalid inputs
  </done>
</task>

</tasks>

<verification>
1. **Timeout protection:**
   ```bash
   cd /home/qualia/Desktop/Projects/aiagents/sofiatesting
   grep -c "TIME_BUDGET_MS" supabase/functions/sophia-bot/services/ai-chat.ts
   # Should return 4+ (definition + 3+ usages)
   ```

2. **Test suites:**
   ```bash
   npm test -- phone-masking.test.ts bank-detection.test.ts
   # Both suites should pass with 47+ total tests
   ```

3. **Edge Function still deploys:**
   ```bash
   supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx
   # Should succeed
   ```
</verification>

<success_criteria>
- TIME_BUDGET_MS constant defined as 90000 (90 seconds)
- Budget check before callOpenRouter in main loop (line ~377)
- Budget check before force retry callOpenRouter (line ~536)
- Graceful timeout message when budget exceeded
- phone-masking.test.ts with 22+ passing tests
- bank-detection.test.ts with 25+ passing tests
- All tests pass in CI
- sophia-bot Edge Function deploys successfully
</success_criteria>

<output>
After completion, create `.planning/quick/5-fix-tool-execution-timeout-budget-and-ad/5-SUMMARY.md`
</output>
