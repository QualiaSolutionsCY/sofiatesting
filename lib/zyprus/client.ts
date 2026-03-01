/* eslint-disable @typescript-eslint/no-explicit-any -- External Zyprus API returns untyped JSON */
import { createCircuitBreaker } from "@/lib/circuit-breakers";
import type { PropertyListing } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import {
  DEFAULT_LISTING_INSTRUCTOR_UUID,
  DEFAULT_LISTING_REVIEWER_UUID,
} from "./constants";

const log = logger.zyprus;

type ZyprusAPIErrorOptions = {
  message: string;
  code: string;
  statusCode?: number;
  details?: string;
  errors?: any[];
};

export class ZyprusAPIError extends Error {
  code: string;
  statusCode?: number;
  details?: string;
  errors?: any[];

  constructor(options: ZyprusAPIErrorOptions) {
    super(options.message);
    this.name = "ZyprusAPIError";
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.details = options.details;
    this.errors = options.errors;
  }
}

type OAuthToken = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
};

type JsonApiResource = {
  type: string;
  id?: string;
  attributes: Record<string, any>;
  relationships?: Record<string, any>;
};

type JsonApiDocument = {
  data: JsonApiResource | JsonApiResource[];
  included?: JsonApiResource[];
  meta?: Record<string, any>;
};

let cachedToken: OAuthToken | null = null;
let tokenExpiresAt = 0;

/**
 * Validate if a string is a valid UUID v4
 */
const isValidUuid = (id: string): boolean => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

/**
 * Filter array to only include valid UUIDs, with warning for invalid ones
 */
const filterValidUuids = (ids: string[], fieldName: string): string[] => {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const id of ids) {
    if (isValidUuid(id)) {
      valid.push(id);
    } else {
      invalid.push(id);
    }
  }

  if (invalid.length > 0) {
    log.warn("Filtered out invalid UUIDs", {
      fieldName,
      invalidCount: invalid.length,
      invalidIds: invalid,
    });
  }

  return valid;
};

/**
 * Convert ibb.co page URLs to direct image URLs
 * ibb.co page URLs (e.g., https://ibb.co/YFZ2Qt2j) don't return images directly
 * We need to convert them to i.ibb.co direct URLs
 */
const convertToDirectImageUrl = (url: string): string => {
  // Check if it's an ibb.co page URL (not i.ibb.co)
  const ibbPageMatch = url.match(/^https?:\/\/ibb\.co\/([a-zA-Z0-9]+)$/);
  if (ibbPageMatch) {
    const imageId = ibbPageMatch[1];
    // Convert to direct image URL format
    // Note: ibb.co doesn't have a simple conversion, we need to fetch the page and extract the image
    // For now, log a warning and try the i.ibb.co format
    log.warn("ibb.co page URL detected, use direct image URLs instead", {
      url,
    });
    // Try common i.ibb.co format - this may not always work
    return `https://i.ibb.co/${imageId}/image.jpg`;
  }

  // Check if it's already a direct i.ibb.co URL - these are fine
  if (url.includes("i.ibb.co")) {
    return url;
  }

  // Return other URLs unchanged
  return url;
};

/**
 * Generate a unique reference ID from owner details
 * Format: [last 4 phone digits]-[email prefix 4 chars]-[title deed number]
 * Fallback: AI-[8 char UUID] if no owner info provided
 */
export const generateReferenceId = (listing: {
  ownerPhone?: string | null;
  ownerEmail?: string | null;
  titleDeedNumber?: string | null;
}): string => {
  const parts: string[] = [];

  // Extract last 4 digits of phone
  if (listing.ownerPhone) {
    const phoneDigits = listing.ownerPhone.replace(/\D/g, "");
    if (phoneDigits.length >= 4) {
      parts.push(phoneDigits.slice(-4));
    }
  }

  // Extract email prefix (before @), max 4 chars uppercase
  if (listing.ownerEmail) {
    const emailPrefix = listing.ownerEmail
      .split("@")[0]
      .slice(0, 4)
      .toUpperCase();
    if (emailPrefix.length > 0) {
      parts.push(emailPrefix);
    }
  }

  // Add title deed number if available (remove spaces)
  if (listing.titleDeedNumber) {
    const cleanDeed = listing.titleDeedNumber.replace(/\s/g, "");
    if (cleanDeed.length > 0) {
      parts.push(cleanDeed);
    }
  }

  // Fallback to UUID if no owner info
  if (parts.length === 0) {
    return `AI-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }

  return parts.join("-");
};

/**
 * Internal OAuth token fetch (wrapped by circuit breaker)
 */
async function fetchAccessTokenInternal(): Promise<string> {
  const now = Date.now();

  const apiUrl = process.env.ZYPRUS_API_URL || "https://dev9.zyprus.com";
  const clientId = process.env.ZYPRUS_CLIENT_ID;
  const clientSecret = process.env.ZYPRUS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new ZyprusAPIError({
      message: "ZYPRUS_CLIENT_ID or ZYPRUS_CLIENT_SECRET not configured",
      code: "CONFIG_ERROR",
    });
  }

  try {
    const response = await fetch(`${apiUrl}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "SophiaAI",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ZyprusAPIError({
        message:
          errorData.error_description || `OAuth error: ${response.status}`,
        code: errorData.error || "OAUTH_ERROR",
        statusCode: response.status,
      });
    }

    const tokenData: OAuthToken = await response.json();
    cachedToken = tokenData;
    tokenExpiresAt = now + tokenData.expires_in * 1000;

    return tokenData.access_token;
  } catch (error) {
    if (error instanceof ZyprusAPIError) {
      throw error;
    }

    throw new ZyprusAPIError({
      message: `OAuth token error: ${error instanceof Error ? error.message : "Unknown error"}`,
      code: "OAUTH_ERROR",
    });
  }
}

// Circuit breaker for OAuth token fetch
const oauthBreaker = createCircuitBreaker(fetchAccessTokenInternal, {
  name: "ZyprusOAuth",
  timeout: 10_000, // 10 second timeout
  errorThresholdPercentage: 60, // Allow more failures before opening (OAuth is critical)
  resetTimeout: 60_000, // Wait 1 minute before trying again
});

