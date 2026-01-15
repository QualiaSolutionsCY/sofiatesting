# Telegram Bot Production Readiness - Repository Research

**Date:** 2026-01-14
**Researcher:** Claude Code (Opus 4.5)

## Executive Summary

This document provides comprehensive research findings for implementing Telegram bot production readiness features. The repository already has several patterns and infrastructure that can be extended.

---

## Architecture Overview

### Stack
- **Framework:** Next.js 15 (but Telegram bot runs on Supabase Edge Functions)
- **Database:** Supabase PostgreSQL with Drizzle ORM
- **Deployment:** Supabase Edge Functions (NOT Vercel for bots)
- **AI:** OpenRouter API (Gemini models)
- **Error Tracking:** Sentry (configured for Next.js)

### Telegram Bot Location
- **Edge Function:** `/home/qualia/Desktop/Projects/aiagents/sofiatesting/supabase/functions/telegram-sophia/`
- **Files:**
  - `index.ts` - Main webhook handler
  - `database.ts` - Database operations
  - `lead-router.ts` - Lead routing logic
  - `routing-constants.ts` - Routing rules and patterns
  - `types.ts` - TypeScript type definitions
  - `telegram-client.ts` - Telegram API client
  - `zyprus-api.ts` - Zyprus property API integration
  - `prompts.ts` - AI system prompts

---

## Existing Patterns and Infrastructure

### 1. Database Migrations

**Location:** `/home/qualia/Desktop/Projects/aiagents/sofiatesting/supabase/migrations/`

**Existing Telegram Migrations:**

| File | Purpose |
|------|---------|
| `20260113_add_telegram_lead_routing.sql` | Creates `telegram_groups`, `telegram_leads`, `lead_forwarding_rotation` tables |
| `20260113_enable_rls_telegram_tables.sql` | Enables RLS policies for security |
| `20260114_fix_telegram_lead_routing.sql` | Adds RPC functions for atomic operations |

**Migration Pattern:**
```sql
-- Example from 20260114_fix_telegram_lead_routing.sql
CREATE OR REPLACE FUNCTION function_name(param_type TYPE)
RETURNS RETURN_TYPE AS $$
DECLARE
  v_variable TYPE;
BEGIN
  -- Logic here
END;
$$ LANGUAGE plpgsql;
```

**Existing RPC Functions:**
- `increment_forward_count(p_region TEXT)` - Increment rotation counter
- `select_next_agent_atomic(p_region TEXT, p_agent_ids UUID[])` - Atomic round-robin selection
- `check_recent_duplicates(p_property_ids TEXT[], p_group_id BIGINT, p_window_minutes INT)` - Batch duplicate check
- `get_registration_state(p_user_id BIGINT)` - Get registration state
- `set_registration_state(p_user_id BIGINT, p_step VARCHAR)` - Set registration state
- `clear_registration_state(p_user_id BIGINT)` - Clear registration state
- `cleanup_expired_registrations()` - Cleanup function (already exists!)

---

### 2. Cron Job Pattern

**Location:** `/home/qualia/Desktop/Projects/aiagents/sofiatesting/app/api/cron/cleanup/route.ts`

**Existing Cron Configuration** (`vercel.json`):
```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup",
      "schedule": "0 2 * * *"
    }
  ]
}
```

**Pattern for New Cron Routes:**
```typescript
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // 1. Verify CRON_SECRET
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (process.env.NODE_ENV === "production") {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // 2. Execute cleanup logic
  // ...

  // 3. Return results
  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    // ...results
  });
}
```

**Note:** This runs on Vercel. For Supabase Edge Functions, need to use:
- Supabase pg_cron extension, or
- External cron service hitting Edge Function endpoint

---

### 3. Admin Dashboard Pattern

**Location:** `/home/qualia/Desktop/Projects/aiagents/sofiatesting/app/(admin)/admin/`

**Existing Pages:**
| Page | Path | Purpose |
|------|------|---------|
| Status | `/admin/status` | System health monitoring |
| Logs | `/admin/logs` | Agent execution logs |
| Activity | `/admin/activity` | Live activity feed |
| Agents Registry | `/admin/agents-registry` | Agent management |
| Listings | `/admin/listings` | Property listings review |

**Dashboard Pattern:**
```typescript
// Force dynamic rendering for real-time data
export const dynamic = "force-dynamic";

import { db } from "@/lib/db/client";
import { someTable } from "@/lib/db/schema";

async function getData() {
  // Query database
  const data = await db.select().from(someTable)...
  return data;
}

export default async function Page() {
  const data = await getData();
  return (
    <div className="space-y-6 p-8 pt-6">
      {/* Dashboard content */}
    </div>
  );
}
```

---

### 4. Sentry Error Tracking

**Configuration Files:**
- `/home/qualia/Desktop/Projects/aiagents/sofiatesting/sentry.server.config.ts`
- `/home/qualia/Desktop/Projects/aiagents/sofiatesting/sentry.client.config.ts`
- `/home/qualia/Desktop/Projects/aiagents/sofiatesting/sentry.edge.config.ts`

