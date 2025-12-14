import "server-only";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import { runWithUserContext } from "@/lib/ai/context";
import { db } from "@/lib/db/client";
import { getMessagesByChatId, saveMessages } from "@/lib/db/queries";
import { agentExecutionLog } from "@/lib/db/schema";
import { convertToUIMessages } from "@/lib/utils";

// Use same model as Vercel web chat for consistent behavior
// Previously used Flash for cost savings, but it caused instruction-following issues
// (e.g., rental registration asking for wrong fields like "marketing price")
const WHATSAPP_MODEL = "chat-model";

import { systemPrompt } from "../ai/prompts";
import { myProvider } from "../ai/providers";
import { calculateCapitalGainsTool } from "../ai/tools/calculate-capital-gains";
import { calculateTransferFeesTool } from "../ai/tools/calculate-transfer-fees";
import { calculateVATTool } from "../ai/tools/calculate-vat";
import { createLandListingTool } from "../ai/tools/create-land-listing";
import { createListingTool } from "../ai/tools/create-listing";
import { getZyprusDataTool } from "../ai/tools/get-zyprus-data";
import { listListingsTool } from "../ai/tools/list-listings";
import { uploadLandListingTool } from "../ai/tools/upload-land-listing";
import { uploadListingTool } from "../ai/tools/upload-listing";
import { isProductionEnvironment } from "../constants";
import type { ChatMessage } from "../types";
import { generateUUID } from "../utils";
import { getWhatsAppClient } from "./client";
import { getDocumentType, shouldSendAsDocument } from "./document-detector";
import { generateDocx } from "./docx-generator";
import { formatForWhatsApp, splitEmailParts } from "./text-utils";
import { createWhatsAppSendDocumentTool } from "./tools/send-document-whatsapp";
import type { WaSenderMessageData } from "./types";
import {
  getOrCreateWhatsAppChat,
  getOrCreateWhatsAppUser,
  updateAgentLastActive,
} from "./user-mapping";

/**
 * Handle incoming WhatsApp message and generate AI response
 */