/**
 * Get OAuth token for API authentication (with circuit breaker and caching)
 */
async function getAccessToken(): Promise<string> {
  const now = Date.now();

  // Return cached token if still valid (with 5 minute buffer)
  if (cachedToken && tokenExpiresAt > now + 300_000) {
    return cachedToken.access_token;
  }

  // Fetch new token through circuit breaker
  return await oauthBreaker.fire();
}

/**
 * Get available locations from Zyprus
 */
export async function getZyprusLocations(): Promise<any[]> {
  const apiUrl = process.env.ZYPRUS_API_URL || "https://dev9.zyprus.com";
  const token = await getAccessToken();

  try {
    const response = await fetch(`${apiUrl}/jsonapi/node/location`, {
      method: "GET",
      headers: {
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "SophiaAI",
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ZyprusAPIError({
        message:
          errorData.errors?.[0]?.title || `API error: ${response.status}`,
        code: errorData.errors?.[0]?.code || "API_ERROR",
        statusCode: response.status,
      });
    }

    const data: JsonApiDocument = await response.json();
    return Array.isArray(data.data) ? data.data : [data.data];
  } catch (error) {
    if (error instanceof ZyprusAPIError) {
      throw error;
    }

    throw new ZyprusAPIError({
      message: `Failed to fetch locations: ${error instanceof Error ? error.message : "Unknown error"}`,
      code: "NETWORK_ERROR",
    });
  }
}

/**
 * Get taxonomy terms for property features
 */
export async function getZyprusTaxonomyTerms(
  vocabularyType: string
): Promise<any[]> {
  const apiUrl = process.env.ZYPRUS_API_URL || "https://dev9.zyprus.com";
  const token = await getAccessToken();

  try {
    const response = await fetch(
      `${apiUrl}/jsonapi/taxonomy_term/${vocabularyType}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/vnd.api+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "SophiaAI",
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ZyprusAPIError({
        message:
          errorData.errors?.[0]?.title || `API error: ${response.status}`,
        code: errorData.errors?.[0]?.code || "API_ERROR",
        statusCode: response.status,
      });
    }

    const data: JsonApiDocument = await response.json();
    return Array.isArray(data.data) ? data.data : [data.data];
  } catch (error) {
    if (error instanceof ZyprusAPIError) {
      throw error;
    }

    throw new ZyprusAPIError({
      message: `Failed to fetch taxonomy terms: ${error instanceof Error ? error.message : "Unknown error"}`,
      code: "NETWORK_ERROR",
    });
  }
}

/**
 * Extended listing type for upload with all Zyprus API fields
 */
export type ZyprusListingInput = PropertyListing & {
  locationId?: string;
  indoorFeatureIds?: string[];
  outdoorFeatureIds?: string[];
  listingTypeId?: string;
  propertyTypeId?: string;
  priceModifierId?: string;
  titleDeedId?: string;
  yearBuilt?: number;
  referenceId?: string;
  // NEW: AI tracking fields
  chatId?: string;
  duplicateDetected?: boolean;
  // NEW: Property status and views
  propertyStatusId?: string;
  viewIds?: string[];
  // NEW: Optional fields
  energyClass?: string;
  videoUrl?: string;
  phoneNumber?: string;
  propertyNotes?: string;
};

/**
 * Internal property upload function (wrapped by circuit breaker)
 */
async function uploadToZyprusAPIInternal(listing: ZyprusListingInput): Promise<{
  listingId: string;
  listingUrl: string;
}> {
  const apiUrl = process.env.ZYPRUS_API_URL || "https://dev9.zyprus.com";
  const token = await getAccessToken();

  // Upload images to field_gallery_ endpoint if present (PARALLEL UPLOADS)
  const imageIds: string[] = [];
  if (listing.image && Array.isArray(listing.image)) {
    const imageUrls = listing.image as string[];
    const totalImages = imageUrls.length;

    log.info("Starting PARALLEL image upload to Zyprus", { totalImages });

    // Create upload promise for each image
    const uploadPromises = imageUrls.map(async (imageUrl, i) => {
      // Convert ibb.co page URLs to direct image URLs
      const directUrl = convertToDirectImageUrl(imageUrl);
      log.debug("Uploading image", {
        index: i + 1,
        totalImages,
        url: directUrl,
        converted: directUrl !== imageUrl,
      });

      try {
        // Fetch image from URL (supports both external URLs and Vercel Blob URLs)
        const imageResponse = await fetch(directUrl, {
          signal: AbortSignal.timeout(30_000), // 30 second timeout
        });
        if (!imageResponse.ok) {
          throw new Error(
            `Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`
          );
        }

        // Validate content-type is an actual image
        const contentType =
          imageResponse.headers.get("content-type") || "image/jpeg";
        if (!contentType.startsWith("image/")) {
          throw new Error(
            `URL returned non-image content-type: ${contentType}. Use direct image URLs (e.g., i.ibb.co instead of ibb.co)`
          );
        }

        const imageBlob = await imageResponse.blob();

        // Determine file extension from content type
        const ext = contentType.split("/")[1] || "jpg";
        const filename = `property-image-${i + 1}.${ext}`;

        // IMPORTANT: Zyprus expects raw binary upload with Content-Disposition header
        // NOT multipart/form-data (as per Postman collection spec)
        const uploadResponse = await fetch(
          `${apiUrl}/jsonapi/node/property/field_gallery_`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "User-Agent": "SophiaAI",
              "Content-Type": "application/octet-stream",
              "Content-Disposition": `file; filename="${filename}"`,
            },
            body: imageBlob,
          }
        );

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          throw new Error(
            `Upload failed: ${uploadResponse.status} - ${errorText}`
          );
        }

        const data = await uploadResponse.json();
        log.debug("Successfully uploaded image", {
          index: i + 1,
          id: data.data.id,
        });
        return { index: i, id: data.data.id, url: imageUrl };
      } catch (imgError) {
        log.error("Error processing image", imgError, {
          index: i + 1,
          url: imageUrl,
        });
        throw imgError; // Re-throw to mark as rejected in Promise.allSettled
      }
    });

    // Execute all uploads in parallel and collect results
    const results = await Promise.allSettled(uploadPromises);

    // Extract successful image IDs (preserve original order)
    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        imageIds.push(result.value.id);
      } else {
        log.error("Image upload failed", result.reason, { index: i + 1 });
      }
    });

    log.info("Parallel image upload complete", {
      successful: imageIds.length,
      total: totalImages,
      successRate: `${((imageIds.length / totalImages) * 100).toFixed(1)}%`,
    });
  }

  // Extract coordinates for field_map if available
  const geo = (listing.address as any)?.geo;
  const hasCoordinates = geo?.latitude && geo?.longitude;

  // Build JSON:API payload for Drupal with correct field names
  const payload: JsonApiDocument = {
    data: {
      type: "node--property",
      attributes: {
        status: false, // MANDATORY: false to prevent unexpected display
        title: listing.name,
        body: {
          value: listing.description,
          format: "plain_text",
        },
        field_ai_state: "draft", // CRUCIAL: track AI-generated properties
        // NEW: AI tracking fields (mandatory for AI-generated listings)
        field_ai_generated: true,
        field_ai_message: {
          value: listing.chatId
            ? `Generated by SOFIA AI from chat ${listing.chatId}`
            : "Generated by SOFIA AI",
        },
        field_ai_probably_exists: listing.duplicateDetected || false,
        field_price: String(listing.price), // Price as string
        field_covered_area: Number.parseFloat(String(listing.floorSize)), // Parse as float
        field_land_size: Number.parseFloat(
          String((listing as any).landSize || listing.floorSize)
        ), // Parse as float
        field_no_bedrooms: Number.parseInt(String(listing.numberOfRooms), 10), // Parse as integer
        field_no_bathrooms: Number.parseInt(
          String(listing.numberOfBathroomsTotal),
          10
        ), // Parse as integer (Drupal expects integer)
        field_no_kitchens: Number.parseInt(
          String((listing as any).numberOfKitchens || 1),
          10
        ), // Parse as integer
        field_no_living_rooms: Number.parseInt(
          String((listing as any).numberOfLivingRooms || 1),
          10
        ), // Parse as integer
        field_own_reference_id:
          listing.referenceId ||
          generateReferenceId({
            ownerPhone: listing.ownerPhone,
            ownerEmail: (listing as any).ownerEmail,
            titleDeedNumber: (listing as any).titleDeedNumber,
          }),
        // AI Draft Reference ID - same as own_reference_id for AI-generated listings
        field_ai_draft_own_reference_id:
          listing.referenceId ||
          generateReferenceId({
            ownerPhone: listing.ownerPhone,
            ownerEmail: (listing as any).ownerEmail,
            titleDeedNumber: (listing as any).titleDeedNumber,
          }),
        field_year_built: Number.parseInt(
          String(listing.yearBuilt || new Date().getFullYear()),
          10
        ), // Parse as integer
        field_new_build: false,
        // NEW: Optional fields
        field_energy_class: listing.energyClass || null,
        field_video_walkthrough: listing.videoUrl || null,
        // NOTE: field_phone_number removed - OAuth client doesn't have permission
        field_property_notes: listing.propertyNotes || null,
        // FIX: field_map now includes latlon field (required by Zyprus API)
        field_map: hasCoordinates
          ? {
              value: `POINT (${geo.longitude} ${geo.latitude})`,
              geo_type: "Point",
              lat: geo.latitude,
              lon: geo.longitude,
              latlon: `${geo.latitude},${geo.longitude}`, // NEW: latlon field
            }
          : undefined,
      },
      relationships: {},
    },
  };

  // Add relationships only if IDs are provided
  const relationships: any = {};

  // Use a default location if not provided (first available location)
  // You should ideally fetch this dynamically or configure it
  const DEFAULT_LOCATION_ID = "7dbc931e-90eb-4b89-9ac8-b5e593831cf8"; // Acropolis, Strovolos
  const DEFAULT_PROPERTY_TYPE_ID = "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44"; // Apartment

  if (listing.locationId) {
    relationships.field_location = {
      data: {
        type: "node--location",
        id: listing.locationId,
      },
    };
  } else {
    // Use default location if not provided
    relationships.field_location = {
      data: {
        type: "node--location",
        id: DEFAULT_LOCATION_ID,
      },
    };
  }

  if (listing.indoorFeatureIds?.length) {
    const validIndoorIds = filterValidUuids(
      listing.indoorFeatureIds,
      "indoor feature"
    );
    if (validIndoorIds.length > 0) {
      relationships.field_indoor_property_features = {
        data: validIndoorIds.map((id) => ({
          type: "taxonomy_term--indoor_property_views",
          id,
        })),
      };
    }
  }

  if (listing.outdoorFeatureIds?.length) {
    const validOutdoorIds = filterValidUuids(
      listing.outdoorFeatureIds,
      "outdoor feature"
    );
    if (validOutdoorIds.length > 0) {
      relationships.field_outdoor_property_features = {
        data: validOutdoorIds.map((id) => ({
          type: "taxonomy_term--outdoor_property_features",
          id,
        })),
      };
    }
  }

  if (listing.listingTypeId) {
    relationships.field_listing_type = {
      data: {
        type: "taxonomy_term--listing_type",
        id: listing.listingTypeId,
      },
    };
  }

  if (listing.propertyTypeId) {
    relationships.field_property_type = {
      data: {
        type: "taxonomy_term--property_type",
        id: listing.propertyTypeId,
      },
    };
  } else {
    // Use default property type if not provided
    relationships.field_property_type = {
      data: {
        type: "taxonomy_term--property_type",
        id: DEFAULT_PROPERTY_TYPE_ID,
      },
    };
  }

  if (listing.priceModifierId) {
    relationships.field_price_modifier = {
      data: {
        type: "taxonomy_term--price_modifier",
        id: listing.priceModifierId,
      },
    };
  }

  if (listing.titleDeedId) {
    relationships.field_title_deed = {
      data: {
        type: "taxonomy_term--title_deed",
        id: listing.titleDeedId,
      },
    };
  }

  // NEW: Property status relationship (Under Construction, Resale, Off Plan, etc.)
  if (listing.propertyStatusId) {
    relationships.field_property_status = {
      data: {
        type: "taxonomy_term--property_status",
        id: listing.propertyStatusId,
      },
    };
  }

  // NEW: Property views relationship (Sea View, Mountain View, City View, etc.)
  if (listing.viewIds?.length) {
    const validViewIds = filterValidUuids(listing.viewIds, "property view");
    if (validViewIds.length > 0) {
      relationships.field_property_views = {
        data: validViewIds.map((id) => ({
          type: "taxonomy_term--property_views",
          id,
        })),
      };
    }
  }

  // AI Listing Reviewer - temporarily using default
  // TODO: Implement dynamic reviewer assignment after fixing type issues
  relationships.field_ai_listing_reviewer = {
    data: [
      {
        type: "user--user",
        id: DEFAULT_LISTING_REVIEWER_UUID,
      },
    ],
  };

  // AI Listing Instructor - who instructed/submitted the listing (single user)
  relationships.field_ai_listing_instructor = {
    data: {
      type: "user--user",
      id: DEFAULT_LISTING_INSTRUCTOR_UUID,
    },
  };

  if (imageIds.length > 0) {
    relationships.field_gallery_ = {
      data: imageIds.map((id) => ({
        type: "file--file",
        id,
      })),
    };
  }

  // Add default empty array for gallery if no images
  if (!relationships.field_gallery_) {
    relationships.field_gallery_ = {
      data: [],
    };
  }

  // Always add relationships (even if some are empty)
  (payload.data as JsonApiResource).relationships = relationships;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000); // 30s timeout

    const response = await fetch(`${apiUrl}/jsonapi/node/property`, {
      method: "POST",
      headers: {
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.api+json",
        "User-Agent": "SophiaAI",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      log.error("Zyprus API Response Error", undefined, {
        status: response.status,
        errors: errorData.errors,
      });

      // Build detailed error message
      let errorMessage = `API error: ${response.status}`;
      let errorDetails = "";

      if (errorData.errors && Array.isArray(errorData.errors)) {
        const errors = errorData.errors
          .map(
            (err: any) =>
              `${err.title || ""} - ${err.detail || ""} (${err.source?.pointer || "unknown field"})`
          )
          .join("; ");
        errorMessage = errors || errorMessage;
        errorDetails = JSON.stringify(errorData.errors);
      }

      throw new ZyprusAPIError({
        message: errorMessage,
        code: errorData.errors?.[0]?.code || "API_ERROR",
        statusCode: response.status,
        details: errorDetails,
        errors: errorData.errors,
      });
    }

    const responseData: JsonApiDocument = await response.json();
    const propertyData = responseData.data as JsonApiResource;

    return {
      listingId: propertyData.id || "",
      listingUrl: `${process.env.ZYPRUS_SITE_URL || "https://dev9.zyprus.com"}/property/${propertyData.id}`,
    };
  } catch (error) {
    if (error instanceof ZyprusAPIError) {
      throw error;
    }

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new ZyprusAPIError({
          message: "Request timeout after 30 seconds",
          code: "TIMEOUT",
        });
      }
      throw new ZyprusAPIError({
        message: `Network error: ${error.message}`,
        code: "NETWORK_ERROR",
      });
    }

    throw new ZyprusAPIError({
      message: "Unknown error occurred",
      code: "UNKNOWN",
    });
  }
}

/**
 * Get existing property listings from Zyprus
 */
export async function getZyprusListings(): Promise<any[]> {
  const apiUrl = process.env.ZYPRUS_API_URL || "https://dev9.zyprus.com";
  const token = await getAccessToken();

  try {
    const response = await fetch(`${apiUrl}/jsonapi/node/property`, {
      method: "GET",
      headers: {
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "SophiaAI",
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ZyprusAPIError({
        message:
          errorData.errors?.[0]?.title || `API error: ${response.status}`,
        code: errorData.errors?.[0]?.code || "API_ERROR",
        statusCode: response.status,
      });
    }

    const data: JsonApiDocument = await response.json();
    return Array.isArray(data.data) ? data.data : [data.data];
  } catch (error) {
    if (error instanceof ZyprusAPIError) {
      throw error;
    }

    throw new ZyprusAPIError({
      message: `Failed to fetch listings: ${error instanceof Error ? error.message : "Unknown error"}`,
      code: "NETWORK_ERROR",
    });
  }
}

// Circuit breaker for property upload
const uploadBreaker = createCircuitBreaker(uploadToZyprusAPIInternal, {
  name: "ZyprusUpload",
  timeout: 90_000, // 90 second timeout (allows for multiple image uploads)
  errorThresholdPercentage: 50, // 50% failure rate trips circuit
  resetTimeout: 30_000, // Wait 30 seconds before trying again
  volumeThreshold: 3, // Need at least 3 failed requests to trip
});

/**
 * Upload property listing to Zyprus API (with circuit breaker)
 *
 * Supports all Zyprus API fields including:
 * - AI tracking: chatId, duplicateDetected (sets field_ai_generated, field_ai_message, field_ai_probably_exists)
 * - Property status and views: propertyStatusId, viewIds
 * - Optional fields: energyClass, videoUrl, phoneNumber, propertyNotes
 */
export async function uploadToZyprusAPI(listing: ZyprusListingInput): Promise<{
  listingId: string;
  listingUrl: string;
}> {
  return await uploadBreaker.fire(listing);
}

/**
 * Land listing input type for Zyprus API
 */
export type ZyprusLandInput = {
  title: string;
  description: string;
  price: number;
  landSize: number;
  // Land-specific building permissions
  buildingDensity?: number; // % density allowed
  siteCoverage?: number; // % site coverage allowed
  maxFloors?: number;
  maxHeight?: number;
  // Location and coordinates
  locationId: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  // Taxonomy relationships
  landTypeId: string;
  listingTypeId: string;
  priceModifierId?: string;
  titleDeedId?: string;
  infrastructureIds?: string[]; // Electricity, Water, Road Access, etc.
  viewIds?: string[]; // Sea View, Mountain View, etc.
  // AI tracking
  chatId?: string;
  duplicateDetected?: boolean;
  // Optional
  referenceId?: string;
  phoneNumber?: string;
  notes?: string;
  // Images
  images?: string[];
};

/**
 * Internal land upload function (wrapped by circuit breaker)
 */
async function uploadLandToZyprusAPIInternal(
  listing: ZyprusLandInput
): Promise<{
  listingId: string;
  listingUrl: string;
}> {
  const apiUrl = process.env.ZYPRUS_API_URL || "https://dev9.zyprus.com";
  const token = await getAccessToken();

  // Upload images to field_land_gallery endpoint if present (PARALLEL UPLOADS)
  const imageIds: string[] = [];
  if (listing.images && Array.isArray(listing.images)) {
    const imageUrls = listing.images;
    const totalImages = imageUrls.length;

    log.info("Starting PARALLEL land image upload to Zyprus", { totalImages });

    const uploadPromises = imageUrls.map(async (imageUrl, i) => {
      // Convert ibb.co page URLs to direct image URLs
      const directUrl = convertToDirectImageUrl(imageUrl);
      log.debug("Uploading land image", {
        index: i + 1,
        totalImages,
        url: directUrl,
        converted: directUrl !== imageUrl,
      });

      try {
        const imageResponse = await fetch(directUrl, {
          signal: AbortSignal.timeout(30_000), // 30 second timeout
        });
        if (!imageResponse.ok) {
          throw new Error(
            `Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`
          );
        }

        // Validate content-type is an actual image
        const contentType =
          imageResponse.headers.get("content-type") || "image/jpeg";
        if (!contentType.startsWith("image/")) {
          throw new Error(
            `URL returned non-image content-type: ${contentType}. Use direct image URLs (e.g., i.ibb.co instead of ibb.co)`
          );
        }

        const imageBlob = await imageResponse.blob();
        const ext = contentType.split("/")[1] || "jpg";
        const filename = `land-image-${i + 1}.${ext}`;

        // IMPORTANT: Land uses field_land_gallery (different from property field_gallery_)
        const uploadResponse = await fetch(
          `${apiUrl}/jsonapi/node/land/field_land_gallery`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "User-Agent": "SophiaAI",
              "Content-Type": "application/octet-stream",
              "Content-Disposition": `file; filename="${filename}"`,
            },
            body: imageBlob,
          }
        );

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          throw new Error(
            `Upload failed: ${uploadResponse.status} - ${errorText}`
          );
        }

        const data = await uploadResponse.json();
        log.debug("Successfully uploaded land image", {
          index: i + 1,
          id: data.data.id,
        });
        return { index: i, id: data.data.id, url: imageUrl };
      } catch (imgError) {
        log.error("Error processing land image", imgError, {
          index: i + 1,
          url: imageUrl,
        });
        throw imgError;
      }
    });

    const results = await Promise.allSettled(uploadPromises);

    for (const result of results) {
      if (result.status === "fulfilled") {
        imageIds.push(result.value.id);
      } else {
        log.error("Land image upload failed", result.reason);
      }
    }

    log.info("Parallel land image upload complete", {
      successful: imageIds.length,
      total: totalImages,
    });
  }

  // Build land-specific field_map
  const hasCoordinates =
    listing.coordinates?.latitude && listing.coordinates?.longitude;

  // Build JSON:API payload for land listing
  const payload: JsonApiDocument = {
    data: {
      type: "node--land",
      attributes: {
        status: false, // MANDATORY: false to prevent unexpected display
        title: listing.title,
        body: {
          value: listing.description,
          format: "plain_text",
        },
        field_ai_state: "draft", // CRUCIAL: track AI-generated listings
        field_ai_generated: true,
        field_ai_message: {
          value: listing.chatId
            ? `Generated by SOFIA AI from chat ${listing.chatId}`
            : "Generated by SOFIA AI",
        },
        field_ai_probably_exists: listing.duplicateDetected || false,
        field_price: String(listing.price),
        field_land_size: listing.landSize,
        // Land-specific building permissions
        field_building_density: listing.buildingDensity || null,
        field_site_coverage: listing.siteCoverage || null,
        field_floors: listing.maxFloors || null,
        field_height: listing.maxHeight || null,
        field_own_reference_id:
          listing.referenceId ||
          generateReferenceId({
            ownerPhone: listing.phoneNumber,
            ownerEmail: null,
            titleDeedNumber: null,
          }),
        // AI Draft Reference ID - same as own_reference_id for AI-generated listings
        field_ai_draft_own_reference_id:
          listing.referenceId ||
          generateReferenceId({
            ownerPhone: listing.phoneNumber,
            ownerEmail: null,
            titleDeedNumber: null,
          }),
        // NOTE: field_phone_number removed - OAuth client doesn't have permission
        field_property_notes: listing.notes || null,
        field_map: hasCoordinates
          ? {
              value: `POINT (${listing.coordinates?.longitude} ${listing.coordinates?.latitude})`,
              geo_type: "Point",
              lat: listing.coordinates?.latitude,
              lon: listing.coordinates?.longitude,
              latlon: `${listing.coordinates?.latitude},${listing.coordinates?.longitude}`,
            }
          : undefined,
      },
      relationships: {},
    },
  };

  // Build relationships for land listing
  const relationships: Record<string, any> = {};

  // Mandatory: Location
  relationships.field_location = {
    data: {
      type: "node--location",
      id: listing.locationId,
    },
  };

  // Mandatory: Land type
  relationships.field_land_type = {
    data: {
      type: "taxonomy_term--land_type",
      id: listing.landTypeId,
    },
  };

  // Mandatory: Listing type (For Sale, For Rent, etc.)
  relationships.field_listing_type = {
    data: {
      type: "taxonomy_term--listing_type",
      id: listing.listingTypeId,
    },
  };

  // Optional: Price modifier (land uses field_land_price_modifier)
  if (listing.priceModifierId) {
    relationships.field_land_price_modifier = {
      data: {
        type: "taxonomy_term--price_modifier",
        id: listing.priceModifierId,
      },
    };
  }

  // Optional: Title deed (land uses field_land_title_deed)
  if (listing.titleDeedId) {
    relationships.field_land_title_deed = {
      data: {
        type: "taxonomy_term--title_deed",
        id: listing.titleDeedId,
      },
    };
  }

  // Optional: Infrastructure (Electricity, Water, Road Access, etc.)
  if (listing.infrastructureIds?.length) {
    const validInfraIds = filterValidUuids(
      listing.infrastructureIds,
      "infrastructure"
    );
    if (validInfraIds.length > 0) {
      relationships.field_infrastructure = {
        data: validInfraIds.map((id) => ({
          type: "taxonomy_term--infrastructure_",
          id,
        })),
      };
    }
  }

  // Optional: Land views (land uses field_land_views)
  if (listing.viewIds?.length) {
    const validViewIds = filterValidUuids(listing.viewIds, "land view");
    if (validViewIds.length > 0) {
      relationships.field_land_views = {
        data: validViewIds.map((id) => ({
          type: "taxonomy_term--property_views",
          id,
        })),
      };
    }
  }

  // AI Listing Reviewer - assigned to review AI-generated listings (array of users)
  relationships.field_ai_listing_reviewer = {
    data: [
      {
        type: "user--user",
        id: DEFAULT_LISTING_REVIEWER_UUID,
      },
    ],
  };

  // AI Listing Instructor - who instructed/submitted the listing (single user)
  relationships.field_ai_listing_instructor = {
    data: {
      type: "user--user",
      id: DEFAULT_LISTING_INSTRUCTOR_UUID,
    },
  };

  // Images
  if (imageIds.length > 0) {
    relationships.field_land_gallery = {
      data: imageIds.map((id) => ({
        type: "file--file",
        id,
      })),
    };
  } else {
    relationships.field_land_gallery = {
      data: [],
    };
  }

  (payload.data as JsonApiResource).relationships = relationships;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    // POST to /jsonapi/node/land (different from property)
    const response = await fetch(`${apiUrl}/jsonapi/node/land`, {
      method: "POST",
      headers: {
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.api+json",
        "User-Agent": "SophiaAI",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      log.error("Zyprus Land API Response Error", undefined, {
        status: response.status,
        errors: errorData.errors,
      });

      let errorMessage = `API error: ${response.status}`;
      let errorDetails = "";

      if (errorData.errors && Array.isArray(errorData.errors)) {
        const errors = errorData.errors
          .map(
            (err: any) =>
              `${err.title || ""} - ${err.detail || ""} (${err.source?.pointer || "unknown field"})`
          )
          .join("; ");
        errorMessage = errors || errorMessage;
        errorDetails = JSON.stringify(errorData.errors);
      }

      throw new ZyprusAPIError({
        message: errorMessage,
        code: errorData.errors?.[0]?.code || "API_ERROR",
        statusCode: response.status,
        details: errorDetails,
        errors: errorData.errors,
      });
    }

    const responseData: JsonApiDocument = await response.json();
    const landData = responseData.data as JsonApiResource;

    return {
      listingId: landData.id || "",
      listingUrl: `${process.env.ZYPRUS_SITE_URL || "https://dev9.zyprus.com"}/land/${landData.id}`,
    };
  } catch (error) {
    if (error instanceof ZyprusAPIError) {
      throw error;
    }

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new ZyprusAPIError({
          message: "Request timeout after 30 seconds",
          code: "TIMEOUT",
        });
      }
      throw new ZyprusAPIError({
        message: `Network error: ${error.message}`,
        code: "NETWORK_ERROR",
      });
    }

    throw new ZyprusAPIError({
      message: "Unknown error occurred",
      code: "UNKNOWN",
    });
  }
}

// Circuit breaker for land upload
const landUploadBreaker = createCircuitBreaker(uploadLandToZyprusAPIInternal, {
  name: "ZyprusLandUpload",
  timeout: 90_000, // 90 second timeout (allows for multiple image uploads)
  errorThresholdPercentage: 50,
  resetTimeout: 30_000,
  volumeThreshold: 3,
});

/**
 * Upload land listing to Zyprus API (with circuit breaker)
 *
 * Supports all Zyprus Land API fields including:
 * - Building permissions: buildingDensity, siteCoverage, maxFloors, maxHeight
 * - Infrastructure: infrastructureIds (Electricity, Water, Road Access)
 * - AI tracking: chatId, duplicateDetected
 */
export async function uploadLandToZyprusAPI(listing: ZyprusLandInput): Promise<{
  listingId: string;
  listingUrl: string;
}> {
  return await landUploadBreaker.fire(listing);
}

// =====================================================
// Generic File Upload Support (Floor Plans, PDFs, etc.)
// =====================================================

/**
 * Supported file upload fields for property and land
 */
export type PropertyFileField =
  | "field_gallery_" // Main property images (MANDATORY)
  | "field_floor_plan" // Floor plan images
  | "field_pdf_floor_plan" // Floor plan PDF
  | "field_epc"; // Energy Performance Certificate PDF

export type LandFileField =
  | "field_land_gallery" // Main land images (MANDATORY)
  | "field_marketing_agreement" // Marketing agreement PDF
  | "field_title_deed_file" // Title deed scan PDF
  | "field_other_document"; // Other documents PDF

/**
 * Upload files to a specific field on a Zyprus listing
 *
 * @param fileUrls - Array of URLs to fetch and upload
 * @param nodeBundle - "property" or "land"
 * @param fieldName - The Drupal field name to upload to
 * @returns Array of uploaded file UUIDs
 */
export async function uploadFilesToZyprus(
  fileUrls: string[],
  nodeBundle: "property" | "land",
  fieldName: PropertyFileField | LandFileField
): Promise<string[]> {
  const apiUrl = process.env.ZYPRUS_API_URL || "https://dev9.zyprus.com";
  const token = await getAccessToken();
  const endpoint = `${apiUrl}/jsonapi/node/${nodeBundle}/${fieldName}`;

  log.info("Starting file upload to Zyprus", {
    count: fileUrls.length,
    fieldName,
  });

  const uploadPromises = fileUrls.map(async (url, i) => {
    try {
      // Fetch file from URL
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status}`);
      }

      const blob = await response.blob();
      const contentType =
        response.headers.get("content-type") || "application/octet-stream";

      // Extract filename from URL or generate one
      const urlPath = new URL(url).pathname;
      const ext = urlPath.split(".").pop() || getExtensionFromMime(contentType);
      const filename = urlPath.split("/").pop() || `file-${i + 1}.${ext}`;

      // Upload to Zyprus
      const uploadResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "SophiaAI",
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `file; filename="${filename}"`,
        },
        body: blob,
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(
          `Upload failed: ${uploadResponse.status} - ${errorText}`
        );
      }

      const data = await uploadResponse.json();
      log.debug("Successfully uploaded file", {
        index: i + 1,
        id: data.data.id,
      });
      return data.data.id as string;
    } catch (error) {
      log.error("Error uploading file", error, { index: i + 1, url });
      throw error;
    }
  });

  const results = await Promise.allSettled(uploadPromises);
  const fileIds: string[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      fileIds.push(result.value);
    } else {
      log.error("File upload failed", result.reason);
    }
  }

  log.info("File upload complete", {
    successful: fileIds.length,
    total: fileUrls.length,
  });
  return fileIds;
}

