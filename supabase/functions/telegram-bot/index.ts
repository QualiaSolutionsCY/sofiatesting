/**
 * Telegram Bot Edge Function
 *
 * SOPHIA on Telegram - uses shared infrastructure from _shared/
 *
 * Enable/Disable via Supabase secrets:
 *   supabase secrets set SOPHIA_TELEGRAM_ENABLED=true --project-ref vceeheaxcrhmpqueudqx
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Shared imports
import { SYSTEM_PROMPT } from "../_shared/prompts.ts";
import { getHistory, addMessage, claimMessageForProcessing } from "../_shared/db.ts";
import { getToolDefinitions } from "../_shared/tools.ts";
import {
  handleCalculateVAT,
  handleCalculateTransferFees,
  handleCalculateCapitalGains,
} from "../_shared/tools.ts";

// Telegram adapter
import {
  parseTelegramMessage,
  getTelegramMessageKey,
  sendTelegramResponse,
  sendTelegramTyping,
  type TelegramUpdate,
} from "../_shared/adapters/telegram.ts";

// Agent identification (from sophia-bot)
import { identifyAgentByPhone, type Agent } from "../sophia-bot/agents/identifier.ts";

// Environment variables
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const SOPHIA_TELEGRAM_ENABLED = Deno.env.get("SOPHIA_TELEGRAM_ENABLED") === "true";

// AI model
const AI_MODEL = "google/gemini-2.0-flash-001";

/**
 * Main handler
 */
serve(async (req: Request) => {
  // Only allow POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Check if Telegram is enabled
  if (!SOPHIA_TELEGRAM_ENABLED) {
    console.log("[Telegram] SOPHIA_TELEGRAM_ENABLED is false, ignoring webhook");
    return new Response("OK", { status: 200 });
  }

  // Validate required env vars
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("[Telegram] TELEGRAM_BOT_TOKEN not set");
    return new Response("Configuration error", { status: 500 });
  }

  if (!OPENROUTER_API_KEY) {
    console.error("[Telegram] OPENROUTER_API_KEY not set");
    return new Response("Configuration error", { status: 500 });
  }

  try {
    // Parse the Telegram update
    const update: TelegramUpdate = await req.json();
    console.log("[Telegram] Received update:", JSON.stringify(update).substring(0, 200));

    // Parse into unified message
    const message = await parseTelegramMessage(update, TELEGRAM_BOT_TOKEN);
    if (!message) {
      console.log("[Telegram] Could not parse message from update");
      return new Response("OK", { status: 200 });
    }

    // Deduplication check
    const messageKey = getTelegramMessageKey(update);
    const claimed = await claimMessageForProcessing(messageKey, message.senderPhone);
    if (!claimed) {
      console.log("[Telegram] Message already processed:", messageKey);
      return new Response("OK", { status: 200 });
    }

    // Extract chat ID for responses
    const chatId = update.message?.chat.id || update.edited_message?.chat.id;
    if (!chatId) {
      console.log("[Telegram] No chat ID found");
      return new Response("OK", { status: 200 });
    }

    // Send typing indicator
    await sendTelegramTyping(chatId, TELEGRAM_BOT_TOKEN);

    // Identify the agent (using phone number from Telegram contact or user ID)
    const agent = await identifyAgentByPhone(message.senderPhone, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    console.log("[Telegram] Identified agent:", agent?.fullName || "Unknown");

    // Get conversation history
    const history = await getHistory(message.conversationId);

    // Build system prompt with agent context
    let systemPrompt = SYSTEM_PROMPT;
    if (agent) {
      systemPrompt += `\n\n---\n## CURRENT SENDER IDENTIFICATION\n`;
      systemPrompt += `Phone/ID: ${message.senderPhone}\n`;
      systemPrompt += `Identified Agent: ${agent.fullName}\n`;
      systemPrompt += `Email: ${agent.communicationEmail}\n`;
      systemPrompt += `Region: ${agent.region}\n`;
      systemPrompt += `Can Upload: ${agent.canUpload ? "Yes" : "No"}\n`;
      systemPrompt += `Channel: telegram\n`;
    } else {
      systemPrompt += `\n\n---\n## CURRENT SENDER IDENTIFICATION\n`;
      systemPrompt += `Phone/ID: ${message.senderPhone}\n`;
      systemPrompt += `Identified Agent: Unknown - not in agent database\n`;
      systemPrompt += `Channel: telegram\n`;
    }

    // Build user content
    let userContent = message.text || "";
    if (message.images && message.images.length > 0) {
      userContent += `\n\n[User sent ${message.images.length} image(s)]`;
      for (const img of message.images) {
        if (img.caption) {
          userContent += `\nCaption: ${img.caption}`;
        }
      }
    }

    // Store user message
    await addMessage(message.conversationId, "user", userContent);

    // Build messages for OpenRouter
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map((msg: { role: string; parts: Array<{ text: string }> }) => ({
        role: msg.role === "model" ? "assistant" : "user",
        content: msg.parts.map(p => p.text).join(""),
      })),
      { role: "user", content: userContent },
    ];

    // Call OpenRouter
    const response = await callOpenRouter(messages, getToolDefinitions());

    // Process response with tool handling
    const aiResponse = await processAIResponse(response, { agent }, messages);

    // Store AI response
    await addMessage(message.conversationId, "model", aiResponse);

    // Send response via Telegram
    await sendTelegramResponse(chatId, { text: aiResponse }, TELEGRAM_BOT_TOKEN);

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[Telegram] Error:", error);
    return new Response("Internal error", { status: 500 });
  }
});

