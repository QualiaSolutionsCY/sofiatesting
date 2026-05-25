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
      // Test environment: use stub error models (models.mock removed with deprecated chat)
      const stubModel = {
        specificationVersion: "v1",
        provider: "test",
        modelId: "test-model",
        doGenerate: () => {
          throw new Error("Test environment - no AI provider");
        },
        doStream: () => {
          throw new Error("Test environment - no AI provider");
        },
      } as any;
      return customProvider({
        languageModels: {
          "chat-model": stubModel,
          "title-model": stubModel,
          "artifact-model": stubModel,
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
          },
        });
      }

      const model = openrouter("google/gemini-3-flash-preview");

      return customProvider({
        languageModels: {
          "chat-model": model,
          "title-model": model,
          "artifact-model": model,
        },
      });
    })();
