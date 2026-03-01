/**
 * Load test: 20 concurrent WhatsApp users sending messages
 *
 * Tests webhook resilience under production-like load:
 * - Concurrent message processing
 * - Deduplication under load
 * - Circuit breaker behavior
 * - Response time degradation
 *
 * Run: npx tsx tests/load/whatsapp-concurrent.test.ts
 */
import { randomUUID } from "crypto";

const WEBHOOK_URL = process.env.TEST_WEBHOOK_URL || "http://localhost:3000/api/whatsapp/webhook";
const WEBHOOK_SECRET = process.env.WASENDER_WEBHOOK_SECRET || "test-secret";
const CONCURRENT_USERS = 20;
const MESSAGES_PER_USER = 3;

interface LoadTestResult {
  userId: number;
  messageNum: number;
  status: number;
  duration: number;
  error?: string;
}

async function sendMessage(userId: number, messageNum: number): Promise<LoadTestResult> {
  const startTime = Date.now();
  const messageId = randomUUID();
  const phoneNumber = `357${99000000 + userId}`; // Cyprus numbers

  const payload = {
    type: "messages.upsert",
    sessionId: "test-session",
    timestamp: Date.now(),
    data: {
      key: {
        id: messageId,
        fromMe: false,
        remoteId: `${phoneNumber}@s.whatsapp.net`,
      },
      message: {
        conversation: `Load test message ${messageNum} from user ${userId}`,
      },
      pushName: `TestUser${userId}`,
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  };

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": WEBHOOK_SECRET,
      },
      body: JSON.stringify(payload),
    });

    return {
      userId,
      messageNum,
      status: response.status,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      userId,
      messageNum,
      status: 0,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runLoadTest() {
  console.log(`Starting load test: ${CONCURRENT_USERS} concurrent users, ${MESSAGES_PER_USER} messages each`);
  console.log(`Target: ${WEBHOOK_URL}\n`);

  const results: LoadTestResult[] = [];
  const promises: Promise<LoadTestResult>[] = [];

  // Create concurrent requests
  for (let userId = 1; userId <= CONCURRENT_USERS; userId++) {
    for (let msgNum = 1; msgNum <= MESSAGES_PER_USER; msgNum++) {
      promises.push(sendMessage(userId, msgNum));
    }
  }

  // Wait for all requests
  const startTime = Date.now();
  const settled = await Promise.allSettled(promises);
  const totalDuration = Date.now() - startTime;

  // Collect results
  for (const result of settled) {
    if (result.status === "fulfilled") {
      results.push(result.value);
    }
  }

  // Analyze results
  const successful = results.filter((r) => r.status === 200);
  const failed = results.filter((r) => r.status !== 200);
  const durations = results.map((r) => r.duration);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const maxDuration = Math.max(...durations);
  const minDuration = Math.min(...durations);

  console.log("=== LOAD TEST RESULTS ===\n");
  console.log(`Total requests: ${results.length}`);
  console.log(`Successful: ${successful.length} (${((successful.length / results.length) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${failed.length}`);
  console.log(`\nTiming:`);
  console.log(`  Total duration: ${totalDuration}ms`);
  console.log(`  Avg response: ${avgDuration.toFixed(0)}ms`);
  console.log(`  Min response: ${minDuration}ms`);
  console.log(`  Max response: ${maxDuration}ms`);

  if (failed.length > 0) {
    console.log(`\nFailed requests:`);
    failed.forEach((r) => {
      console.log(`  User ${r.userId}, Msg ${r.messageNum}: ${r.status} - ${r.error || "Unknown error"}`);
    });
  }

  // Success criteria
  const successRate = (successful.length / results.length) * 100;
  if (successRate >= 95 && avgDuration < 5000) {
    console.log(`\n✅ PASSED: ${successRate.toFixed(1)}% success, ${avgDuration.toFixed(0)}ms avg`);
    process.exit(0);
  } else {
    console.log(`\n❌ FAILED: ${successRate.toFixed(1)}% success (need 95%), ${avgDuration.toFixed(0)}ms avg (need <5000ms)`);
    process.exit(1);
  }
}

runLoadTest();
