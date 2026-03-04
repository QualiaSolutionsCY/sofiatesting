/**
 * Zyprus Property API
 * Handles property listing creation, image uploads, and search
 */

import { logClassifiedError } from "../utils/error-mapper.ts";
import { LogCategory, logger } from "../utils/logger.ts";
import { withRetry } from "../utils/retry.ts";
import { validateImageUrl } from "../utils/url-validator.ts";
import {
  findIndoorFeatureUuids,
  findListingTypeUuid,
  findOutdoorFeatureUuids,
  findPriceModifierUuid,
  findPropertyTypeUuid,
  findPropertyViewUuids,
  findTitleDeedUuid,
  findUserUuid,
  findUserUuids,
} from "./taxonomy-cache.ts";
import { getAccessToken, getZyprusConfig, type ZyprusConfig } from "./oauth.ts";

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
  coveredVeranda?: number; // Covered veranda sqm
  uncoveredVeranda?: number; // Uncovered veranda sqm
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
  priceNegotiable?: boolean; // Default true (negotiable)
  isNewBuild?: boolean; // New build property
  parkingType?: "covered" | "open" | "garage" | "carport" | "none";
  priceModifier?: "no_vat" | "plus_vat" | "vat_included";
  floorPlanUrls?: string[]; // Floor plan images (uploaded to field_floor_plan)
  titleDeedFileUrls?: string[]; // Title deed documents (uploaded to field_title_deed_file)
  energyClass?: string; // Energy rating (A, B, C, D) - goes to field_energy_class
  // For Own Reference ID format: Owner - {Agent} - {Seller} - {Phone} - {Email}
  agentName?: string;
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  registrationNumber?: string;
  buildingName?: string; // Name of building/complex for Reference ID
}

export interface CreateResult {
  listingId: string;
  listingUrl: string;
  titleDeedAttached?: boolean;
}

/**
 * Add privacy offset to coordinates (at least 1km away)
 * Per spec: NEVER place pin at exact property address
 * Pin should land on a general area like a roundabout or supermarket nearby
 */
