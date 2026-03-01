import "server-only";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessageStreamWriter,
} from "ai";
import { runWithUserContext } from "@/lib/ai/context";
import { pruneConversationHistory } from "@/lib/ai/conversation-pruning";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { myProvider } from "@/lib/ai/providers";
import { getToolConfig } from "@/lib/ai/tools/registry";
import { createCircuitBreaker } from "@/lib/circuit-breakers";
import { isProductionEnvironment } from "@/lib/constants";
import { db } from "@/lib/db/client";
import { getMessagesByChatIdWithHistory, saveMessages } from "@/lib/db/queries";
import { agentExecutionLog } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import type { ChatMessage } from "@/lib/types";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { getWhatsAppClient } from "./client";
import type { WaSenderMessageData } from "./types";
import {
  getOrCreateWhatsAppChat,
  getOrCreateWhatsAppUser,
  updateAgentLastActive,
} from "./user-mapping";

const log = logger.whatsapp.child("handler");

/**
 * Handle incoming WhatsApp message and generate AI response
 * Uses EXACT same logic as web chat route for identical responses
 */
export async function handleWhatsAppMessage(
  messageData: WaSenderMessageData
): Promise<void> {
  // Only handle text messages, skip group messages
  if (messageData.type !== "text" || !messageData.text || messageData.isGroup) {
    if (isProductionEnvironment) {
      log.debug("Skipping WhatsApp message", {
        type: messageData.type,
        isGroup: messageData.isGroup,
      });
    }
    return;
  }

  const client = getWhatsAppClient();
  const phoneNumber = messageData.from;
  const userMessage = messageData.text;

  // Default user context (used if DB fails)
  let userContext: {
    id: string;
    email: string;
    name: string;
    type: "guest" | "regular";
  } = {
    id: `whatsapp-${phoneNumber}`,
    email: `${phoneNumber}@whatsapp.local`,
    name: messageData.sender?.name || phoneNumber,
    type: "guest",
  };

  let sessionChatId = generateUUID();
  let hasDbChat = false;

  try {
    // Try to get or create user from DB
    try {
      const dbUser = await getOrCreateWhatsAppUser(phoneNumber);
      const dbChat = await getOrCreateWhatsAppChat(dbUser.id, phoneNumber);

      sessionChatId = dbChat.id;
      hasDbChat = true;

      userContext = {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name || phoneNumber,
        type: dbUser.type,
      };

      if (dbUser.agentId) {
        await updateAgentLastActive(dbUser.agentId);
      }

      await db.insert(agentExecutionLog).values({
        agentType: "whatsapp",
        action: "message_received",
        modelUsed: "user",
        success: true,
        metadata: {
          from: phoneNumber,
          message: userMessage,
          isGroup: messageData.isGroup,
          userId: dbUser.id,
          chatId: dbChat.id,
          isAgent: dbUser.isAgent,
        },
      });
    } catch (dbError) {
      log.warn("DB operations failed, using fallback context", { error: String(dbError) });
    }

    // Get message history - last 30 days for context
    let previousMessages: ChatMessage[] = [];
    if (hasDbChat) {
      try {
        const messagesFromDb = await getMessagesByChatIdWithHistory({
          id: sessionChatId,
          days: 30,
        });
        previousMessages = convertToUIMessages(messagesFromDb);
      } catch (err) {
        log.warn("Failed to retrieve history", { error: String(err) });
      }
    }

    // Create new user message - EXACT same structure as web
    const newUserMessage: ChatMessage = {
      id: generateUUID(),
      role: "user",
      parts: [{ type: "text", text: userMessage }],
    };

    // Build message array - EXACT same as web
    const allMessages = [...previousMessages, newUserMessage];

    // Prune conversation history - EXACT same as web
    const uiMessages = pruneConversationHistory(allMessages);

    // Save user message
    if (hasDbChat) {
      await saveMessages({
        messages: [
          {
            chatId: sessionChatId,
            id: newUserMessage.id,
            role: "user",
            parts: newUserMessage.parts,
            attachments: [],
            createdAt: new Date(),
          },
        ],
      });
    }

    // Request hints - EXACT same as web (no geolocation for WhatsApp)
    const requestHints: RequestHints = {
      longitude: undefined,
      latitude: undefined,
      city: undefined,
      country: "Cyprus",
    };

    // Extract user message text for smart template loading - EXACT same as web
    const userMessageText = newUserMessage.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join(" ");

    // System prompt - EXACT same as web (NO WhatsApp-specific context)
    const systemPromptValue = await systemPrompt({
      selectedChatModel: DEFAULT_CHAT_MODEL, // Use default model, not fixed gemini3
      requestHints,
      userMessage: userMessageText,
    });

    // Create a mock dataStream for tools (WhatsApp can't show UI forms)
    // Tools will still work but won't show forms - they'll return text responses
    const mockDataStream = {
      write: () => {
        // WhatsApp can't show UI forms, so we ignore dataStream writes
        // Tools will still execute and return text responses
      },
      merge: () => {
        // No-op for WhatsApp
      },
      onError: () => {
        // No-op for WhatsApp
      },
    } as unknown as UIMessageStreamWriter<ChatMessage>;

    // Mock session for tools
    // Create session-like object for tool context
    // Note: This is a minimal mock that satisfies tool requirements without full NextAuth Session
    const mockSession = {
      user: {
        id: userContext.id,
        email: userContext.email,
        name: userContext.name,
        type: userContext.type,
      },
      expires: new Date(Date.now() + 86400000).toISOString(), // 24h from now
    };

    const aiUserContext = { user: userContext };

    // Generate AI response - EXACT same as web
    log.info("Starting AI response generation", {
      user: userContext.name,
      messagePreview: userMessage.substring(0, 50),
      model: DEFAULT_CHAT_MODEL,
    });

    // Result type inferred from streamText call
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: Awaited<ReturnType<typeof streamText<any>>> | null = null;
    let retryCount = 0;
    const MAX_RETRIES = 2;

    while (retryCount <= MAX_RETRIES) {
      try {
        // Get tool configuration from registry - single source of truth
        const { tools, activeTools } = getToolConfig({
          session: mockSession,
          dataStream: mockDataStream,
        });

        // Wrap AI call in circuit breaker for resilience
        const aiBreaker = createCircuitBreaker(
          async () => {
            return await runWithUserContext(aiUserContext, async () => {
              return await streamText({
                model: myProvider.languageModel(DEFAULT_CHAT_MODEL),
                system: systemPromptValue,
                messages: convertToModelMessages(uiMessages),
                temperature: 0,
                stopWhen: stepCountIs(5),
                experimental_activeTools: activeTools,
                tools,
                experimental_telemetry: {
                  isEnabled: isProductionEnvironment,
                  functionId: "whatsapp-stream-text",
                },
                // Provider-specific options for token limiting (OpenRouter/Gemini)
                providerOptions: {
                  openai: {
                    max_tokens: 4096, // Prevent runaway token costs
                  },
                },
              });
            });
          },
          { name: "WhatsApp-AI", timeout: 30000 }
        );

        result = await aiBreaker.fire();
        break;
      } catch (err) {
        retryCount++;
        if (retryCount > MAX_RETRIES) {
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount));
      }
    }

    // Collect stream - EXACT same as web
    if (!result) {
      throw new Error("AI failed to initialize");
    }

    let fullResponse = "";
    const assistantMessageId = generateUUID();

    for await (const textPart of result.textStream) {
      fullResponse += textPart;
    }

    // Check if we got a response
    if (!fullResponse || fullResponse.trim().length === 0) {
      throw new Error("AI returned empty response");
    }

    // Save assistant message
    if (hasDbChat) {
      await saveMessages({
        messages: [
          {
            chatId: sessionChatId,
            id: assistantMessageId,
            role: "assistant",
            parts: [{ type: "text", text: fullResponse }],
            attachments: [],
            createdAt: new Date(),
          },
        ],
      });
    }

    // Send response via WhatsApp - just send the text, no formatting or document detection
    await client.sendLongMessage({
      to: phoneNumber,
      text: fullResponse,
    });
  } catch (error) {
    log.error("Error handling WhatsApp message", error);
    
    // Determine error message based on error type
    let errorMessage = "I encountered an error. Please try again or rephrase.";
    
    if (error instanceof Error) {
      // Check for quota exhaustion
      if (
        error.message.includes("Resource has been exhausted") ||
        error.message.includes("quota") ||
        error.message.includes("429")
      ) {
        errorMessage =
          "I'm currently experiencing high demand. Please try again in a few moments.";
      } else if (error.message.includes("empty response")) {
        errorMessage =
          "I couldn't generate a response. Please try rephrasing your question.";
      } else if (error.message.includes("failed to initialize")) {
        errorMessage =
          "I'm having trouble connecting. Please try again in a moment.";
      }
    }

    try {
      await client.sendMessage({
        to: phoneNumber,
        text: errorMessage,
      });
    } catch (sendError) {
      log.error("Failed to send error message", sendError);
      // ignore - can't do anything if we can't send messages
    }
  }
}
