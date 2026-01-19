#!/bin/bash
# Set Telegram webhook to point to telegram-bot Edge Function
# Usage: TELEGRAM_BOT_TOKEN=your_token ./scripts/set-telegram-webhook.sh

if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    echo "Error: TELEGRAM_BOT_TOKEN not set"
    echo "Usage: TELEGRAM_BOT_TOKEN=your_token ./scripts/set-telegram-webhook.sh"
    exit 1
fi

WEBHOOK_URL="https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/telegram-bot"

echo "Setting Telegram webhook to: $WEBHOOK_URL"

curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
    -H "Content-Type: application/json" \
    -d "{\"url\":\"${WEBHOOK_URL}\",\"allowed_updates\":[\"message\",\"edited_message\"]}" | jq .

echo ""
echo "Verifying webhook..."
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo" | jq .
