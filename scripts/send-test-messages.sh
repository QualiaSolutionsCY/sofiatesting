#!/bin/bash
# Send test messages to all registered agents
# Usage: ./scripts/send-test-messages.sh YOUR_BOT_TOKEN

BOT_TOKEN="$1"

if [ -z "$BOT_TOKEN" ]; then
  echo "Usage: ./scripts/send-test-messages.sh YOUR_TELEGRAM_BOT_TOKEN"
  echo ""
  echo "Get your bot token from Supabase Dashboard > Edge Functions > Secrets"
  exit 1
fi

# Agent Telegram IDs and names
declare -A agents=(
  ["7894947182"]="Qualia Admin"
  ["6766766478"]="Lauren Ellingham"
  ["5744796857"]="Charalambos Pitros"
  ["5474905262"]="Marios Azinas"
  ["6361990395"]="Dimitris Panayiotou"
  ["6186532033"]="Evelina Neophytou"
  ["6294797269"]="Marios Polyviou"
  ["890109914"]="Narine Akopyan"
)

echo "🤖 Sending test messages to ${#agents[@]} agents..."
echo ""

for chat_id in "${!agents[@]}"; do
  name="${agents[$chat_id]}"

  # Create message
  message="👋 Hi ${name}!

I'm SOPHIA, the Zyprus AI assistant.

This is a test message to confirm your Telegram is connected to the lead routing system.

When leads come in from Zyprus groups with property links, I'll forward them directly to you here.

✅ Your connection is working!"

  echo "📤 Sending to $name ($chat_id)..."

  response=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{\"chat_id\": \"$chat_id\", \"text\": $(echo "$message" | jq -Rs .)}")

  if echo "$response" | grep -q '"ok":true'; then
    echo "   ✅ Sent successfully"
  else
    error=$(echo "$response" | jq -r '.description // "Unknown error"')
    echo "   ❌ Failed: $error"
  fi

  # Small delay to avoid rate limiting
  sleep 0.5
done

echo ""
echo "✨ Done!"