/**
 * Get file extension from MIME type
 */
function getExtensionFromMime(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "application/octet-stream": "bin",
  };
  return mimeMap[mimeType] || "bin";
}

/**
 * Upload floor plan images to a property
 */
export function uploadFloorPlanImages(
  _propertyId: string,
  floorPlanUrls: string[]
): Promise<string[]> {
  return uploadFilesToZyprus(floorPlanUrls, "property", "field_floor_plan");
}

/**
 * Upload floor plan PDF to a property
 */
export async function uploadFloorPlanPdf(
  _propertyId: string,
  pdfUrl: string
): Promise<string | null> {
  const ids = await uploadFilesToZyprus(
    [pdfUrl],
    "property",
    "field_pdf_floor_plan"
  );
  return ids[0] || null;
}

/**
 * Upload Energy Performance Certificate (EPC) PDF to a property
 */
export async function uploadEpcPdf(
  _propertyId: string,
  pdfUrl: string
): Promise<string | null> {
  const ids = await uploadFilesToZyprus([pdfUrl], "property", "field_epc");
  return ids[0] || null;
}

// =====================================================
// Duplicate Detection and Listing Retrieval
// =====================================================

/**
 * Duplicate check result
 */
export type DuplicateCheckResult = {
  exists: boolean;
  matches: Array<{
    id: string;
    title: string;
    url: string;
    price?: string;
    referenceId?: string;
  }>;
};

