import "server-only";
import { convertToModelMessages, streamText } from "ai";
import { systemPrompt } from "../ai/prompts";
import { myProvider } from "../ai/providers";
import { getTelegramToolConfig } from "../ai/tools/registry";
import { isProductionEnvironment } from "../constants";
import {
  getChatById,
  getMessagesByChatIdWithHistory,
  saveChat,
  saveMessages,
} from "../db/queries";
import {
  generateFilePath,
  uploadToSupabaseStorage,
} from "../storage/upload-file";
import type { ChatMessage } from "../types";
import { convertToUIMessages, generateUUID } from "../utils";
import { getTelegramClient } from "./client";
import { handleGroupMessage, isGroupChat } from "./lead-router";
import type { TelegramMessage } from "./types";
import { getTelegramChatId, getTelegramUser } from "./user-mapping";

// Top-level regex patterns for quick responses (performance optimization)
const GREETING_PATTERN =
  /^(hi|hello|hey|hiya|yo|sup|hola|good morning|good afternoon|good evening|morning|afternoon|evening)[\s!.,?]*$/i;
const HOW_ARE_YOU_PATTERN =
  /how are you|how r u|how're you|hows it going|what's up|whats up|wassup/i;
const THANKS_PATTERN =
  /^(thanks|thank you|thx|ty|cheers|appreciated|much appreciated)[\s!.,?]*$/i;
const GOODBYE_PATTERN =
  /^(bye|goodbye|see you|cya|later|take care|gtg|gotta go)[\s!.,?]*$/i;
const HELP_PATTERN =
  /can you help|help me|what can you do|what do you do|your capabilities|your features/i;
const WHO_ARE_YOU_PATTERN =
  /who are you|what are you|your name|introduce yourself/i;
const YES_PATTERN =
  /^(yes|yeah|yep|yup|ok|okay|sure|alright|got it|understood|k)[\s!.,?]*$/i;
const NO_PATTERN = /^(no|nope|nah|not really|nothing)[\s!.,?]*$/i;
const SORRY_PATTERN = /^(sorry|my bad|apologies|oops)[\s!.,?]*$/i;
const DIGIT_PATTERN = /\d/;
const PROPERTY_IMAGE_PATTERN = /property|listing|house|apartment|villa/i;
const TITLE_DEED_PATTERN = /title|deed|document|pdf/i;

/**
 * Handle incoming Telegram message and generate AI response
 */
