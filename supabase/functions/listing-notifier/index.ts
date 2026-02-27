/**
 * Listing Notifier Edge Function
 *
 * Polls Zyprus API for listings that have been published (status: true)
 * and sends WhatsApp notifications to the agents who uploaded them.
 *
 * Schedule: Every 15 minutes via pg_cron
 * See LISTING-UPLOAD-GAPS-PLAN.md for pg_cron setup SQL
 *
 * Prerequisites:
 *   1. Create listing_uploads table (see _shared/db.ts for SQL)
 *   2. Deploy: supabase functions deploy listing-notifier --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx
 *   3. Set up pg_cron schedule above
 */

import { getPendingListingUploads, markListingPublished, markListingExpired } from "../_shared/db.ts";
import { sendTextMessage, formatPhoneNumber } from "../sophia-bot/utils/wasend.ts";
import { logger, LogCategory } from "../sophia-bot/utils/logger.ts";

const ZYPRUS_API_URL = Deno.env.get("ZYPRUS_API_URL") || "https://dev9.zyprus.com";
const MAX_DRAFT_AGE_DAYS = 30;

// Get Zyprus credentials from environment (set via supabase secrets)
const ZYPRUS_CLIENT_ID = Deno.env.get("ZYPRUS_CLIENT_ID");
const ZYPRUS_CLIENT_SECRET = Deno.env.get("ZYPRUS_CLIENT_SECRET");

if (!ZYPRUS_CLIENT_ID || !ZYPRUS_CLIENT_SECRET) {
  throw new Error("ZYPRUS_CLIENT_ID and ZYPRUS_CLIENT_SECRET must be set as Supabase secrets");
}

if (!Deno.env.get("ZYPRUS_API_URL")) {
  logger.warn("[Listing Notifier] ZYPRUS_API_URL not set, defaulting to dev9.zyprus.com", {
    category: LogCategory.CONFIG,
  });
}

const responseHeaders = {
  "Content-Type": "application/json",
};

/**
 * Get OAuth token for Zyprus API
 */
async function getZyprusToken(): Promise<string> {
  const response = await fetch(`${ZYPRUS_API_URL}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "SophiaAI",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: ZYPRUS_CLIENT_ID,
      client_secret: ZYPRUS_CLIENT_SECRET,
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`Zyprus auth failed: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Check if a specific listing is published on Zyprus
 */
async function isListingPublished(
  listingId: string,
  token: string,
): Promise<boolean> {
  const url = `${ZYPRUS_API_URL}/jsonapi/node/property/${listingId}?fields[node--property]=status`;

  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.api+json",
      "User-Agent": "SophiaAI",
    },
  });

  if (!response.ok) {
    // 404 means listing was deleted — treat as expired
    if (response.status === 404) {
      return false;
    }
    throw new Error(`Zyprus API error: ${response.status}`);
  }

  const data = await response.json();
  // status: true means published, false means still draft
  return data.data?.attributes?.status === true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 405 });
  }

  try {
    const results = {
      checked: 0,
      notified: 0,
      expired: 0,
      errors: [] as string[],
    };

    // Get all draft listings that need checking
    const pendingListings = await getPendingListingUploads();

    if (pendingListings.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No pending listings to check", ...results }),
        { headers: responseHeaders, status: 200 },
      );
    }

    // Get Zyprus auth token (one for all checks)
    const token = await getZyprusToken();

    // Process in batches of 5 to avoid overwhelming Zyprus API
    const BATCH_SIZE = 5;
    const batches: typeof pendingListings[] = [];
    for (let i = 0; i < pendingListings.length; i += BATCH_SIZE) {
      batches.push(pendingListings.slice(i, i + BATCH_SIZE));
    }

    for (const batch of batches) {
      await Promise.allSettled(
        batch.map(async (listing) => {
          results.checked++;

          try {
            const published = await isListingPublished(listing.zyprus_listing_id, token);

            if (published) {
              // Send WhatsApp notification to the agent
              const phone = formatPhoneNumber(listing.agent_phone);
              if (phone) {
                const message =
                  `Your listing "${listing.property_title}" has been published and is now live on Zyprus.com.\n\n` +
                  `View it here: ${listing.listing_url}\n\n` +
                  `If you need any changes, please contact the office.`;

                await sendTextMessage(phone, message);
                results.notified++;
              }

              await markListingPublished(listing.id);
            } else {
              // Check if listing is too old — stop polling after MAX_DRAFT_AGE_DAYS
              const ageMs = Date.now() - new Date(listing.created_at).getTime();
              const ageDays = ageMs / (1000 * 60 * 60 * 24);
              if (ageDays > MAX_DRAFT_AGE_DAYS) {
                await markListingExpired(listing.id);
                results.expired++;
              }
            }
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            results.errors.push(`Error checking ${listing.zyprus_listing_id}: ${msg}`);
          }
        })
      );
    }

    logger.info(`[Listing Notifier] Checked ${results.checked}, notified ${results.notified}, expired ${results.expired}`, {
      category: LogCategory.DATABASE,
    });

    return new Response(
      JSON.stringify({ success: true, ...results }),
      { headers: responseHeaders, status: results.errors.length > 0 ? 207 : 200 },
    );
  } catch (error) {
    logger.error("[Listing Notifier] Fatal error", error instanceof Error ? error : new Error(String(error)), {
      category: LogCategory.DATABASE,
    });
    return new Response(
      JSON.stringify({
        error: "Notifier failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      { headers: responseHeaders, status: 500 },
    );
  }
});
