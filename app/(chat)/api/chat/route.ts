import { geolocation } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  JsonToSseTransformStream,
  smoothStream,
  stepCountIs,
  streamText,
} from "ai";
import { unstable_cache as cache } from "next/cache";
import type { ModelCatalog } from "tokenlens/core";
import { fetchModels } from "tokenlens/fetch";
import { getUsage } from "tokenlens/helpers";
import { auth, type UserType } from "@/app/(auth)/auth";
import type { VisibilityType } from "@/components/visibility-selector";
import { pruneConversationHistory } from "@/lib/ai/conversation-pruning";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import type { ChatModel } from "@/lib/ai/models";
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
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  updateChatLastContextById,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import type { ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

// Increased to 120s to allow for image uploads to Zyprus API
export const maxDuration = 120;

const logger = createLogger("api:chat");

const getTokenlensCatalog = cache(
  async (): Promise<ModelCatalog | undefined> => {
    try {
      return await fetchModels();
    } catch (err) {
      logger.warn("TokenLens catalog fetch failed, using default catalog", {
        error: err instanceof Error ? err.message : String(err),
      });
      return; // tokenlens helpers will fall back to defaultCatalog
    }
  },
  ["tokenlens-catalog"],
  { revalidate: 24 * 60 * 60 } // 24 hours
);

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (error) {
    let errorMessage = "Invalid request body";
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    // Handle Zod errors specifically for better feedback
    if (
      typeof error === "object" &&
      error !== null &&
      "issues" in error &&
      Array.isArray((error as any).issues)
    ) {
      const issues = (error as any).issues;
      errorMessage = issues
        .map((i: any) => `${i.path.join(".")}: ${i.message}`)
        .join(", ");
    }

    logger.error("Validation error in POST /api/chat", undefined, {
      error: errorMessage,
    });
    return new ChatSDKError(
      "bad_request:api",
      `Validation failed: ${errorMessage}`
    ).toResponse();
  }

  try {
    // System is always enabled - removed Vercel KV dependency
    // If you need system-wide toggles in the future, implement via Supabase

    const {
      id,
      message,
      selectedChatModel,
      selectedVisibilityType,
    }: {
      id: string;
      message: ChatMessage;
      selectedChatModel: ChatModel["id"];
      selectedVisibilityType: VisibilityType;
    } = requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const userType: UserType = session.user.type;

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    const maxMessages = entitlementsByUserType[userType].maxMessagesPerDay;

    if (messageCount >= maxMessages) {
      logger.warn("Rate limit exceeded", {
        userId: session.user.id,
        userType,
        messageCount,
        maxMessages,
      });
      return new ChatSDKError("rate_limit:chat").toResponse();
    }

    const chat = await getChatById({ id });

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError("forbidden:chat").toResponse();
      }
    } else {
      const title = await generateTitleFromUserMessage({
        message,
      });

      await saveChat({
        id,
        userId: session.user.id,
        title,
        visibility: selectedVisibilityType,
      });
    }

    const messagesFromDb = await getMessagesByChatId({ id });
    const allMessages = [...convertToUIMessages(messagesFromDb), message];

    // Prune conversation history to prevent unbounded token growth
    // Keeps first message + last N messages for optimal cost/quality balance
    const uiMessages = pruneConversationHistory(allMessages);

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    await saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: "user",
          parts: message.parts,
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    let finalMergedUsage: AppUsage | undefined;

    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        // Extract user message text for smart template loading
        const userMessageText = message.parts
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join(" ");

        // AI Gateway models don't support Anthropic's native prompt caching format
        // Always use string format for system prompts
        // Smart template loading: Only load relevant templates based on user message
        const systemPromptValue = await systemPrompt({
          selectedChatModel,
          requestHints,
          userMessage: userMessageText,
        });

        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
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
            // "getGeneralKnowledge", // DISABLED - Knowledge now embedded in system prompt
            // "createDocument", // DISABLED - No artifacts needed
            // "updateDocument", // DISABLED - No artifacts needed
            "requestSuggestions",
            "sendDocument", // Generate and send documents via email/WhatsApp/download
          ], // SOFIA can use calculator, property listing, land listing, taxonomy, and document tools
          experimental_transform: smoothStream({ chunking: "word" }),
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
            requestSuggestions: requestSuggestions({ session, dataStream }),
            sendDocument: sendDocument({ session, dataStream }),
          }, // Cyprus real estate tools - property listings, land listings, taxonomy, documents
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: "stream-text",
          },
          // Provider-specific options for token limiting (OpenRouter/Gemini)
          providerOptions: {
            openai: {
              max_tokens: 4096, // Prevent runaway token costs
            },
          },
          onFinish: async ({ usage }) => {
            try {
              const providers = await getTokenlensCatalog();
              const modelId =
                myProvider.languageModel(selectedChatModel).modelId;
              if (!modelId) {
                finalMergedUsage = usage;
                dataStream.write({
                  type: "data-usage",
                  data: finalMergedUsage,
                });
                return;
              }

              if (!providers) {
                finalMergedUsage = usage;
                dataStream.write({
                  type: "data-usage",
                  data: finalMergedUsage,
                });
                return;
              }

              const summary = getUsage({ modelId, usage, providers });
              finalMergedUsage = { ...usage, ...summary, modelId } as AppUsage;
              dataStream.write({ type: "data-usage", data: finalMergedUsage });
            } catch (err) {
              logger.warn("TokenLens enrichment failed", {
                error: err instanceof Error ? err.message : String(err),
              });
              finalMergedUsage = usage;
              dataStream.write({ type: "data-usage", data: finalMergedUsage });
            }
          },
        });

        result.consumeStream();

        dataStream.merge(
          result.toUIMessageStream({
            sendReasoning: true,
          })
        );
      },
      generateId: generateUUID,
      onFinish: async ({ messages }) => {
        await saveMessages({
          messages: messages.map((currentMessage) => ({
            id: currentMessage.id,
            role: currentMessage.role,
            parts: currentMessage.parts,
            createdAt: new Date(),
            attachments: [],
            chatId: id,
          })),
        });

        if (finalMergedUsage) {
          try {
            await updateChatLastContextById({
              chatId: id,
              context: finalMergedUsage,
            });
          } catch (err) {
            logger.warn("Unable to persist last usage for chat", {
              chatId: id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      },
      onError: () => {
        return "Oops, an error occurred!";
      },
    });

    // const streamContext = getStreamContext();

    // if (streamContext) {
    //   return new Response(
    //     await streamContext.resumableStream(streamId, () =>
    //       stream.pipeThrough(new JsonToSseTransformStream())
    //     )
    //   );
    // }

    return new Response(stream.pipeThrough(new JsonToSseTransformStream()));
  } catch (error) {
    const vercelId = request.headers.get("x-vercel-id");

    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    // Check for Vercel AI Gateway credit card error
    if (
      error instanceof Error &&
      error.message?.includes(
        "AI Gateway requires a valid credit card on file to service requests"
      )
    ) {
      logger.warn("AI Gateway billing issue - falling back to Gemini", {
        vercelId,
      });
      // Don't fail the request - just use Gemini as fallback
      // The providers.ts already handles this fallback
      return new ChatSDKError("bad_request:activate_gateway").toResponse();
    }

    // Check for AI Gateway configuration errors or API failures
    if (
      error instanceof Error &&
      (error.message?.includes("AI Gateway") ||
        error.message?.includes("gateway") ||
        error.message?.includes("401") ||
        error.message?.includes("403") ||
        error.message?.includes("429") ||
        error.message?.includes("500") ||
        error.message?.includes("502") ||
        error.message?.includes("503") ||
        error.message?.includes("504") ||
        error.message?.includes("ECONNREFUSED") ||
        error.message?.includes("ETIMEDOUT") ||
        error.message?.includes("fetch failed"))
    ) {
      logger.error("Service error - attempting recovery", error, {
        vercelId,
        model: requestBody.selectedChatModel,
      });

      // Don't expose internal errors to users
      // The app should continue working with Gemini fallback
      return new ChatSDKError("offline:chat").toResponse();
    }

    logger.error("Unhandled error in chat API", error, { vercelId });
    return new ChatSDKError("offline:chat").toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