/**
 * Call OpenRouter API
 */
interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
  }>;
}

const callOpenRouter = async (
  messages: Array<{ role: string; content: string }>,
  tools: ReturnType<typeof getToolDefinitions>
): Promise<OpenRouterResponse> => {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://zyprus.com",
      "X-Title": "SOPHIA AI - Telegram",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages,
      tools: tools.map(t => ({
        type: t.type,
        function: t.function,
      })),
      tool_choice: "auto",
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  return response.json();
};

/**
 * Process AI response with tool handling
 */
interface ToolContext {
  agent: Agent | null;
}

const processAIResponse = async (
  response: OpenRouterResponse,
  context: ToolContext,
  messages: Array<{ role: string; content: string }>,
  depth = 0
): Promise<string> => {
  // Prevent infinite loops
  if (depth > 5) {
    return "I apologize, but I encountered too many steps. Please try a simpler query.";
  }

  const choice = response.choices[0];
  if (!choice) {
    return "I didn't receive a valid response. Please try again.";
  }

  const { message } = choice;

  // If no tool calls, return the content
  if (!message.tool_calls || message.tool_calls.length === 0) {
    return message.content || "I'm not sure how to respond to that.";
  }

  // Process tool calls
  const toolResults: Array<{ role: string; content: string; tool_call_id: string }> = [];

  for (const toolCall of message.tool_calls) {
    const { name, arguments: argsString } = toolCall.function;
    let args: Record<string, unknown>;

    try {
      args = JSON.parse(argsString);
    } catch {
      toolResults.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify({ error: "Invalid tool arguments" }),
      });
      continue;
    }

    // Execute the tool
    const result = await executeTool(name, args, context);
    toolResults.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: JSON.stringify(result),
    });
  }

  // Build new messages array with tool results
  const newMessages = [
    ...messages,
    {
      role: "assistant",
      content: message.content || "",
      tool_calls: message.tool_calls,
    },
    ...toolResults,
  ];

  // Call OpenRouter again with tool results
  const followUpResponse = await callOpenRouter(
    newMessages as Array<{ role: string; content: string }>,
    getToolDefinitions()
  );

  // Recursively process the follow-up response
  return processAIResponse(followUpResponse, context, newMessages as Array<{ role: string; content: string }>, depth + 1);
};

/**
 * Execute a tool
 * For now, only calculator tools are supported on Telegram
 * Property listing tools require more complex handling (images, DOCX, etc.)
 */
const executeTool = async (
  name: string,
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<{ success?: boolean; error?: string; message?: string; data?: unknown }> => {
  console.log(`[Telegram] Executing tool: ${name}`);

  switch (name) {
    case "calculateVAT":
      return handleCalculateVAT(args);

    case "calculateTransferFees":
      return handleCalculateTransferFees(args);

    case "calculateCapitalGains":
      return handleCalculateCapitalGains(args);

    case "createPropertyListing":
      // Property listing not yet supported on Telegram
      return {
        error: "Property listing uploads are currently only available on WhatsApp. Please use WhatsApp to create property listings.",
        message: "Property listing creation is not available on Telegram yet. Please use WhatsApp to upload property listings.",
      };

    case "getZyprusData":
      // Taxonomy lookup not yet implemented on Telegram
      return {
        error: "This feature is currently only available on WhatsApp.",
        message: "Taxonomy lookup is not available on Telegram yet.",
      };

    default:
      return { error: `Unknown tool: ${name}` };
  }
};
