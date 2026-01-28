/**
 * Zyprus API Client for Deno
 * Handles OAuth2 authentication and property listing operations
 */

import { validateImageUrl } from "../utils/url-validator.ts";
import {
  findListingTypeUuid,
  findPropertyTypeUuid,
  findPriceModifierUuid,
  findTitleDeedUuid,
  findUserUuid,
  findUserUuids,
  findIndoorFeatureUuids,
  findOutdoorFeatureUuids,
  findPropertyViewUuids,
} from "./taxonomy-cache.ts";
import { logger, LogCategory } from "../utils/logger.ts";

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
  // For Own Reference ID format: Owner - {Agent} - {Seller} - {Phone} - {Email}
  agentName?: string;
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  registrationNumber?: string;
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

  logger.info("Fetching new Zyprus access token", {
    category: LogCategory.ZYPRUS,
    operation: "getAccessToken",
  });

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
    logger.error("Failed to get Zyprus access token", undefined, {
      category: LogCategory.ZYPRUS,
      operation: "getAccessToken",
      status: response.status,
      errorPreview: errorText.substring(0, 200),
    });
    throw new Error(`Failed to get access token: ${response.status}`);
  }

  const data = await response.json();

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  logger.info("Zyprus access token obtained successfully", {
    category: LogCategory.ZYPRUS,
    operation: "getAccessToken",
    expiresIn: data.expires_in,
  });
  return data.access_token;
}

/**
 * Add privacy offset to coordinates (2-3 streets away)
 * Per meeting spec: NEVER place pin at exact property address
 */
function addPrivacyOffset(coords: { lat: number; lon: number }): { lat: number; lon: number } {
  // ~0.002 degrees ≈ 200m offset
  const offset = 0.002;
  return {
    lat: coords.lat + (Math.random() - 0.5) * offset,
    lon: coords.lon + (Math.random() - 0.5) * offset,
  };
}

/**
 * Generate Own Reference ID for quick reviewer reference
 * Format: Owner - {Agent Name} - {Seller Name} - {Seller Phone} - {Seller Email}
 * Example: Owner - Evelina Neophytou - Jane Smith - 99123456 - seller@email.com
 * Per Lauren feedback Jan 2026: Include owner email when provided
 */
function generateOwnReferenceId(
  agentName?: string,
  ownerName?: string,
  ownerPhone?: string,
  ownerEmail?: string,
  registrationNumber?: string
): string {
  const parts: string[] = ["Owner"];

  if (agentName) {
    parts.push(agentName);
  }

  if (ownerName) {
    parts.push(ownerName);
  }

  if (ownerPhone) {
    // Clean phone number - remove spaces, +357, etc.
    const cleanPhone = ownerPhone.replace(/[\s\-\+]/g, "").replace(/^357/, "");
    parts.push(cleanPhone);
  }

  // Add owner email when provided (per Lauren feedback Jan 2026)
  if (ownerEmail) {
    parts.push(ownerEmail);
  }

  if (registrationNumber) {
    parts.push(`Reg No.${registrationNumber}`);
  }

  return parts.join(" - ");
}

/**
 * Build JSON:API payload for property creation
 */
