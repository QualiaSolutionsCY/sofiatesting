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
import { calculateCapitalGainsTool } from "@/lib/ai/tools/calculate-capital-gains";
import { calculateTransferFeesTool } from "@/lib/ai/tools/calculate-transfer-fees";
import { calculateVATTool } from "@/lib/ai/tools/calculate-vat";
import { createLandListingTool } from "@/lib/ai/tools/create-land-listing";
import { createListingTool } from "@/lib/ai/tools/create-listing";
import { getZyprusDataTool } from "@/lib/ai/tools/get-zyprus-data";
import { listListingsTool } from "@/lib/ai/tools/list-listings";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { sendDocument } from "@/lib/ai/tools/send-document";
import { uploadLandListingTool } from "@/lib/ai/tools/upload-land-listing";
import { uploadListingTool } from "@/lib/ai/tools/upload-listing";
import { isProductionEnvironment } from "@/lib/constants";
import { db } from "@/lib/db/client";
import { getMessagesByChatId, saveMessages } from "@/lib/db/queries";
import { agentExecutionLog } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { getWhatsAppClient } from "./client";
import type { WaSenderMessageData } from "./types";
import {
  getOrCreateWhatsAppChat,
  getOrCreateWhatsAppUser,
  updateAgentLastActive,
} from "./user-mapping";

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
      console.log(
        "Skipping WhatsApp message:",
        messageData.type,
        messageData.isGroup ? "group" : ""
      );
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
      console.warn(
        "[WhatsApp] DB operations failed, using fallback context:",
        dbError
      );
    }

    // Get message history - EXACT same as web
    let previousMessages: ChatMessage[] = [];
    if (hasDbChat) {
      try {
        const messagesFromDb = await getMessagesByChatId({ id: sessionChatId });
        previousMessages = convertToUIMessages(messagesFromDb);
      } catch (err) {
        console.warn("[WhatsApp] Failed to retrieve history:", err);
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
    const mockSession = {
      user: {
        id: userContext.id,
        email: userContext.email,
        name: userContext.name,
        type: userContext.type,
      },
    } as any;

    const aiUserContext = { user: userContext };

    // Generate AI response - EXACT same as web
    console.log("[WhatsApp AI] Starting AI response generation for:", {
      user: userContext.name,
      messagePreview: userMessage.substring(0, 50),
      model: DEFAULT_CHAT_MODEL,
    });

    let result: any = null;
    let retryCount = 0;
    const MAX_RETRIES = 2;

    while (retryCount <= MAX_RETRIES) {
      try {
        result = await runWithUserContext(aiUserContext, async () => {
          return await streamText({
            model: myProvider.languageModel(DEFAULT_CHAT_MODEL),
            system: systemPromptValue,
            messages: convertToModelMessages(uiMessages),
            temperature: 0,
            stopWhen: stepCountIs(5),
            experimental_activeTools: [
              "calculateTransferFees",
              "calculateCapitalGains",
              "calculateVAT",
              "createListing",
              "listListings",
              "uploadListing",
              "createLandListing",
              "uploadLandListing",
              "getZyprusData",
              "requestSuggestions",
              "sendDocument",
            ],
            tools: {
              calculateTransferFees: calculateTransferFeesTool,
              calculateCapitalGains: calculateCapitalGainsTool,
              calculateVAT: calculateVATTool,
              createListing: createListingTool,
              listListings: listListingsTool,
              uploadListing: uploadListingTool,
              createLandListing: createLandListingTool,
              uploadLandListing: uploadLandListingTool,
              getZyprusData: getZyprusDataTool,
              requestSuggestions: requestSuggestions({
                session: mockSession,
                dataStream: mockDataStream,
              }),
              sendDocument: sendDocument({
                session: mockSession,
                dataStream: mockDataStream,
              }),
            },
            experimental_telemetry: {
              isEnabled: isProductionEnvironment,
              functionId: "whatsapp-stream-text",
            },
          });
        });
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
    console.error("Error handling WhatsApp message:", error);
    
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
      console.error("Failed to send error message:", sendError);
      // ignore - can't do anything if we can't send messages
    }
  }
}