/**
 * Check for duplicate listings in Zyprus API
 *
 * Searches by reference ID, location + price combination, or title similarity
 * Returns matching listings to help prevent duplicates
 */
export async function checkForDuplicates(
  type: "property" | "land",
  criteria: {
    referenceId?: string;
    locationId?: string;
    price?: number;
    title?: string;
  }
): Promise<DuplicateCheckResult> {
  const apiUrl = process.env.ZYPRUS_API_URL || "https://dev9.zyprus.com";
  const siteUrl = process.env.ZYPRUS_SITE_URL || "https://dev9.zyprus.com";
  const token = await getAccessToken();

  const endpoint =
    type === "property" ? "/jsonapi/node/property" : "/jsonapi/node/land";

  // Build filter query - prioritize reference ID as exact match
  const filters: string[] = [];

  if (criteria.referenceId) {
    filters.push(
      `filter[field_own_reference_id]=${encodeURIComponent(criteria.referenceId)}`
    );
  }

  if (criteria.locationId) {
    filters.push(`filter[field_location.id]=${criteria.locationId}`);
  }

  // Only add price filter if we have location (more specific match)
  if (criteria.price && criteria.locationId) {
    // Search within 10% price range
    const minPrice = Math.floor(criteria.price * 0.9);
    const maxPrice = Math.ceil(criteria.price * 1.1);
    filters.push("filter[field_price][condition][path]=field_price");
    filters.push("filter[field_price][condition][operator]=BETWEEN");
    filters.push(`filter[field_price][condition][value][0]=${minPrice}`);
    filters.push(`filter[field_price][condition][value][1]=${maxPrice}`);
  }

  // Add page size limit
  filters.push("page[limit]=10");

  try {
    const url = `${apiUrl}${endpoint}?${filters.join("&")}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "SophiaAI",
      },
    });

    if (!response.ok) {
      log.error("Duplicate check failed", undefined, {
        status: response.status,
      });
      return { exists: false, matches: [] };
    }

    const data: JsonApiDocument = await response.json();
    const items = Array.isArray(data.data)
      ? data.data
      : data.data
        ? [data.data]
        : [];

    // Filter further by title similarity if provided
    let matches = items;
    if (criteria.title && matches.length > 0) {
      const searchTitle = criteria.title.toLowerCase();
      matches = items.filter((item: any) => {
        const itemTitle = (item.attributes?.title || "").toLowerCase();
        // Check for significant overlap
        return (
          itemTitle.includes(searchTitle.slice(0, 20)) ||
          searchTitle.includes(itemTitle.slice(0, 20))
        );
      });
    }

    return {
      exists: matches.length > 0,
      matches: matches.map((item: any) => ({
        id: item.id,
        title: item.attributes?.title || "Untitled",
        url: `${siteUrl}/${type}/${item.id}`,
        price: item.attributes?.field_price,
        referenceId: item.attributes?.field_own_reference_id,
      })),
    };
  } catch (error) {
    log.error("Duplicate check error", error);
    return { exists: false, matches: [] };
  }
}

/**
 * Retrieved listing from Zyprus API
 */
export type ZyprusRetrievedListing = {
  id: string;
  type: "property" | "land";
  title: string;
  description?: string;
  price?: string;
  status: boolean;
  aiState?: string;
  aiGenerated?: boolean;
  referenceId?: string;
  createdAt?: string;
  updatedAt?: string;
  // Additional fields from API
  attributes: Record<string, any>;
  relationships?: Record<string, any>;
};

/**
 * Get a listing from Zyprus API by ID
 *
 * @param type - "property" or "land"
 * @param id - The listing UUID
 * @returns The listing data or null if not found
 */
export async function getListingFromZyprus(
  type: "property" | "land",
  id: string
): Promise<ZyprusRetrievedListing | null> {
  const apiUrl = process.env.ZYPRUS_API_URL || "https://dev9.zyprus.com";
  const token = await getAccessToken();

  const endpoint =
    type === "property"
      ? `/jsonapi/node/property/${id}`
      : `/jsonapi/node/land/${id}`;

  try {
    const response = await fetch(`${apiUrl}${endpoint}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "SophiaAI",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new ZyprusAPIError({
        message: `Failed to fetch listing: ${response.status}`,
        code: "API_ERROR",
        statusCode: response.status,
      });
    }

    const data: JsonApiDocument = await response.json();
    const item = data.data as JsonApiResource;

    return {
      id: item.id || id,
      type,
      title: item.attributes?.title || "Untitled",
      description: item.attributes?.body?.value,
      price: item.attributes?.field_price,
      status: item.attributes?.status || false,
      aiState: item.attributes?.field_ai_state,
      aiGenerated: item.attributes?.field_ai_generated,
      referenceId: item.attributes?.field_own_reference_id,
      createdAt: item.attributes?.created,
      updatedAt: item.attributes?.changed,
      attributes: item.attributes || {},
      relationships: item.relationships,
    };
  } catch (error) {
    if (error instanceof ZyprusAPIError) {
      throw error;
    }
    log.error("Failed to fetch listing from Zyprus", error, { type, id });
    return null;
  }
}

