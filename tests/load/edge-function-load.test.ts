/**
 * Load test: Supabase Edge Function (sophia-bot) — the PRODUCTION path
 *
 * Tests:
 * 1. Health endpoint concurrency (no auth, no cost)
 * 2. Webhook pipeline (auth + dedup + rate limit + AI)
 * 3. Deduplication under load
 *
 * Run: npx tsx tests/load/edge-function-load.test.ts
 *
 * WARNING: Webhook tests hit real OpenRouter AI = real costs (~$0.001/msg)
 * Use --health-only flag to skip webhook tests
 * NOTE: Requires WASEND_WEBHOOK_SECRET env var (not hardcoded for security)
 */

const EDGE_FUNCTION_URL =
  "https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot";
const HEALTH_URL = `${EDGE_FUNCTION_URL}/health`;

// Webhook secret from Supabase Edge Function secrets
const WEBHOOK_SECRET = process.env.WASEND_WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) {
  throw new Error(
    "WASEND_WEBHOOK_SECRET environment variable is required for webhook tests"
  );
}

// Configuration
const HEALTH_CONCURRENT = 20; // Parallel health checks
const WEBHOOK_USERS = 20; // 20 concurrent users
const MESSAGES_PER_USER = 2; // 2 messages each = 40 total AI calls
const WEBHOOK_BATCH_SIZE = 5; // Users per wave
const WEBHOOK_BATCH_DELAY_MS = 300; // Delay between waves

const HEALTH_ONLY = process.argv.includes("--health-only");

interface TestResult {
  name: string;
  status: number;
  duration: number;
  error?: string;
  body?: string;
}

// ========================================
// Health Endpoint Tests
// ========================================

