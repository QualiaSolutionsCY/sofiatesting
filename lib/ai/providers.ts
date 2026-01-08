import { createOpenAI } from "@ai-sdk/openai";
import { customProvider } from "ai";
import { isTestEnvironment } from "../constants";

// Supabase Edge Function configuration
// API key is stored securely in Supabase secrets, NOT exposed to Next.js
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ebgsbtqtkdgaafqejjye.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const isSupabaseConfigured = (() => {
  // In test environment, not needed
  if (isTestEnvironment) {
    return false;
  }

  // Build time detected - skipping validation
  const isBuildTime = process.env.NEXT_PHASE === "phase-production-build";
  if (isBuildTime) {
    console.log("[SOFIA] Build time detected - skipping Supabase validation");
    return false;
  }

  // Check for Supabase configuration
  const hasSupabaseConfig = !!SUPABASE_ANON_KEY;

  if (
    !hasSupabaseConfig &&
    typeof window === "undefined" &&
    !process.env.NODE_ENV?.includes("test")
  ) {
    console.warn(
      "[SOFIA] WARNING: Supabase configuration missing. Chat functionality will not work."
    );
  }

  return hasSupabaseConfig;
})();

// Create OpenAI-compatible client that proxies through Supabase Edge Function
// This keeps API keys secure in Supabase, not exposed in Next.js
const supabaseAI = createOpenAI({
  apiKey: SUPABASE_ANON_KEY || "dummy-key",
  baseURL: `${SUPABASE_URL}/functions/v1/ai-chat`,
  headers: {
    "apikey": SUPABASE_ANON_KEY || "",
  },
});

export const myProvider = isTestEnvironment
  ? (() => {
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
      if (!isSupabaseConfigured) {
        // Fallback for missing configuration - prevents crash on startup
        const errorModel = {
          specificationVersion: "v1",
          provider: "supabase",
          modelId: "error-model",
          doGenerate: () => {
            throw new Error("Supabase configuration is missing.");
          },
          doStream: () => {
            throw new Error("Supabase configuration is missing.");
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

      // Supabase Edge Function with Gemini 3 Flash Preview
      // API key is securely stored in Supabase secrets (not exposed to Next.js)
      // The Edge Function calls OpenRouter with google/gemini-3-flash-preview
      const defaultModel = supabaseAI("google/gemini-3-flash-preview");

      return customProvider({
        languageModels: {
          // Primary model: Gemini 3 Flash Preview via Supabase Edge Function
          // API key stored in Supabase secrets - SECURE
          "chat-model": defaultModel,
          "title-model": defaultModel, // Use same model for consistency
          "artifact-model": defaultModel,

          // All aliases point to the same model for consistency
          "chat-model-pro": defaultModel,
          "chat-model-gemini3": defaultModel,
          "chat-model-flash-lite": defaultModel,
          "chat-model-flash": defaultModel,
        },
      });
    })();
