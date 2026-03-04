/**
 * Zyprus Land API
 * Handles land/plot listing creation and image uploads
 */

import { logClassifiedError } from "../utils/error-mapper.ts";
import { LogCategory, logger } from "../utils/logger.ts";
import { withRetry } from "../utils/retry.ts";
import { validateImageUrl } from "../utils/url-validator.ts";
import {
  findInfrastructureUuids,
  findLandTypeUuid,
  findListingTypeUuid,
  findPriceModifierUuid,
  findPropertyViewUuids,
  findTitleDeedUuid,
  findUserUuid,
  findUserUuids,
} from "./taxonomy-cache.ts";
import { getAccessToken, getZyprusConfig, type ZyprusConfig } from "./oauth.ts";
import { uploadSingleImage } from "./property-api.ts";

export interface LandListingData {
  listingType: "sale" | "rent";
  landType: string; // plot, field, agricultural
  price: number;
  location: string;
  locationUuid?: string;
  landSize: number; // sqm (MANDATORY for land)
  description: string;
  myNotes: string;
  images: string[];
  reviewer1: string;
  reviewer2?: string | null;
  listingOwner: string;
  listingInstructor: string;
  titleDeedStatus?: string;
  coordinates?: { lat: number; lon: number };
  priceModifier?: "no_vat" | "plus_vat" | "vat_included";
  titleDeedFileUrls?: string[];
  // Land-specific:
  buildingDensity?: number;
  siteCoverage?: number;
  maxFloors?: number;
  maxHeight?: number;
  infrastructure?: string[];
  views?: string[];
  // Reference ID fields:
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
 * Build JSON:API payload for land/plot creation
 */
function buildJsonApiPayloadLand(
  listing: LandListingData,
  imageFileIds: string[],
  listingTypeUuid: string,
  landTypeUuid: string,
  priceModifierUuid: string,
  titleDeedUuid: string,
  instructorUuid: string,
  reviewerUuids: string[],
  listingOwnerUuid: string,
  infrastructureUuids: string[],
  viewUuids: string[],
  titleDeedFileIds: string[] = []
): Record<string, unknown> {
  // Generate Own Reference ID for quick reviewer reference
  const ownReferenceId = generateOwnReferenceId(
    listing.agentName,
    listing.ownerName,
    listing.ownerPhone,
    listing.ownerEmail,
    listing.registrationNumber
  );

  // Build proper title: "Plot (2,500m²) For Sale in Mesa Chorio, Paphos"
  const landTypeStr = listing.landType || "Plot";
  const landTypeCapitalized =
    landTypeStr.charAt(0).toUpperCase() + landTypeStr.slice(1).toLowerCase();
  const listingTypeText =
    listing.listingType === "rent" ? "For Rent" : "For Sale";
  const generatedTitle = `${landTypeCapitalized} (${listing.landSize.toLocaleString()}m²) ${listingTypeText} in ${listing.location}`;

  logger.info(`Generated land title: ${generatedTitle}`, {
    category: LogCategory.ZYPRUS,
    operation: "createDraftLandListing",
  });

  const attributes: Record<string, unknown> = {
    title: generatedTitle,
    status: false, // Always unpublished draft
    field_price: listing.price,
    field_land_size: listing.landSize,
    body: {
      value: listing.description,
      format: "plain_text",
    },
    field_ai_generated: true,
    field_ai_state: "draft",
    field_own_reference_id: ownReferenceId,
    field_ai_draft_own_reference_id: ownReferenceId,
  };

  // Add building regulations if provided
  if (listing.buildingDensity !== undefined) {
    attributes.field_building_density = listing.buildingDensity;
  }
  if (listing.siteCoverage !== undefined) {
    attributes.field_site_coverage = listing.siteCoverage;
  }
  if (listing.maxFloors !== undefined) {
    attributes.field_floors = listing.maxFloors;
  }
  if (listing.maxHeight !== undefined) {
    attributes.field_height = listing.maxHeight;
  }

  // field_notes: Land uses field_notes (object with value), not field_property_notes (that's for properties)
  if (listing.myNotes) {
    attributes.field_notes = { value: listing.myNotes };
  }

  // Coordinates (with privacy offset) — match property listing format + Postman spec
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

  const relationships: Record<string, unknown> = {};

  // Listing type (sale/rent)
  relationships.field_listing_type = {
    data: { type: "taxonomy_term--listing_type", id: listingTypeUuid },
  };

  // Land type (plot, field, agricultural)
  if (landTypeUuid) {
    relationships.field_land_type = {
      data: { type: "taxonomy_term--land_type", id: landTypeUuid },
    };
  }

  // Price modifier (no_vat, plus_vat, vat_included)
  if (priceModifierUuid) {
    relationships.field_land_price_modifier = {
      data: { type: "taxonomy_term--price_modifier", id: priceModifierUuid },
    };
  }

  // Title deed status
  if (titleDeedUuid) {
    relationships.field_land_title_deed = {
      data: { type: "taxonomy_term--title_deed", id: titleDeedUuid },
    };
  }

  // Location
  if (listing.locationUuid) {
    relationships.field_location = {
      data: { type: "node--location", id: listing.locationUuid },
    };
  }

  // Gallery images (note: field_land_gallery, NOT field_gallery_)
  // ALWAYS include field_land_gallery — it's REQUIRED on the land node (unlike property)
  relationships.field_land_gallery = {
    data: imageFileIds.map((id) => ({
      type: "file--file",
      id,
    })),
  };

  // Title deed files — include in initial POST (same fix as property-api.ts)
  if (titleDeedFileIds.length > 0) {
    relationships.field_title_deed_file = {
      data: titleDeedFileIds.map((id) => ({
        type: "file--file",
        id,
      })),
    };
  }

  // Infrastructure (electricity, water, etc.)
  if (infrastructureUuids.length > 0) {
    relationships.field_infrastructure = {
      data: infrastructureUuids.map((id) => ({
        type: "taxonomy_term--infrastructure_",
        id,
      })),
    };
  }

  // Views (sea view, mountain view, etc.)
  if (viewUuids.length > 0) {
    relationships.field_land_views = {
      data: viewUuids.map((id) => ({
        type: "taxonomy_term--property_views",
        id,
      })),
    };
  }

  // Listing instructor
  relationships.field_ai_listing_instructor = {
    data: { type: "user--user", id: instructorUuid },
  };

  // Listing reviewers
  if (reviewerUuids.length > 0) {
    relationships.field_ai_listing_reviewer = {
      data: reviewerUuids.map((id) => ({ type: "user--user", id })),
    };
  }

  // Listing owner/author
  relationships.uid = {
    data: { type: "user--user", id: listingOwnerUuid },
  };

  return {
    data: {
      type: "node--land",
      attributes,
      relationships,
    },
  };
}

/**
 * Upload images to land gallery endpoint
 */
async function uploadLandImages(
  urls: string[],
  token: string,
  config: ZyprusConfig
): Promise<string[]> {
  logger.info("Uploading land images to Zyprus", {
    category: LogCategory.ZYPRUS,
    operation: "uploadLandImages",
    count: urls.length,
  });

  const results = await Promise.all(
    urls.map(async (url, index) => {
      try {
        const urlValidation = validateImageUrl(url);
        if (!urlValidation.valid) {
          logger.warn("SSRF blocked - invalid image URL", {
            category: LogCategory.ZYPRUS,
            operation: "uploadLandImages",
            imageIndex: index,
            urlPreview: url.substring(0, 100),
            validationError: urlValidation.error,
          });
          return null;
        }

        const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
        const imageResponse = await fetch(url, {
          signal: AbortSignal.timeout(30_000),
        });
        if (!imageResponse.ok) {
          logger.error("Failed to download image for land upload", undefined, {
            category: LogCategory.ZYPRUS,
            operation: "uploadLandImages",
            imageIndex: index,
            status: imageResponse.status,
            urlPreview: url.substring(0, 100),
          });
          return null;
        }

        const contentLength = imageResponse.headers.get("content-length");
        if (contentLength) {
          const sizeBytes = Number.parseInt(contentLength, 10);
          if (sizeBytes > MAX_IMAGE_SIZE_BYTES) {
            logger.warn("Image exceeds maximum size limit - rejecting", {
              category: LogCategory.ZYPRUS,
              operation: "uploadLandImages",
              imageIndex: index,
              sizeBytes,
              maxSizeBytes: MAX_IMAGE_SIZE_BYTES,
              urlPreview: url.substring(0, 100),
            });
            return null;
          }
        }

        const imageBlob = await imageResponse.blob();
        if (imageBlob.size > MAX_IMAGE_SIZE_BYTES) {
          logger.warn("Image blob exceeds maximum size limit - rejecting", {
            category: LogCategory.ZYPRUS,
            operation: "uploadLandImages",
            imageIndex: index,
            actualSize: imageBlob.size,
            maxSizeBytes: MAX_IMAGE_SIZE_BYTES,
            urlPreview: url.substring(0, 100),
          });
          return null;
        }

        const imageBuffer = await imageBlob.arrayBuffer();
        const urlParts = url.split("/");
        let filename = urlParts[urlParts.length - 1].split("?")[0];
        if (!filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
          filename = `land_image_${index + 1}.jpg`;
        }

        // Upload via property gallery endpoint — file IDs are universal in Drupal
        // The /jsonapi/node/land/field_land_gallery endpoint doesn't support standalone file uploads
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
              throw new Error(`Land image upload failed: ${res.status}`);
            }
            return res;
          },
          { maxRetries: 2, baseDelayMs: 500 },
          "uploadLandImage"
        );

        if (!uploadResponse.ok) {
          logger.error("Failed to upload land image", undefined, {
            category: LogCategory.ZYPRUS,
            operation: "uploadLandImages",
            imageIndex: index,
            status: uploadResponse.status,
            urlPreview: url.substring(0, 100),
          });
          return null;
        }

        const result = await uploadResponse.json();
        return result.data?.id || null;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error("Land image upload error", err, {
          category: LogCategory.ZYPRUS,
          operation: "uploadLandImages",
          imageIndex: index,
        });
        return null;
      }
    })
  );

  const successfulUploads = results.filter((id): id is string => id !== null);
  logger.info("Land images uploaded successfully", {
    category: LogCategory.ZYPRUS,
    operation: "uploadLandImages",
    successful: successfulUploads.length,
    failed: urls.length - successfulUploads.length,
  });

  return successfulUploads;
}

