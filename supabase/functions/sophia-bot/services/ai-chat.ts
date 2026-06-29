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
import type { OpenRouterMessage, OpenRouterTool } from "../types/openrouter.ts";
import {
  canRequest,
  recordFailure,
  recordSuccess,
} from "../utils/circuit-breaker.ts";
import { LogCategory, logger } from "../utils/logger.ts";
import { getPendingImages } from "./pending-images.ts";
import { loadSystemPrompt } from "./prompt-loader.ts";

const OPENROUTER_CIRCUIT = {
  name: "openrouter",
  failureThreshold: 5,
  resetTimeoutMs: 60_000, // 60s cooldown
} as const;

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// TEMPORARY: free-tier models (via OpenRouter) while the paid OpenRouter
// account is out of credits. OWNER-approved override 2026-06-29 of the
// "Sonnet 4.6 only" rule — quality WILL regress; revert to
// "anthropic/claude-sonnet-4.6" once credits are restored.
// All three support tool calling (required by SOPHIA's tool loop).
// Fallback is a different provider (Qwen) so an NVIDIA outage isn't total.
const PRIMARY_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
const PRO_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
const FALLBACK_MODEL = "qwen/qwen3-next-80b-a3b-instruct:free";

interface AIResponse {
  response: string;
  success: boolean;
  toolsUsed?: string[];
  tokenCount?: number;
  /** A tool already sent the user a document with `response` as its caption;
   * the webhook must not also send `response` as a separate text message. */
  documentSent?: boolean;
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
    lowerMessage.includes("@zyprus.com") ||
    lowerMessage.includes("bedroom") ||
    lowerMessage.includes("bathroom") ||
    lowerMessage.includes("sqm") ||
    lowerMessage.includes("m2") ||
    lowerMessage.includes("covered area") ||
    lowerMessage.includes("owner") ||
    lowerMessage.includes("title deed") ||
    /\d{2,4}\s*k\b/.test(lowerMessage) ||
    /€\d/.test(lowerMessage);
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

  // Email channel: add extraction directive at the END (closest to the user message = highest attention)
  const isEmail = context.userMessage
    ?.toLowerCase()
    .includes("[channel: email");
  const emailDirective = isEmail
    ? `

---
## EMAIL UPLOAD — CRITICAL INSTRUCTIONS

**This message arrived via email (not WhatsApp). The email body contains ALL the property details already.**

**You MUST carefully read the ENTIRE email body and extract EVERY field before calling a tool.**
**Pay special attention to:**
- **location**: Use the EXACT area name from the email (e.g., "Tala" → pass "Tala, Paphos", NOT just "Paphos")
- **locationUrl**: Pass any Google Maps URL exactly as-is
- **price**: Extract the number only
- **ownerName** and **ownerPhone**: Read these from the email
- **titleDeedStatus**: Map to valid values (separate, in_process, final_approval, etc.)

**Do NOT ask the agent for information that is already in the email.**
**Do NOT use the sendEmail tool — the reply is sent automatically.**
---
`
    : "";

  return (
    baseSystemPrompt +
    dateContext +
    senderContext +
    imageContext +
    documentContext +
    emailDirective +
    (context.personalizationContext || "")
  );
}

/**
 * Calls OpenRouter API with retry logic for rate limiting
 * @returns message, error, and usage (token counts from OpenRouter)
 */
