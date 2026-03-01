/**
 * AI Chat Service
 *
 * Handles AI conversation logic via OpenRouter API.
 * - System prompt building
 * - Tool calling loop
 * - Response processing
 */

import type { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import type { Agent } from "../agents/identifier.ts";
import { getToolDefinitions } from "../tools/definitions.ts";
import { executeTool } from "../tools/executor.ts";
import { LogCategory, logger } from "../utils/logger.ts";
import { clearPendingImages, getPendingImages } from "./pending-images.ts";
import { loadSystemPrompt } from "./prompt-loader.ts";
import {
  canRequest,
  recordFailure,
  recordSuccess,
} from "../utils/circuit-breaker.ts";

const OPENROUTER_CIRCUIT = {
  name: "openrouter",
  failureThreshold: 5,
  resetTimeoutMs: 60_000, // 60s cooldown
} as const;

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const PRIMARY_MODEL = "google/gemini-3-flash-preview";
const FALLBACK_MODEL = "google/gemini-2.0-flash";

interface AIResponse {
  response: string;
  success: boolean;
  toolsUsed?: string[];
}

interface ChatContext {
  userId: string;
  phoneNumber: string;
  agentName?: string;
  agentEmail?: string;
  agentRegion?: string;
  agentCanUpload?: boolean;
  personalizationContext?: string;
  imageUrls?: string[];
  userMessage?: string; // P1 PERFORMANCE: Used for conditional image fetching
  lastDocument?: {
    document_url: string;
    document_name: string;
    document_type: string;
  } | null;
}

/**
 * Builds the system prompt with all contextual information
 */
export async function buildSystemPrompt(
  supabase: ReturnType<typeof createClient>,
  context: ChatContext,
  identifiedAgent: Agent | null
): Promise<string> {
  // Get current date/time in Cyprus timezone (Europe/Nicosia)
  const cyprusDate = new Date().toLocaleString("en-GB", {
    timeZone: "Europe/Nicosia",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const cyprusDateShort = new Date().toLocaleDateString("en-GB", {
    timeZone: "Europe/Nicosia",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  // Calculate tomorrow's date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDateShort = tomorrow.toLocaleDateString("en-GB", {
    timeZone: "Europe/Nicosia",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  // Inject current date context into system prompt
  const dateContext = `

---
## CURRENT DATE/TIME AWARENESS

**IMPORTANT: You must be aware of the current date and time.**

**Current Date/Time in Cyprus (Nicosia):** ${cyprusDate}
**Today's Date (DD/MM/YYYY format):** ${cyprusDateShort}

**When users say relative dates like:**
- "today" -> Use ${cyprusDateShort}
- "tomorrow" -> Add 1 day to today
- "next week" -> Add 7 days to today
- "yesterday" -> Subtract 1 day from today

**ALWAYS calculate dates correctly based on today being ${cyprusDateShort}.**

---
`;

  // Inject sender info with agent details if known
  let senderContext: string;
  if (identifiedAgent) {
    // Use the new agent identification for property uploads
    senderContext = `

---
## CURRENT SENDER - KNOWN AGENT

**IMPORTANT: You are talking to a KNOWN AGENT who can upload property listings.**

**Agent Name:** ${identifiedAgent.fullName}
**Phone Number:** ${context.phoneNumber}
**Email:** ${identifiedAgent.communicationEmail}
**Region:** ${identifiedAgent.region}
**Role:** ${identifiedAgent.role}
**Can Upload Listings:** ${identifiedAgent.canUpload ? "Yes" : "No"}

**When this agent wants to upload a property listing, use the createPropertyListing or createLandListing tools. DO NOT ask for their name - use their info directly.**

---
`;
  } else if (context.agentName) {
    senderContext = `

---
## CURRENT SENDER - KNOWN AGENT

**IMPORTANT: You are talking to a KNOWN AGENT. Use their info directly - DO NOT ask for their name or phone number.**

**Agent Name:** ${context.agentName}
**Phone Number:** ${context.phoneNumber}
${
  context.agentEmail
    ? `**Email:** ${context.agentEmail}
`
    : ""
}
**When generating documents for this agent, automatically use their name and phone number. DO NOT ask them to provide this information.**

---
`;
  } else {
    senderContext = `

---
## CURRENT SENDER IDENTIFICATION

**Message sent from phone number:** ${context.phoneNumber}

**This is an unknown sender. You may need to ask for their name if generating documents. If they want to upload a property, ask them to confirm who they are first.**

---
`;
  }

  // P1 PERFORMANCE: Only fetch accumulated images when relevant to message
  // This saves a DB call on ~95% of requests (most messages aren't about property uploads)
  let accumulatedImages: string[] = [];
  const lowerMessage = context.userMessage?.toLowerCase() || "";
  const isImageRelated = context.imageUrls && context.imageUrls.length > 0;
  const isPropertyRelated =
    lowerMessage.includes("property") ||
    lowerMessage.includes("upload") ||
    lowerMessage.includes("listing") ||
    lowerMessage.includes("photo") ||
    lowerMessage.includes("image") ||
    lowerMessage.includes("finished") ||
    lowerMessage.includes("done") ||
    lowerMessage.includes("that's all") ||
    lowerMessage.includes("assign") ||
    lowerMessage.includes("@zyprus.com");
  // Also check if agent can upload — short replies during upload flow need image context
  const isUploadCapableAgent = context.agentCanUpload === true;
  // Short messages (< 30 chars) from upload-capable agents are likely replies in upload flow
  const isShortReplyFromAgent =
    isUploadCapableAgent && lowerMessage.length < 30 && lowerMessage.length > 0;

  if (isImageRelated || isPropertyRelated || isShortReplyFromAgent) {
    accumulatedImages = await getPendingImages(
      context.phoneNumber.replace(/\D/g, "")
    );
  }
  const totalImageCount = accumulatedImages.length;

  let imageContext = "";
  if (totalImageCount > 0) {
    // Use accumulated images (includes current + previous photos)
    imageContext = `

---
## ACCUMULATED PROPERTY PHOTOS

**IMPORTANT: You have received a total of ${totalImageCount} photo(s) for the property listing.**

**All Image URLs (use ALL of these for property listings):**
${accumulatedImages.map((url, i) => `${i + 1}. ${url}`).join("\n")}

**When the user is ready to create a property listing, use ALL of these image URLs in the \`imageUrls\` parameter of the createPropertyListing or createLandListing tool. INCLUDE EVERY IMAGE - do not leave any out.**

**REMEMBER: Ask the user to confirm all photos have been sent before uploading! Also ask if any photos are title deed images (not property photos) — if yes, pass their numbers in titleDeedImageIndices.**

---
`;
    logger.info(
      `[Images] Added ${totalImageCount} ACCUMULATED image URL(s) to AI context`,
      { category: LogCategory.GENERAL }
    );
  }

  // Check for recently generated documents that can be attached to emails
  let documentContext = "";
  if (context.lastDocument) {
    const docTypeDisplay =
      context.lastDocument.document_type?.replace(/_/g, " ") || "document";
    documentContext = `

---
## AVAILABLE DOCUMENT FOR EMAIL ATTACHMENT

**You have a recently generated document available:**
- **Document:** ${context.lastDocument.document_name}
- **Type:** ${docTypeDisplay}
- **URL:** ${context.lastDocument.document_url}

**If the user asks to email this document (e.g., "send it to my email", "email me the document"):**
-> Use the sendEmail tool with the \`attachmentUrl\` parameter set to the URL above.
-> Keep the email subject and body simple (e.g., "Find attached the ${docTypeDisplay}")

---
`;
    logger.info(
      `[DocContext] Found available document for attachment: ${context.lastDocument.document_name}`,
      { category: LogCategory.GENERAL }
    );
  }

  // Build agent context for dynamic prompt loading
  const agentContext = {
    agentName: identifiedAgent?.fullName || context.agentName || "Agent",
    agentPhone: context.phoneNumber,
    currentDate: cyprusDateShort,
    tomorrowDate: tomorrowDateShort,
  };

  // Load system prompt from database (cached for 5 minutes, falls back to hardcoded)
  const baseSystemPrompt = await loadSystemPrompt(supabase, agentContext);
  logger.info(
    `[PromptLoader] Loaded system prompt (${baseSystemPrompt.length} chars)`,
    { category: LogCategory.GENERAL }
  );

  return (
    baseSystemPrompt +
    dateContext +
    senderContext +
    imageContext +
    documentContext +
    (context.personalizationContext || "")
  );
}

/**
 * Calls OpenRouter API with retry logic for rate limiting
 */
async function callOpenRouter(
  messages: Array<{
    role: string;
    content: string;
    tool_calls?: any[];
    tool_call_id?: string;
  }>,
  tools: any[],
  toolChoice: "auto" | "required" = "auto",
  model: string = PRIMARY_MODEL
): Promise<{ message: any; error?: string }> {
  // Circuit breaker: fail fast if OpenRouter has been consistently failing
  if (!canRequest(OPENROUTER_CIRCUIT)) {
    logger.warn("OpenRouter circuit breaker OPEN — failing fast", {
      category: LogCategory.GENERAL,
    });
    return {
      message: null,
      error: "AI service temporarily unavailable (circuit open)",
    };
  }

  let retries = 0;
  const maxRetries = 3;
  const baseDelay = 2000;

  try {
    while (retries <= maxRetries) {
      // Create fresh AbortController for each retry
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000); // 30 seconds

      try {
        const aiRes = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://sophia-ai.vercel.app",
            "X-Title": "SOPHIA WhatsApp Bot",
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.1,
            max_tokens: 8192,
            tools,
            tool_choice: toolChoice,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (aiRes.ok) {
          recordSuccess(OPENROUTER_CIRCUIT);
          const aiData = await aiRes.json();
          return { message: aiData.choices?.[0]?.message };
        }

        const errorData = await aiRes.json().catch(() => ({
          error: { status: aiRes?.status ?? 0 },
        }));

        if (aiRes.status === 429 && retries < maxRetries) {
          const delay = baseDelay * 2 ** retries;
          logger.info(
            `OpenRouter rate limited (429). Retrying in ${delay}ms... (attempt ${retries + 1}/${maxRetries})`,
            { category: LogCategory.GENERAL }
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          retries++;
          continue;
        }

        logger.error(
          "OpenRouter Error: " + JSON.stringify(errorData, null, 2),
          undefined,
          { category: LogCategory.GENERAL }
        );
        logger.error("Status: " + String(aiRes.status), undefined, {
          category: LogCategory.GENERAL,
        });

        recordFailure(OPENROUTER_CIRCUIT);
        return { message: null, error: "OpenRouter API error" };
      } catch (error) {
        clearTimeout(timeoutId);
        // Re-throw to outer catch if it's an abort error
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }
        throw error;
      }
    }

    recordFailure(OPENROUTER_CIRCUIT);
    return { message: null, error: "Max retries exceeded" };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      logger.error("OpenRouter request timeout (30s)", error, {
        category: LogCategory.GENERAL,
      });
      recordFailure(OPENROUTER_CIRCUIT);
      return { message: null, error: "OpenRouter request timeout (30s)" };
    }
    recordFailure(OPENROUTER_CIRCUIT);
    throw error;
  }
}

/**
 * Main AI chat function with tool calling loop
 */
export async function chat(
  history: Array<{ role: string; parts: Array<{ text: string }> }>,
  systemPrompt: string,
  userMessage: string,
  imageUrls: string[],
  identifiedAgent: Agent | null,
  supabaseUrl: string,
  supabaseKey: string,
  phoneNumber: string
): Promise<AIResponse> {
  if (!OPENROUTER_API_KEY) {
    logger.error("CRITICAL: OPENROUTER_API_KEY is not set", undefined, {
      category: LogCategory.GENERAL,
    });
    return {
      response: "Service configuration error. Please contact support.",
      success: false,
    };
  }

  // Convert Gemini history format to OpenRouter format
  const openrouterMessages: Array<{
    role: string;
    content: string;
    tool_calls?: any[];
    tool_call_id?: string;
  }> = [{ role: "system", content: systemPrompt }];

  // Convert history: {role, parts: [{text}]} -> {role, content}
  for (const msg of history) {
    const role = msg.role === "model" ? "assistant" : msg.role;
    const content = msg.parts.map((p: any) => p.text || "").join("");
    openrouterMessages.push({ role, content });
  }

  logger.info(
    `[OpenRouter] Calling with ${openrouterMessages.length} messages`,
    { category: LogCategory.GENERAL }
  );

  // Get tool definitions for property listing uploads
  const tools = getToolDefinitions();
  logger.info(
    `[OpenRouter] Including ${tools.length} tools for function calling`,
    { category: LogCategory.GENERAL }
  );

  // Detect if user wants to upload a property - force tool usage in this case
  const lowerMessage = userMessage.toLowerCase();
  const isPropertyUploadIntent =
    (lowerMessage.includes("upload") && lowerMessage.includes("property")) ||
    (lowerMessage.includes("create") && lowerMessage.includes("listing")) ||
    (lowerMessage.includes("add") && lowerMessage.includes("property")) ||
    (lowerMessage.includes("want to") && lowerMessage.includes("upload")) ||
    (lowerMessage.includes("i want to") && lowerMessage.includes("property")) ||
    (imageUrls.length > 0 &&
      (lowerMessage.includes("property") ||
        lowerMessage.includes("listing") ||
        lowerMessage.includes("bedroom") ||
        lowerMessage.includes("apartment") ||
        lowerMessage.includes("villa") ||
        lowerMessage.includes("house")));

  if (isPropertyUploadIntent) {
    logger.info(
      "[OpenRouter] Property upload intent detected - will force tool usage",
      { category: LogCategory.ZYPRUS }
    );
  }

  // Tool calling loop - handle multiple tool calls if needed
  let aiResponse = "";
  const maxToolCalls = 5; // Prevent infinite loops
  let toolCallCount = 0;
  let retryableCount = 0; // Cap retryable validation loops to avoid burning tokens
  const MAX_RETRYABLE = 2;
  const currentMessages = [...openrouterMessages];
  const toolsUsed: string[] = [];

  // Edge Function timeout is 120s - use 90s budget with 30s buffer for response generation
  const TIME_BUDGET_MS = 90_000;
  const startTime = Date.now();

  while (toolCallCount < maxToolCalls) {
    // Check time budget before each iteration
    const elapsedMs = Date.now() - startTime;
    if (elapsedMs > TIME_BUDGET_MS) {
      logger.warn(
        `Tool execution loop exceeded time budget (${elapsedMs}ms > ${TIME_BUDGET_MS}ms) after ${toolCallCount} tool calls`,
        { category: LogCategory.GENERAL }
      );
      return {
        response:
          "I'm taking longer than expected to complete this task. Please try again, and I'll work more efficiently.",
        success: true, // Graceful degradation, not a failure
        toolsUsed,
      };
    }

    const toolChoiceForCall =
      isPropertyUploadIntent && toolCallCount === 0 ? "required" : "auto";

    let { message, error } = await callOpenRouter(
      currentMessages,
      tools,
      toolChoiceForCall
    );

    // Fallback: if primary model fails, try the stable fallback model
    if (error || !message) {
      logger.warn(
        `[Fallback] Primary model failed (${error}), trying ${FALLBACK_MODEL}`,
        { category: LogCategory.GENERAL }
      );
      const fallback = await callOpenRouter(
        currentMessages,
        tools,
        toolChoiceForCall,
        FALLBACK_MODEL
      );
      message = fallback.message;
      error = fallback.error;

      if (error || !message) {
        return {
          response:
            "I'm experiencing technical difficulties right now. Please try again in a few moments.",
          success: false,
        };
      }
      logger.info("[Fallback] Fallback model succeeded", {
        category: LogCategory.GENERAL,
      });
    }

    // SAFETY NET: Detect tool calls output as text (Gemini preview models sometimes do this)
    // Pattern: {"action": "default_api:sendEmail", "action_input": "{ ... }"}
    if (
      (!message?.tool_calls || message.tool_calls.length === 0) &&
      message?.content
    ) {
      const content =
        typeof message.content === "string" ? message.content : "";
      const textToolMatch = content.match(
        /\{\s*"action"\s*:\s*"(?:default_api:)?(\w+)"\s*,\s*"action_input"\s*:\s*"(.+?)"\s*\}/s
      );
      if (textToolMatch) {
        const toolName = textToolMatch[1];
        const toolArgsStr = textToolMatch[2]
          .replace(/\\"/g, '"') // unescape quotes
          .replace(/\\n/g, "\n");
        try {
          const toolArgs = JSON.parse(toolArgsStr);
          logger.info(
            `[OpenRouter] Detected text-based tool call for ${toolName}, converting to proper tool call`,
            { category: LogCategory.GENERAL }
          );
          message.tool_calls = [
            {
              id: `text_tool_${Date.now()}`,
              type: "function",
              function: { name: toolName, arguments: JSON.stringify(toolArgs) },
            },
          ];
          // Clear the text content so it doesn't get sent to the user as raw JSON
          message.content = "";
        } catch (parseErr) {
          logger.error(
            `[OpenRouter] Failed to parse text-based tool call: ${String(parseErr)}`,
            undefined,
            { category: LogCategory.GENERAL }
          );
        }
      }
    }

    // Check for tool calls
    if (message?.tool_calls && message.tool_calls.length > 0) {
      toolCallCount++;
      logger.info(
        `[OpenRouter] Tool call ${toolCallCount}: ${message.tool_calls.length} tools requested`,
        { category: LogCategory.GENERAL }
      );

      // CRITICAL: Deduplicate identical tool calls within the same response
      // OpenRouter sometimes returns duplicate tool calls, causing duplicate executions
      const seenToolSignatures = new Set<string>();
      const uniqueToolCalls = message.tool_calls.filter((toolCall) => {
        const toolName = toolCall.function.name;
        const toolArgs = toolCall.function.arguments || "{}";
        // Create a signature from tool name + args hash
        const signature = `${toolName}:${toolArgs}`;
        if (seenToolSignatures.has(signature)) {
          logger.warn(
            `[OpenRouter] Filtering out duplicate tool call: ${toolName}`,
            { category: LogCategory.GENERAL }
          );
          return false;
        }
        seenToolSignatures.add(signature);
        return true;
      });

      if (uniqueToolCalls.length < message.tool_calls.length) {
        logger.info(
          `[OpenRouter] Deduplicated tool calls: ${message.tool_calls.length} -> ${uniqueToolCalls.length}`,
          { category: LogCategory.GENERAL }
        );
      }

      // Add assistant message with original tool calls to history (for proper conversation flow)
      currentMessages.push({
        role: "assistant",
        content: message.content || "",
        tool_calls: message.tool_calls,
      });

      // Execute only unique tool calls
      for (const toolCall of uniqueToolCalls) {
        const toolName = toolCall.function.name;
        let toolArgs: Record<string, unknown>;

        try {
          toolArgs = JSON.parse(toolCall.function.arguments || "{}");
        } catch (_e) {
          logger.error(
            `Tool error: Failed to parse arguments for ${toolName}`,
            undefined,
            { category: LogCategory.TOOL }
          );
          toolArgs = {};
        }

        logger.info(`Tool: Executing: ${toolName}`, {
          category: LogCategory.TOOL,
        });
        logger.info(
          `Tool: Arguments: ${JSON.stringify(toolArgs).substring(0, 200)}`,
          { category: LogCategory.TOOL }
        );

        toolsUsed.push(toolName);

        // Execute the tool with error handling
        let toolResult;
        try {
          toolResult = await executeTool(
            { name: toolName, arguments: toolArgs },
            identifiedAgent,
            supabaseUrl,
            supabaseKey,
            phoneNumber
          );
        } catch (error) {
          logger.error(`Tool execution failed: ${toolName}`, {
            error,
            category: LogCategory.ERROR,
          });
          toolResult = {
            success: false,
            message: `Error executing ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
          };
        }

        logger.info(
          `Tool: Result: ${JSON.stringify(toolResult).substring(0, 200)}`,
          { category: LogCategory.TOOL }
        );

        // Add tool result to history
        currentMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });

        // If tool needs user input, send the question and stop
        // EXCEPT: if the result is retryable (validation failure where AI didn't extract fields),
        // feed it back as a tool result so the AI can retry with correct args
        if (toolResult.needsInput && toolResult.question) {
          if (
            toolResult.retryable &&
            toolCallCount < maxToolCalls &&
            retryableCount < MAX_RETRYABLE
          ) {
            retryableCount++;
            logger.info(
              `[Retry] Tool ${toolName} returned retryable needsInput (attempt ${retryableCount}/${MAX_RETRYABLE}) — feeding back to AI loop`,
              { category: LogCategory.TOOL }
            );
            // The tool result is already in currentMessages (added above)
            // Break out of the for loop so the while loop makes a new AI call
            break;
          }
          return {
            response: toolResult.question,
            success: true,
            toolsUsed,
          };
        }

        // If tool succeeded with a message, use it directly (don't ask AI to respond again)
        // This prevents the AI from generating DOCX when we just want a text confirmation
        if (toolResult.success && toolResult.message) {
          logger.info(
            "Tool: Success with message, using tool response directly",
            { category: LogCategory.TOOL }
          );

          // Clear pending images after successful upload
          if (
            toolName === "createPropertyListing" ||
            toolName === "createLandListing"
          ) {
            const cleanPhone = phoneNumber.replace(/\D/g, "");
            await clearPendingImages(cleanPhone);
            logger.info(
              `[Images] Cleared pending images for ${cleanPhone} after successful upload`,
              { category: LogCategory.IMAGE }
            );
          }

          return {
            response: toolResult.message,
            success: true,
            toolsUsed,
          };
        }

        // If tool returned an error, return it directly (for debugging)
        if (toolResult.error) {
          logger.info(`Tool: Error result: ${toolResult.error}`, {
            category: LogCategory.TOOL,
          });
          // For createPropertyListing errors, show the actual error instead of generic message
          if (
            toolName === "createPropertyListing" ||
            toolName === "createLandListing"
          ) {
            return {
              response: `I encountered an error while creating the listing: ${toolResult.error}`,
              success: false,
              toolsUsed,
            };
          }
        }
      }

      // Continue loop to get AI's next response
      continue;
    }

    // No tool calls - get the text response
    aiResponse = message?.content || "";

    // ANTI-HALLUCINATION FIX: If upload intent detected but no tool called, force retry with tool_choice: "required"
    if (isPropertyUploadIntent && toolCallCount === 0 && imageUrls.length > 0) {
      // Check budget before force retry
      const elapsedMs = Date.now() - startTime;
      if (elapsedMs > TIME_BUDGET_MS) {
        logger.warn(
          `Skipping force retry - time budget exceeded (${elapsedMs}ms > ${TIME_BUDGET_MS}ms)`,
          { category: LogCategory.GENERAL }
        );
        // Return current response without retry
        return { response: aiResponse, success: true, toolsUsed };
      }

      logger.info(
        "[FORCE TOOL] Upload intent with images but no tool call - forcing retry with required tool_choice",
        { category: LogCategory.GENERAL }
      );

      const { message: retryMessage } = await callOpenRouter(
        currentMessages,
        tools,
        "required"
      );

      if (retryMessage?.tool_calls && retryMessage.tool_calls.length > 0) {
        logger.info("[FORCE TOOL] Retry successful - got tool calls", {
          category: LogCategory.GENERAL,
        });

        // CRITICAL: Deduplicate identical tool calls within the retry response
        const seenToolSignatures = new Set<string>();
        const uniqueRetryCalls = retryMessage.tool_calls.filter((toolCall) => {
          const toolName = toolCall.function.name;
          const toolArgs = toolCall.function.arguments || "{}";
          const signature = `${toolName}:${toolArgs}`;
          if (seenToolSignatures.has(signature)) {
            logger.warn(
              `[FORCE TOOL] Filtering out duplicate tool call: ${toolName}`,
              { category: LogCategory.GENERAL }
            );
            return false;
          }
          seenToolSignatures.add(signature);
          return true;
        });

        // Process only unique tool calls
        for (const toolCall of uniqueRetryCalls) {
          const toolName = toolCall.function.name;
          let toolArgs: Record<string, unknown>;
          try {
            toolArgs = JSON.parse(toolCall.function.arguments || "{}");
          } catch (_e) {
            toolArgs = {};
          }
          logger.info(`[FORCE TOOL] Executing: ${toolName}`, {
            category: LogCategory.GENERAL,
          });
          toolsUsed.push(toolName);

          let toolResult;
          try {
            toolResult = await executeTool(
              { name: toolName, arguments: toolArgs },
              identifiedAgent,
              supabaseUrl,
              supabaseKey,
              phoneNumber
            );
          } catch (error) {
            logger.error(`[FORCE TOOL] Tool execution failed: ${toolName}`, {
              error,
              category: LogCategory.ERROR,
            });
            toolResult = {
              success: false,
              message: `Error executing ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
            };
          }

          if (toolResult.success && toolResult.message) {
            // Clear pending images after successful upload
            if (
              toolName === "createPropertyListing" ||
              toolName === "createLandListing"
            ) {
              const cleanPhone = phoneNumber.replace(/\D/g, "");
              await clearPendingImages(cleanPhone);
            }
            return {
              response: toolResult.message,
              success: true,
              toolsUsed,
            };
          }
          if (toolResult.needsInput && toolResult.question) {
            return {
              response: toolResult.question,
              success: true,
              toolsUsed,
            };
          }
          if (toolResult.error) {
            return {
              response: `I encountered an issue: ${toolResult.error}`,
              success: false,
              toolsUsed,
            };
          }
        }
      }
    }

    break;
  }

  if (!aiResponse) {
    logger.error("Empty response from OpenRouter", undefined, {
      category: LogCategory.GENERAL,
    });
    return {
      response:
        "I couldn't generate a response. Please rephrase your request and try again.",
      success: false,
    };
  }

  logger.info(
    "AI Response received (first 500 chars): " + aiResponse.substring(0, 500),
    { category: LogCategory.GENERAL }
  );
  logger.info("AI Response length:" + String(aiResponse.length), {
    category: LogCategory.GENERAL,
  });

  return {
    response: aiResponse,
    success: true,
    toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
  };
}
