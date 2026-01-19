/**
 * Shared Message Handler
 *
 * The "brain" of SOPHIA - processes UnifiedMessage and returns UnifiedResponse.
 * Used by all channels (WhatsApp, Telegram, Web).
 */

import type { UnifiedMessage, UnifiedResponse, Agent, ChatMessage } from "./adapters/types.ts";
import { SYSTEM_PROMPT } from "./prompts.ts";
import { getToolDefinitions } from "./tools.ts";
import { getHistory, addMessage } from "./db.ts";
import {
  handleCalculateVAT,
  handleCalculateTransferFees,
  handleCalculateCapitalGains,
} from "./tools.ts";

/**
 * Configuration for the message handler
 */
export interface HandlerConfig {
  openRouterApiKey: string;
  supabaseUrl: string;
  supabaseKey: string;
  model?: string;
}

/**
 * Context passed to tool executors
 */
export interface ToolContext {
  agent: Agent | null;
  supabaseUrl: string;
  supabaseKey: string;
}

/**
 * Process a message and return a response
 */
export const handleMessage = async (
  message: UnifiedMessage,
  agent: Agent | null,
  config: HandlerConfig
): Promise<UnifiedResponse> => {
  const { openRouterApiKey, supabaseUrl, supabaseKey } = config;
  const model = config.model || "google/gemini-2.0-flash-001";

  try {
    // Get conversation history
    const history = await getHistory(message.conversationId);

    // Build the message content
    let userContent = message.text || "";

    // Add image descriptions if present
    if (message.images && message.images.length > 0) {
      userContent += `\n\n[User sent ${message.images.length} image(s)]`;
      for (const img of message.images) {
        if (img.caption) {
          userContent += `\nCaption: ${img.caption}`;
        }
      }
    }

    // Add document info if present
    if (message.documents && message.documents.length > 0) {
      userContent += `\n\n[User sent ${message.documents.length} document(s)]`;
      for (const doc of message.documents) {
        userContent += `\nFilename: ${doc.filename}`;
      }
    }

    // Store user message
    await addMessage(message.conversationId, "user", userContent);

    // Build system prompt with agent context
    let systemPrompt = SYSTEM_PROMPT;
    if (agent) {
      systemPrompt += `\n\n---\n## CURRENT SENDER IDENTIFICATION\n`;
      systemPrompt += `Phone: ${message.senderPhone}\n`;
      systemPrompt += `Identified Agent: ${agent.full_name}\n`;
      systemPrompt += `Email: ${agent.email}\n`;
      systemPrompt += `Region: ${agent.region}\n`;
      systemPrompt += `Can Upload: ${agent.can_upload ? "Yes" : "No"}\n`;
      systemPrompt += `Channel: ${message.channelType}\n`;
    } else {
      systemPrompt += `\n\n---\n## CURRENT SENDER IDENTIFICATION\n`;
      systemPrompt += `Phone: ${message.senderPhone}\n`;
      systemPrompt += `Identified Agent: Unknown - not in agent database\n`;
      systemPrompt += `Channel: ${message.channelType}\n`;
    }

    // Build messages array for OpenRouter
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map((msg: ChatMessage) => ({
        role: msg.role === "model" ? "assistant" : "user",
        content: msg.parts.map(p => p.text).join(""),
      })),
      { role: "user", content: userContent },
    ];

    // Call OpenRouter with tools
    const response = await callOpenRouter(
      messages,
      getToolDefinitions(),
      model,
      openRouterApiKey
    );

    // Process the response
    const aiResponse = await processAIResponse(
      response,
      { agent, supabaseUrl, supabaseKey },
      messages,
      model,
      openRouterApiKey
    );

    // Store AI response
    await addMessage(message.conversationId, "model", aiResponse);

    return { text: aiResponse };
  } catch (error) {
    console.error("[Handler] Error processing message:", error);
    return {
      text: "I apologize, but I encountered an error processing your message. Please try again.",
    };
  }
};

/**
 * Call OpenRouter API
 */
const callOpenRouter = async (
  messages: Array<{ role: string; content: string }>,
  tools: ReturnType<typeof getToolDefinitions>,
  model: string,
  apiKey: string
): Promise<OpenRouterResponse> => {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://zyprus.com",
      "X-Title": "SOPHIA AI",
    },
    body: JSON.stringify({
      model,
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
 * OpenRouter response structure
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

/**
 * Process AI response, handling tool calls if present
 */
const processAIResponse = async (
  response: OpenRouterResponse,
  context: ToolContext,
  messages: Array<{ role: string; content: string }>,
  model: string,
  apiKey: string,
  depth = 0
): Promise<string> => {
  // Prevent infinite loops
  if (depth > 5) {
    return "I apologize, but I encountered too many steps processing your request. Please try a simpler query.";
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
    const result = await executeSharedTool(name, args, context);
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
    getToolDefinitions(),
    model,
    apiKey
  );

  // Recursively process the follow-up response
  return processAIResponse(followUpResponse, context, newMessages as Array<{ role: string; content: string }>, model, apiKey, depth + 1);
};

/**
 * Execute a shared tool
 */
const executeSharedTool = async (
  name: string,
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<{ success?: boolean; error?: string; message?: string; data?: unknown }> => {
  console.log(`[Handler] Executing tool: ${name}`);

  switch (name) {
    case "calculateVAT":
      return handleCalculateVAT(args);

    case "calculateTransferFees":
      return handleCalculateTransferFees(args);

    case "calculateCapitalGains":
      return handleCalculateCapitalGains(args);

    // Note: createPropertyListing and getZyprusData require more complex
    // handling that's currently in sophia-bot/tools/executor.ts
    // For Phase 2, we'll import that logic here

    default:
      return { error: `Unknown tool: ${name}` };
  }
};
