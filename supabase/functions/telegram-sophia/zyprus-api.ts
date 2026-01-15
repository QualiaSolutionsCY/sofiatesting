/**
 * Zyprus API Client for Telegram SOPHIA
 * Fetches listing ownership info for routing leads to the correct agent
 */

// Environment variables
const ZYPRUS_API_URL = Deno.env.get("ZYPRUS_API_URL") || "https://www.zyprus.com";
const ZYPRUS_CLIENT_ID = Deno.env.get("ZYPRUS_CLIENT_ID");
const ZYPRUS_CLIENT_SECRET = Deno.env.get("ZYPRUS_CLIENT_SECRET");

// Cached OAuth token
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Get OAuth access token for Zyprus API
 */
const getAccessToken = async (): Promise<string | null> => {
  const now = Date.now();

  // Return cached token if still valid (with 5 minute buffer)
  if (cachedToken && tokenExpiresAt > now + 300_000) {
    return cachedToken;
  }

  if (!ZYPRUS_CLIENT_ID || !ZYPRUS_CLIENT_SECRET) {
    console.error("[ZyprusAPI] Missing ZYPRUS_CLIENT_ID or ZYPRUS_CLIENT_SECRET");
    return null;
  }

  try {
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
      }),
    });

    if (!response.ok) {
      console.error("[ZyprusAPI] OAuth error:", response.status);
      return null;
    }

    const data = await response.json();
    cachedToken = data.access_token;
    tokenExpiresAt = now + data.expires_in * 1000;

    return cachedToken;
  } catch (error) {
    console.error("[ZyprusAPI] OAuth exception:", error);
    return null;
  }
};

/**
 * Listing ownership info
 */
export interface ListingOwnerInfo {
  found: boolean;
  listingType: "property" | "land";
  listingId: string;
  title: string;
  ownerAgentName: string | null;
  ownerAgentId: string | null;
  isOfficeOwned: boolean;
}

/**
 * Extract listing type and ID from Zyprus URL
 * Examples:
 * - https://www.zyprus.com/land/32417/residential-land-in-petridia-emba-paphos → { type: "land", id: "32417" }
 * - https://www.zyprus.com/property/12345/apartment-in-limassol → { type: "property", id: "12345" }
 */
export const parseZyprusUrl = (
  url: string
): { type: "property" | "land"; nodeId: string } | null => {
  // Match URLs like zyprus.com/land/32417 or zyprus.com/property/12345
  const match = url.match(
    /zyprus\.com\/(property|land)\/(\d+)/i
  );

  if (!match) {
    return null;
  }

  return {
    type: match[1].toLowerCase() as "property" | "land",
    nodeId: match[2],
  };
};

/**
 * Get listing owner info from Zyprus API by node ID
 *
 * Uses JSON:API filter to find listing by drupal_internal__nid
 */
export const getListingOwnerInfo = async (
  listingType: "property" | "land",
  nodeId: string
): Promise<ListingOwnerInfo | null> => {
  const token = await getAccessToken();

  if (!token) {
    console.error("[ZyprusAPI] No access token available");
    return null;
  }

  try {
    // Use JSON:API filter to find by internal node ID
    const endpoint = listingType === "property"
      ? "/jsonapi/node/property"
      : "/jsonapi/node/land";

    // Include the user relationship to get agent info
    const url = `${ZYPRUS_API_URL}${endpoint}?filter[drupal_internal__nid]=${nodeId}&include=uid`;

    console.log(`[ZyprusAPI] Fetching ${listingType} with node ID ${nodeId}`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.api+json",
        "User-Agent": "SophiaAI",
      },
    });

    if (!response.ok) {
      console.error(`[ZyprusAPI] API error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    // Check if listing was found
    if (!data.data || (Array.isArray(data.data) && data.data.length === 0)) {
      console.log(`[ZyprusAPI] Listing ${nodeId} not found`);
      return null;
    }

    const listing = Array.isArray(data.data) ? data.data[0] : data.data;
    const included = data.included || [];

    // Get the owner user from relationships
    const ownerRelId = listing.relationships?.uid?.data?.id;
    let ownerUser = null;

    if (ownerRelId) {
      ownerUser = included.find(
        (item: any) => item.type === "user--user" && item.id === ownerRelId
      );
    }

    // Extract owner agent name from user display name
    // Format could be "Marios Azinas" or similar
    const ownerAgentName = ownerUser?.attributes?.display_name ||
      ownerUser?.attributes?.name ||
      null;

    console.log(`[ZyprusAPI] Found listing "${listing.attributes?.title}", owner: ${ownerAgentName || "office"}`);

    // Determine if office-owned (no specific agent, or system user)
    const isOfficeOwned = !ownerAgentName ||
      ownerAgentName.toLowerCase() === "admin" ||
      ownerAgentName.toLowerCase() === "zyprus" ||
      ownerAgentName.toLowerCase().includes("office");

    return {
      found: true,
      listingType,
      listingId: listing.id,
      title: listing.attributes?.title || "Unknown",
      ownerAgentName: isOfficeOwned ? null : ownerAgentName,
      ownerAgentId: ownerRelId || null,
      isOfficeOwned,
    };
  } catch (error) {
    console.error("[ZyprusAPI] getListingOwnerInfo exception:", error);
    return null;
  }
};

/**
 * Batch fetch owner info for multiple URLs
 * Returns the first listing that has a specific agent owner
 */
export const getOwnerFromUrls = async (
  urls: string[]
): Promise<ListingOwnerInfo | null> => {
  for (const url of urls) {
    const parsed = parseZyprusUrl(url);
    if (!parsed) {
      continue;
    }

    const ownerInfo = await getListingOwnerInfo(parsed.type, parsed.nodeId);
    if (ownerInfo?.found) {
      return ownerInfo;
    }
  }

  return null;
};
