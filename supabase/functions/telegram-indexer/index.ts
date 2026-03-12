/**
 * Telegram Group Message Indexer
 *
 * Receives webhook updates from the Telegram Bot API and indexes
 * messages from regional groups into `telegram_group_messages`.
 * The call-audit pipeline searches this table to check if a phone
 * number has already been posted in a group.
 *
 * Setup:
 *   1. Deploy: supabase functions deploy telegram-indexer --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx
 *   2. Set webhook: curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/telegram-indexer"
 *   3. Disable privacy mode: BotFather -> /setprivacy -> Disable
 *   4. Add bot to each regional group
 */

import { getSupabaseAdmin } from "../_shared/db.ts";
import { REGIONAL_GROUP_IDS, ZYPRESS_OTHERS_CHAT_ID } from "../_shared/telegram-search.ts";

// All group IDs we want to index (regional + others)
const INDEXED_GROUP_IDS = new Set([
  ...Object.values(REGIONAL_GROUP_IDS),
  ZYPRESS_OTHERS_CHAT_ID,
]);

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: {
      id: number;
      title?: string;
      type: string;
    };
    from?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    date: number;
    text?: string;
    caption?: string;
  };
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // GET ?setup — registers this function as the Telegram webhook (requires secret)
  if (req.method === "GET" && url.searchParams.has("setup")) {
    const secret = url.searchParams.get("secret");
    const expected = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
    if (!secret || secret !== expected) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    }
    const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN not set" }), { status: 500 });
    }
    const webhookUrl = `https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/telegram-indexer`;
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
    const data = await res.json();
    return new Response(JSON.stringify(data), { status: 200 });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  try {
    const update: TelegramUpdate = await req.json();
    const msg = update.message;

    // Only index text messages from monitored groups
    if (!msg || !INDEXED_GROUP_IDS.has(msg.chat.id)) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const text = msg.text || msg.caption || "";
    if (!text.trim()) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const senderName = [msg.from?.first_name, msg.from?.last_name]
      .filter(Boolean)
      .join(" ") || null;

    const supabase = getSupabaseAdmin();

    await supabase.from("telegram_group_messages").upsert(
      {
        group_chat_id: msg.chat.id,
        group_name: msg.chat.title || "Unknown",
        message_id: msg.message_id,
        sender_telegram_id: msg.from?.id || null,
        sender_name: senderName,
        message_text: text,
        message_date: new Date(msg.date * 1000).toISOString(),
      },
      { onConflict: "group_chat_id,message_id" }
    );

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch {
    // Always return 200 to Telegram — retries cause duplicate processing
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
});
