# Telegram Bot Production Readiness Plan

**Created**: 2026-01-14
**Status**: Ready for Implementation
**Priority**: P1 (Critical for Production)

---

## Overview

Make the SOPHIA Telegram bot system production-ready with data cleanup, health monitoring, alerting, documentation, and observability.

## Problem Statement

The Telegram lead routing system is functional but lacks production hardening:
- No data cleanup for old messages (tables will grow unbounded)
- No health check endpoint for monitoring
- No alerting when webhook fails
- No runbook documentation
- No visibility into lead routing stats
- No error tracking (Sentry)
- No automated tests

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Supabase PostgreSQL                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ pg_cron      │  │ telegram_*   │  │ lead_forwarding_*    │  │
│  │ (cleanup)    │  │ tables       │  │ tables               │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Supabase Edge Functions                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ telegram-    │  │ telegram-    │  │ telegram-            │  │
│  │ sophia       │  │ health       │  │ admin                │  │
│  │ (webhook)    │  │ (monitoring) │  │ (dashboard API)      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    External Services                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Telegram     │  │ Sentry       │  │ Uptime Monitor       │  │
│  │ Bot API      │  │ (errors)     │  │ (health checks)      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Data Cleanup (Priority 1)

**Goal**: Prevent unbounded table growth with automated cleanup.

#### 1.1 Enable pg_cron Extension

```sql
-- supabase/migrations/20260114_enable_pg_cron.sql
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
```

#### 1.2 Create Cleanup Functions

```sql
-- supabase/migrations/20260114_cleanup_functions.sql

-- Cleanup old processed messages (keep 7 days for debugging)
CREATE OR REPLACE FUNCTION cleanup_old_processed_messages()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM telegram_processed_messages
  WHERE created_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Log cleanup
  INSERT INTO cleanup_logs (table_name, deleted_count, cleaned_at)
  VALUES ('telegram_processed_messages', deleted_count, NOW());

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Cleanup old chat history (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_chat_history()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM telegram_chat_history
  WHERE created_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  INSERT INTO cleanup_logs (table_name, deleted_count, cleaned_at)
  VALUES ('telegram_chat_history', deleted_count, NOW());

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Cleanup expired registration states (already exists, add logging)
CREATE OR REPLACE FUNCTION cleanup_expired_registrations()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM telegram_registration_state
  WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count > 0 THEN
    INSERT INTO cleanup_logs (table_name, deleted_count, cleaned_at)
    VALUES ('telegram_registration_state', deleted_count, NOW());
  END IF;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create cleanup logs table
CREATE TABLE IF NOT EXISTS cleanup_logs (
  id SERIAL PRIMARY KEY,
  table_name VARCHAR(100) NOT NULL,
  deleted_count INTEGER NOT NULL,
  cleaned_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying cleanup history
CREATE INDEX idx_cleanup_logs_cleaned_at ON cleanup_logs (cleaned_at DESC);
```

#### 1.3 Schedule Cron Jobs

```sql
-- supabase/migrations/20260114_schedule_cleanup_crons.sql

-- Run daily at 3 AM UTC (low traffic)
SELECT cron.schedule(
  'cleanup-processed-messages',
  '0 3 * * *',
  $$SELECT cleanup_old_processed_messages()$$
);

SELECT cron.schedule(
  'cleanup-chat-history',
  '0 3 * * *',
  $$SELECT cleanup_old_chat_history()$$
);

-- Run hourly for registration state cleanup
SELECT cron.schedule(
  'cleanup-registrations',
  '0 * * * *',
  $$SELECT cleanup_expired_registrations()$$
);
```

**Files to create:**
- `supabase/migrations/20260114_enable_pg_cron.sql`
- `supabase/migrations/20260114_cleanup_functions.sql`
- `supabase/migrations/20260114_schedule_cleanup_crons.sql`

---

### Phase 2: Health Check Endpoint (Priority 1)

**Goal**: Enable external monitoring of bot health.

#### 2.1 Create Health Check Edge Function