/**
 * Search listings in Zyprus API
 *
 * @param type - "property" or "land"
 * @param filters - Search filters
 * @returns Array of matching listings
 */
export async function searchZyprusListings(
  type: "property" | "land",
  filters: {
    aiState?: "draft" | "published" | "archived";
    aiGenerated?: boolean;
    locationId?: string;
    minPrice?: number;
    maxPrice?: number;
    limit?: number;
  } = {}
): Promise<ZyprusRetrievedListing[]> {
  const apiUrl = process.env.ZYPRUS_API_URL || "https://dev9.zyprus.com";
  const token = await getAccessToken();

  const endpoint =
    type === "property" ? "/jsonapi/node/property" : "/jsonapi/node/land";

  // Build filter query
  const queryParams: string[] = [];

  if (filters.aiState) {
    queryParams.push(`filter[field_ai_state]=${filters.aiState}`);
  }

  if (filters.aiGenerated !== undefined) {
    queryParams.push(`filter[field_ai_generated]=${filters.aiGenerated}`);
  }

  if (filters.locationId) {
    queryParams.push(`filter[field_location.id]=${filters.locationId}`);
  }

  if (filters.minPrice !== undefined) {
    queryParams.push("filter[field_price][condition][path]=field_price");
    queryParams.push("filter[field_price][condition][operator]=>=");
    queryParams.push(
      `filter[field_price][condition][value]=${filters.minPrice}`
    );
  }

  if (filters.maxPrice !== undefined) {
    queryParams.push("filter[max_price][condition][path]=field_price");
    queryParams.push("filter[max_price][condition][operator]=<=");
    queryParams.push(`filter[max_price][condition][value]=${filters.maxPrice}`);
  }

  queryParams.push(`page[limit]=${filters.limit || 20}`);

  try {
    const url = `${apiUrl}${endpoint}${queryParams.length > 0 ? `?${queryParams.join("&")}` : ""}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "SophiaAI",
      },
    });

    if (!response.ok) {
      throw new ZyprusAPIError({
        message: `Failed to search listings: ${response.status}`,
        code: "API_ERROR",
        statusCode: response.status,
      });
    }

    const data: JsonApiDocument = await response.json();
    const items = Array.isArray(data.data)
      ? data.data
      : data.data
        ? [data.data]
        : [];

    return items.map((item: any) => ({
      id: item.id,
      type,
      title: item.attributes?.title || "Untitled",
      description: item.attributes?.body?.value,
      price: item.attributes?.field_price,
      status: item.attributes?.status || false,
      aiState: item.attributes?.field_ai_state,
      aiGenerated: item.attributes?.field_ai_generated,
      referenceId: item.attributes?.field_own_reference_id,
      createdAt: item.attributes?.created,
      updatedAt: item.attributes?.changed,
      attributes: item.attributes || {},
      relationships: item.relationships,
    }));
  } catch (error) {
    if (error instanceof ZyprusAPIError) {
      throw error;
    }
    log.error("Failed to search Zyprus listings", error, { type, filters });
    return [];
  }
}

/**
 * Check if error is permanent (should not retry)
 */
export function isPermanentError(error: ZyprusAPIError): boolean {
  const permanentCodes = [
    "AUTH_FAILED",
    "INVALID_DATA",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFIG_ERROR",
    "OAUTH_ERROR",
  ];
  return permanentCodes.includes(error.code);
}

/**
 * Export circuit breakers for monitoring/admin
 */
export const zyprusCircuitBreakers = {
  oauth: oauthBreaker,
  upload: uploadBreaker,
  landUpload: landUploadBreaker,
};
