# Load Testing

## WhatsApp Concurrent Load Test

Simulates 20 concurrent WhatsApp users sending 3 messages each (60 total requests).

### Prerequisites

```bash
# Set webhook URL (defaults to localhost)
export TEST_WEBHOOK_URL="https://sofiatesting.vercel.app/api/whatsapp/webhook"

# Set webhook secret (must match production)
export WASENDER_WEBHOOK_SECRET="your-secret-here"
```

### Run

```bash
npx tsx tests/load/whatsapp-concurrent.test.ts
```

### Success Criteria

- ≥95% success rate (57/60 requests)
- <5000ms average response time
- All deduplication working (no duplicate processing in logs)
- Circuit breaker not tripping (check logs)