function buildJsonApiPayload(
  listing: ListingData,
  imageFileIds: string[],
  listingTypeUuid: string,
  propertyTypeUuid: string,
  priceModifierUuid: string,
  titleDeedUuid: string,
  instructorUuid: string,
  reviewerUuids: string[],
  listingOwnerUuid: string,
  indoorFeatureUuids: string[],
  outdoorFeatureUuids: string[],
  viewUuids: string[]
): Record<string, unknown> {
  // Generate Own Reference ID for quick reviewer reference
  // Format: Owner - {Agent Name} - {Seller Name} - {Seller Phone} - {Email}
  const ownReferenceId = generateOwnReferenceId(
    listing.agentName,
    listing.ownerName,
    listing.ownerPhone,
    listing.ownerEmail,
    listing.registrationNumber
  );

  // Build proper title: "2 Bedroom Bungalow For Sale in Kamares, Tala"
  const bedroomText = listing.bedrooms === 1 ? "1 Bedroom" : `${listing.bedrooms} Bedroom`;
  const listingTypeText = listing.listingType === "rent" ? "For Rent" : "For Sale";
  const propertyTypeCapitalized = listing.propertyType.charAt(0).toUpperCase() + listing.propertyType.slice(1).toLowerCase();

  const attributes: Record<string, unknown> = {
    title: `${bedroomText} ${propertyTypeCapitalized} ${listingTypeText} in ${listing.location}`,
    status: false, // Always unpublished draft
    field_price: listing.price,
    field_no_bedrooms: listing.bedrooms,
    field_no_bathrooms: listing.bathrooms,
    field_covered_area: listing.coveredArea,
    body: {
      value: listing.description,
      format: "plain_text",
    },
    field_my_notes: listing.myNotes,
    field_ai_assistant_notes: listing.aiNotes || "",
    field_ai_generated: true,
    field_ai_state: "draft",
    field_negotiable: true,
    // Own Reference ID: Owner - {Agent} - {Seller} - {Phone} - Reg No.{Reg}
    field_own_reference_id: ownReferenceId,
    field_ai_draft_own_reference_id: ownReferenceId,
  };

  // Optional fields
  if (listing.plotSize) {
    attributes.field_land_size = listing.plotSize; // API field is field_land_size, not field_plot_size
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

  // Coordinates - Full object format per Postman spec
  // Apply privacy offset per meeting spec (2-3 streets away)
  if (listing.coordinates) {
    const offsetCoords = addPrivacyOffset(listing.coordinates);
    attributes.field_map = {
      value: `POINT (${offsetCoords.lon} ${offsetCoords.lat})`,
      geo_type: "Point",
      lat: offsetCoords.lat,
      lon: offsetCoords.lon,
      latlon: `${offsetCoords.lat},${offsetCoords.lon}`,
    };
  }

  // Build relationships
  const relationships: Record<string, unknown> = {};

  // MANDATORY: Listing type (sale/rent)
  relationships.field_listing_type = {
    data: { type: "taxonomy_term--listing_type", id: listingTypeUuid },
  };

  // MANDATORY: Property type (apartment, villa, etc.)
  relationships.field_property_type = {
    data: { type: "taxonomy_term--property_type", id: propertyTypeUuid },
  };

  // MANDATORY: Price modifier (VAT context)
  relationships.field_price_modifier = {
    data: { type: "taxonomy_term--price_modifier", id: priceModifierUuid },
  };

  // MANDATORY: Title deed status
  relationships.field_title_deed = {
    data: { type: "taxonomy_term--title_deed", id: titleDeedUuid },
  };

  // MANDATORY: Location (NOTE: Zyprus uses node--location, NOT taxonomy_term)
  // Always include - findLocationUuid now always returns a valid UUID
  relationships.field_location = {
    data: { type: "node--location", id: listing.locationUuid || "7dbc931e-90eb-4b89-9ac8-b5e593831cf8" },
  };

  // Images (NOTE: Zyprus uses field_gallery_ with trailing underscore)
  if (imageFileIds.length > 0) {
    relationships.field_gallery_ = {
      data: imageFileIds.map((id) => ({
        type: "file--file",
        id,
      })),
    };
  }

  // Indoor features (AC, heating, etc.)
  // Note: field is field_indoor_property_features but references taxonomy_term--indoor_property_views
  if (indoorFeatureUuids.length > 0) {
    relationships.field_indoor_property_features = {
      data: indoorFeatureUuids.map((id) => ({
        type: "taxonomy_term--indoor_property_views",
        id,
      })),
    };
  }

  // Outdoor features (pool, garden, parking, etc.)
  if (outdoorFeatureUuids.length > 0) {
    relationships.field_outdoor_property_features = {
      data: outdoorFeatureUuids.map((id) => ({
        type: "taxonomy_term--outdoor_property_features",
        id,
      })),
    };
  }

  // Listing instructor - person who requested upload (resolved from email)
  relationships.field_ai_listing_instructor = {
    data: { type: "user--user", id: instructorUuid },
  };

  // Listing reviewers - people who will review the listing (resolved from emails)
  if (reviewerUuids.length > 0) {
    relationships.field_ai_listing_reviewer = {
      data: reviewerUuids.map((id) => ({ type: "user--user", id })),
    };
  }

  // CRITICAL: Listing owner - the agent account where property is assigned
  // Per meeting spec: "Listing Owner must match the agent mapping"
  // This was MISSING before - causing listings to not show in correct agent's dashboard
  relationships.field_listing_owner = {
    data: { type: "user--user", id: listingOwnerUuid },
  };

  // Property views (sea view, mountain view, etc.)
  // Per Postman spec: taxonomy_term--property_views
  if (viewUuids.length > 0) {
    relationships.field_property_views = {
      data: viewUuids.map((id) => ({
        type: "taxonomy_term--property_views",
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
      logger.warn("SSRF blocked - invalid image URL", {
        category: LogCategory.ZYPRUS,
        operation: "uploadSingleImage",
        imageIndex: index,
        urlPreview: url.substring(0, 100),
        validationError: urlValidation.error,
      });
      return null;
    }

    // Download image
    const imageResponse = await fetch(url);
    if (!imageResponse.ok) {
      logger.error("Failed to download image for Zyprus upload", undefined, {
        category: LogCategory.ZYPRUS,
        operation: "uploadSingleImage",
        imageIndex: index,
        status: imageResponse.status,
        urlPreview: url.substring(0, 100),
      });
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

    // Upload to Zyprus (NOTE: field_gallery_ with trailing underscore)
    const uploadResponse = await fetch(
      `${config.apiUrl}/jsonapi/node/property/field_gallery_`,
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
      logger.error("Failed to upload image to Zyprus", undefined, {
        category: LogCategory.ZYPRUS,
        operation: "uploadSingleImage",
        imageIndex: index,
        status: uploadResponse.status,
      });
      return null;
    }

    const uploadResult = await uploadResponse.json();
    if (uploadResult.data?.id) {
      logger.info("Image uploaded to Zyprus successfully", {
        category: LogCategory.ZYPRUS,
        operation: "uploadSingleImage",
        imageIndex: index + 1,
        fileId: uploadResult.data.id,
      });
      return uploadResult.data.id;
    }
    return null;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Image upload error", err, {
      category: LogCategory.ZYPRUS,
      operation: "uploadSingleImage",
      imageIndex: index,
      urlPreview: url.substring(0, 100),
    });
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
  logger.info("Uploading images to Zyprus in parallel", {
    category: LogCategory.ZYPRUS,
    operation: "uploadImages",
    imageCount: imageUrls.length,
  });

  // Upload all images in parallel
  const results = await Promise.all(
    imageUrls.map((url, index) => uploadSingleImage(url, index, token, config))
  );

  // Filter out failed uploads (nulls)
  const fileIds = results.filter((id): id is string => id !== null);

  logger.info("Image upload to Zyprus completed", {
    category: LogCategory.ZYPRUS,
    operation: "uploadImages",
    successCount: fileIds.length,
    totalCount: imageUrls.length,
  });
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

  logger.info("Creating draft listing on Zyprus", {
    category: LogCategory.ZYPRUS,
    operation: "createDraftListing",
    listingType: listing.listingType,
    propertyType: listing.propertyType,
    location: listing.location,
  });

  // Collect all reviewer emails for UUID resolution
  const reviewerEmails: string[] = [];
  if (listing.reviewer1) reviewerEmails.push(listing.reviewer1);
  if (listing.reviewer2) reviewerEmails.push(listing.reviewer2);

  // Resolve all taxonomy UUIDs, user UUIDs, and feature UUIDs in parallel
  const [
    listingTypeUuid,
    propertyTypeUuid,
    priceModifierUuid,
    titleDeedUuid,
    instructorUuid,
    reviewerUuids,
    listingOwnerUuid,
    indoorFeatureUuids,
    outdoorFeatureUuids,
    viewUuids,
  ] = await Promise.all([
    findListingTypeUuid(listing.listingType),
    findPropertyTypeUuid(listing.propertyType),
    findPriceModifierUuid(), // Uses default "No VAT"
    findTitleDeedUuid(), // Uses default "Title Deed"
    findUserUuid(listing.listingInstructor), // Resolve instructor email to UUID
    findUserUuids(reviewerEmails), // Resolve reviewer emails to UUIDs
    findUserUuid(listing.listingOwner), // CRITICAL: Resolve listing owner email to UUID
    findIndoorFeatureUuids(listing.features || [], listing.bathrooms), // Resolve indoor features (auto-adds guest toilet + master bed if bathrooms >= 2)
    findOutdoorFeatureUuids(listing.features || []), // Resolve outdoor features
    findPropertyViewUuids(listing.features || []), // Resolve property views (sea view, etc.)
  ]);

  // Note: All taxonomy/user functions now have hardcoded fallbacks, so they cannot fail

  logger.info("Resolved Zyprus UUIDs for listing", {
    category: LogCategory.ZYPRUS,
    operation: "createDraftListing",
    listingTypeUuid,
    propertyTypeUuid,
    priceModifierUuid,
    titleDeedUuid,
    instructorUuid,
    reviewerCount: reviewerUuids.length,
    listingOwnerUuid,
    indoorFeatureCount: indoorFeatureUuids.length,
    outdoorFeatureCount: outdoorFeatureUuids.length,
    viewCount: viewUuids.length,
  });

  // Upload images first
  const imageFileIds = await uploadImages(listing.images, token, config);
  logger.info("Images uploaded for listing", {
    category: LogCategory.ZYPRUS,
    operation: "createDraftListing",
    uploadedCount: imageFileIds.length,
    totalCount: listing.images.length,
  });

  // Build and send listing payload
  const payload = buildJsonApiPayload(
    listing,
    imageFileIds,
    listingTypeUuid,
    propertyTypeUuid,
    priceModifierUuid,
    titleDeedUuid,
    instructorUuid,
    reviewerUuids,
    listingOwnerUuid,
    indoorFeatureUuids,
    outdoorFeatureUuids,
    viewUuids
  );

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
    // Include error details in the exception for debugging
    let errorDetail = "";
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.errors) {
        errorDetail = errorJson.errors.map((e: any) => e.detail || e.title || JSON.stringify(e)).join("; ");
      }
    } catch {
      errorDetail = errorText.substring(0, 200);
    }
    logger.error("Failed to create Zyprus listing", undefined, {
      category: LogCategory.ZYPRUS,
      operation: "createDraftListing",
      status: response.status,
      errorDetail,
    });
    throw new Error(`Failed to create listing (${response.status}): ${errorDetail || "Unknown error"}`);
  }

  const result = await response.json();
  const listingId = result.data.id;

  logger.info("Zyprus listing created successfully", {
    category: LogCategory.ZYPRUS,
    operation: "createDraftListing",
    listingId,
  });

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
    logger.error("Zyprus property search failed", undefined, {
      category: LogCategory.ZYPRUS,
      operation: "searchProperties",
      status: response.status,
      query,
    });
    return [];
  }

  const data = await response.json();
  return data.data || [];
}