export async function handleTelegramMessage(
  message: TelegramMessage
): Promise<void> {
  if (!message.from || message.from.is_bot) {
    return; // Ignore bot messages
  }

  // Handle group/supergroup messages differently (lead forwarding)
  if (isGroupChat(message.chat.type)) {
    await handleGroupMessage(message);
    return;
  }

  // From here on, we're handling private (1-on-1) chat messages
  if (!message.text && !message.photo && !message.document) {
    // Handle unsupported message types
    await sendTelegramMessage(
      message.chat.id,
      "I can process text messages, photos, and documents. Please send me one of those!"
    );
    return;
  }

  const telegramClient = getTelegramClient();
  const chatId = message.chat.id;

  // Handle photo/document uploads (for property listings)
  if (message.photo || message.document) {
    await handleFileUpload(message);
    return;
  }

  // From here, message.text is guaranteed to exist
  if (!message.text) {
    return;
  }

  // Handle bot commands
  const command = message.text.split(" ")[0].toLowerCase();

  switch (command) {
    case "/start":
      await handleStartCommand(chatId, message.from.first_name);
      return;
    case "/help":
      await handleHelpCommand(chatId);
      return;
    case "/templates":
    case "/template":
      await handleTemplatesCommand(chatId);
      return;
    case "/vat":
      await handleVATCommand(chatId);
      return;
    case "/transfer":
      await handleTransferCommand(chatId);
      return;
    case "/capitalgains":
      await handleCapitalGainsCommand(chatId);
      return;
    case "/examples":
      await handleExamplesCommand(chatId);
      return;
    case "/clear":
      await handleClearCommand(chatId, message.from.id);
      return;
    case "/about":
      await handleAboutCommand(chatId);
      return;
    default:
      // Not a known command, continue to handle as regular message
      break;
  }

  // Handle quick conversational responses (no AI needed)
  const quickResponse = getQuickResponse(message.text, message.from.first_name);
  if (quickResponse) {
    await sendTelegramMessage(chatId, quickResponse);
    return;
  }

  // Get the model once for use in both streaming and error logging
  // Using Flash-Lite for Telegram - cheapest and fastest model
  const chatModel = myProvider.languageModel("chat-model-flash-lite");

  try {
    // Show typing indicator
    await telegramClient.sendChatAction({ chatId });

    // Get or create user
    const dbUser = await getTelegramUser(message.from);

    // Get or create persistent chat session
    const sessionChatId = getTelegramChatId(message.from.id);

    // Check if chat exists
    const chat = await getChatById({ id: sessionChatId });

    if (!chat) {
      // Create new chat session
      await saveChat({
        id: sessionChatId,
        userId: dbUser.id,
        title: `Telegram Chat - ${message.from.first_name}`,
        visibility: "private",
      });
    }

    // Get message history - last 30 days for context
    const messagesFromDb = await getMessagesByChatIdWithHistory({
      id: sessionChatId,
      days: 30,
    });
    const previousMessages = convertToUIMessages(messagesFromDb);

    // Create new user message
    const userMessage: ChatMessage = {
      id: generateUUID(),
      role: "user",
      parts: [{ type: "text", text: message.text }],
    };

    // Save user message to database
    await saveMessages({
      messages: [
        {
          chatId: sessionChatId,
          id: userMessage.id,
          role: "user",
          parts: userMessage.parts,
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });

    // Prepare messages for AI
    const allMessages = [...previousMessages, userMessage];

    // Generate AI response with retry mechanism
    let fullResponse = "";
    const assistantMessageId = generateUUID();
    let result: any = null;
    let retryCount = 0;
    const MAX_RETRIES = 2;
    const STREAM_TIMEOUT_MS = 45_000; // 45 seconds

    // Get Telegram-specific tool configuration from registry
    // Note: uploadListing deliberately NOT added - listings require reviewer approval
    const { tools, activeTools } = getTelegramToolConfig();

    while (retryCount <= MAX_RETRIES) {
      try {
        result = await streamText({
          model: chatModel, // Gemini 2.5 Flash-Lite - cheapest & fastest
          system: await systemPrompt({
            selectedChatModel: "chat-model-flash-lite",
            requestHints: {
              latitude: undefined,
              longitude: undefined,
              city: undefined,
              country: "Cyprus", // Default to Cyprus for SOFIA
            },
            userMessage: message.text,
          }),
          messages: convertToModelMessages(allMessages),
          experimental_activeTools: activeTools,
          tools,
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: "telegram-stream-text",
          },
        });
        break; // Success - exit retry loop
      } catch (streamError) {
        retryCount++;
        console.error(`AI stream attempt ${retryCount} failed:`, {
          chatId,
          attempt: retryCount,
          error: streamError instanceof Error ? streamError.message : "Unknown",
          stack: streamError instanceof Error ? streamError.stack : undefined,
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
    const TYPING_INTERVAL_MS = 3000; // 3 seconds
    let lastTypingIndicator = Date.now();
    const streamStartTime = Date.now();

    // TypeScript: result is guaranteed to be defined here (retry loop ensures it)
    if (!result) {
      throw new Error("AI model failed to initialize");
    }

    for await (const textPart of result.textStream) {
      // Check for timeout
      if (Date.now() - streamStartTime > STREAM_TIMEOUT_MS) {
        console.error("AI stream timeout exceeded", {
          chatId,
          duration: Date.now() - streamStartTime,
          partialResponse: fullResponse.substring(0, 200),
        });
        throw new Error("Response generation timeout");
      }

      fullResponse += textPart;

      // Send typing indicator periodically (time-based, not character-based)
      const now = Date.now();
      if (now - lastTypingIndicator >= TYPING_INTERVAL_MS) {
        await telegramClient.sendChatAction({ chatId });
        lastTypingIndicator = now;
      }
    }

    // Tool results will be included in the text stream automatically

    // Save assistant message to database
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

    // Format response for Telegram (plain text mode)
    const telegramFormattedResponse = formatForTelegram(fullResponse);

    // Send response to Telegram with plain text mode
    await telegramClient.sendLongMessage({
      chatId,
      text: telegramFormattedResponse,
      replyToMessageId: message.message_id,
      parseMode: undefined, // Use plain text mode to avoid HTML parsing errors
    });
  } catch (error) {
    const errorId = Date.now();
    console.error("Error handling Telegram message:", {
      errorId,
      chatId,
      fromUser: message.from,
      messageText: message.text?.substring(0, 100),
      error,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      errorStack: error instanceof Error ? error.stack : undefined,
      modelName: chatModel.modelId, // Log the actual model being used
    });

    try {
      // Send user-friendly error message with error ID for support
      await telegramClient.sendMessage({
        chatId,
        text:
          "⚠️ I encountered an error processing your message.\n\n" +
          "Please try:\n" +
          "• Rephrasing your question\n" +
          "• Using /help for commands\n" +
          "• Contacting support if this persists\n\n" +
          `Error ID: ${errorId}`,
        replyToMessageId: message.message_id,
        parseMode: undefined, // Plain text mode
      });
    } catch (sendError) {
      console.error("Failed to send error message to Telegram:", {
        errorId,
        chatId,
        sendError:
          sendError instanceof Error ? sendError.message : "Unknown error",
        originalError: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}

/**
 * Format text for Telegram
 * Converts markdown to plain text for maximum compatibility
 * Avoids HTML parsing errors by using plain text mode
 */
function formatForTelegram(text: string): string {
  let formatted = text;

  // Remove markdown formatting for plain text mode
  // Bold: **text** -> text (keep content only)
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, "$1");

  // Italic: *text* -> text (keep content only)
  formatted = formatted.replace(/\*(.+?)\*/g, "$1");

  // Code blocks: ```code``` -> code (keep content only)
  formatted = formatted.replace(/```[\s\S]*?```/g, (match) => {
    const code = match.replace(/```/g, "").trim();
    return code;
  });

  // Inline code: `code` -> code (keep content only)
  formatted = formatted.replace(/`([^`]+)`/g, "$1");

  // Clean up multiple newlines (keep max 2 consecutive newlines)
  formatted = formatted.replace(/\n{3,}/g, "\n\n");

  // Keep newlines as-is - Telegram preserves them in plain text mode
  // No need to convert to <br> tags

  return formatted.trim();
}

/**
 * Send a message to Telegram (helper function)
 */
async function sendTelegramMessage(
  chatId: number,
  text: string
): Promise<void> {
  const telegramClient = getTelegramClient();
  await telegramClient.sendMessage({ chatId, text });
}

/**
 * Get quick response for casual conversation
 * Returns null if message should go to AI
 */
function getQuickResponse(text: string, firstName: string): string | null {
  const msg = text.toLowerCase().trim();

  // Greetings (using top-level pattern)
  if (GREETING_PATTERN.test(msg)) {
    const greetings = [
      `Hi ${firstName}! How can I help you with Cyprus property today?`,
      "Hello! Ready to help with property calculations or documents.",
      `Hey ${firstName}! Ask me about VAT, transfer fees, or templates.`,
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  // How are you (using top-level pattern)
  if (HOW_ARE_YOU_PATTERN.test(msg)) {
    return `I'm great, thanks! Ready to help with Cyprus real estate. What do you need?`;
  }

  // Thank you (using top-level pattern)
  if (THANKS_PATTERN.test(msg)) {
    return `You're welcome! Let me know if you need anything else.`;
  }

  // Goodbye (using top-level pattern)
  if (GOODBYE_PATTERN.test(msg)) {
    return `Goodbye ${firstName}! Come back anytime for property help.`;
  }

  // Can you help / what can you do (using top-level pattern)
  if (HELP_PATTERN.test(msg)) {
    return `I can help with:
- VAT calculations for new properties
- Transfer fees for purchases
- Capital gains tax estimates
- 43 document templates

Just ask! Example: "VAT for 350000 apartment 120sqm"`;
  }

  // Who are you (using top-level pattern)
  if (WHO_ARE_YOU_PATTERN.test(msg)) {
    return `I'm SOFIA, Zyprus Property Group's AI assistant. I help with Cyprus property taxes, fees, and documents. Ask me anything!`;
  }

  // Yes/No/Ok responses (using top-level pattern)
  if (YES_PATTERN.test(msg)) {
    return "Great! What would you like to know about Cyprus property?";
  }

  // No/Nope (using top-level pattern)
  if (NO_PATTERN.test(msg)) {
    return `No problem! I'm here if you need property calculations or documents.`;
  }

  // Sorry (using top-level pattern)
  if (SORRY_PATTERN.test(msg)) {
    return "No worries! How can I help you?";
  }

  // Emoji-only or very short (using top-level pattern)
  if (msg.length <= 3 && !DIGIT_PATTERN.test(msg)) {
    return `Need help with Cyprus property? Try "transfer fees for 400000" or /help`;
  }

  // Not a quick response - let AI handle it
  return null;
}

/**
 * Handle /templates command - List all available templates
 */
async function handleTemplatesCommand(chatId: number): Promise<void> {
  const templatesList = `📋 SOFIA Template Library - 43 Available Templates

🏢 REGISTRATION TEMPLATES (1-8)
1. Standard Seller Registration
2. Seller with Marketing Agreement
3. Rental Property Registration
4. Advanced Seller Registration
5. Bank Property Registration
6. Bank Land Registration
7. Developer Registration (with viewing)
8. Developer Registration (no viewing)

👁️ VIEWING & RESERVATIONS (9-13)
9. Standard Viewing Form
10. Advanced Viewing Form
11. Multiple Persons Viewing Form
12. Property Reservation Form
13. Property Reservation Agreement

📢 MARKETING AGREEMENTS (14-16)
14. Email Marketing Agreement
15. Non-Exclusive Marketing Agreement
16. Exclusive Marketing Agreement

📧 CLIENT COMMUNICATIONS (17-33)
17. Good Client Request - Email
18. Good Client Request - WhatsApp
19. Valuation Quote
20. Valuation Request Received
21. Client Not Providing Phone
22. Follow-up Multiple Properties
23. Follow-up Single Property
24. Buyer Viewing Confirmation
25. No Options - Low Budget
26. Multiple Areas Issue
27. Time Wasters Polite Decline
28. Still Looking Follow-up
29. No Agent Cooperation
30. AML/KYC Record Keeping
31. Selling Request Received
32. Recommended Pricing Advice
33. Overpriced Property Decline

📨 EXTENDED COMMUNICATIONS (39-43)
39. Property Location Info Request
40. Different Regions Request
41. Client Follow-up (No Reply)
42. Plain Request to info@zyprus
43. Apology for Extended Delay

Usage:
• "seller registration"
• "template 7 for Maria"
• "developer registration with viewing tomorrow at 15:00"
• "bank property registration"`;

  await sendTelegramMessage(chatId, templatesList);
}

/**
 * Handle /start command - Welcome message with quick start
 */
async function handleStartCommand(
  chatId: number,
  firstName: string
): Promise<void> {
  const startText = `Welcome ${firstName}! I'm SOFIA, your Cyprus Real Estate AI Assistant.

I help with:
- Property tax calculations (VAT, transfer fees, capital gains)
- Document templates for real estate transactions
- Cyprus property market information

Quick Start:
Just type your question naturally, like:
"Calculate VAT for a €400,000 apartment"
"Transfer fees for €250,000 property"

Or use /help to see all commands.

How can I assist you today?`;

  await sendTelegramMessage(chatId, startText);
}

/**
 * Handle /help command - Show available commands and usage
 */
async function handleHelpCommand(chatId: number): Promise<void> {
  const helpText = `SOFIA - Cyprus Real Estate AI Assistant

COMMANDS:
/vat - Calculate VAT for new properties
/transfer - Calculate property transfer fees
/capitalgains - Calculate capital gains tax
/templates - Browse 43 document templates
/examples - See example questions
/clear - Start fresh conversation
/about - About SOFIA

CALCULATORS:
Just ask naturally:
"VAT for €350,000 apartment, 120sqm"
"Transfer fees for €500,000"
"Capital gains: bought €200k in 2015, selling €350k"

DOCUMENTS:
"Seller registration for John Smith"
"Viewing form for tomorrow at 3pm"
"Marketing agreement for Villa Costa"

Need help? Just type your question!`;

  await sendTelegramMessage(chatId, helpText);
}

/**
 * Handle /vat command - VAT calculator guide
 */
async function handleVATCommand(chatId: number): Promise<void> {
  const vatText = `VAT Calculator for Cyprus Properties

VAT applies to NEW properties only (not resale).

RATES:
- 5% reduced rate: Primary residence, first 130sqm, up to €350k
- 19% standard rate: Investment properties or excess

REQUIRED INFO:
1. Property price (€)
2. Total area (sqm)
3. Main residence? (yes/no)

EXAMPLES:
"Calculate VAT for €300,000 apartment, 100sqm, main residence"
"VAT on €500,000 villa, 200sqm, investment property"

Just type your calculation request!`;

  await sendTelegramMessage(chatId, vatText);
}

/**
 * Handle /transfer command - Transfer fees guide
 */
async function handleTransferCommand(chatId: number): Promise<void> {
  const transferText = `Transfer Fees Calculator

Progressive rates with 50% exemption for resale:
- Up to €85,000: 3%
- €85,001 - €170,000: 5%
- Over €170,000: 8%

EXAMPLES:
"Transfer fees for €250,000 property"
"Transfer fees for €400,000 in joint names"

Joint names = fee split between 2 buyers (often saves money on higher-value properties).

Just type your calculation!`;

  await sendTelegramMessage(chatId, transferText);
}

/**
 * Handle /capitalgains command - Capital gains guide
 */
async function handleCapitalGainsCommand(chatId: number): Promise<void> {
  const cgText = `Capital Gains Tax Calculator

TAX RATE: 20% on profit above allowance

ALLOWANCES:
- Main residence: €85,430
- Farm land: €25,629
- Other property: €17,086

DEDUCTIBLE COSTS:
- Purchase price (inflation adjusted)
- Improvements
- Legal fees, agent fees
- Transfer fees paid

EXAMPLE:
"Capital gains: bought for €200,000 in 2015, selling for €350,000 now, main residence"

Type your calculation with purchase & sale details!`;

  await sendTelegramMessage(chatId, cgText);
}

/**
 * Handle /examples command - Show example questions
 */
async function handleExamplesCommand(chatId: number): Promise<void> {
  const examplesText = `Example Questions for SOFIA

CALCULATIONS:
"Calculate VAT for €350,000 new apartment, 120sqm"
"What are the transfer fees for a €500,000 villa?"
"Capital gains if I bought for €180k in 2018 and sell for €280k"
"Total buying costs for €400,000 property"

DOCUMENTS:
"Create seller registration for Maria Georgiou"
"Viewing form for 25 Poseidon St, Limassol, tomorrow 2pm"
"Marketing agreement for 3-bed apartment"
"Valuation request for villa in Paphos"

INFORMATION:
"What documents do I need to buy property in Cyprus?"
"Explain the property buying process"
"What is Title Deed vs Contract of Sale?"

Just copy any example or type your own question!`;

  await sendTelegramMessage(chatId, examplesText);
}

/**
 * Handle /clear command - Clear conversation history
 */
async function handleClearCommand(
  chatId: number,
  _telegramUserId: number
): Promise<void> {
  try {
    // Note: Full message deletion would require deleteChatMessages DB operation
    // For now, we just acknowledge the clear request

    const clearText = `Conversation cleared!

Your previous context has been reset. I'll treat our next exchange as a fresh conversation.

How can I help you today?`;

    await sendTelegramMessage(chatId, clearText);
  } catch {
    await sendTelegramMessage(
      chatId,
      "Ready for a fresh start! What would you like to know?"
    );
  }
}

/**
 * Handle /about command - About SOFIA
 */
async function handleAboutCommand(chatId: number): Promise<void> {
  const aboutText = `About SOFIA

SOFIA (Smart Operations & Facilitation Intelligence Assistant) is the AI assistant for Zyprus Property Group.

CAPABILITIES:
- Cyprus property tax calculations
- 43 real estate document templates
- Property market information
- Transaction cost estimates

ACCURACY:
Calculations follow official Cyprus tax rules:
- VAT: Cyprus Tax Department guidelines
- Transfer fees: Land Registry rates
- Capital gains: 20% tax rate with allowances

SUPPORT:
For complex queries or official advice, consult:
- Tax advisor for tax matters
- Lawyer for legal documents
- Licensed agent for property valuations

Powered by Zyprus Property Group
https://www.zyprus.com`;

  await sendTelegramMessage(chatId, aboutText);
}

/**
 * Handle file uploads (photos and documents)
 * Used for property listing images and title deeds
 */
async function handleFileUpload(message: TelegramMessage): Promise<void> {
  const telegramClient = getTelegramClient();
  const chatId = message.chat.id;

  try {
    // Show upload processing indicator
    await telegramClient.sendChatAction({ chatId, action: "upload_document" });

    let fileId: string | undefined;
    let fileName: string | undefined;
    let fileType: "photo" | "document" = "photo";

    if (message.photo && message.photo.length > 0) {
      // Get the largest photo (last in array)
      const largestPhoto = message.photo.at(-1);
      if (largestPhoto) {
        fileId = largestPhoto.file_id;
      }
      fileType = "photo";
    } else if (message.document) {
      fileId = message.document.file_id;
      fileName = message.document.file_name;
      fileType = "document";
    }

    if (!fileId) {
      await telegramClient.sendMessage({
        chatId,
        text: "Could not process your file. Please try again.",
      });
      return;
    }

    // Download the file
    const fileData = await telegramClient.getAndDownloadFile(fileId);

    if (!fileData) {
      await telegramClient.sendMessage({
        chatId,
        text: "Could not download your file. Please try again.",
      });
      return;
    }

    // Determine file type from content and metadata
    const caption = message.caption || "";
    const isPropertyImage = PROPERTY_IMAGE_PATTERN.test(caption);
    const isTitleDeed =
      TITLE_DEED_PATTERN.test(caption) ||
      fileName?.toLowerCase().includes("deed") ||
      fileName?.toLowerCase().endsWith(".pdf");

    let documentUrl: string | null = null;
    let responseText: string;

    // Upload title deeds to Supabase Storage
    if (isTitleDeed && fileData.buffer) {
      const filePath = generateFilePath({
        chatId: chatId.toString(),
        fileName: fileName || "deed.pdf",
        fileType: "title-deeds",
      });

      const uploadResult = await uploadToSupabaseStorage({
        file: fileData.buffer,
        bucket: "documents",
        path: filePath,
        contentType: fileData.mimeType || "application/pdf",
      });

      if (uploadResult.success && uploadResult.publicUrl) {
        documentUrl = uploadResult.publicUrl;
        console.log("Title deed uploaded to:", uploadResult.publicUrl);

        // Try to parse the title deed if it's an image
        if (fileData.mimeType?.startsWith("image/")) {
          // TODO: Add OCR parsing for image-based deeds
          console.log(
            "Image title deed received - OCR parsing not implemented yet"
          );
        }
      } else {
        console.error("Failed to upload title deed:", uploadResult.error);
      }
    }

    if (fileType === "photo") {
      if (isPropertyImage) {
        responseText = `Photo received for property listing.

To complete your listing, please also provide:
- Property type (apartment/house/villa)
- Location (Google Maps link preferred)
- Size (sqm), price, bedrooms, bathrooms
- Swimming pool (private/communal/none)
- Parking (yes/no)
- Air conditioning (yes/no)
- Owner name and phone number

You can send more photos or start describing the property!`;
      } else {
        responseText = `Photo received!

Is this for a property listing? If so, please tell me:
- Property type and location
- Size, price, bedrooms, bathrooms
- Pool, parking, and AC status
- Owner/agent contact details`;
      }
    } else if (isTitleDeed) {
      responseText = `📄 Title deed document received (${fileName || "document"}).

${documentUrl ? "✅ Document saved successfully!" : ""}

I'll analyze it to extract property details. Please provide additional information:
- Property type and location
- Swimming pool (private/communal/none)
- Parking and AC status
- Owner name and phone number

The title deed will be attached to your property listing in the Documents section.`;
    } else {
      responseText = `Document received (${fileName || "file"}).

If this is for a property listing, please describe the property:
- Type, location, size, price
- Features (pool, parking, AC)
- Owner contact details`;
    }

    await telegramClient.sendMessage({
      chatId,
      text: responseText,
      replyToMessageId: message.message_id,
    });
  } catch (error) {
    console.error("Error handling file upload:", error);
    await telegramClient.sendMessage({
      chatId,
      text: "Sorry, I had trouble processing your file. Please try again.",
    });
  }
}
