/**
 * SOPHIA Bot - Main Entry Point
 *
 * WhatsApp AI assistant for Zyprus Property Group.
 * Handles:
 * - WhatsApp webhook messages via WaSenderAPI
 * - Health check endpoint
 * - Admin API endpoints for cache/prompt management
 *
 * Architecture:
 * - index.ts: Minimal routing, environment setup
 * - handlers/webhook.ts: WhatsApp message processing
 * - handlers/health.ts: Health check endpoint
 * - handlers/admin.ts: Admin API endpoints
 * - services/ai-chat.ts: OpenRouter AI conversation
 * - services/message-processor.ts: Message extraction/formatting
 * - utils/wasend.ts: WaSend API client
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { logger, LogCategory, ErrorCategory } from "./utils/logger.ts";
import { withContext } from "./utils/context.ts";
import { handleHealthCheck } from "./handlers/health.ts";
import { handleAdminRequest } from "./handlers/admin.ts";
import { handleWebhook } from "./handlers/webhook.ts";

// Environment variables
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
const WASEND_API_KEY = Deno.env.get("WASEND_API_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

// Validate critical environment variables at startup
if (!OPENROUTER_API_KEY) {
  logger.error("CRITICAL: OPENROUTER_API_KEY is not set", undefined, {
    category: LogCategory.GENERAL,
  });
}
if (!WASEND_API_KEY) {
  logger.error("CRITICAL: WASEND_API_KEY is not set", undefined, {
    category: LogCategory.GENERAL,
  });
}
if (!RESEND_API_KEY) {
  logger.warn("WARNING: RESEND_API_KEY is not set - email sending will be disabled", {
    category: LogCategory.GENERAL,
  });
}

// CORS headers for cross-origin requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Webhook-Signature, X-Request-ID",
  "Access-Control-Max-Age": "86400",
};

/**
 * Main request handler
 */
serve(async (req) => {
  const url = new URL(req.url);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Health check endpoint (unauthenticated)
  if (url.pathname.endsWith("/health") && req.method === "GET") {
    return await handleHealthCheck(supabase);
  }

  // Admin endpoints
  if (url.pathname.startsWith("/sophia-bot/admin/")) {
    return handleAdminRequest(req, url, supabase);
  }

  // Wrap webhook requests in context for correlation ID tracking
  return withContext(
    {
      correlationId: crypto.randomUUID(),
      startTime: Date.now(),
    },
    async () => {
      try {
        return await handleWebhook(req, supabase, supabaseUrl, supabaseKey);
      } catch (error) {
        logger.error("Worker error", error as Error, {
          category: LogCategory.WEBHOOK,
          errorCategory: ErrorCategory.UNKNOWN,
        });
        // Return 200 to avoid webhook retries
        return new Response("OK", { status: 200 });
      }
    }
  );
});

// =====================================================
// DOCX Templates Index - Re-exports for backwards compatibility
// =====================================================

export {
  createViewingFormSingle,
  parseViewingFormSingleData,
  type ViewingFormSingleData,
} from "./docx/templates/viewing-form-single.ts";

export {
  createViewingFormMultiple,
  parseViewingFormMultipleData,
  type ViewingFormMultipleData,
  type PersonData,
} from "./docx/templates/viewing-form-multiple.ts";

export {
  createViewingFormAdvanced,
  parseViewingFormAdvancedData,
  type ViewingFormAdvancedData,
} from "./docx/templates/viewing-form-advanced.ts";