**Current Configuration:**
```typescript
Sentry.init({
  dsn: "https://78c4b01fd98abb3c2cff25b0439cdf7a@o4510184257814528.ingest.de.sentry.io/4510184259453008",
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: 0.1,
});
```

**Note:** Sentry is configured for Next.js, not Supabase Edge Functions. Edge Functions need separate error tracking solution.

---

### 5. Logger with PII Redaction

**Location:** `/home/qualia/Desktop/Projects/aiagents/sofiatesting/supabase/functions/sophia-bot/utils/logger.ts`

**Features:**
- Log levels: DEBUG, INFO, WARN, ERROR
- PII redaction (phone numbers, emails)
- Structured JSON output
- Environment-configurable log level

**Usage:**
```typescript
import { logger } from "./utils/logger.ts";

logger.info("Message processed", {
  operation: "handle_message",
  messageId: "123"
});
logger.error("Failed to process", error, { operation: "handle_message" });
```

**Can be copied to telegram-sophia function.**

---

### 6. Test Patterns

**Unit Tests:** `/home/qualia/Desktop/Projects/aiagents/sofiatesting/tests/unit/`
- `whatsapp-webhook.test.ts` - Webhook signature verification
- `whatsapp-session.test.ts` - Session management
- `send-email.test.ts` - Email sending
- `input-sanitizer.test.ts` - Input validation
- `conversation-pruning.test.ts` - Message history pruning

**Manual Tests:** `/home/qualia/Desktop/Projects/aiagents/sofiatesting/tests/manual/`
- `test-telegram-webhook.ts` - Telegram webhook testing

**Test Pattern (Node.js test runner):**
```typescript
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("Feature", () => {
  it("should do something", () => {
    assert.strictEqual(result, expected);
  });
});
```

**Run:** `pnpm exec tsx --test tests/unit/your-file.test.ts`

---

## Database Tables for Telegram

### Tables in Drizzle Schema (`lib/db/schema.ts`)

#### TelegramGroup (line 677-701)
```typescript
telegramGroup = pgTable("TelegramGroup", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: bigint("groupId", { mode: "number" }).notNull().unique(),
  groupName: varchar("groupName", { length: 256 }).notNull(),
  groupType: varchar("groupType", { length: 32 }).notNull(),
  region: varchar("region", { length: 50 }),
  isActive: boolean("isActive").notNull().default(true),
  leadRoutingEnabled: boolean("leadRoutingEnabled").notNull().default(true),
  // ...
});
```

#### TelegramLead (line 706-773)
```typescript
telegramLead = pgTable("TelegramLead", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceGroupId: bigint("sourceGroupId", { mode: "number" }).notNull(),
  sourceGroupName: varchar("sourceGroupName", { length: 256 }),
  originalMessageId: varchar("originalMessageId", { length: 64 }),
  originalMessageText: text("originalMessageText"),
  // ... extensive fields for lead tracking
  status: varchar("status", { length: 32 }).notNull().default("forwarded"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});
```

#### LeadForwardingRotation (line 778-796)
```typescript
leadForwardingRotation = pgTable("LeadForwardingRotation", {
  id: uuid("id").primaryKey().defaultRandom(),
  region: varchar("region", { length: 50 }).notNull().unique(),
  lastForwardedToAgentId: uuid("lastForwardedToAgentId"),
  forwardCount: integer("forwardCount").notNull().default(0),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});
```

### Tables in Supabase (via migrations)

Additional tables created by migrations that may not be in Drizzle:
- `telegram_chat_history` - Conversation history
- `telegram_processed_messages` - Message deduplication
- `telegram_registration_state` - Agent registration flow

---

## Feature Implementation Guide

### 1. Cleanup Cron for Telegram Data

**Existing Pattern:** `cleanup_expired_registrations()` function exists in migration

**New Functions Needed:**
```sql
-- Cleanup old processed messages (older than 24 hours)
CREATE OR REPLACE FUNCTION cleanup_old_processed_messages()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM telegram_processed_messages
  WHERE created_at < NOW() - INTERVAL '24 hours';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Cleanup old chat history (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_chat_history()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM telegram_chat_history
  WHERE created_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
```

**Cron Options:**
1. Add to existing Vercel cron (calls Supabase RPC)
2. Use Supabase pg_cron extension
3. Create Edge Function endpoint + external cron

---

### 2. Health Check Endpoint

**Pattern:** Create Edge Function endpoint

