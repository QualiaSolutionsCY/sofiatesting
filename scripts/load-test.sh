#!/bin/bash
# Load test runner for sofiatesting WhatsApp webhook
# Starts dev server in test mode, runs load test, kills server
set -e

PORT=${LOAD_TEST_PORT:-3099}
WEBHOOK_URL="http://localhost:${PORT}/api/whatsapp/webhook"

echo "Starting dev server in test mode on port ${PORT}..."
cd "$(dirname "$0")/.."

# Set webhook secret for both server and test (skip if already in .env.local)
export WASENDER_WEBHOOK_SECRET="${WASENDER_WEBHOOK_SECRET:-test-secret}"

# Kill anything already on our port
lsof -ti:${PORT} 2>/dev/null | xargs -r kill 2>/dev/null || true

PLAYWRIGHT=1 npx next dev --turbo --port ${PORT} &
DEV_PID=$!

# Wait for server to be ready
echo "Waiting for server startup..."
for i in {1..30}; do
  if curl -s -o /dev/null -w "" "http://localhost:${PORT}" 2>/dev/null; then
    echo "Server ready on port ${PORT}."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Server failed to start after 30s"
    kill $DEV_PID 2>/dev/null
    exit 1
  fi
  sleep 1
done

# Run load test
echo ""
TEST_WEBHOOK_URL="${WEBHOOK_URL}" npx tsx tests/load/whatsapp-concurrent.test.ts
EXIT_CODE=$?

# Cleanup
kill $DEV_PID 2>/dev/null
wait $DEV_PID 2>/dev/null || true

exit $EXIT_CODE