function addPrivacyOffset(coords: { lat: number; lon: number }): {
  lat: number;
  lon: number;
} {
  // ~0.008 degrees ≈ 900m offset — pin should NOT be near the actual property
  // Must be far enough that the property location is NOT identifiable
  const minOffset = 0.007;
  const range = 0.005;

  // Cyprus center of mass (Troodos area) — always offset TOWARD this point
  const CYPRUS_CENTER = { lat: 35.0, lon: 33.0 };

  // Calculate direction toward inland center
  const dirLat = CYPRUS_CENTER.lat - coords.lat; // positive = north (inland for south coast)
  const dirLon = CYPRUS_CENTER.lon - coords.lon;
  const dirMag = Math.hypot(dirLat, dirLon);

  if (dirMag === 0) {
    // Already at center (unlikely), small random offset
    return {
      lat: coords.lat + (minOffset + Math.random() * range),
      lon:
        coords.lon +
        (Math.random() > 0.5 ? 1 : -1) * (minOffset + Math.random() * range),
    };
  }

  // Normalize direction toward center
  const normLat = dirLat / dirMag;
  const normLon = dirLon / dirMag;

  // Offset magnitude with some randomness
  const offsetMag = minOffset + Math.random() * range;

  // Add perpendicular jitter so pins aren't all on the same line toward center
  const jitterAngle = (Math.random() - 0.5) * Math.PI * 0.6; // ±54 degrees jitter
  const cosJ = Math.cos(jitterAngle);
  const sinJ = Math.sin(jitterAngle);
  const jitteredLat = normLat * cosJ - normLon * sinJ;
  const jitteredLon = normLat * sinJ + normLon * cosJ;

  return {
    lat: coords.lat + jitteredLat * offsetMag,
    lon: coords.lon + jitteredLon * offsetMag,
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
  registrationNumber?: string,
  buildingName?: string
): string {
  const parts: string[] = ["Owner"];

  if (agentName) {
    parts.push(agentName);
  }

  // Building/complex name (e.g., "Flow Residence") for quick identification
  if (buildingName) {
    parts.push(buildingName);
  }

  if (ownerName) {
    parts.push(ownerName);
  }

  if (ownerPhone) {
    // Clean phone number - remove spaces, +357, etc.
    const cleanPhone = ownerPhone.replace(/[\s\-+]/g, "").replace(/^357/, "");
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
  viewUuids: string[],
  floorPlanFileIds: string[] = []
): Record<string, unknown> {
  // Generate Own Reference ID for quick reviewer reference
  // Format: Owner - {Agent Name} - {Seller Name} - {Seller Phone} - {Email}
  const ownReferenceId = generateOwnReferenceId(
    listing.agentName,
    listing.ownerName,
    listing.ownerPhone,
    listing.ownerEmail,
    listing.registrationNumber,
    listing.buildingName
  );

  // Build proper title: "2 Bedroom Bungalow (125m²) For Sale in Kamares, Tala"
  // If there's a covered veranda, include total area (Net Indoor Area + Covered Veranda only)
  const bedroomText =
    listing.bedrooms === 1 ? "1 Bedroom" : `${listing.bedrooms} Bedroom`;
  const listingTypeText =
    listing.listingType === "rent" ? "For Rent" : "For Sale";
  const propertyTypeCapitalized =
    listing.propertyType.charAt(0).toUpperCase() +
    listing.propertyType.slice(1).toLowerCase();

  // Calculate title area text: Show covered area + covered veranda separately (not summed)
  const hasCoveredVeranda =
    listing.coveredVeranda && listing.coveredVeranda > 0;
  let titleAreaText = "";
  if (hasCoveredVeranda) {
    titleAreaText = ` (${listing.coveredArea}m² + ${listing.coveredVeranda}m² covered veranda)`;
    logger.info(
      `Title area calculation: ${listing.coveredArea}m² + ${listing.coveredVeranda}m² covered veranda`,
      {
        category: LogCategory.ZYPRUS,
        operation: "createDraftListing",
      }
    );
  } else {
    titleAreaText = ` (${listing.coveredArea}m²)`;
    logger.info(
      `Title area calculation: ${listing.coveredArea}m² (no covered veranda)`,
      {
        category: LogCategory.ZYPRUS,
        operation: "createDraftListing",
      }
    );
  }

  const generatedTitle = `${bedroomText} ${propertyTypeCapitalized}${titleAreaText} ${listingTypeText} in ${listing.location}`;
  logger.info(`Generated title: ${generatedTitle}`, {
    category: LogCategory.ZYPRUS,
    operation: "createDraftListing",
  });

  const attributes: Record<string, unknown> = {
    title: generatedTitle,
    status: false, // Always unpublished draft
    field_price: listing.price,
    field_no_bedrooms: listing.bedrooms,
    ...(listing.bathrooms > 0 ? { field_no_bathrooms: listing.bathrooms } : {}),
    // NOTE: field_no_kitchens and field_no_living_rooms intentionally NOT set
    // Zyprus auto-generates titles from room counts — only bedrooms/bathrooms are standard
    field_covered_area: listing.coveredArea,
    body: {
      value: listing.description,
      format: "plain_text",
    },
    // NOTE: field_my_notes was removed - location URL now goes to field_property_notes instead
    // NOTE: field_ai_assistant_notes does NOT exist on live API (verified Feb 2026)
    // aiNotes content is merged into field_ai_message instead
    field_ai_generated: true,
    field_ai_state: "draft",
    // Price negotiable: default TRUE unless explicitly set to false
    // NOTE: Drupal list fields may expect integer (1/0) instead of boolean (true/false)
    // NOTE: field_negotiable does NOT exist in Zyprus API (not in Postman spec)
    // "Negotiable" display is controlled by field_price_modifier taxonomy term
    // Own Reference ID: Owner - {Agent} - {Seller} - {Phone} - Reg No.{Reg}
    field_own_reference_id: ownReferenceId,
    field_ai_draft_own_reference_id: ownReferenceId,
  };

  // field_property_notes: Location URL goes here (for agent/reviewer reference)
  // This is the "Property Notes / My notes" field on the edit form
  if (listing.myNotes) {
    attributes.field_property_notes = listing.myNotes;
  }

  // Optional fields
  if (listing.plotSize) {
    attributes.field_land_size = listing.plotSize; // API field is field_land_size, not field_plot_size
  }
  if (listing.coveredVeranda) {
    attributes.field_no_covered_verandas = listing.coveredVeranda;
  }
  if (listing.uncoveredVeranda) {
    attributes.field_no_uncovered_verandas = listing.uncoveredVeranda;
  }
  if (listing.yearBuilt) {
    attributes.field_year_built = listing.yearBuilt;
  }
  if (listing.floor) {
    attributes.field_floor = listing.floor;
  }
  if (listing.potentialDuplicate) {
    attributes.field_ai_probably_exists = true;
  }
  // Merge aiNotes and aiMessage into field_ai_message
  // NOTE: myNotes is NOT included here - it goes to field_property_notes instead
  const aiMessageParts = [listing.aiMessage, listing.aiNotes].filter(Boolean);
  if (aiMessageParts.length > 0) {
    attributes.field_ai_message = aiMessageParts.join("\n\n");
  }
  // New build flag — ONLY set when VAT applies (+VAT)
  // For No VAT new builds (resale), don't set this flag because
  // Zyprus shows "New Build +VAT" badge which implies buyer pays VAT
  if (listing.isNewBuild && listing.priceModifier !== "no_vat") {
    attributes.field_new_build = true;
  }

  // Energy class (A, B, C, D) — dedicated field, NOT in description
  if (listing.energyClass) {
    attributes.field_energy_class = listing.energyClass;
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

  // Location (NOTE: Zyprus uses node--location, NOT taxonomy_term)
  // MANDATORY: API requires field_location to be non-null (422 error if missing)
  // Since Zyprus only has Nicosia locations, non-Nicosia properties will get Nicosia location
  // The AI message will warn about this mismatch for manual correction
  if (listing.locationUuid) {
    relationships.field_location = {
      data: { type: "node--location", id: listing.locationUuid },
    };
  }

  // Images (NOTE: Zyprus uses field_gallery_ with trailing underscore)
  if (imageFileIds.length > 0) {
    relationships.field_gallery_ = {
      data: imageFileIds.map((id) => ({
        type: "file--file",
        id,
      })),
    };
  }

  // Floor plan images (separate from gallery)
  if (floorPlanFileIds.length > 0) {
    relationships.field_floor_plan = {
      data: floorPlanFileIds.map((id) => ({
        type: "file--file",
        id,
      })),
    };
  }

  // NOTE: field_title_deed_file is NOT included in the initial POST payload.
  // The service account does not have permission to POST this field (403).
  // Title deed files are attached via PATCH after listing creation instead.

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

  // Listing owner/author - set via uid to override the OAuth service account
  // NOTE: field_listing_owner does NOT exist on live API (verified Feb 2026)
  // The CMS "Listing Owner" is determined by the uid (author) relationship
  relationships.uid = {
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
export async function uploadSingleImage(
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

    // P1 SECURITY: Maximum image size (10MB) to prevent DoS
    const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

    // Download image
    const imageResponse = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
    });
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

    // P1 SECURITY: Check Content-Length header before downloading full content
    const contentLength = imageResponse.headers.get("content-length");
    if (contentLength) {
      const sizeBytes = Number.parseInt(contentLength, 10);
      if (sizeBytes > MAX_IMAGE_SIZE_BYTES) {
        logger.warn("Image exceeds maximum size limit - rejecting", {
          category: LogCategory.ZYPRUS,
          operation: "uploadSingleImage",
          imageIndex: index,
          sizeBytes,
          maxSizeBytes: MAX_IMAGE_SIZE_BYTES,
          urlPreview: url.substring(0, 100),
        });
        return null;
      }
    }

    const imageBlob = await imageResponse.blob();

    // P1 SECURITY: Double-check actual blob size (Content-Length may be absent or incorrect)
    if (imageBlob.size > MAX_IMAGE_SIZE_BYTES) {
      logger.warn("Image blob exceeds maximum size limit - rejecting", {
        category: LogCategory.ZYPRUS,
        operation: "uploadSingleImage",
        imageIndex: index,
        actualSize: imageBlob.size,
        maxSizeBytes: MAX_IMAGE_SIZE_BYTES,
        urlPreview: url.substring(0, 100),
      });
      return null;
    }

    const imageBuffer = await imageBlob.arrayBuffer();

    // Get filename from URL
    const urlParts = url.split("/");
    let filename = urlParts[urlParts.length - 1].split("?")[0];
    if (!filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      filename = `property_image_${index + 1}.jpg`;
    }

    // Upload to Zyprus (NOTE: field_gallery_ with trailing underscore)
    const uploadResponse = await withRetry(
      async () => {
        const res = await fetch(
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
            signal: AbortSignal.timeout(30_000),
          }
        );

        if (!res.ok && res.status >= 500) {
          throw new Error(`Image upload failed: ${res.status}`);
        }
        return res;
      },
      { maxRetries: 2, baseDelayMs: 500 },
      "uploadSingleImage"
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
    logClassifiedError("Image upload error", err, {
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
 * Upload floor plan images to Zyprus (uses field_floor_plan endpoint)
 */
async function uploadFloorPlans(
  floorPlanUrls: string[],
  token: string,
  config: ZyprusConfig
): Promise<string[]> {
  logger.info("Uploading floor plans to Zyprus", {
    category: LogCategory.ZYPRUS,
    operation: "uploadFloorPlans",
    count: floorPlanUrls.length,
  });

  const results = await Promise.all(
    floorPlanUrls.map(async (url, index) => {
      try {
        // Download the floor plan image
        const imageResponse = await fetch(url, {
          signal: AbortSignal.timeout(30_000),
        });
        if (!imageResponse.ok) {
          logger.warn("Failed to download floor plan", {
            category: LogCategory.ZYPRUS,
            operation: "uploadFloorPlan",
            imageIndex: index,
            status: imageResponse.status,
          });
          return null;
        }

        const imageBlob = await imageResponse.blob();
        const imageBuffer = await imageBlob.arrayBuffer();
        let filename =
          url.split("/").pop()?.split("?")[0] || `floor_plan_${index + 1}.jpg`;
        if (!filename.match(/\.(jpg|jpeg|png|gif|webp|pdf)$/i)) {
          filename = `floor_plan_${index + 1}.jpg`;
        }

        const response = await withRetry(
          async () => {
            const res = await fetch(
              `${config.apiUrl}/jsonapi/node/property/field_floor_plan`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/octet-stream",
                  "Content-Disposition": `file; filename="${filename}"`,
                  "User-Agent": "SophiaAI",
                },
                body: imageBuffer,
                signal: AbortSignal.timeout(30_000),
              }
            );
            if (!res.ok && res.status >= 500) {
              throw new Error(`Floor plan upload failed: ${res.status}`);
            }
            return res;
          },
          { maxRetries: 2, baseDelayMs: 500 },
          "uploadFloorPlan"
        );

        if (!response.ok) {
          const errorBody = await response.text().catch(() => "");
          logger.error("Floor plan upload failed", undefined, {
            category: LogCategory.ZYPRUS,
            operation: "uploadFloorPlan",
            imageIndex: index,
            status: response.status,
            statusText: response.statusText,
            errorBody: errorBody.substring(0, 500),
            url: url.substring(0, 100),
          });
          // If field_floor_plan endpoint fails, try uploading via field_gallery_ as fallback
          // The file ID can still be referenced in field_floor_plan relationship
          const fallbackRes = await fetch(
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
              signal: AbortSignal.timeout(30_000),
            }
          );
          if (fallbackRes.ok) {
            const fallbackResult = await fallbackRes.json();
            logger.info("Floor plan uploaded via gallery fallback", {
              category: LogCategory.ZYPRUS,
              operation: "uploadFloorPlan",
              imageIndex: index,
              fileId: fallbackResult.data?.id,
            });
            return fallbackResult.data?.id || null;
          }
          return null;
        }

        const result = await response.json();
        return result.data?.id || null;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error("Floor plan upload error", err, {
          category: LogCategory.ZYPRUS,
          operation: "uploadFloorPlan",
          imageIndex: index,
        });
        return null;
      }
    })
  );

  return results.filter((id): id is string => id !== null);
}

/**
 * Upload title deed files to Zyprus (uses field_title_deed_file endpoint)
 * Falls back gracefully if the field doesn't exist on property nodes
 */
async function uploadTitleDeedFiles(
  fileUrls: string[],
  token: string,
  config: ZyprusConfig
): Promise<string[]> {
  logger.info("Uploading title deed files to Zyprus", {
    category: LogCategory.ZYPRUS,
    operation: "uploadTitleDeedFiles",
    count: fileUrls.length,
  });

  const results = await Promise.all(
    fileUrls.map(async (url, index) => {
      try {
        const fileResponse = await fetch(url, {
          signal: AbortSignal.timeout(30_000),
        });
        if (!fileResponse.ok) {
          logger.warn("Failed to download title deed file", {
            category: LogCategory.ZYPRUS,
            operation: "uploadTitleDeedFile",
            imageIndex: index,
            status: fileResponse.status,
          });
          return null;
        }

        const fileBlob = await fileResponse.blob();
        const fileBuffer = await fileBlob.arrayBuffer();
        // Detect actual file type from Content-Type header or blob type
        const contentType =
          fileResponse.headers.get("content-type") || fileBlob.type || "";
        const extFromMime: Record<string, string> = {
          "image/jpeg": ".jpg",
          "image/png": ".png",
          "image/gif": ".gif",
          "image/webp": ".webp",
          "application/pdf": ".pdf",
          "application/msword": ".doc",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            ".docx",
        };
        const detectedExt =
          extFromMime[contentType.split(";")[0].trim().toLowerCase()];
        let filename =
          url.split("/").pop()?.split("?")[0] || `title_deed_${index + 1}`;
        if (!filename.match(/\.(jpg|jpeg|png|gif|webp|pdf|doc|docx)$/i)) {
          // Use detected extension from content-type, default to .jpg for images
          filename = `title_deed_${index + 1}${detectedExt || ".jpg"}`;
        }
        logger.info("Title deed file type detected", {
          category: LogCategory.ZYPRUS,
          operation: "uploadTitleDeedFile",
          imageIndex: index,
          contentType,
          filename,
        });

        const response = await withRetry(
          async () => {
            const res = await fetch(
              `${config.apiUrl}/jsonapi/node/property/field_title_deed_file`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/octet-stream",
                  "Content-Disposition": `file; filename="${filename}"`,
                  "User-Agent": "SophiaAI",
                },
                body: fileBuffer,
                signal: AbortSignal.timeout(30_000),
              }
            );
            if (!res.ok && res.status >= 500) {
              throw new Error(`Title deed upload failed: ${res.status}`);
            }
            return res;
          },
          { maxRetries: 2, baseDelayMs: 500 },
          "uploadTitleDeedFile"
        );

        if (!response.ok) {
          let errorBody = "";
          try {
            errorBody = await response.text();
          } catch {
            /* ignore */
          }
          logger.warn("Title deed upload to Zyprus failed", {
            category: LogCategory.ZYPRUS,
            operation: "uploadTitleDeedFile",
            status: response.status,
            filename,
            contentType,
            errorBody: errorBody.substring(0, 500),
          });
          return null;
        }

        const result = await response.json();
        return result.data?.id || null;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error("Title deed upload error", err, {
          category: LogCategory.ZYPRUS,
          operation: "uploadTitleDeedFile",
          imageIndex: index,
        });
        return null;
      }
    })
  );

  return results.filter((id): id is string => id !== null);
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

  // Log incoming values for debugging
  logger.info("Listing assignment values (incoming)", {
    category: LogCategory.ZYPRUS,
    operation: "createDraftListing",
    listingOwner: listing.listingOwner,
    listingInstructor: listing.listingInstructor,
    reviewer1: listing.reviewer1,
    reviewer2: listing.reviewer2,
    match: listing.listingOwner === listing.listingInstructor,
  });

  // Collect all reviewer emails for UUID resolution
  const reviewerEmails: string[] = [];
  if (listing.reviewer1) reviewerEmails.push(listing.reviewer1);
  if (listing.reviewer2) reviewerEmails.push(listing.reviewer2);

  // Resolve all taxonomy UUIDs, user UUIDs, and feature UUIDs in parallel
  // CRITICAL: listingOwner and listingInstructor should be the SAME person (same UUID)
  // We resolve listingOwner first, then use that UUID for both fields
  const [
    listingTypeUuid,
    propertyTypeUuid,
    priceModifierUuid,
    titleDeedUuid,
    listingOwnerUuid,
    reviewerUuids,
    indoorFeatureUuids,
    outdoorFeatureUuids,
    viewUuids,
  ] = await Promise.all([
    findListingTypeUuid(listing.listingType),
    findPropertyTypeUuid(listing.propertyType),
    findPriceModifierUuid(listing.priceModifier, listing.priceNegotiable), // Default "Negotiable" unless explicitly non-negotiable
    findTitleDeedUuid(listing.titleDeedStatus), // Maps status to Zyprus taxonomy (permits_only → "not available")
    findUserUuid(listing.listingOwner), // CRITICAL: Resolve listing owner email to UUID
    findUserUuids(reviewerEmails), // Resolve reviewer emails to UUIDs
    findIndoorFeatureUuids(listing.features || [], listing.bathrooms), // Resolve indoor features (auto-adds guest toilet + master bed if bathrooms >= 2)
    findOutdoorFeatureUuids(listing.features || []), // Resolve outdoor features
    findPropertyViewUuids(listing.features || []), // Resolve property views (sea view, etc.)
  ]);

  // Note: All taxonomy/user functions now have hardcoded fallbacks, so they cannot fail

  // CRITICAL: listingInstructor MUST be the same UUID as listingOwner
  const instructorUuid = listingOwnerUuid;

  logger.info("Resolved Zyprus UUIDs for listing", {
    category: LogCategory.ZYPRUS,
    operation: "createDraftListing",
    listingTypeUuid,
    propertyTypeUuid,
    priceModifierUuid,
    titleDeedUuid,
    instructorUuid,
    listingOwnerUuid,
    reviewerCount: reviewerUuids.length,
    indoorFeatureCount: indoorFeatureUuids.length,
    outdoorFeatureCount: outdoorFeatureUuids.length,
    viewCount: viewUuids.length,
  });

  // Upload all file types in parallel (gallery, floor plans, title deeds)
  const [imageFileIds, floorPlanFileIds, titleDeedFileIds] = await Promise.all([
    uploadImages(listing.images, token, config),
    listing.floorPlanUrls && listing.floorPlanUrls.length > 0
      ? uploadFloorPlans(listing.floorPlanUrls, token, config)
      : Promise.resolve([] as string[]),
    listing.titleDeedFileUrls && listing.titleDeedFileUrls.length > 0
      ? uploadTitleDeedFiles(listing.titleDeedFileUrls, token, config)
      : Promise.resolve([] as string[]),
  ]);

  logger.info("All files uploaded for listing", {
    category: LogCategory.ZYPRUS,
    operation: "createDraftListing",
    galleryUploaded: imageFileIds.length,
    galleryTotal: listing.images.length,
    floorPlansUploaded: floorPlanFileIds.length,
    titleDeedsUploaded: titleDeedFileIds.length,
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
    viewUuids,
    floorPlanFileIds
  );

  const response = await withRetry(
    async () => {
      const res = await fetch(`${config.apiUrl}/jsonapi/node/property`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/vnd.api+json",
          Accept: "application/vnd.api+json",
          "User-Agent": "SophiaAI",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      });

      // Only retry on server errors, not client errors (4xx)
      if (!res.ok && res.status >= 500) {
        throw new Error(`Listing creation failed: ${res.status}`);
      }
      return res;
    },
    { maxRetries: 2, baseDelayMs: 1000 },
    "createDraftListing"
  );

  if (!response.ok) {
    const errorText = await response.text();
    // Include error details in the exception for debugging
    let errorDetail = "";
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.errors) {
        errorDetail = errorJson.errors
          .map((e: { detail?: string; title?: string }) =>
            e.detail || e.title || JSON.stringify(e)
          )
          .join("; ");
      }
    } catch {
      errorDetail = errorText.substring(0, 200);
    }
    // Log full error details internally for debugging
    logClassifiedError(
      "Failed to create Zyprus listing",
      new Error(
        `API error: ${response.status} - ${errorDetail || "Unknown error"}`
      ),
      {
        category: LogCategory.ZYPRUS,
        operation: "createDraftListing",
        status: response.status,
        errorDetail,
      }
    );
    // Include status and error detail in thrown error so executor can log the root cause
    throw new Error(
      `Zyprus API ${response.status}: ${errorDetail || "Unknown error"}`
    );
  }

  const result = await response.json();
  const listingId = result.data.id;

  logger.info("Zyprus listing created successfully", {
    category: LogCategory.ZYPRUS,
    operation: "createDraftListing",
    listingId,
  });

  // Attach title deed files via PATCH (cannot be included in initial POST due to 403)
  // BUG FIX: Added retry logic — title deeds were silently failing to attach
  let titleDeedAttached = false;
  if (titleDeedFileIds.length > 0) {
    const patchPayload = {
      data: {
        type: "node--property",
        id: listingId,
        relationships: {
          field_title_deed_file: {
            data: titleDeedFileIds.map((id) => ({
              type: "file--file",
              id,
            })),
          },
        },
      },
    };

    // Retry up to 3 times with increasing delay
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const patchRes = await fetch(
          `${config.apiUrl}/jsonapi/node/property/${listingId}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/vnd.api+json",
              Accept: "application/vnd.api+json",
              "User-Agent": "SophiaAI",
            },
            body: JSON.stringify(patchPayload),
            signal: AbortSignal.timeout(30_000),
          }
        );
        if (patchRes.ok) {
          titleDeedAttached = true;
          logger.info("Title deed files attached to listing via PATCH", {
            category: LogCategory.ZYPRUS,
            operation: "patchTitleDeedFiles",
            listingId,
            fileCount: titleDeedFileIds.length,
            attempt,
          });
          break;
        } else {
          let patchErrorBody = "";
          try {
            patchErrorBody = await patchRes.text();
          } catch {
            /* ignore */
          }
          logger.error(
            `Title deed PATCH failed (attempt ${attempt}/3)`,
            undefined,
            {
              category: LogCategory.ZYPRUS,
              operation: "patchTitleDeedFiles",
              listingId,
              status: patchRes.status,
              errorBody: patchErrorBody.substring(0, 500),
              attempt,
            }
          );
          // Only retry on 5xx errors
          if (patchRes.status < 500 && attempt < 3) {
            // 4xx error — likely permissions. Try without delay.
            continue;
          }
        }
      } catch (patchError) {
        logger.error(
          `Title deed PATCH exception (attempt ${attempt}/3)`,
          patchError instanceof Error
            ? patchError
            : new Error(String(patchError)),
          {
            category: LogCategory.ZYPRUS,
            operation: "patchTitleDeedFiles",
            listingId,
            attempt,
          }
        );
      }
      // Wait before retry (500ms, 1s, 2s)
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }

    if (!titleDeedAttached) {
      logger.error(
        "CRITICAL: Title deed files could NOT be attached after 3 attempts",
        undefined,
        {
          category: LogCategory.ZYPRUS,
          operation: "patchTitleDeedFiles",
          listingId,
          fileCount: titleDeedFileIds.length,
        }
      );
    }
  }

  return {
    listingId,
    listingUrl: `${config.siteUrl}/property/${listingId}`,
    titleDeedAttached: titleDeedFileIds.length > 0 ? titleDeedAttached : undefined,
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
    signal: AbortSignal.timeout(30_000),
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
