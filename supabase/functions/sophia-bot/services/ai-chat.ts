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
import type {
  OpenRouterMessage,
  OpenRouterTool,
} from "../types/openrouter.ts";
import { getToolDefinitions } from "../tools/definitions.ts";
import { executeTool } from "../tools/executor.ts";
import { LogCategory, logger } from "../utils/logger.ts";
import { getPendingImages } from "./pending-images.ts";
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

// Sonnet 4.6 for everything — fast, reliable tool calling, consistent behavior
const PRIMARY_MODEL = "anthropic/claude-sonnet-4.6";
const PRO_MODEL = "anthropic/claude-sonnet-4.6";
const FALLBACK_MODEL = "google/gemini-2.5-flash";

interface AIResponse {
  response: string;
  success: boolean;
  toolsUsed?: string[];
  tokenCount?: number;
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
 * @returns message, error, and usage (token counts from OpenRouter)
 */
async function callOpenRouter(
  messages: OpenRouterMessage[],
  tools: OpenRouterTool[],
  toolChoice: "auto" | "required" | { type: "function"; function: { name: string } } = "auto",
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
      // Pro model needs more time (larger context, slower inference)
      const timeoutMs = model === PRO_MODEL ? 60_000 : 30_000;
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
          const aiData = await aiRes.json();

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
      const timeoutMs = model === PRO_MODEL ? 60_000 : 30_000;
      logger.error(`OpenRouter request timeout (${timeoutMs / 1000}s) for model ${model}`, error, {
        category: LogCategory.GENERAL,
      });
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
  const isBazarakiLink = lowerMessage.includes("bazaraki.com/");
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

  // Detect if email contains structured property data (has key required fields)
  // When core fields are present, force createPropertyListing specifically
  // Relaxed detection: agents don't always use formal labels like "price:" or "location:"
  // e.g. "500k not negotiable" contains price, "Kapsalos, Limassol" contains location implicitly
  const isEmailWithStructuredData =
    lowerMessage.includes("this message is via email") &&
    isPropertyUploadIntent &&
    // Price indicator: explicit "price" label OR a number pattern (500k, €185,000, etc.)
    (lowerMessage.includes("price") || /\d{3,}k|\d{4,}|€\d/.test(lowerMessage)) &&
    // Location indicator: explicit "location" label OR a Cyprus city/district name
    (lowerMessage.includes("location") || /paphos|limassol|larnaca|nicosia|famagusta|lemesos|pafos/.test(lowerMessage)) &&
    // Owner indicator
    (lowerMessage.includes("owner") || lowerMessage.includes("seller") || lowerMessage.includes("assign to"));

  // Detect if this is a LAND listing (not a property listing)
  // Land emails typically contain "land for sale", "plot for sale", "land listing", etc.
  const isLandListing = isEmailWithStructuredData &&
    (/\bland\b.*\bfor\s+sale\b|\bplot\b.*\bfor\s+sale\b|\bland\s+listing\b|\bplot\s+listing\b|\bagricultural\b.*\bfor\s+sale\b/.test(lowerMessage));

  if (isPropertyUploadIntent) {
    logger.info(
      `[OpenRouter] Property upload intent detected - will force tool usage${isEmailWithStructuredData ? (isLandListing ? " (EMAIL with structured data → forcing createLandListing)" : " (EMAIL with structured data → forcing createPropertyListing)") : ""}`,
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

    // For emails with pre-extracted fields, ALWAYS force the correct tool
    // This is more reliable than isEmailWithStructuredData which has strict pattern matching
    // Check on EVERY iteration, not just first — retries after validation failure need override too
    const hasPreExtractedFields = lowerMessage.includes("pre-extracted fields");
    // Detect land from pre-extracted block — more reliable than isLandListing regex
    const preExtractedIsLand = hasPreExtractedFields && lowerMessage.includes("tool: createlandlisting");

    // For structured email data, force the right tool (land vs property)
    // For other upload intents, force any tool ("required")
    // Otherwise, let AI decide ("auto")
    const toolChoiceForCall: "auto" | "required" | { type: "function"; function: { name: string } } =
      hasPreExtractedFields && toolCallCount === 0
        ? { type: "function", function: { name: (preExtractedIsLand || isLandListing) ? "createLandListing" : "createPropertyListing" } }
        : isEmailWithStructuredData && toolCallCount === 0
          ? { type: "function", function: { name: isLandListing ? "createLandListing" : "createPropertyListing" } }
          : isPropertyUploadIntent && toolCallCount === 0
            ? "required"
            : "auto";

    // Use Pro model for property uploads, email uploads, and Bazaraki extraction (better at structured extraction)
    const useProModel = isPropertyUploadIntent || isBazarakiLink || hasPreExtractedFields || isEmailWithStructuredData;
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
      logger.info(`[OpenRouter] Used Pro model for ${isBazarakiLink ? "Bazaraki extraction" : hasPreExtractedFields || isEmailWithStructuredData ? "email upload" : "property upload"}`, {
        category: LogCategory.GENERAL,
      });
    }

    // Accumulate token usage
    if (usage?.totalTokens) {
      totalTokens += usage.totalTokens;
    }

    // Fallback: if primary model fails OR returns no tool_calls when we forced a tool, try fallback model
    if (hasPreExtractedFields && message && (!message.tool_calls || message.tool_calls.length === 0) && !message.content) {
      // Primary model returned empty with no tool_calls — treat as failure for email uploads
      logger.warn("[Email] Primary model returned empty (no tool_calls, no content) — triggering fallback", {
        category: LogCategory.GENERAL,
      });
      error = "Empty response with forced tool_choice";
      message = null;
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

        // CRITICAL: For email uploads, OVERRIDE the AI's tool args with server-side parsed values
        // Gemini hallucnates values even when pre-extracted fields are in the prompt
        // So we force-inject the correct values parsed by email-parser.ts
        if (
          (toolName === "createPropertyListing" || toolName === "createLandListing") &&
          userMessage.includes("PRE-EXTRACTED FIELDS")
        ) {
          const overrides = parsePreExtractedFields(userMessage);
          // Apply overrides from server-side parsed fields
          const overridden: string[] = [];
          for (const [key, value] of Object.entries(overrides)) {
            if (value !== undefined && value !== null && value !== "") {
              if (JSON.stringify(toolArgs[key]) !== JSON.stringify(value)) {
                overridden.push(key);
              }
              toolArgs[key] = value;
            }
          }
          // Null out optional fields the AI hallucinated that weren't in the email
          const nullableFields = ["coveredVeranda", "uncoveredVeranda", "plotSize", "yearBuilt", "yearRenovated", "floor", "energyClass", "buildingName", "areaDescription"];
          // ALWAYS strip AI-fabricated imageUrls for email uploads
          // Email images come from pending_images (stored by email-webhook.ts), not from AI args
          // Set to empty array (not delete) because the tool schema requires imageUrls
          // The handler will fetch actual images from pending_images internally
          toolArgs.imageUrls = [];
          for (const field of nullableFields) {
            if (!(field in overrides) && toolArgs[field] !== undefined) {
              logger.info(`[Email] Removing AI-hallucinated field "${field}" (not in email)`, {
                category: LogCategory.TOOL,
              });
              delete toolArgs[field];
            }
          }
          if (overridden.length > 0) {
            logger.warn(`[Email] Overrode ${overridden.length} AI-hallucinated args with server-parsed values: ${overridden.join(", ")}`, {
              category: LogCategory.TOOL,
            });
          }

          // BLOCK upload if no Google Maps link from the EMAIL (not AI-fabricated)
          if (!("locationUrl" in overrides)) {
            delete toolArgs.locationUrl;
            delete toolArgs.coordinates;
            logger.info("[Email] No locationUrl found — blocking upload, asking agent for Google Maps link", {
              category: LogCategory.TOOL,
            });
            return {
              response: "Thank you for the property details! Before I upload the draft, I need one more thing:\n\nCould you please send me the **Google Maps link** (pin location) for this property? This is required so the reviewer knows the exact location.\n\nOnce you reply with the link, I'll complete the upload right away.",
              success: true,
              toolsUsed,
              tokenCount: totalTokens > 0 ? totalTokens : undefined,
            };
          }
        }

        // Inject server-side extracted assignTo if the AI omitted it
        if (
          (toolName === "createPropertyListing" || toolName === "createLandListing") &&
          !toolArgs.assignTo
        ) {
          const assignMatch = userMessage.match(/assignTo:\s*"([^"]+)"/) || userMessage.match(/MANDATORY ASSIGNMENT:.*?assignTo="([^"]+)"/);
          if (assignMatch) {
            toolArgs.assignTo = assignMatch[1];
            logger.info(`[Email] Injected assignTo="${assignMatch[1]}" into ${toolName} (AI omitted it)`, {
              category: LogCategory.TOOL,
            });
          }
        }

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

      const {
        message: retryMessage,
        usage: retryUsage,
      } = await callOpenRouter(currentMessages, tools, "required", PRO_MODEL);

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
          // CRITICAL: For email uploads in retry path, apply same overrides as main path
          if (
            (toolName === "createPropertyListing" || toolName === "createLandListing") &&
            userMessage.includes("PRE-EXTRACTED FIELDS")
          ) {
            const overrides = parsePreExtractedFields(userMessage);
            for (const [key, value] of Object.entries(overrides)) {
              if (value !== undefined && value !== null && value !== "") {
                toolArgs[key] = value;
              }
            }
            // Strip AI-fabricated imageUrls for email uploads (same as main path)
            toolArgs.imageUrls = [];
            const nullableFields = ["coveredVeranda", "uncoveredVeranda", "plotSize", "yearBuilt", "yearRenovated", "floor", "energyClass", "buildingName", "areaDescription"];
            for (const field of nullableFields) {
              if (!(field in overrides) && toolArgs[field] !== undefined) {
                delete toolArgs[field];
              }
            }
            // Block if no Google Maps link from email
            if (!("locationUrl" in overrides)) {
              delete toolArgs.locationUrl;
              delete toolArgs.coordinates;
              return {
                response: "Thank you for the property details! Before I upload the draft, I need one more thing:\n\nCould you please send me the **Google Maps link** (pin location) for this property? This is required so the reviewer knows the exact location.\n\nOnce you reply with the link, I'll complete the upload right away.",
                success: true,
                toolsUsed,
                tokenCount: totalTokens > 0 ? totalTokens : undefined,
              };
            }
            logger.info("[FORCE TOOL] Applied email override logic (retry path)", {
              category: LogCategory.TOOL,
            });
          }

          // Inject server-side extracted assignTo if the AI omitted it (retry path)
          if (
            (toolName === "createPropertyListing" || toolName === "createLandListing") &&
            !toolArgs.assignTo
          ) {
            const assignMatch = userMessage.match(/assignTo:\s*"([^"]+)"/) || userMessage.match(/MANDATORY ASSIGNMENT:.*?assignTo="([^"]+)"/);
            if (assignMatch) {
              toolArgs.assignTo = assignMatch[1];
              logger.info(`[Email] Injected assignTo="${assignMatch[1]}" into ${toolName} (retry path)`, {
                category: LogCategory.TOOL,
              });
            }
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

/**
 * Parse PRE-EXTRACTED FIELDS block from the email prefix in userMessage.
 * Returns a Record of field→value to override AI's hallucinated tool args.
 * This is the nuclear option: Gemini proved unable to copy values from the prompt,
 * so we extract them server-side and force-inject them into the tool call.
 */
function parsePreExtractedFields(userMessage: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Extract the PRE-EXTRACTED FIELDS block
  const blockMatch = userMessage.match(/PRE-EXTRACTED FIELDS[^\n]*\n([\s\S]*?)(?:\n\n(?:RULES:|MANDATORY|\[Subject:)|\n\[Subject:)/);
  if (!blockMatch) {
    logger.warn("[Email] parsePreExtractedFields: Failed to match PRE-EXTRACTED FIELDS block — AI will use its own extraction", {
      category: LogCategory.TOOL,
      messagePreview: userMessage.substring(0, 200),
    });
    return result;
  }

  const block = blockMatch[1];
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Parse "key: value" or 'key: "value"' patterns
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (!match) continue;

    const key = match[1];
    let value: unknown = match[2].trim();

    // Skip non-field lines
    if (key === "Tool") continue;

    // Parse typed values
    const strVal = value as string;
    if (strVal.startsWith('"')) {
      // String value — find closing quote (handles trailing text like: "none" [warning])
      const closingQuoteIdx = strVal.indexOf('"', 1);
      value = closingQuoteIdx > 0 ? strVal.slice(1, closingQuoteIdx) : strVal.slice(1);
    } else if (strVal === "true") {
      value = true;
    } else if (strVal === "false") {
      value = false;
    } else if (strVal.startsWith("[")) {
      // JSON array (features)
      try { value = JSON.parse(strVal); } catch { /* keep as string */ }
    } else if (strVal.startsWith("{")) {
      // JSON object (coordinates)
      try {
        // Convert "{ lat: 34.83, lon: 32.42 }" to proper JSON
        const jsonStr = strVal.replace(/(\w+):/g, '"$1":');
        value = JSON.parse(jsonStr);
      } catch { /* keep as string */ }
    } else if (/^\d+$/.test(strVal)) {
      value = parseInt(strVal);
    } else if (/^\d+\.\d+$/.test(strVal)) {
      value = parseFloat(strVal);
    }

    result[key] = value;
  }

  return result;
}
