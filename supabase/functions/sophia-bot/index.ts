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

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { initSentry } from "../_shared/sentry.ts";
import { handleAdminRequest } from "./handlers/admin.ts";
import { handleHealthCheck } from "./handlers/health.ts";
import { handleWebhook } from "./handlers/webhook.ts";
import { withContext } from "./utils/context.ts";
import { ErrorCategory, LogCategory, logger } from "./utils/logger.ts";

// Initialize Sentry for error tracking (OBS-01)
initSentry();

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
  logger.warn(
    "WARNING: RESEND_API_KEY is not set - email sending will be disabled",
    {
      category: LogCategory.GENERAL,
    }
  );
}

// CORS headers - restricted to admin endpoints only
// Webhooks are server-to-server and don't need CORS
// Admin endpoints are protected by secret header authentication
const ALLOWED_ADMIN_ORIGINS = [
  "https://supabase.com",
  "https://vceeheaxcrhmpqueudqx.supabase.co",
  // Zyprus CMS domains
  "https://www.zyprus.com",
  "https://zyprus.com",
  "https://dev9.zyprus.com",
];

const getCorsHeaders = (origin: string | null): Record<string, string> => {
  // Only allow CORS for known admin origins
  const allowedOrigin =
    origin && ALLOWED_ADMIN_ORIGINS.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Webhook-Signature, X-Request-ID, X-Admin-Secret",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
};

/**
 * Main request handler
 */
serve(async (req) => {
  const url = new URL(req.url);

  // Handle CORS preflight requests (only for admin endpoints)
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    // Only respond to preflight for admin endpoints
    if (url.pathname.startsWith("/sophia-bot/admin/")) {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    // Webhooks don't need CORS - reject preflight
    return new Response("Method not allowed", { status: 405 });
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
  createViewingFormAdvanced,
  parseViewingFormAdvancedData,
  type ViewingFormAdvancedData,
} from "./docx/templates/viewing-form-advanced.ts";

export {
  createViewingFormMultiple,
  type PersonData,
  parseViewingFormMultipleData,
  type ViewingFormMultipleData,
} from "./docx/templates/viewing-form-multiple.ts";
export {
  createViewingFormSingle,
  parseViewingFormSingleData,
  type ViewingFormSingleData,
} from "./docx/templates/viewing-form-single.ts";
