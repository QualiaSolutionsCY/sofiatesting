import { createOpenAI } from "@ai-sdk/openai";
import { customProvider } from "ai";
import { isTestEnvironment } from "../constants";
import { logger } from "../logger";

const log = logger.ai.child("providers");

// OpenRouter API configuration
// API key is server-side only (in API routes), NOT exposed to browser
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const isOpenRouterConfigured = (() => {
  if (isTestEnvironment) {
    return false;
  }

  const isBuildTime = process.env.NEXT_PHASE === "phase-production-build";
  if (isBuildTime) {
    log.debug("Build time detected - skipping OpenRouter validation");
    return false;
  }

  const hasKey = !!OPENROUTER_API_KEY;

  if (
    !hasKey &&
    typeof window === "undefined" &&
    !process.env.NODE_ENV?.includes("test")
  ) {
    log.warn("OPENROUTER_API_KEY missing - chat will not work");
  }

  return hasKey;
})();

// OpenRouter client - uses google/gemini-3-flash-preview
const openrouter = createOpenAI({
  apiKey: OPENROUTER_API_KEY || "missing-key",
  baseURL: "https://openrouter.ai/api/v1",
});

export const myProvider = isTestEnvironment
  ? (() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { chatModel, claudeModel, mistralSmallModel } =
        require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "title-model": mistralSmallModel,
          "artifact-model": claudeModel,
          "chat-model-pro": chatModel,
          "chat-model-flash-lite": chatModel,
        },
      });
    })()
  : (() => {
      if (!isOpenRouterConfigured) {
        const errorModel = {
          specificationVersion: "v1",
          provider: "openrouter",
          modelId: "error-model",
          doGenerate: () => {
            throw new Error("OPENROUTER_API_KEY is not configured.");
          },
          doStream: () => {
            throw new Error("OPENROUTER_API_KEY is not configured.");
          },
        } as any;

        return customProvider({
          languageModels: {
            "chat-model": errorModel,
            "title-model": errorModel,
            "artifact-model": errorModel,
            "chat-model-pro": errorModel,
            "chat-model-gemini3": errorModel,
            "chat-model-flash-lite": errorModel,
            "chat-model-flash": errorModel,
          },
        });
      }

      // OpenRouter with Gemini 3 Flash Preview
      const defaultModel = openrouter("google/gemini-3-flash-preview");

      return customProvider({
        languageModels: {
          "chat-model": defaultModel,
          "title-model": defaultModel,
          "artifact-model": defaultModel,
          "chat-model-pro": defaultModel,
          "chat-model-gemini3": defaultModel,
          "chat-model-flash-lite": defaultModel,
          "chat-model-flash": defaultModel,
        },
      });
    })();