export async function handleWhatsAppMessage(
  messageData: WaSenderMessageData
): Promise<void> {
  // Only handle text messages, skip group messages
  if (messageData.type !== "text" || !messageData.text || messageData.isGroup) {
    console.log(
      "Skipping WhatsApp message:",
      messageData.type,
      messageData.isGroup ? "group" : ""
    );
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

  try {
    // Try to get or create user from DB (non-blocking if fails)
    try {
      const dbUser = await getOrCreateWhatsAppUser(phoneNumber);
      const dbChat = await getOrCreateWhatsAppChat(dbUser.id, phoneNumber);

      // Use DB user context if available
      userContext = {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name || phoneNumber,
        type: dbUser.type,
      };

      // Update agent last active if this is a registered agent
      if (dbUser.agentId) {
        await updateAgentLastActive(dbUser.agentId);
      }

      // Log incoming message
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
      console.warn("[WhatsApp] DB operations failed, using fallback context:", {
        error: dbError instanceof Error ? dbError.message : "Unknown error",
        phoneNumber,
      });
      // Continue with default user context - AI will still respond
    }

    // Simplified WhatsApp flow - no router step, direct to main model
    // This reduces API calls and quota usage significantly
    let fullResponse = "";

    // Get chat ID for conversation history (use deterministic UUID as fallback)
    // Generate a deterministic UUID from phone number for fallback (avoids DB UUID constraint errors)
    let sessionChatId = generateUUID(); // Fallback: new UUID each time (no history but no errors)
    let hasDbChat = false;
    try {
      const dbUser = await getOrCreateWhatsAppUser(phoneNumber);
      const dbChat = await getOrCreateWhatsAppChat(dbUser.id, phoneNumber);
      sessionChatId = dbChat.id;
      hasDbChat = true;
    } catch (dbErr) {
      console.warn("[WhatsApp] Failed to get chat ID, messages won't be saved:", dbErr);
    }

    // Get message history from database for conversation continuity
    let previousMessages: ChatMessage[] = [];
    try {
      const messagesFromDb = await getMessagesByChatId({ id: sessionChatId });
      previousMessages = convertToUIMessages(messagesFromDb);
      console.log(
        "[WhatsApp] Retrieved",
        previousMessages.length,
        "previous messages for context"
      );
    } catch (historyErr) {
      console.warn(
        "[WhatsApp] Failed to retrieve message history:",
        historyErr
      );
      // Continue without history - AI will still respond
    }

    // Prepare system prompt
    console.log("[WhatsApp] Building system prompt...");
    const baseSystemPrompt = await systemPrompt({
      selectedChatModel: WHATSAPP_MODEL,
      requestHints: {
        latitude: undefined,
        longitude: undefined,
        city: undefined,
        country: "Cyprus",
      },
      userMessage,
    });
    console.log("[WhatsApp] System prompt length:", baseSystemPrompt.length);

    // Add WhatsApp-specific platform context
    const whatsappContext = `
PLATFORM CONTEXT: WhatsApp Mobile Messaging
- Users are on mobile and expect quick, concise text responses
- Calculator results (VAT, transfer fees, capital gains) should ALWAYS be formatted as text, NOT documents
- Only generate documents when users EXPLICITLY ask: "send document", "generate form", "email me the form", etc.
- For calculator queries, provide clear, formatted text responses with tables if needed
- Use emojis sparingly for better readability on mobile
- Keep responses concise but complete
- DO NOT auto-generate documents based on content - wait for explicit user request
- CRITICAL: You have access to full conversation history. Review previous messages to understand what information the user has ALREADY PROVIDED. DO NOT ask for details that have already been given in earlier messages.
- When collecting listing details, track which fields have been provided and only ask for MISSING information.
`;

    const finalSystemPrompt = baseSystemPrompt + whatsappContext;

    // Main Chat Execution (Flash Model - higher quota limits)
    const chatModel = myProvider.languageModel(WHATSAPP_MODEL);
    const newUserMessage: ChatMessage = {
      id: generateUUID(),
      role: "user",
      parts: [{ type: "text", text: userMessage }],
    };

    // Save user message to database BEFORE AI processing (only if we have a valid DB chat)
    if (hasDbChat) {
      try {
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
        console.log("[WhatsApp] Saved user message to database");
      } catch (saveErr) {
        console.warn("[WhatsApp] Failed to save user message:", saveErr);
      }
    }

    // Combine previous messages with new message for full context
    const allMessages = [...previousMessages, newUserMessage];

    // Wrap AI execution with user context so tools can access user info
    const aiUserContext = {
      user: {
        id: userContext.id,
        email: userContext.email,
        name: userContext.name,
        type: userContext.type,
      },
    };

    console.log(
      "[WhatsApp] Starting AI generation with",
      allMessages.length,
      "messages..."
    );
    const assistantMessageId = generateUUID();
    // Generate AI response with retry mechanism
    let result: any = null;
    let retryCount = 0;
    const MAX_RETRIES = 2;
    const STREAM_TIMEOUT_MS = 45_000; // 45 seconds

    while (retryCount <= MAX_RETRIES) {
      try {
        result = await runWithUserContext(aiUserContext, async () => {
          return await streamText({
            model: chatModel,
            system: finalSystemPrompt,
            messages: convertToModelMessages(allMessages),
            temperature: 0, // Match web chat for strict instruction following
            stopWhen: stepCountIs(5), // Limit tool call chains to 5 steps max
            experimental_activeTools: [
              "calculateTransferFees",
              "calculateCapitalGains",
              "calculateVAT",
              // "getGeneralKnowledge", // DISABLED - Knowledge now embedded in system prompt
              "createListing",
              "listListings",
              "uploadListing",
              "getZyprusData",
              "createLandListing",
              "uploadLandListing",
              "sendDocument",
            ],
            tools: {
              calculateTransferFees: calculateTransferFeesTool,
              calculateCapitalGains: calculateCapitalGainsTool,
              calculateVAT: calculateVATTool,
              // getGeneralKnowledge, // DISABLED - Knowledge now embedded in system prompt
              createListing: createListingTool,
              listListings: listListingsTool,
              uploadListing: uploadListingTool,
              getZyprusData: getZyprusDataTool,
              createLandListing: createLandListingTool,
              uploadLandListing: uploadLandListingTool,
              sendDocument: createWhatsAppSendDocumentTool(phoneNumber),
            },
            experimental_telemetry: {
              isEnabled: isProductionEnvironment,
              functionId: "whatsapp-stream-text",
            },
          });
        });
        break; // Success - exit retry loop
      } catch (streamError) {
        retryCount++;
        console.error(`[WhatsApp] AI stream attempt ${retryCount} failed:`, {
          phoneNumber,
          attempt: retryCount,
          error: streamError instanceof Error ? streamError.message : "Unknown",
        });

        if (retryCount > MAX_RETRIES) {
          throw new Error(
            `AI service unavailable after ${MAX_RETRIES} retries: ${streamError instanceof Error ? streamError.message : "Unknown error"}`
          );
        }

        // Wait before retry (exponential backoff: 1s, 2s)
        await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount));
      }
    }

    // Collect response text with timeout protection
    const streamStartTime = Date.now();

    // TypeScript: result is guaranteed to be defined here (retry loop ensures it)
    if (!result) {
      throw new Error("AI model failed to initialize");
    }

    for await (const textPart of result.textStream) {
      // Check for timeout
      if (Date.now() - streamStartTime > STREAM_TIMEOUT_MS) {
        console.error("[WhatsApp] AI stream timeout exceeded", {
          phoneNumber,
          duration: Date.now() - streamStartTime,
          partialResponse: fullResponse.substring(0, 200),
        });
        throw new Error("Response generation timeout");
      }

      fullResponse += textPart;
    }
    console.log(
      "[WhatsApp] AI response collected, length:",
      fullResponse.length
    );

    // Save assistant response to database for conversation continuity (only if we have a valid DB chat)
    if (hasDbChat) {
      try {
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
        console.log("[WhatsApp] Saved assistant message to database");
      } catch (saveErr) {
        console.warn("[WhatsApp] Failed to save assistant message:", saveErr);
      }
    }

    console.log(
      "[WhatsApp] AI generation complete, response length:",
      fullResponse.length
    );

    // Determine if response should be sent as document (forms) or text (emails)
    if (shouldSendAsDocument(fullResponse)) {
      // Generate .docx for forms (templates 01-16)
      console.log("[WhatsApp] Sending as document...");
      const docBuffer = await generateDocx(fullResponse);
      const docType = getDocumentType(fullResponse);
      const filename = `SOFIA_${docType}_${Date.now()}.docx`;

      const docResult = await client.sendDocument({
        to: phoneNumber,
        document: docBuffer,
        filename,
        caption: "Here is your completed document.",
      });
      console.log("[WhatsApp] Document send result:", docResult);
    } else {
      // Send as plain text messages (emails, calculations, etc.)
      // Format: 1st message = subject, 2nd message = body, 3rd message = notes/warnings
      console.log("[WhatsApp] Sending as text messages...");
      const formattedResponse = formatForWhatsApp(fullResponse);

      // Split into subject, body, and notes (3 parts)
      const emailParts = splitEmailParts(formattedResponse);

      if (emailParts.subject) {
        // Send subject as first message
        console.log("[WhatsApp] Sending subject (1/3)...");
        await client.sendMessage({
          to: phoneNumber,
          text: emailParts.subject,
        });

        // Small delay to ensure message order
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Send body as second message
        console.log("[WhatsApp] Sending body (2/3)...");
        const bodyResult = await client.sendLongMessage({
          to: phoneNumber,
          text: emailParts.body,
        });
        console.log("[WhatsApp] Body send result:", bodyResult);

        // Send notes as third message if present
        if (emailParts.notes) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          console.log("[WhatsApp] Sending notes (3/3)...");
          await client.sendMessage({
            to: phoneNumber,
            text: emailParts.notes,
          });
        }
      } else {
        // No subject line, send as single message (for non-email responses like calculations)
        const textResult = await client.sendLongMessage({
          to: phoneNumber,
          text: formattedResponse,
        });
        console.log("[WhatsApp] Text send result:", textResult);
      }
    }
  } catch (error) {
    console.error("Error handling WhatsApp message:", {
      error: error instanceof Error ? error.message : "Unknown error",
      from: phoneNumber,
      messageText: userMessage.substring(0, 100),
    });

    // Send error message to user
    try {
      await client.sendMessage({
        to: phoneNumber,
        text: "I encountered an error processing your message. Please try again or rephrase your question.",
      });
    } catch (sendError) {
      console.error("Failed to send error message:", sendError);
    }
  }
}

// NOTE: splitSubjectFromBody and formatForWhatsApp moved to ./text-utils.ts for testability
