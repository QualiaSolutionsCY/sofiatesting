/**
 * SOPHIA Telegram Bot - Supabase Edge Function
 * Handles Telegram webhook events and responds with AI
 *
 * Features:
 * - Webhook validation
 * - Message deduplication
 * - Conversation history
 * - OpenRouter AI (Gemini 3 Flash)
 * - Typing indicators
 * - Long message splitting
 * - Group lead routing (forwards leads to agents)
 * - Agent registration (/register command)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { sendMessage, sendLongMessage, sendChatAction } from "./telegram-client.ts";
import {
  getHistory,
  addMessage,
  claimMessage,
  clearHistory,
  findAgentByPhone,
  registerAgentTelegram,
  getAgentByTelegramId,
  getRegistrationState,
  setRegistrationState,
  clearRegistrationState,
} from "./database.ts";
import { SYSTEM_PROMPT, getDateContext } from "./prompts.ts";
import { handleGroupMessage, isGroupChat } from "./lead-router.ts";
import type { TelegramMessage, TelegramUpdate } from "./types.ts";

// Environment variables
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");

// Validate critical environment variables
if (!TELEGRAM_BOT_TOKEN) {
  console.error("CRITICAL: TELEGRAM_BOT_TOKEN is not set");
}
if (!OPENROUTER_API_KEY) {
  console.error("CRITICAL: OPENROUTER_API_KEY is not set");
}

// OpenRouter API configuration
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const AI_MODEL = "google/gemini-3-flash-preview";

/**
 * Main webhook handler
 */
serve(async (req: Request): Promise<Response> => {
  // CORS headers for preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type, X-Telegram-Bot-Api-Secret-Token",
      },
    });
  }

  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // 1. Validate webhook secret - if configured
    // For now, make validation optional while debugging secret sync issues
    const token = req.headers.get("x-telegram-bot-api-secret-token");
    if (TELEGRAM_WEBHOOK_SECRET && token !== TELEGRAM_WEBHOOK_SECRET) {
      console.error("[Webhook] Invalid secret token", {
        hasToken: !!token,
        expectedSecret: TELEGRAM_WEBHOOK_SECRET?.substring(0, 5) + "...",
        receivedToken: token?.substring(0, 5) + "...",
        timestamp: new Date().toISOString(),
      });
      return new Response("Unauthorized", { status: 401 });
    }

    // 2. Parse update
    const update: TelegramUpdate = await req.json();
    const message = update.message;

    // 3. Validate message
    if (!message) {
      return jsonResponse({ ok: true, reason: "no_message" });
    }

    if (!message.from || message.from.is_bot) {
      return jsonResponse({ ok: true, reason: "bot_or_no_sender" });
    }

    if (!message.text) {
      // Non-text message - send helpful response
      await sendMessage(
        message.chat.id,
        "I can only process text messages at the moment. Please send me a text question about Cyprus real estate!"
      );
      return jsonResponse({ ok: true, reason: "non_text" });
    }

    // 4. Handle group chats - route to lead router
    if (isGroupChat(message.chat.type)) {
      console.log(`[Webhook] Group message from "${message.chat.title}"`);
      // Process group message for lead routing (fire-and-forget)
      handleGroupMessage(message).catch((error) => {
        console.error("[Webhook] handleGroupMessage error:", error);
      });
      return jsonResponse({ ok: true, reason: "group_message_routed" });
    }

    // 5. Generate message key for deduplication
    const messageKey = `tg_${message.chat.id}_${message.message_id}`;

    // 6. Claim message (atomic deduplication)
    const claimed = await claimMessage(messageKey, message.from.id);
    if (!claimed) {
      console.log("[Webhook] Duplicate message, skipping:", messageKey);
      return jsonResponse({ ok: true, reason: "duplicate" });
    }

    // 7. Process message asynchronously
    // We don't await - return 200 immediately to prevent Telegram timeout
    processMessage(message).catch((error) => {
      console.error("[Webhook] processMessage error:", error);
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("[Webhook] Error:", error);
    // Always return 200 to prevent Telegram retries
    return jsonResponse({ ok: true, error: String(error) });
  }
});