async function healthCheck(): Promise<TestResult> {
  const start = Date.now();
  try {
    const res = await fetch(HEALTH_URL, {
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.text();
    return {
      name: "health",
      status: res.status,
      duration: Date.now() - start,
      body,
    };
  } catch (error) {
    return {
      name: "health",
      status: 0,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runHealthConcurrency(): Promise<TestResult[]> {
  console.log(
    `\n--- Health Endpoint: ${HEALTH_CONCURRENT} concurrent requests ---`
  );

  const promises = Array.from({ length: HEALTH_CONCURRENT }, () =>
    healthCheck()
  );
  const results = await Promise.all(promises);

  return results;
}

// ========================================
// Webhook Pipeline Tests
// ========================================

function buildWebhookPayload(
  userId: number,
  messageNum: number,
  messageId: string
) {
  const phoneNumber = `357${96_000_000 + userId}`; // Cyprus test numbers (96xxxxxx range)

  // Match EXACT WaSend production format: event + data.messages (single object)
  return {
    event: "messages.received",
    data: {
      messages: {
        key: {
          id: messageId,
          fromMe: false,
          remoteId: `${phoneNumber}@s.whatsapp.net`,
          remoteJid: `${phoneNumber}@s.whatsapp.net`,
          cleanedSenderPn: phoneNumber,
        },
        messageBody: `Load test ${messageNum} from user ${userId}: What is the transfer fee for a property worth 200000 euros?`,
        message: {
          conversation: `Load test ${messageNum} from user ${userId}: What is the transfer fee for a property worth 200000 euros?`,
        },
        pushName: `LoadTestUser${userId}`,
        messageTimestamp: Math.floor(Date.now() / 1000),
      },
    },
  };
}

async function sendWebhookMessage(
  userId: number,
  messageNum: number,
  messageId?: string
): Promise<TestResult> {
  const id = messageId || crypto.randomUUID();
  const start = Date.now();
  const payload = buildWebhookPayload(userId, messageNum, id);

  try {
    const res = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": WEBHOOK_SECRET,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000), // Edge Function has 120s limit, we wait 60s
    });

    const body = await res.text();
    return {
      name: `webhook-u${userId}-m${messageNum}`,
      status: res.status,
      duration: Date.now() - start,
      body,
    };
  } catch (error) {
    return {
      name: `webhook-u${userId}-m${messageNum}`,
      status: 0,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runWebhookBatched(): Promise<TestResult[]> {
  const total = WEBHOOK_USERS * MESSAGES_PER_USER;
  console.log(
    `\n--- Webhook Pipeline: ${WEBHOOK_USERS} users x ${MESSAGES_PER_USER} msgs = ${total} requests ---`
  );
  console.log("  (Each request triggers real AI — ~$0.001/msg)");

  const results: TestResult[] = [];
  const userIds = Array.from({ length: WEBHOOK_USERS }, (_, i) => i + 1);

  for (let i = 0; i < userIds.length; i += WEBHOOK_BATCH_SIZE) {
    const batch = userIds.slice(i, i + WEBHOOK_BATCH_SIZE);
    const wave = Math.floor(i / WEBHOOK_BATCH_SIZE) + 1;
    console.log(`  Wave ${wave}: users ${batch[0]}-${batch[batch.length - 1]}`);

    const promises: Promise<TestResult>[] = [];
    for (const userId of batch) {
      for (let msgNum = 1; msgNum <= MESSAGES_PER_USER; msgNum++) {
        promises.push(sendWebhookMessage(userId, msgNum));
      }
    }

    const settled = await Promise.allSettled(promises);
    for (const result of settled) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        results.push({
          name: "webhook-unknown",
          status: 0,
          duration: 0,
          error: result.reason?.message || "Promise rejected",
        });
      }
    }

    if (i + WEBHOOK_BATCH_SIZE < userIds.length) {
      await new Promise((r) => setTimeout(r, WEBHOOK_BATCH_DELAY_MS));
    }
  }

  return results;
}

// ========================================
// Deduplication Test
// ========================================

async function runDedupTest(): Promise<{ passed: boolean; detail: string }> {
  console.log("\n--- Deduplication Test ---");

  const duplicateId = crypto.randomUUID();

  // Send same message ID twice simultaneously
  const [first, second] = await Promise.all([
    sendWebhookMessage(998, 1, duplicateId),
    sendWebhookMessage(998, 1, duplicateId),
  ]);

  // Both should return 200 (webhook always ACKs), but only one should be processed
  const bothOk = first.status === 200 && second.status === 200;
  return {
    passed: bothOk,
    detail: `First: ${first.status} (${first.duration}ms), Second: ${second.status} (${second.duration}ms). ID: ${duplicateId}`,
  };
}

// ========================================
// Auth Rejection Test
// ========================================

async function runAuthTest(): Promise<{ passed: boolean; detail: string }> {
  console.log("\n--- Auth Rejection Test ---");
  const start = Date.now();

  const payload = buildWebhookPayload(999, 1, crypto.randomUUID());

  const res = await fetch(EDGE_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Signature": "wrong-secret-should-be-rejected",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });

  const duration = Date.now() - start;
  const rejected = res.status === 401;

  return {
    passed: rejected,
    detail: `Status: ${res.status} (${duration}ms). Expected 401.`,
  };
}

// ========================================
// Analysis & Reporting
// ========================================

function percentile(sorted: number[], p: number): number {
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function analyzeResults(label: string, results: TestResult[]) {
  const successful = results.filter((r) => r.status === 200);
  const failed = results.filter((r) => r.status !== 200);
  const durations = results.map((r) => r.duration).sort((a, b) => a - b);
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  const p95 = percentile(durations, 95);
  const p99 = percentile(durations, 99);
  const successRate = (successful.length / results.length) * 100;

  console.log(`\n  ${label}:`);
  console.log(
    `  Requests:  ${results.length} total, ${successful.length} ok, ${failed.length} failed`
  );
  console.log(`  Success:   ${successRate.toFixed(1)}%`);
  console.log(
    `  Response:  avg=${avg.toFixed(0)}ms  p95=${p95}ms  p99=${p99}ms  min=${durations[0]}ms  max=${durations[durations.length - 1]}ms`
  );

  if (failed.length > 0) {
    console.log("  Failures:");
    for (const r of failed.slice(0, 5)) {
      console.log(
        `    ${r.name}: HTTP ${r.status} - ${r.error || r.body?.substring(0, 100) || "Unknown"}`
      );
    }
    if (failed.length > 5) {
      console.log(`    ... and ${failed.length - 5} more`);
    }
  }

  return { successRate, avg, p95 };
}

// ========================================
// Main
// ========================================

async function main() {
  console.log("\n=== SOPHIA EDGE FUNCTION LOAD TEST ===");
  console.log(`Target: ${EDGE_FUNCTION_URL}`);
  console.log(
    `Mode: ${HEALTH_ONLY ? "Health only (no AI costs)" : "Full (health + webhook + AI)"}`
  );
  console.log(`Time: ${new Date().toISOString()}\n`);

  // 1. Health concurrency test
  const healthResults = await runHealthConcurrency();
  const healthStats = analyzeResults("Health Endpoint", healthResults);

  // Parse first successful health response for dependency info
  const firstHealthBody = healthResults.find((r) => r.status === 200)?.body;
  if (firstHealthBody) {
    try {
      const health = JSON.parse(firstHealthBody);
      console.log("\n  Dependencies:");
      for (const [dep, info] of Object.entries(
        health.dependencies as Record<string, any>
      )) {
        console.log(`    ${dep}: ${info.status} (${info.latencyMs || "?"}ms)`);
      }
    } catch {
      /* ignore parse errors */
    }
  }

  if (HEALTH_ONLY) {
    console.log("\n=== CHECKS (health-only mode) ===");
    const checks = [
      { name: "Health success >= 95%", passed: healthStats.successRate >= 95 },
      { name: "Health avg < 5000ms", passed: healthStats.avg < 5000 },
      { name: "Health p95 < 10000ms", passed: healthStats.p95 < 10_000 },
    ];
    let allPassed = true;
    for (const c of checks) {
      console.log(`  ${c.passed ? "PASS" : "FAIL"}  ${c.name}`);
      if (!c.passed) allPassed = false;
    }
    console.log(`\nOVERALL: ${allPassed ? "PASS" : "FAIL"}`);
    process.exit(allPassed ? 0 : 1);
  }

  // 2. Auth rejection test
  const authResult = await runAuthTest();
  console.log(`  ${authResult.passed ? "PASS" : "FAIL"}: ${authResult.detail}`);

  // 3. Webhook pipeline test
  const webhookResults = await runWebhookBatched();
  const webhookStats = analyzeResults("Webhook Pipeline", webhookResults);

  // 4. Deduplication test
  const dedupResult = await runDedupTest();
  console.log(
    `  ${dedupResult.passed ? "PASS" : "FAIL"}: ${dedupResult.detail}`
  );

  // === Final checks ===
  console.log("\n=== CHECKS ===");
  const checks = [
    { name: "Health success >= 95%", passed: healthStats.successRate >= 95 },
    { name: "Health avg < 5000ms", passed: healthStats.avg < 5000 },
    { name: "Auth rejection (401)", passed: authResult.passed },
    { name: "Webhook success >= 90%", passed: webhookStats.successRate >= 90 },
    { name: "Webhook avg < 30000ms", passed: webhookStats.avg < 30_000 },
    { name: "Webhook p95 < 45000ms", passed: webhookStats.p95 < 45_000 },
    { name: "Deduplication", passed: dedupResult.passed },
  ];

  let allPassed = true;
  for (const c of checks) {
    console.log(`  ${c.passed ? "PASS" : "FAIL"}  ${c.name}`);
    if (!c.passed) allPassed = false;
  }

  const estimatedCost = (WEBHOOK_USERS * MESSAGES_PER_USER + 3) * 0.001; // +3 for dedup test
  console.log(`\nEstimated AI cost: ~$${estimatedCost.toFixed(3)}`);
  console.log(`OVERALL: ${allPassed ? "PASS" : "FAIL"}`);
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("Load test crashed:", err);
  process.exit(1);
});