async function callOpenRouter(
  messages: OpenRouterMessage[],
  tools: OpenRouterTool[],
  toolChoice:
    | "auto"
    | "required"
    | { type: "function"; function: { name: string } } = "auto",
  model: string = PRIMARY_MODEL
): Promise<{
  message: OpenRouterMessage | null;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null;
  error?: string;
}> {
  // Circuit breaker: fail fast if OpenRouter has been consistently failing
  if (!canRequest(OPENROUTER_CIRCUIT)) {
    logger.warn("OpenRouter circuit breaker OPEN — failing fast", {
      category: LogCategory.GENERAL,
    });
    return {
      message: null,
      usage: null,
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
      // Generous timeout — email uploads with tool calling can take 40-60s
      const timeoutMs = model === PRO_MODEL ? 90_000 : 60_000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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

          // Parse the response body separately so a malformed JSON payload from
          // OpenRouter is distinguishable from an AbortError/timeout. The
          // timeout has already been cleared above, so any throw here is a
          // genuine parse failure, not a timeout.
          let aiData;
          try {
            aiData = await aiRes.json();
          } catch (parseError) {
            logger.error(
              "Failed to parse OpenRouter response",
              parseError instanceof Error
                ? parseError
                : new Error(String(parseError)),
              {
                category: LogCategory.GENERAL,
                status: aiRes.status,
                attempt: retries,
                model,
              }
            );
            recordFailure(OPENROUTER_CIRCUIT);
            return {
              message: null,
              usage: null,
              error: "Failed to parse OpenRouter response",
            };
          }

          // Extract usage data from OpenRouter response
          const usage = aiData.usage
            ? {
                promptTokens: aiData.usage.prompt_tokens || 0,
                completionTokens: aiData.usage.completion_tokens || 0,
                totalTokens: aiData.usage.total_tokens || 0,
              }
            : null;

          if (!usage) {
            logger.warn(
              "[OpenRouter] No usage data in response - token tracking unavailable for this request",
              { category: LogCategory.GENERAL }
            );
          }

          return { message: aiData.choices?.[0]?.message, usage };
        }

        const errorData = await aiRes.json().catch(() => ({
          error: { status: aiRes?.status ?? 0 },
        }));

        if (aiRes.status === 429 && retries < maxRetries) {
          // Ride out transient rate limits (common when the OpenRouter account
          // is near its spend cap) instead of hard-failing to the user.
          // 1) Honor the server's Retry-After when present — it's more accurate
          //    than a blind exponential — but CAP it so a long wait can't blow
          //    the Edge Function's ~120s wall.
          // 2) Add jitter so many concurrent WhatsApp webhooks don't retry in
          //    lockstep and immediately re-trigger the same 429.
          const MAX_BACKOFF_MS = 8000;
          const retryAfterSec = Number(aiRes.headers.get("retry-after"));
          const baseWait =
            Number.isFinite(retryAfterSec) && retryAfterSec > 0
              ? retryAfterSec * 1000
              : baseDelay * 2 ** retries;
          const delay =
            Math.min(baseWait, MAX_BACKOFF_MS) + Math.floor(Math.random() * 500);
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
        return { message: null, usage: null, error: "OpenRouter API error" };
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
    return { message: null, usage: null, error: "Max retries exceeded" };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const timeoutMs = model === PRO_MODEL ? 90_000 : 60_000;
      logger.error(
        `OpenRouter request timeout (${timeoutMs / 1000}s) for model ${model}`,
        error,
        {
          category: LogCategory.GENERAL,
        }
      );
      recordFailure(OPENROUTER_CIRCUIT);
      return {
        message: null,
        usage: null,
        error: `OpenRouter request timeout (${timeoutMs / 1000}s)`,
      };
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
  const openrouterMessages: OpenRouterMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  // Convert history: {role, parts: [{text}]} -> {role, content}
  for (const msg of history) {
    const role = msg.role === "model" ? "assistant" : msg.role;
    const content = msg.parts
      .map((p: { text?: string }) => p.text || "")
      .join("");
    openrouterMessages.push({
      role: role as "system" | "user" | "assistant" | "tool",
      content,
    });
  }

  // For email uploads: add user message + assistant prefill to force the AI to read the email
  // BEFORE the tool calling loop. The prefill acknowledges the email content and lists key fields,
  // which dramatically improves tool arg extraction accuracy.
  const lowerMsg = userMessage.toLowerCase();
  if (lowerMsg.includes("[channel: email") && history.length === 0) {
    // Add the email as user message
    openrouterMessages.push({ role: "user", content: userMessage });
    // Add assistant prefill that reads the email — the AI continues from here
    openrouterMessages.push({
      role: "assistant",
      content:
        "I'll read the email carefully and extract all the property details to create the listing. Let me call the appropriate tool with the information provided.",
    });
    // Now add a "user" nudge to trigger the tool call
    openrouterMessages.push({
      role: "user",
      content:
        "Go ahead — use the tool now with the details from the email above. Remember to use the EXACT location/area name from the email.",
    });
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
  // Email and WhatsApp use the SAME detection — no channel-specific branching
  const lowerMessage = userMessage.toLowerCase();
  // Detect any supported property portal link (Bazaraki + bank portals)
  const isPropertyPortalLink =
    lowerMessage.includes("bazaraki.com/") ||
    lowerMessage.includes("bazaraki.cy/") ||
    lowerMessage.includes("marketplace.altia.com.cy/") ||
    lowerMessage.includes("altia.com.cy/") ||
    lowerMessage.includes("altamirarealestate.com.cy/") ||
    lowerMessage.includes("remuproperties.com/") ||
    lowerMessage.includes("gogordian.com/");
  const isEmailChannel = lowerMessage.includes("[channel: email");
  const isPropertyUploadIntent =
    (lowerMessage.includes("upload") && lowerMessage.includes("property")) ||
    (lowerMessage.includes("create") && lowerMessage.includes("listing")) ||
    (lowerMessage.includes("add") && lowerMessage.includes("property")) ||
    (lowerMessage.includes("want to") && lowerMessage.includes("upload")) ||
    (lowerMessage.includes("i want to") && lowerMessage.includes("property")) ||
    // Email uploads: the body itself has property details (price, bedrooms, location)
    (isEmailChannel &&
      (lowerMessage.includes("sale") ||
        lowerMessage.includes("rent") ||
        lowerMessage.includes("bedroom") ||
        lowerMessage.includes("apartment") ||
        lowerMessage.includes("villa") ||
        lowerMessage.includes("house") ||
        lowerMessage.includes("property") ||
        lowerMessage.includes("listing") ||
        /€\d/.test(lowerMessage) ||
        /\d+\s*sqm/.test(lowerMessage))) ||
    (imageUrls.length > 0 &&
      (lowerMessage.includes("property") ||
        lowerMessage.includes("listing") ||
        lowerMessage.includes("bedroom") ||
        lowerMessage.includes("apartment") ||
        lowerMessage.includes("villa") ||
        lowerMessage.includes("house")));

  if (isPropertyUploadIntent) {
    logger.info(
      "[OpenRouter] Property upload intent detected - will encourage tool usage",
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
  let totalTokens = 0; // Accumulate tokens from all OpenRouter calls

  // Edge Function timeout is 120s - use 110s budget with 10s buffer for response delivery
  const TIME_BUDGET_MS = 110_000;
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
        tokenCount: totalTokens > 0 ? totalTokens : undefined,
      };
    }

    // Both email and WhatsApp: use "required" when upload intent detected (AI must call a tool).
    // "required" lets the AI pick WHICH tool — it reads the content and fills args itself.
    const toolChoiceForCall:
      | "auto"
      | "required"
      | { type: "function"; function: { name: string } } =
      isPropertyUploadIntent && toolCallCount === 0 ? "required" : "auto";

    // Use Pro model for property uploads, portal extraction, and email uploads (better at structured extraction)
    const useProModel =
      isPropertyUploadIntent || isPropertyPortalLink || isEmailChannel;
    const modelForCall = useProModel ? PRO_MODEL : PRIMARY_MODEL;

    const openRouterResult = await callOpenRouter(
      currentMessages,
      tools,
      toolChoiceForCall,
      modelForCall
    );
    let { message, error } = openRouterResult;
    const { usage } = openRouterResult;

    if (useProModel && !error) {
      logger.info(
        `[OpenRouter] Used Pro model for ${isPropertyPortalLink ? "portal extraction" : "property upload"}`,
        {
          category: LogCategory.GENERAL,
        }
      );
    }

    // Accumulate token usage
    if (usage?.totalTokens) {
      totalTokens += usage.totalTokens;
    }
    if (error || !message) {
      logger.warn(
        `[Fallback] ${modelForCall} failed (${error}), trying ${FALLBACK_MODEL}`,
        { category: LogCategory.GENERAL }
      );
      // Reset circuit breaker before fallback — Pro failures should NOT block Flash fallback
      recordSuccess(OPENROUTER_CIRCUIT);
      const fallback = await callOpenRouter(
        currentMessages,
        tools,
        toolChoiceForCall,
        FALLBACK_MODEL
      );
      message = fallback.message;
      error = fallback.error;

      // Accumulate fallback token usage
      if (fallback.usage?.totalTokens) {
        totalTokens += fallback.usage.totalTokens;
      }

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
          // If retries exhausted for a retryable error, show a user-friendly message
          // instead of raw validation details
          const userMessage2 = toolResult.retryable
            ? "I'm having trouble processing the upload. Could you please resend the property details so I can try again?"
            : toolResult.question;
          return {
            response: userMessage2,
            success: true,
            toolsUsed,
            tokenCount: totalTokens > 0 ? totalTokens : undefined,
          };
        }

        // If tool succeeded with a message, use it directly (don't ask AI to respond again)
        // This prevents the AI from generating DOCX when we just want a text confirmation
        if (toolResult.success && toolResult.message) {
          logger.info(
            "Tool: Success with message, using tool response directly",
            { category: LogCategory.TOOL }
          );

          // Note: pending images are cleared by property-listing.ts on successful upload
          // No need to clear again here

          return {
            response: toolResult.message,
            success: true,
            toolsUsed,
            tokenCount: totalTokens > 0 ? totalTokens : undefined,
            documentSent: (toolResult as { documentSent?: boolean }).documentSent,
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
              tokenCount: totalTokens > 0 ? totalTokens : undefined,
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
        return {
          response: aiResponse,
          success: true,
          toolsUsed,
          tokenCount: totalTokens > 0 ? totalTokens : undefined,
        };
      }

      logger.info(
        "[FORCE TOOL] Upload intent with images but no tool call - forcing retry with required tool_choice",
        { category: LogCategory.GENERAL }
      );

      const { message: retryMessage, usage: retryUsage } = await callOpenRouter(
        currentMessages,
        tools,
        "required",
        PRO_MODEL
      );

      // Accumulate retry token usage
      if (retryUsage?.totalTokens) {
        totalTokens += retryUsage.totalTokens;
      }

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
            // Note: pending images are cleared by property-listing.ts on successful upload
            return {
              response: toolResult.message,
              success: true,
              toolsUsed,
              tokenCount: totalTokens > 0 ? totalTokens : undefined,
              documentSent: (toolResult as { documentSent?: boolean }).documentSent,
            };
          }
          if (toolResult.needsInput && toolResult.question) {
            return {
              response: toolResult.question,
              success: true,
              toolsUsed,
              tokenCount: totalTokens > 0 ? totalTokens : undefined,
            };
          }
          if (toolResult.error) {
            return {
              response: `I encountered an issue: ${toolResult.error}`,
              success: false,
              toolsUsed,
              tokenCount: totalTokens > 0 ? totalTokens : undefined,
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
    tokenCount: totalTokens > 0 ? totalTokens : undefined,
  };
}
