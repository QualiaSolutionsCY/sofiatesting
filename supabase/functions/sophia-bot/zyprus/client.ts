/**
 * Zyprus API Client for Deno
 * Handles OAuth2 authentication and property listing operations
 */

import { validateImageUrl } from "../utils/url-validator.ts";

export interface TokenCache {
  token: string;
  expiresAt: number;
}

export interface ListingData {
  listingType: "sale" | "rent";
  propertyType: string;
  price: number;
  location: string;
  locationUuid?: string;
  bedrooms: number;
  bathrooms: number;
  coveredArea: number;
  plotSize?: number;
  description: string;
  myNotes: string;
  aiNotes?: string;
  images: string[];
  reviewer1: string;
  reviewer2?: string | null;
  listingOwner: string;
  listingInstructor: string;
  features?: string[];
  titleDeedStatus?: string;
  coordinates?: { lat: number; lon: number };
  yearBuilt?: number;
  floor?: string;
  potentialDuplicate?: boolean;
  aiMessage?: string | null;
}

export interface CreateResult {
  listingId: string;
  listingUrl: string;
}

export interface ZyprusConfig {
  apiUrl: string;
  siteUrl: string;
  clientId: string;
  clientSecret: string;
}

// Token cache (in-memory for Edge Function)
let cachedToken: TokenCache | null = null;

/**
 * Get Zyprus API configuration from environment
 */
export function getZyprusConfig(): ZyprusConfig {
  const apiUrl = Deno.env.get("ZYPRUS_API_URL");
  const siteUrl = Deno.env.get("ZYPRUS_SITE_URL") || "https://zyprus.com";
  const clientId = Deno.env.get("ZYPRUS_CLIENT_ID");
  const clientSecret = Deno.env.get("ZYPRUS_CLIENT_SECRET");

  if (!apiUrl || !clientId || !clientSecret) {
    throw new Error("Zyprus API credentials not configured");
  }

  return { apiUrl, siteUrl, clientId, clientSecret };
}

/**
 * Get OAuth2 access token
 */