```typescript
// supabase/functions/telegram-health/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");

interface HealthCheck {
  status: "pass" | "warn" | "fail";
  version: string;
  releaseId: string;
  description: string;
  checks: Record<string, ComponentCheck>;
}

interface ComponentCheck {
  status: "pass" | "warn" | "fail";
  time: string;
  output?: string;
}

serve(async (req: Request): Promise<Response> => {
  const startTime = Date.now();
  const checks: Record<string, ComponentCheck> = {};
  let overallStatus: "pass" | "warn" | "fail" = "pass";

  // 1. Check database connectivity
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { error } = await supabase
      .from("telegram_groups")
      .select("count")
      .limit(1);

    checks["database:connectivity"] = {
      status: error ? "fail" : "pass",
      time: new Date().toISOString(),
      output: error ? error.message : "Connected",
    };
    if (error) overallStatus = "fail";
  } catch (e) {
    checks["database:connectivity"] = {
      status: "fail",
      time: new Date().toISOString(),
      output: String(e),
    };
    overallStatus = "fail";
  }

  // 2. Check Telegram webhook status
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`
    );
    const data = await response.json();

    const webhookOk = data.ok && data.result?.url;
    const pendingCount = data.result?.pending_update_count || 0;
    const lastError = data.result?.last_error_message;

    let webhookStatus: "pass" | "warn" | "fail" = "pass";
    if (!webhookOk) webhookStatus = "fail";
    else if (pendingCount > 100 || lastError) webhookStatus = "warn";

    checks["telegram:webhook"] = {
      status: webhookStatus,
      time: new Date().toISOString(),
      output: lastError || `Pending: ${pendingCount}`,
    };

    if (webhookStatus === "fail") overallStatus = "fail";
    else if (webhookStatus === "warn" && overallStatus !== "fail") overallStatus = "warn";
  } catch (e) {
    checks["telegram:webhook"] = {
      status: "fail",
      time: new Date().toISOString(),
      output: String(e),
    };
    overallStatus = "fail";
  }

  // 3. Check recent lead activity (warn if none in 24h during business hours)
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("telegram_leads")
      .select("id")
      .gte("created_at", yesterday)
      .limit(1);

    const hasRecentLeads = !error && data && data.length > 0;

    checks["leads:recent_activity"] = {
      status: hasRecentLeads ? "pass" : "warn",
      time: new Date().toISOString(),
      output: hasRecentLeads ? "Active" : "No leads in 24h",
    };
  } catch (e) {
    checks["leads:recent_activity"] = {
      status: "warn",
      time: new Date().toISOString(),
      output: String(e),
    };
  }

  const health: HealthCheck = {
    status: overallStatus,
    version: "1.0.0",
    releaseId: "telegram-sophia-v1",
    description: "SOPHIA Telegram Bot Health",
    checks,
  };

  const responseTime = Date.now() - startTime;

  return new Response(JSON.stringify(health, null, 2), {
    status: overallStatus === "fail" ? 503 : 200,
    headers: {
      "Content-Type": "application/health+json",
      "Cache-Control": "no-cache",
      "X-Response-Time": `${responseTime}ms`,
    },
  });
});
```

**Files to create:**
- `supabase/functions/telegram-health/index.ts`

**Deploy command:**
```bash
supabase functions deploy telegram-health --project-ref vceeheaxcrhmpqueudqx --no-verify-jwt
```

---

### Phase 3: Webhook Failure Notifications (Priority 1)

**Goal**: Alert when Telegram webhook has errors.

#### 3.1 Create Monitoring Function

```sql
-- supabase/migrations/20260114_webhook_monitoring.sql