/**
 * Process a Telegram message
 */
const processMessage = async (message: TelegramMessage): Promise<void> => {
  const chatId = message.chat.id;
  const userId = message.from!.id;
  const text = message.text!;
  const firstName = message.from?.first_name || "there";

  console.log(`[Process] User ${userId}: "${text.substring(0, 50)}..."`);

  // Handle commands
  const command = text.split(" ")[0].toLowerCase();

  if (command === "/start") {
    await handleStartCommand(chatId, firstName);
    return;
  }

  if (command === "/help") {
    await handleHelpCommand(chatId);
    return;
  }

  if (command === "/clear") {
    await handleClearCommand(chatId, userId);
    return;
  }

  if (command === "/register") {
    await handleRegisterCommand(chatId, userId);
    return;
  }

  // Check if user is in registration flow (waiting for phone number)
  // Uses database-backed state instead of in-memory Map (survives cold starts)
  const regState = await getRegistrationState(userId);
  if (regState && regState.step === "awaiting_phone") {
    await handlePhoneRegistration(chatId, userId, text);
    return;
  }

  // Regular message - process with AI
  await processAIMessage(chatId, userId, text, message.message_id, firstName);
};

/**
 * Handle /start command
 */
const handleStartCommand = async (chatId: number, firstName: string): Promise<void> => {
  const welcomeMessage = `Hi ${firstName}! I'm SOPHIA from Zyprus Property Group.

Ask me about Cyprus property, PR programs, taxes, or areas. What do you need?`;

  await sendMessage(chatId, welcomeMessage);
};

/**
 * Handle /help command
 */
const handleHelpCommand = async (chatId: number): Promise<void> => {
  const helpMessage = `I can answer questions about:
- PR programs & investment
- VAT, transfer fees, taxes
- Areas (Limassol, Paphos, Larnaca...)

Commands: /start /help /clear /register

Just ask your question!`;

  await sendMessage(chatId, helpMessage);
};

/**
 * Handle /register command (for agents to link Telegram ID)
 */
const handleRegisterCommand = async (chatId: number, userId: number): Promise<void> => {
  // Check if already registered
  const existingAgent = await getAgentByTelegramId(userId);
  if (existingAgent) {
    await sendMessage(
      chatId,
      `You're already registered as ${existingAgent.full_name} (${existingAgent.region} ${existingAgent.role}).\n\nYou will receive lead forwards from Zyprus groups.`
    );
    return;
  }

  // Set registration state in database (persists across cold starts)
  await setRegistrationState(userId, "awaiting_phone");

  await sendMessage(
    chatId,
    `To register as a Zyprus agent, please send your phone number.\n\nFormat: +35799XXXXXX\n\nThis will link your Telegram account so you can receive lead forwards from Zyprus groups.`
  );
};

/**
 * Handle phone number submission for registration
 */
const handlePhoneRegistration = async (
  chatId: number,
  userId: number,
  phoneInput: string
): Promise<void> => {
  // Clean up registration state from database
  await clearRegistrationState(userId);

  // Normalize phone number
  let phone = phoneInput.trim().replace(/\s/g, "");
  if (!phone.startsWith("+")) {
    phone = "+" + phone;
  }

  // Basic validation
  if (!/^\+\d{10,15}$/.test(phone)) {
    await sendMessage(
      chatId,
      `Invalid phone format. Please use: +35799XXXXXX\n\nSend /register to try again.`
    );
    return;
  }

  // Look up agent by phone
  const agent = await findAgentByPhone(phone);
  if (!agent) {
    await sendMessage(
      chatId,
      `No agent found with phone number ${phone}.\n\nPlease make sure you're using the same phone number registered in the Zyprus system. Contact management if you need to update your phone number.`
    );
    return;
  }

  // Check if agent already has a different Telegram ID
  if (agent.telegram_user_id && agent.telegram_user_id !== userId) {
    await sendMessage(
      chatId,
      `This phone number is already linked to another Telegram account.\n\nPlease contact management if you need to update your registration.`
    );
    return;
  }

  // Register the Telegram ID
  const success = await registerAgentTelegram(agent.id, userId);
  if (!success) {
    await sendMessage(
      chatId,
      `Registration failed due to a technical error. Please try again later or contact support.`
    );
    return;
  }

  // Success!
  await sendMessage(
    chatId,
    `✓ Registered successfully!\n\nYou are now linked as:\n• ${agent.full_name}\n• ${agent.region} ${agent.role}\n\nYou will receive lead forwards from Zyprus Telegram groups.`
  );

  console.log(`[Register] Agent ${agent.full_name} registered with Telegram ID ${userId}`);
};