export async function getAccessToken(config: ZyprusConfig): Promise<string> {
  // Check cache (with 5 minute buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 300_000) {
    return cachedToken.token;
  }

  console.log("[Zyprus] Fetching new access token...");

  const response = await fetch(`${config.apiUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "SophiaAI",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Zyprus] Token error:", errorText);
    throw new Error(`Failed to get access token: ${response.status}`);
  }

  const data = await response.json();

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  console.log("[Zyprus] Access token obtained successfully");
  return data.access_token;
}

/**
 * Build JSON:API payload for property creation
 */
function buildJsonApiPayload(
  listing: ListingData,
  imageFileIds: string[]
): Record<string, unknown> {
  const attributes: Record<string, unknown> = {
    title: `${listing.bedrooms} Bed ${listing.propertyType} in ${listing.location}`,
    status: false, // Always unpublished draft
    field_price: listing.price,
    field_bedrooms: listing.bedrooms,
    field_bathrooms: listing.bathrooms,
    field_covered_area: listing.coveredArea,
    field_description: {
      value: listing.description,
      format: "basic_html",
    },
    field_my_notes: listing.myNotes,
    field_ai_assistant_notes: listing.aiNotes || "",
    field_ai_generated: true,
    field_ai_state: "draft",
    field_negotiable: true,
  };

  // Optional fields
  if (listing.plotSize) {
    attributes.field_plot_size = listing.plotSize;
  }
  if (listing.yearBuilt) {
    attributes.field_year_built = listing.yearBuilt;
  }
  if (listing.floor) {
    attributes.field_floor = listing.floor;
  }
  if (listing.potentialDuplicate) {
    attributes.field_potential_duplicate = true;
  }
  if (listing.aiMessage) {
    attributes.field_ai_message = listing.aiMessage;
  }

  // Coordinates (POINT format: LON LAT)
  if (listing.coordinates) {
    attributes.field_map = `POINT (${listing.coordinates.lon} ${listing.coordinates.lat})`;
  }

  // Build relationships
  const relationships: Record<string, unknown> = {};

  // Listing type (sale/rent)
  if (listing.listingType === "rent") {
    relationships.field_listing_type = {
      data: { type: "taxonomy_term--listing_type", id: "RENT_UUID" }, // TODO: Get from taxonomy
    };
  } else {
    relationships.field_listing_type = {
      data: { type: "taxonomy_term--listing_type", id: "SALE_UUID" }, // TODO: Get from taxonomy
    };
  }

  // Location
  if (listing.locationUuid) {
    relationships.field_location = {
      data: { type: "taxonomy_term--location", id: listing.locationUuid },
    };
  }

  // Images
  if (imageFileIds.length > 0) {
    relationships.field_images = {
      data: imageFileIds.map((id) => ({
        type: "file--file",
        id,
      })),
    };
  }

  return {
    data: {
      type: "node--property",
      attributes,
      relationships,
    },
  };
}

/**
 * Upload a single image to Zyprus
 */
async function uploadSingleImage(
  url: string,
  index: number,
  token: string,
  config: ZyprusConfig
): Promise<string | null> {
  try {
    // P0 SECURITY: Validate image URL before fetching (SSRF prevention)
    const urlValidation = validateImageUrl(url);
    if (!urlValidation.valid) {
      console.error(`[Zyprus] SSRF blocked for image ${index}: ${urlValidation.error}`, {
        url: url.substring(0, 100),
      });
      return null;
    }

    // Download image
    const imageResponse = await fetch(url);
    if (!imageResponse.ok) {
      console.error(`[Zyprus] Failed to download image ${index}: ${url}`);
      return null;
    }

    const imageBlob = await imageResponse.blob();
    const imageBuffer = await imageBlob.arrayBuffer();

    // Get filename from URL
    const urlParts = url.split("/");
    let filename = urlParts[urlParts.length - 1].split("?")[0];
    if (!filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      filename = `property_image_${index + 1}.jpg`;
    }

    // Upload to Zyprus
    const uploadResponse = await fetch(
      `${config.apiUrl}/jsonapi/node/property/field_images`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `file; filename="${filename}"`,
          "User-Agent": "SophiaAI",
        },
        body: imageBuffer,
      }
    );

    if (!uploadResponse.ok) {
      console.error(`[Zyprus] Failed to upload image ${index}: ${uploadResponse.status}`);
      return null;
    }

    const uploadResult = await uploadResponse.json();
    if (uploadResult.data?.id) {
      console.log(`[Zyprus] Uploaded image ${index + 1}`);
      return uploadResult.data.id;
    }
    return null;
  } catch (error) {
    console.error(`[Zyprus] Image upload error for ${url}:`, error);
    return null;
  }
}

/**
 * Upload images to Zyprus and get file IDs (PARALLEL)
 */
async function uploadImages(
  imageUrls: string[],
  token: string,
  config: ZyprusConfig
): Promise<string[]> {
  console.log(`[Zyprus] Uploading ${imageUrls.length} images in parallel...`);

  // Upload all images in parallel
  const results = await Promise.all(
    imageUrls.map((url, index) => uploadSingleImage(url, index, token, config))
  );

  // Filter out failed uploads (nulls)
  const fileIds = results.filter((id): id is string => id !== null);

  console.log(`[Zyprus] Successfully uploaded ${fileIds.length}/${imageUrls.length} images`);
  return fileIds;
}

/**
 * Create a property listing draft
 */
export async function createDraftListing(
  listing: ListingData
): Promise<CreateResult> {
  const config = getZyprusConfig();
  const token = await getAccessToken(config);

  console.log("[Zyprus] Creating draft listing...");

  // Upload images first
  const imageFileIds = await uploadImages(listing.images, token, config);
  console.log(`[Zyprus] Uploaded ${imageFileIds.length} images`);

  // Build and send listing payload
  const payload = buildJsonApiPayload(listing, imageFileIds);

  const response = await fetch(`${config.apiUrl}/jsonapi/node/property`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
      "User-Agent": "SophiaAI",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Zyprus] Create listing error:", errorText);
    throw new Error(`Failed to create listing: ${response.status}`);
  }

  const result = await response.json();
  const listingId = result.data.id;

  console.log(`[Zyprus] Created listing: ${listingId}`);

  return {
    listingId,
    listingUrl: `${config.siteUrl}/property/${listingId}`,
  };
}

/**
 * Search for existing properties
 */
export async function searchProperties(
  query: string,
  filters?: Record<string, string>
): Promise<unknown[]> {
  const config = getZyprusConfig();
  const token = await getAccessToken(config);

  let url = `${config.apiUrl}/jsonapi/node/property?page[limit]=10`;

  if (query) {
    url += `&filter[title][operator]=CONTAINS&filter[title][value]=${encodeURIComponent(query)}`;
  }

  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      url += `&filter[${key}]=${encodeURIComponent(value)}`;
    }
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.api+json",
      "User-Agent": "SophiaAI",
    },
  });

  if (!response.ok) {
    console.error("[Zyprus] Search error:", response.status);
    return [];
  }

  const data = await response.json();
  return data.data || [];
}