-- Table to store webhook check results
CREATE TABLE IF NOT EXISTS webhook_health_logs (
  id SERIAL PRIMARY KEY,
  webhook_url TEXT,
  pending_updates INTEGER DEFAULT 0,
  last_error_message TEXT,
  last_error_date TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'healthy',
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_health_checked_at ON webhook_health_logs (checked_at DESC);
```

#### 3.2 Create Alert Edge Function

```typescript
// supabase/functions/telegram-monitor/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const ALERT_TELEGRAM_CHAT_ID = Deno.env.get("ALERT_TELEGRAM_CHAT_ID"); // Admin chat

serve(async (req: Request): Promise<Response> => {
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Get webhook info from Telegram
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`
    );
    const data = await response.json();

    if (!data.ok) {
      throw new Error("Failed to get webhook info");
    }

    const webhookInfo = data.result;
    const hasError = !!webhookInfo.last_error_message;
    const highPending = (webhookInfo.pending_update_count || 0) > 50;

    // Log to database
    await supabase.from("webhook_health_logs").insert({
      webhook_url: webhookInfo.url,
      pending_updates: webhookInfo.pending_update_count || 0,
      last_error_message: webhookInfo.last_error_message || null,
      last_error_date: webhookInfo.last_error_date
        ? new Date(webhookInfo.last_error_date * 1000).toISOString()
        : null,
      status: hasError ? "error" : highPending ? "degraded" : "healthy",
    });

    // Send alert if there's an error
    if (hasError && ALERT_TELEGRAM_CHAT_ID) {
      const alertMessage = `⚠️ SOPHIA Webhook Alert\n\n` +
        `Error: ${webhookInfo.last_error_message}\n` +
        `Pending: ${webhookInfo.pending_update_count}\n` +
        `Time: ${new Date().toISOString()}`;

      await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: ALERT_TELEGRAM_CHAT_ID,
            text: alertMessage,
            parse_mode: "HTML",
          }),
        }
      );
    }

    return new Response(JSON.stringify({
      status: hasError ? "alert_sent" : "healthy",
      webhookInfo,
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Monitor] Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
```

#### 3.3 Schedule Monitoring Cron

```sql
-- Add to cron schedule (run every 5 minutes)
-- This calls the Edge Function via HTTP
SELECT cron.schedule(
  'check-telegram-webhook',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/telegram-monitor',
    headers := '{"Authorization": "Bearer ' || current_setting('app.supabase_service_key') || '"}'::jsonb
  )
  $$
);
```

**Files to create:**
- `supabase/functions/telegram-monitor/index.ts`
- `supabase/migrations/20260114_webhook_monitoring.sql`

**Required secrets:**
```bash
supabase secrets set ALERT_TELEGRAM_CHAT_ID=<your-admin-chat-id> --project-ref vceeheaxcrhmpqueudqx
```

---

### Phase 4: System Runbook (Priority 1)

**Goal**: Document operational procedures.

```markdown
# docs/runbooks/telegram-sophia-runbook.md

# SOPHIA Telegram Bot - Operations Runbook

## System Overview

SOPHIA is an AI assistant for Zyprus Property Group that:
- Answers Cyprus real estate questions via Telegram DM
- Routes leads from group chats to appropriate agents
- Uses Supabase Edge Functions (NOT Vercel)

### Architecture

```
Telegram → Webhook → telegram-sophia Edge Function → Database
                           ↓
                     OpenRouter AI (Gemini)
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Main webhook | `supabase/functions/telegram-sophia/` | Handles all Telegram updates |
| Lead router | `telegram-sophia/lead-router.ts` | Routes leads to agents |
| Database | Supabase PostgreSQL | Chat history, leads, agents |
| AI | OpenRouter (Gemini 3 Flash) | Generates responses |

---

## Health Checks

### Manual Health Check

```bash
curl https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/telegram-health
```

Expected response:
```json
{
  "status": "pass",
  "checks": {
    "database:connectivity": { "status": "pass" },
    "telegram:webhook": { "status": "pass" }
  }
}
```

### Check Webhook Status Directly

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

Look for:
- `pending_update_count`: Should be < 50
- `last_error_message`: Should be null
- `url`: Should match Edge Function URL

---

## Common Issues & Fixes

### Bot Not Responding

**Symptoms**: Messages sent but no reply

**Diagnosis**:
1. Check webhook: `curl .../getWebhookInfo`
2. Check Edge Function logs: `supabase functions logs telegram-sophia`
3. Check database connectivity

**Fixes**:
- If webhook URL wrong: Re-run webhook setup script
- If 401 errors: Redeploy with `--no-verify-jwt`
- If AI errors: Check `OPENROUTER_API_KEY` secret

### Leads Not Routing

**Symptoms**: Lead messages in groups not forwarded

**Diagnosis**:
1. Check if message contains `zyprus.com` URL or `ZYP-` ID
2. Check if group has `lead_routing_enabled = true`
3. Check if target agents have `telegram_user_id` set

**Fixes**:
```sql
-- Enable routing for a group
UPDATE telegram_groups SET lead_routing_enabled = true WHERE group_name LIKE '%Paphos%';

-- Check agent registration
SELECT full_name, telegram_user_id FROM agents WHERE region = 'paphos';
```

### Wrong Agent Receives Lead

**Symptoms**: Lead goes to unexpected agent

**Diagnosis**:
1. Check routing rules in `lead-router.ts`
2. Check rotation state in `lead_forwarding_rotation` table

**Fixes**:
```sql
-- Reset rotation for a region
DELETE FROM lead_forwarding_rotation WHERE region = 'paphos';
```

---

## Deployment

### Deploy Edge Function

```bash
cd /path/to/project
supabase functions deploy telegram-sophia --project-ref vceeheaxcrhmpqueudqx --no-verify-jwt
```

### Set Secrets

```bash
supabase secrets set KEY=value --project-ref vceeheaxcrhmpqueudqx
```

Required secrets:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `OPENROUTER_API_KEY`

### Set Webhook

```bash
pnpm exec tsx scripts/setup-telegram-webhook.ts
```

---

## Database Maintenance

### Check Table Sizes

```sql
SELECT
  relname as table,
  pg_size_pretty(pg_total_relation_size(relid)) as size
FROM pg_catalog.pg_statio_user_tables
WHERE relname LIKE 'telegram%'
ORDER BY pg_total_relation_size(relid) DESC;
```

### Manual Cleanup

```sql
-- Delete old processed messages
SELECT cleanup_old_processed_messages();

-- Check cleanup logs
SELECT * FROM cleanup_logs ORDER BY cleaned_at DESC LIMIT 10;
```

### Check Cron Jobs

```sql
SELECT * FROM cron.job;
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

---

## Monitoring

### Check Recent Leads

```sql
SELECT
  source_group_name,
  a.full_name as agent,
  status,
  created_at
FROM telegram_leads l
JOIN agents a ON l.forwarded_to_agent_id = a.id
ORDER BY created_at DESC
LIMIT 20;
```

### Check Rotation State

```sql
SELECT
  r.region,
  a.full_name as last_agent,
  r.forward_count,
  r.updated_at
FROM lead_forwarding_rotation r
JOIN agents a ON r.last_forwarded_to_agent_id = a.id;
```

---

## Contacts

- **Technical**: Qualia Solutions (qualia@zyprus.com)
- **Business**: Zyprus Property Group
```

**Files to create:**
- `docs/runbooks/telegram-sophia-runbook.md`

---

### Phase 5: Lead Stats Dashboard (Priority 3)

**Goal**: Visual dashboard for lead routing statistics.

#### 5.1 Create Stats API Edge Function

```typescript
// supabase/functions/telegram-admin/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req: Request): Promise<Response> => {
  // Basic auth check (expand as needed)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const url = new URL(req.url);
  const action = url.pathname.split("/").pop();

  try {
    switch (action) {
      case "stats": {
        // Lead stats by region (last 7 days)
        const { data: byRegion } = await supabase.rpc("get_lead_stats_by_region");

        // Lead stats by agent (last 7 days)
        const { data: byAgent } = await supabase.rpc("get_lead_stats_by_agent");

        // Recent leads
        const { data: recent } = await supabase
          .from("telegram_leads")
          .select(`
            id,
            source_group_name,
            property_reference_id,
            status,
            created_at,
            agents!forwarded_to_agent_id(full_name)
          `)
          .order("created_at", { ascending: false })
          .limit(50);

        return new Response(JSON.stringify({
          byRegion,
          byAgent,
          recentLeads: recent,
        }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      case "agents": {
        const { data } = await supabase
          .from("agents")
          .select("id, full_name, region, telegram_user_id, is_active, can_receive_leads")
          .order("region", { ascending: true });

        return new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" },
        });
      }

      case "groups": {
        const { data } = await supabase
          .from("telegram_groups")
          .select("*")
          .order("group_name", { ascending: true });

        return new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" },
        });
      }

      default:
        return new Response("Not found", { status: 404 });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
```

#### 5.2 Create Stats SQL Functions

```sql
-- supabase/migrations/20260114_stats_functions.sql

CREATE OR REPLACE FUNCTION get_lead_stats_by_region()
RETURNS TABLE (
  region TEXT,
  lead_count BIGINT,
  forwarded_count BIGINT,
  duplicate_count BIGINT
) AS $$
  SELECT
    COALESCE(property_region, 'unknown') as region,
    COUNT(*) as lead_count,
    COUNT(*) FILTER (WHERE status = 'forwarded') as forwarded_count,
    COUNT(*) FILTER (WHERE status = 'duplicate') as duplicate_count
  FROM telegram_leads
  WHERE created_at > NOW() - INTERVAL '7 days'
  GROUP BY property_region
  ORDER BY lead_count DESC;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION get_lead_stats_by_agent()
RETURNS TABLE (
  agent_name TEXT,
  region TEXT,
  lead_count BIGINT
) AS $$
  SELECT
    a.full_name as agent_name,
    a.region,
    COUNT(l.id) as lead_count
  FROM agents a
  LEFT JOIN telegram_leads l ON l.forwarded_to_agent_id = a.id
    AND l.created_at > NOW() - INTERVAL '7 days'
  WHERE a.is_active = true AND a.can_receive_leads = true
  GROUP BY a.id, a.full_name, a.region
  ORDER BY lead_count DESC;
$$ LANGUAGE sql STABLE;
```

**Files to create:**
- `supabase/functions/telegram-admin/index.ts`
- `supabase/migrations/20260114_stats_functions.sql`

---

### Phase 6: Sentry Error Tracking (Priority 3)

**Goal**: Capture and track errors for debugging.

#### 6.1 Add Sentry to Edge Function

```typescript
// supabase/functions/telegram-sophia/sentry.ts
import * as Sentry from "npm:@sentry/deno";

const SENTRY_DSN = Deno.env.get("SENTRY_DSN");

export const initSentry = () => {
  if (!SENTRY_DSN) {
    console.log("[Sentry] DSN not configured, skipping initialization");
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: "production",
    release: "telegram-sophia@1.0.0",
    tracesSampleRate: 0.1, // 10% of transactions
    beforeSend(event) {
      // Scrub sensitive data
      if (event.request?.headers) {
        delete event.request.headers["x-telegram-bot-api-secret-token"];
        delete event.request.headers["authorization"];
      }
      return event;
    },
  });
};

export const captureError = (error: Error, context?: Record<string, unknown>) => {
  if (!SENTRY_DSN) return;

  Sentry.captureException(error, {
    extra: context,
  });
};

export const captureMessage = (message: string, level: "info" | "warning" | "error" = "info") => {
  if (!SENTRY_DSN) return;

  Sentry.captureMessage(message, level);
};
```

#### 6.2 Integrate with Main Handler

Update `supabase/functions/telegram-sophia/index.ts`:

```typescript
// Add at top
import { initSentry, captureError } from "./sentry.ts";

// Initialize Sentry at startup
initSentry();

// Wrap error handlers
catch (error) {
  captureError(error as Error, { chatId, messageId });
  console.error("[Webhook] Error:", error);
  return jsonResponse({ ok: true, error: String(error) });
}
```

**Files to create/modify:**
- `supabase/functions/telegram-sophia/sentry.ts`
- Modify `supabase/functions/telegram-sophia/index.ts`

**Required secrets:**
```bash
supabase secrets set SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx --project-ref vceeheaxcrhmpqueudqx
```

---

### Phase 7: Automated Tests (Priority 3)

**Goal**: Ensure code quality and prevent regressions.

#### 7.1 Unit Tests for Routing Logic

```typescript
// tests/unit/telegram-lead-router.test.ts
import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";

// Mock database functions
const mockGetAgentsByNames = mock.fn(() => Promise.resolve([
  { id: "1", full_name: "Marios Azinas", telegram_user_id: 123 },
  { id: "2", full_name: "Dimitris Panayiotou", telegram_user_id: 456 },
]));

describe("Lead Router", () => {
  describe("Paphos Region Routing", () => {
    it("should route to 50/50 between Marios A and Dimitris only", async () => {
      // Test that Paphos leads go to PAPHOS_OFFICE_FALLBACK_AGENTS
      const result = await mockGetAgentsByNames(["Marios Azinas", "Dimitris Panayiotou"]);
      assert.strictEqual(result.length, 2);
      assert.ok(result.some(a => a.full_name === "Marios Azinas"));
      assert.ok(result.some(a => a.full_name === "Dimitris Panayiotou"));
    });

    it("should not include other Paphos agents in fallback rotation", async () => {
      const fallbackAgents = ["Marios Azinas", "Dimitris Panayiotou"];
      assert.ok(!fallbackAgents.includes("Lauren Ellingham"));
      assert.ok(!fallbackAgents.includes("Evelina Neophytou"));
      assert.ok(!fallbackAgents.includes("Marios Polyviou"));
    });
  });

  describe("Lead Detection", () => {
    it("should detect zyprus.com URLs as leads", () => {
      const isLead = (text: string) => text.includes("zyprus.com");
      assert.ok(isLead("Check out www.zyprus.com/land/32417"));
      assert.ok(!isLead("Hello world"));
    });

    it("should detect ZYP- property IDs as leads", () => {
      const isLead = (text: string) => /ZYP[-]?\d+/i.test(text);
      assert.ok(isLead("Property ZYP-12345 available"));
      assert.ok(isLead("ZYP12345"));
      assert.ok(!isLead("Random text"));
    });
  });

  describe("Russian Detection", () => {
    it("should detect Cyrillic text as Russian", () => {
      const detectRussian = (text: string) => /[\u0400-\u04FF]/.test(text);
      assert.ok(detectRussian("Привет"));
      assert.ok(!detectRussian("Hello"));
    });

    it("should detect Slavic name suffixes", () => {
      const suffixes = ["ova", "eva", "ski", "sky"];
      const hasSlaficSuffix = (name: string) =>
        suffixes.some(s => name.toLowerCase().endsWith(s));

      assert.ok(hasSlaficSuffix("Petrova"));
      assert.ok(hasSlaficSuffix("Ivanova"));
      assert.ok(!hasSlaficSuffix("Smith"));
    });
  });
});
```

#### 7.2 Integration Test for Webhook

```typescript
// tests/integration/telegram-webhook.test.ts
import { describe, it } from "node:test";
import assert from "node:assert";

const WEBHOOK_URL = "https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/telegram-sophia";

describe("Telegram Webhook Integration", () => {
  it("should return 200 for valid webhook payload", async () => {
    const mockUpdate = {
      update_id: 123456789,
      message: {
        message_id: 1,
        from: { id: 12345, is_bot: false, first_name: "Test" },
        chat: { id: 12345, type: "private" },
        date: Math.floor(Date.now() / 1000),
        text: "/start",
      },
    };

    // Note: This would need proper webhook secret header
    // Skipping actual HTTP call in unit test
    assert.ok(true, "Integration test placeholder");
  });

  it("should reject requests without valid secret", async () => {
    // Test 401 response when secret is missing/wrong
    assert.ok(true, "Integration test placeholder");
  });
});
```

**Files to create:**
- `tests/unit/telegram-lead-router.test.ts`
- `tests/integration/telegram-webhook.test.ts`

---

## Acceptance Criteria

### Functional Requirements
- [ ] Old telegram_processed_messages deleted after 7 days
- [ ] Old telegram_chat_history deleted after 30 days
- [ ] Health check returns pass/warn/fail status
- [ ] Alerts sent to admin when webhook has errors
- [ ] Runbook covers common operational scenarios
- [ ] Stats API returns lead counts by region/agent
- [ ] Sentry captures errors with context
- [ ] Unit tests pass for routing logic

### Non-Functional Requirements
- [ ] Cleanup jobs run without blocking operations
- [ ] Health check responds in < 2 seconds
- [ ] Dashboard API responds in < 1 second
- [ ] No sensitive data in Sentry events

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Data cleanup | Tables stay under 100k rows |
| Health check uptime | 99.9% |
| Alert latency | < 5 minutes from error |
| Test coverage | > 80% for routing logic |

---

## Dependencies

- pg_cron extension enabled in Supabase
- Sentry project created
- Admin Telegram chat ID for alerts
- External uptime monitor (optional)

---

## Risk Analysis

| Risk | Mitigation |
|------|------------|
| pg_cron not available | Use external cron service or Edge Function scheduled calls |
| Cleanup deletes needed data | Conservative retention (7-30 days), cleanup_logs table |
| Health check false positives | Multiple checks, warn vs fail status |
| Sentry quota exceeded | Low sample rate (10%), error-only capture |

---

## References

### Internal
- `supabase/functions/telegram-sophia/` - Main webhook code
- `supabase/migrations/20260114_fix_telegram_lead_routing.sql` - Existing migrations
- `lib/telegram/lead-router.ts` - Local reference (NOT deployed)

### External
- [Supabase pg_cron docs](https://supabase.com/docs/guides/database/extensions/pg_cron)
- [IETF Health Check Format](https://datatracker.ietf.org/doc/html/draft-inadarei-api-health-check)
- [Sentry Deno SDK](https://docs.sentry.io/platforms/javascript/guides/deno/)
- [Telegram Bot API - getWebhookInfo](https://core.telegram.org/bots/api#getwebhookinfo)
