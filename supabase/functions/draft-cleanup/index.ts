/**
 * Draft Cleanup Edge Function
 *
 * Cleans up expired draft listings (PropertyListing and LandListing).
 * Triggered by Supabase pg_cron or manual invocation.
 *
 * Schedule: Daily at 2 AM UTC
 * pg_cron: SELECT cron.schedule('draft-cleanup', '0 2 * * *',
 *   $$SELECT net.http_post('https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/draft-cleanup', '{}', '{"Authorization": "Bearer <service_role_key>"}')$$
 * );
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { logger, LogCategory } from "../sophia-bot/utils/logger.ts";

const responseHeaders = {
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  // No CORS needed - this is a server-to-server cron function
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 405 });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const now = new Date().toISOString();

    const results = {
      propertyListingsDeleted: 0,
      landListingsDeleted: 0,
      errors: [] as string[],
    };

    // Clean up expired property listing drafts (soft delete)
    try {
      const { data: expiredProperties, error: propError } = await supabase
        .from("PropertyListing")
        .update({ deletedAt: now })
        .is("deletedAt", null)
        .lt("draftExpiresAt", now)
        .select("id");

      if (propError) throw propError;
      results.propertyListingsDeleted = expiredProperties?.length || 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      results.errors.push(`Property listings cleanup failed: ${message}`);
    }

    // Clean up expired land listing drafts (soft delete)
    try {
      const { data: expiredLand, error: landError } = await supabase
        .from("LandListing")
        .update({ deletedAt: now })
        .is("deletedAt", null)
        .lt("draftExpiresAt", now)
        .select("id");

      if (landError) throw landError;
      results.landListingsDeleted = expiredLand?.length || 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      results.errors.push(`Land listings cleanup failed: ${message}`);
    }

    // Also clean up old processed_webhooks entries (> 7 days old)
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      await supabase
        .from("processed_webhooks")
        .delete()
        .lt("created_at", sevenDaysAgo);
    } catch (error) {
      // Non-critical, just log
      results.errors.push(`Webhook cleanup warning: ${error}`);
    }

    // Log results
    logger.info(`[Draft Cleanup] Completed: ${results.propertyListingsDeleted} properties, ${results.landListingsDeleted} land listings soft-deleted`, { category: LogCategory.DATABASE });

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: now,
        ...results,
      }),
      {
        headers: responseHeaders,
        status: results.errors.length > 0 ? 207 : 200,
      }
    );
  } catch (error) {
    logger.error("[Draft Cleanup] Fatal error", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.DATABASE });
    return new Response(
      JSON.stringify({
        error: "Cleanup failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: responseHeaders,
        status: 500,
      }
    );
  }
});