/**
 * Handle /clear command
 */
const handleClearCommand = async (chatId: number, userId: number): Promise<void> => {
  const success = await clearHistory(userId);

  if (success) {
    await sendMessage(chatId, "Conversation cleared! Feel free to start fresh.");
  } else {
    await sendMessage(chatId, "Conversation cleared. How can I help you?");
  }
};

/**
 * Process message with AI
 */
const processAIMessage = async (
  chatId: number,
  userId: number,
  userText: string,
  messageId: number,
  firstName: string
): Promise<void> => {
  try {
    // 1. Show typing indicator
    await sendChatAction(chatId);

    // 2. Get conversation history
    const history = await getHistory(userId);

    // 3. Save user message to history
    await addMessage(userId, "user", userText);

    // 4. Build messages for OpenRouter
    const systemPromptWithContext = SYSTEM_PROMPT + "\n\n" + getDateContext() + `\n\nCurrent user: ${firstName}`;

    const openrouterMessages = [
      { role: "system", content: systemPromptWithContext },
      ...history.map((msg) => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      })),
      { role: "user", content: userText },
    ];

    // 5. Call OpenRouter API
    const aiResponse = await callOpenRouter(openrouterMessages);

    if (!aiResponse) {
      await sendMessage(
        chatId,
        "I'm having trouble connecting right now. Please try again in a moment.",
        messageId
      );
      return;
    }

    // 6. Save assistant response to history
    await addMessage(userId, "assistant", aiResponse);

    // 7. Send response (split if needed)
    await sendLongMessage(chatId, aiResponse, messageId);

    console.log(`[Process] Response sent to user ${userId}, length: ${aiResponse.length}`);
  } catch (error) {
    console.error("[Process] AI processing error:", error);
    await sendMessage(
      chatId,
      "Sorry, I encountered an error. Please try again.",
      messageId
    );
  }
};

/**
 * Call OpenRouter API for AI response
 */
const callOpenRouter = async (
  messages: Array<{ role: string; content: string }>
): Promise<string | null> => {
  const MAX_RETRIES = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://sophia-telegram.zyprus.com",
          "X-Title": "SOPHIA Telegram Bot",
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages,
          temperature: 0.7,
          max_tokens: 4096,
        }),
      });

      if (response.status === 429) {
        // Rate limited - wait and retry
        const retryAfter = parseInt(response.headers.get("retry-after") || "5");
        console.log(`[OpenRouter] Rate limited, waiting ${retryAfter}s...`);
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[OpenRouter] Error ${response.status}:`, errorText);
        lastError = new Error(`OpenRouter API error: ${response.status}`);
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        console.error("[OpenRouter] No content in response:", data);
        lastError = new Error("No content in AI response");
        continue;
      }

      return content;
    } catch (error) {
      console.error(`[OpenRouter] Attempt ${attempt + 1} failed:`, error);
      lastError = error as Error;

      // Wait before retry (exponential backoff)
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  console.error("[OpenRouter] All attempts failed:", lastError);
  return null;
};

/**
 * Helper to create JSON response
 */
const jsonResponse = (data: Record<string, unknown>): Response => {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
};