/**
 * Upload title deed files for land (uses field_title_deed_file endpoint)
 */
async function uploadLandTitleDeedFiles(
  fileUrls: string[],
  token: string,
  config: ZyprusConfig
): Promise<string[]> {
  logger.info("Uploading title deed files to Zyprus", {
    category: LogCategory.ZYPRUS,
    operation: "uploadLandTitleDeedFiles",
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
            operation: "uploadLandTitleDeedFile",
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
          operation: "uploadLandTitleDeedFile",
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
          "uploadLandTitleDeedFile"
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
            operation: "uploadLandTitleDeedFile",
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
          operation: "uploadLandTitleDeedFile",
          imageIndex: index,
        });
        return null;
      }
    })
  );

  return results.filter((id): id is string => id !== null);
}

/**
 * Create a draft land listing on Zyprus
 */
export async function createDraftLandListing(
  listing: LandListingData
): Promise<CreateResult> {
  const config = getZyprusConfig();
  const token = await getAccessToken(config);

  logger.info("Creating draft land listing on Zyprus", {
    category: LogCategory.ZYPRUS,
    operation: "createDraftLandListing",
    listingType: listing.listingType,
    landType: listing.landType,
    location: listing.location,
  });

  // Collect reviewer emails
  const reviewerEmails: string[] = [];
  if (listing.reviewer1) reviewerEmails.push(listing.reviewer1);
  if (listing.reviewer2) reviewerEmails.push(listing.reviewer2);

  // Resolve all taxonomy UUIDs and user UUIDs in parallel
  const [
    listingTypeUuid,
    landTypeUuid,
    priceModifierUuid,
    titleDeedUuid,
    listingOwnerUuid,
    reviewerUuids,
    infrastructureUuids,
    viewUuids,
  ] = await Promise.all([
    findListingTypeUuid(listing.listingType),
    findLandTypeUuid(listing.landType),
    findPriceModifierUuid(listing.priceModifier, true), // Land is negotiable by default
    findTitleDeedUuid(listing.titleDeedStatus),
    findUserUuid(listing.listingOwner),
    findUserUuids(reviewerEmails),
    findInfrastructureUuids(listing.infrastructure || []),
    findPropertyViewUuids(listing.views || []),
  ]);

  const instructorUuid = listingOwnerUuid;

  logger.info("Resolved Zyprus UUIDs for land listing", {
    category: LogCategory.ZYPRUS,
    operation: "createDraftLandListing",
    listingTypeUuid,
    landTypeUuid,
    priceModifierUuid,
    titleDeedUuid,
    instructorUuid,
    listingOwnerUuid,
    reviewerCount: reviewerUuids.length,
    infrastructureCount: infrastructureUuids.length,
    viewCount: viewUuids.length,
  });

  // Upload files in parallel
  const [imageFileIds, titleDeedFileIds] = await Promise.all([
    uploadLandImages(listing.images, token, config),
    listing.titleDeedFileUrls && listing.titleDeedFileUrls.length > 0
      ? uploadLandTitleDeedFiles(listing.titleDeedFileUrls, token, config)
      : Promise.resolve([] as string[]),
  ]);

  logger.info("All files uploaded for land listing", {
    category: LogCategory.ZYPRUS,
    operation: "createDraftLandListing",
    galleryUploaded: imageFileIds.length,
    galleryTotal: listing.images.length,
    titleDeedsUploaded: titleDeedFileIds.length,
  });

  // Land gallery is REQUIRED by Zyprus — fail early if no images uploaded
  if (imageFileIds.length === 0 && listing.images.length > 0) {
    throw new Error(
      "All land image uploads failed — cannot create listing without gallery images"
    );
  }

  // Build and send listing payload
  const payload = buildJsonApiPayloadLand(
    listing,
    imageFileIds,
    listingTypeUuid,
    landTypeUuid,
    priceModifierUuid,
    titleDeedUuid,
    instructorUuid,
    reviewerUuids,
    listingOwnerUuid,
    infrastructureUuids,
    viewUuids,
    titleDeedFileIds
  );

  const response = await withRetry(
    async () => {
      const res = await fetch(`${config.apiUrl}/jsonapi/node/land`, {
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

      if (!res.ok && res.status >= 500) {
        throw new Error(`Land listing creation failed: ${res.status}`);
      }
      return res;
    },
    { maxRetries: 2, baseDelayMs: 1000 },
    "createDraftLandListing"
  );

  if (!response.ok) {
    const errorText = await response.text();
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
    logClassifiedError(
      "Failed to create Zyprus land listing",
      new Error(
        `API error: ${response.status} - ${errorDetail || "Unknown error"}`
      ),
      {
        category: LogCategory.ZYPRUS,
        operation: "createDraftLandListing",
        status: response.status,
        errorDetail,
      }
    );
    throw new Error(
      `Zyprus API ${response.status}: ${errorDetail || "Unknown error"}`
    );
  }

  const result = await response.json();
  const listingId = result.data.id;

  logger.info("Zyprus land listing created successfully", {
    category: LogCategory.ZYPRUS,
    operation: "createDraftLandListing",
    listingId,
  });

  // Title deed files: Check if attached via initial POST
  // Fall back to PATCH only if POST didn't include them
  let titleDeedAttachedToLand = false;
  if (titleDeedFileIds.length > 0) {
    const hasRelationship = result.data?.relationships?.field_title_deed_file?.data;
    if (hasRelationship) {
      titleDeedAttachedToLand = true;
      logger.info("Title deed files attached to land listing via initial POST", {
        category: LogCategory.ZYPRUS,
        operation: "createDraftLandListing",
        listingId,
        fileCount: titleDeedFileIds.length,
      });
    }
  }
  if (titleDeedFileIds.length > 0 && !titleDeedAttachedToLand) {
    try {
      const patchPayload = {
        data: {
          type: "node--land",
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
      const patchRes = await fetch(
        `${config.apiUrl}/jsonapi/node/land/${listingId}`,
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
        logger.info("Title deed files attached to land listing via PATCH", {
          category: LogCategory.ZYPRUS,
          operation: "patchLandTitleDeedFiles",
          listingId,
          fileCount: titleDeedFileIds.length,
        });
      } else {
        let patchErrorBody = "";
        try {
          patchErrorBody = await patchRes.text();
        } catch {
          /* ignore */
        }
        logger.warn(
          "Could not attach title deed files to land listing (non-blocking)",
          {
            category: LogCategory.ZYPRUS,
            operation: "patchLandTitleDeedFiles",
            listingId,
            status: patchRes.status,
            errorBody: patchErrorBody.substring(0, 500),
          }
        );
      }
    } catch (patchError) {
      logger.warn(
        "Failed to PATCH title deed files to land listing (non-blocking)",
        {
          category: LogCategory.ZYPRUS,
          operation: "patchLandTitleDeedFiles",
          listingId,
        }
      );
    }
  }

  return {
    listingId,
    listingUrl: `${config.siteUrl}/land/${listingId}`,
  };
}