```typescript
// supabase/functions/telegram-health/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

serve(async (req: Request) => {
  const checks = {
    database: false,
    telegram_api: false,
    timestamp: new Date().toISOString(),
  };

  // Check database
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { error } = await supabase.from("telegram_groups").select("id").limit(1);
    checks.database = !error;
  } catch {}

  // Check Telegram API
  try {
    const res = await fetch(`https://api.telegram.org/bot${Deno.env.get("TELEGRAM_BOT_TOKEN")}/getMe`);
    checks.telegram_api = res.ok;
  } catch {}

  const healthy = checks.database && checks.telegram_api;

  return new Response(JSON.stringify({
    status: healthy ? "healthy" : "degraded",
    checks,
  }), {
    status: healthy ? 200 : 503,
    headers: { "Content-Type": "application/json" },
  });
});
```

---

### 3. Webhook Failure Notifications

**Pattern:** Add to existing Edge Function error handling

```typescript
// In lead-router.ts or index.ts
const notifyWebhookFailure = async (error: Error, context: object) => {
  // Option 1: Log to database
  await supabase.from("webhook_failures").insert({
    service: "telegram",
    error_message: error.message,
    context: JSON.stringify(context),
  });

  // Option 2: Send to Slack/Discord
  // Option 3: Email via Resend
};
```

---

### 4. Lead Routing Stats Dashboard

**Location:** Create `/home/qualia/Desktop/Projects/aiagents/sofiatesting/app/(admin)/admin/telegram-leads/page.tsx`

**Data Queries:**
```typescript
// Get lead stats
const stats = await db
  .select({
    total: sql<number>`count(*)`,
    forwarded: sql<number>`count(*) filter (where status = 'forwarded')`,
    contacted: sql<number>`count(*) filter (where status = 'contacted')`,
    closed: sql<number>`count(*) filter (where status = 'closed')`,
  })
  .from(telegramLead)
  .where(gte(telegramLead.createdAt, thirtyDaysAgo));

// Get leads by agent
const leadsByAgent = await db
  .select({
    agentId: telegramLead.forwardedToAgentId,
    agentName: telegramLead.forwardedToName,
    count: sql<number>`count(*)`,
  })
  .from(telegramLead)
  .groupBy(telegramLead.forwardedToAgentId, telegramLead.forwardedToName);
```

---

### 5. Sentry for Edge Functions

**Note:** @sentry/deno package available for Deno runtime

```typescript
// supabase/functions/telegram-sophia/sentry.ts
import * as Sentry from "https://deno.land/x/sentry@0.2.0/mod.ts";

Sentry.init({
  dsn: Deno.env.get("SENTRY_DSN"),
  environment: "production",
});

export const captureException = (error: Error, context?: object) => {
  Sentry.captureException(error, { extra: context });
};
```

---

### 6. Automated Tests

**Files to Create:**
- `tests/unit/telegram-routing.test.ts` - Test routing logic
- `tests/unit/telegram-deduplication.test.ts` - Test dedup logic
- `tests/integration/telegram-edge-function.test.ts` - Integration tests

**Test routing constants:**
```typescript
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectRussianLanguage,
  extractPropertyIds,
  isLeadMessage,
} from "@/supabase/functions/telegram-sophia/routing-constants";

describe("Telegram Routing", () => {
  it("should detect Russian language from Cyrillic", () => {
    assert.strictEqual(detectRussianLanguage("Привет"), true);
  });

  it("should extract property IDs", () => {
    const ids = extractPropertyIds("Check ZYP-1234 and ZYP-5678");
    assert.deepStrictEqual(ids, ["ZYP-1234", "ZYP-5678"]);
  });
});
```

---

## References

### Internal Files

| File | Line | Purpose |
|------|------|---------|
| `supabase/functions/telegram-sophia/index.ts` | 1-450 | Main webhook handler |
| `supabase/functions/telegram-sophia/database.ts` | 1-645 | Database operations |
| `supabase/functions/telegram-sophia/lead-router.ts` | 1-455 | Lead routing logic |
| `supabase/functions/telegram-sophia/routing-constants.ts` | 1-264 | Routing rules |
| `supabase/functions/telegram-sophia/types.ts` | 1-112 | Type definitions |
| `lib/db/schema.ts` | 677-796 | Telegram table definitions |
| `app/api/cron/cleanup/route.ts` | 1-115 | Cron cleanup pattern |
| `app/(admin)/admin/status/page.tsx` | 1-117 | Status dashboard pattern |
| `supabase/functions/sophia-bot/utils/logger.ts` | 1-141 | Logger with PII redaction |
| `sentry.server.config.ts` | 1-22 | Sentry configuration |

### Migrations

| File | Purpose |
|------|---------|
| `20260113_add_telegram_lead_routing.sql` | Create telegram tables |
| `20260113_enable_rls_telegram_tables.sql` | Enable RLS |
| `20260114_fix_telegram_lead_routing.sql` | Add RPC functions |

---

## Risks and Gotchas

1. **NO VERCEL for bots** - Everything runs on Supabase Edge Functions
2. **Deno imports** - Use `https://esm.sh/` or `https://deno.land/` imports
3. **Sentry not configured for Edge Functions** - Needs separate setup
4. **Cron on Supabase** - Need pg_cron or external service
5. **Message deduplication** - Critical for preventing duplicate forwards
6. **Race conditions** - Use atomic RPC functions for round-robin

---

## Next Steps

1. **Create cleanup cron** - Add migration for cleanup functions + cron route
2. **Add health check** - Create Edge Function endpoint
3. **Setup notifications** - Add webhook failure tracking table
4. **Create runbook** - Document operational procedures
5. **Build dashboard** - Add `/admin/telegram-leads` page
6. **Configure Sentry** - Add to Edge Functions
7. **Write tests** - Test routing logic, deduplication

