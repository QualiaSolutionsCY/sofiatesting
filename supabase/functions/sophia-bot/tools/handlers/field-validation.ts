/**
 * Field Validation Module
 * Handles steps 1-6: agent identification, duplicate checking, required field validation,
 * location correction, regional access validation, special cases, reviewer assignment
 */

import { type Agent, getAgentByEmail } from "../../agents/identifier.ts";
import {
  REGIONAL_EMAILS,
} from "../../config/business-rules.ts";
import {
  determineRegion,
  validateRegionalAccess,
} from "../../rules/region-validator.ts";
import {
  assignReviewers,
  needsAssignmentInput,
} from "../../rules/reviewer-assignment.ts";
import {
  getMissingFieldsMessage,
  handleSpecialCases,
  handleUnknownSender,
  validateRequiredFields,
} from "../../rules/special-cases.ts";
import { LogCategory, logger } from "../../utils/logger.ts";
import {
  extractAreaFromGoogleMapsUrl,
  isCityOnlyLocation,
  isLocationAStreetInUrl,
  isStreetAddress,
} from "../validators/location.ts";
import { acquireUploadLock, releaseUploadLock } from "../validators/upload-lock.ts";
import { getSupabaseAdmin } from "../../../_shared/db.ts";

/**
 * Resolve a short URL (maps.app.goo.gl, etc.) by following redirects.
 * Returns the final URL with full coordinates.
 */
async function resolveShortUrl(shortUrl: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    // Follow redirect but don't download body
    const response = await fetch(shortUrl, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    const resolved = response.url;
    // Only return if it resolved to a different, longer URL
    if (resolved && resolved !== shortUrl && resolved.length > shortUrl.length) {
      return resolved;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

import type { ToolResult } from "../executor.ts";
export type { ToolResult };

export interface ValidatedFields {
  location: string;
  listingType: "sale" | "rent";
  locationUrl: string;
  streetName: string;
  reviewers: {
    reviewer1Uuid: string;
    reviewer2Uuid: string | null;
    listingOwner: string;
    listingInstructor: string;
  };
  listingOwnerName: string;
  potentialDuplicateNote: string;
  uploadLockKey: string;
  args: Record<string, unknown>;
}

export async function validateAndPrepareFields(
  args: Record<string, unknown>,
  agent: Agent | null
): Promise<ToolResult | ValidatedFields> {
  logger.info("Field validation started", {
    category: LogCategory.TOOL,
    operation: "validateAndPrepareFields",
    argsPreview: JSON.stringify(args).substring(0, 500),
  });

  // 1. Check if agent is identified
  if (!agent) {
    logger.warn("Listing creation blocked - no agent identified", {
      category: LogCategory.TOOL,
      operation: "validateAndPrepareFields",
    });
    return handleUnknownSender();
  }

  logger.info("Agent identified for listing creation", {
    category: LogCategory.TOOL,
    operation: "validateAndPrepareFields",
    agentName: agent.fullName,
    agentRegion: agent.region,
  });

  // 1.5 CRITICAL: Acquire DB-based upload lock to prevent duplicate uploads
  // Uses property fingerprint (agent+location+price+owner) so different properties can upload in parallel
  // DB lock is atomic — only ONE concurrent Edge Function invocation wins
  const agentPhone = agent.mobile?.replace(/\D/g, "") || agent.communicationEmail || "";
  // Per-property lock — agent+location+price+owner fingerprint so different properties can upload in parallel
  const propertyLockKey = `upload:${agentPhone}:${((args.location as string) || "").toLowerCase()}:${args.price}:${((args.ownerPhone as string) || "").slice(-6)}`;
  const lockResult = await acquireUploadLock(propertyLockKey, agentPhone);
  if (!lockResult.acquired) {
    logger.warn("Upload blocked by DB lock - duplicate upload in progress", {
      category: LogCategory.TOOL,
      operation: "validateAndPrepareFields",
      agentName: agent.fullName,
      remainingSeconds: lockResult.remainingSeconds,
    });
    return {
      needsInput: true,
      question: `I'm already processing an upload for this property. Please wait ${lockResult.remainingSeconds} seconds before trying again.`,
    };
  }

  // Helper: release lock on early-return paths (fire-and-forget)
  const releaseLock = () => releaseUploadLock(propertyLockKey).catch(() => {});

  // 1.6 Check listing_uploads for recent duplicates — BLOCKS upload if match found within 24 hours
  // Skip if agent already confirmed duplicate with "upload anyway" (confirmDuplicate=true)
  let potentialDuplicateNote = "";

  const sb = getSupabaseAdmin();

  if (!args.confirmDuplicate) {
    const twentyFourHoursAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString();
    const { data: recentUploads } = await sb
      .from("listing_uploads")
      .select("id, property_title, created_at, zyprus_listing_id, price")
      .eq("agent_phone", agentPhone)
      .gte("created_at", twentyFourHoursAgo)
      .order("created_at", { ascending: false })
      .limit(5);

    if (recentUploads && recentUploads.length > 0) {
      const locationLower = ((args.location as string) || "").toLowerCase().trim();
      const currentPrice = Number(args.price) || 0;
      // Split location into parts (e.g., "Agios Tychonas, Limassol" → ["agios tychonas", "limassol"])
      const locationParts = locationLower.split(",").map((p: string) => p.trim()).filter(Boolean);
      // Use the FIRST part (specific area) for matching, not the city name
      // This prevents "Limassol" matching every Limassol property, or "Paphos" matching every Paphos property
      // Only fall back to full location if it's already specific (single part with 2+ words)
      const specificArea = locationParts.length > 1
        ? locationParts[0] // Use "Agios Tychonas" not "Limassol"
        : (locationLower.split(/\s+/).length >= 2 ? locationLower : null); // Single part needs 2+ words to be specific
      const match = specificArea ? recentUploads.find(
        (p: Record<string, unknown>) => {
          const titleMatch = ((p.property_title as string) || "")
            .toLowerCase()
            .includes(specificArea);
          if (!titleMatch) return false;
          // Price check: require BOTH prices for reliable comparison
          const existingPrice = Number(p.price) || 0;
          if (currentPrice > 0 && existingPrice > 0) {
            // Both prices exist — reject if they differ by >20%
            const priceDiff = Math.abs(currentPrice - existingPrice) / Math.max(currentPrice, existingPrice);
            if (priceDiff > 0.2) {
              logger.info("Duplicate candidate rejected — price differs by >20%", {
                category: LogCategory.TOOL,
                operation: "validateAndPrepareFields",
                currentPrice,
                existingPrice,
                priceDiff: `${(priceDiff * 100).toFixed(0)}%`,
              });
              return false;
            }
          } else if (existingPrice === 0) {
            // Old record has no price — can't confirm it's the same property
            // Only match if bedrooms or type also appear in the existing title
            const currentBeds = Number(args.bedrooms) || 0;
            const currentType = ((args.propertyType as string) || "").toLowerCase();
            const titleLower = ((p.property_title as string) || "").toLowerCase();
            const bedsMatch = currentBeds > 0 && titleLower.includes(`${currentBeds} bed`);
            const typeMatch = currentType.length > 2 && titleLower.includes(currentType);
            if (!bedsMatch && !typeMatch) {
              logger.info("Duplicate candidate rejected — no price on record & beds/type mismatch", {
                category: LogCategory.TOOL,
                operation: "validateAndPrepareFields",
              });
              return false;
            }
          }
          return true;
        }
      ) : null;
      if (match) {
        const minutesAgo = Math.round(
          (Date.now() - new Date(match.created_at as string).getTime()) / 60_000
        );
        potentialDuplicateNote = `POTENTIAL DUPLICATE - similar listing exists: ${match.property_title} (${match.zyprus_listing_id})`;
        logger.warn("Duplicate detected - blocking upload", {
          category: LogCategory.TOOL,
          operation: "validateAndPrepareFields",
          existingId: match.zyprus_listing_id,
          existingTitle: match.property_title,
          minutesAgo,
          agentPhone,
        });
        // Release the upload lock since we're not proceeding
        await releaseUploadLock(propertyLockKey).catch(() => {});
        return {
          needsInput: true,
          question: `This property was already uploaded ${minutesAgo < 60 ? `${minutesAgo} minutes` : `${Math.round(minutesAgo / 60)} hours`} ago: "${match.property_title}" (${match.zyprus_listing_id}). If you want to upload it again, please confirm by saying "upload anyway".`,
        };
      }
    }
  } else {
    logger.info("Duplicate check skipped — agent confirmed upload anyway", {
      category: LogCategory.TOOL,
      operation: "validateAndPrepareFields",
      agentPhone,
    });
  }

  // 2. Validate required fields
  const validation = validateRequiredFields(args);
  if (!validation.valid) {
    // If confirmDuplicate is true but fields are missing, tell the AI to re-read chat history
    if (args.confirmDuplicate) {
      logger.warn("confirmDuplicate=true but required fields missing — asking AI to re-send all fields", {
        category: LogCategory.TOOL,
        operation: "validateAndPrepareFields",
        missingFields: validation.missing,
      });
      await releaseLock();
      return {
        needsInput: true,
        retryable: true,
        question: `To proceed with the duplicate upload, I need you to call createPropertyListing again with ALL the original property details (listingType, propertyType, price, location, bedrooms, coveredArea, ownerName, ownerPhone, titleDeedStatus) plus confirmDuplicate: true. Re-read the conversation above to find all the property information the agent provided.`,
      };
    }
    // Mark as retryable so ai-chat.ts feeds this back to the AI loop
    // instead of showing the generic "I still need..." message to the user.
    // The AI already has the data in conversation context — it just failed to extract it.
    logger.warn("Validation failed — missing fields in tool call args", {
      category: LogCategory.TOOL,
      operation: "validateAndPrepareFields",
      missingFields: validation.missing,
      providedFields: Object.keys(args).filter(
        (k) => args[k] !== undefined && args[k] !== null
      ),
    });
    await releaseLock();
    return {
      needsInput: true,
      retryable: true,
      question: getMissingFieldsMessage(validation.missing),
    };
  }

  let location = args.location as string;
  const listingType = args.listingType as "sale" | "rent";
  let locationUrl = args.locationUrl as string | undefined;

  // Resolve Google Maps short links (maps.app.goo.gl) to full URLs with coordinates
  if (locationUrl && (locationUrl.includes("goo.gl") || locationUrl.includes("maps.app"))) {
    try {
      const resolved = await resolveShortUrl(locationUrl);
      if (resolved && resolved !== locationUrl) {
        logger.info(`Resolved short URL: ${locationUrl} → ${resolved.substring(0, 100)}`, {
          category: LogCategory.TOOL,
        });
        locationUrl = resolved;
        // Update args so downstream code (coordinates, locationUrl field) uses the resolved URL
        args.locationUrl = resolved;
      }
    } catch (error) {
      logger.warn(`Failed to resolve short URL: ${error instanceof Error ? error.message : error}`, {
        category: LogCategory.TOOL,
      });
    }
  }

  // 2.5 CRITICAL: Correct street addresses to area names
  // AI sometimes passes street names (e.g., "Apostolou Pavlou Ave, Paphos" or "Michali Sougioul, Limassol")
  // instead of area names (e.g., "Kato Paphos, Paphos"). Detect this and fix using the Google Maps URL.
  const streetDetected =
    isStreetAddress(location) ||
    // Cross-reference with Google Maps URL: if the /place/ path contains the AI's location
    // name alongside a house number, it's a street name (e.g., "Michali Sougioul 21, Lemesos")
    (locationUrl ? isLocationAStreetInUrl(location, locationUrl) : false);

  if (streetDetected && locationUrl) {
    const areaFromUrl = extractAreaFromGoogleMapsUrl(locationUrl);
    if (areaFromUrl) {
      logger.warn(
        "Location corrected: AI passed street address, extracted area from Google Maps URL",
        {
          category: LogCategory.TOOL,
          operation: "validateAndPrepareFields",
          originalLocation: location,
          correctedLocation: areaFromUrl,
          googleMapsUrl: locationUrl.substring(0, 100),
        }
      );
      location = areaFromUrl;
    } else {
      // Could not extract a specific area — ask the agent
      logger.warn(
        "Location appears to be a street address, asking agent for area name",
        {
          category: LogCategory.TOOL,
          operation: "validateAndPrepareFields",
          location,
          googleMapsUrl: locationUrl.substring(0, 100),
        }
      );
      await releaseLock();
      return {
        needsInput: true,
        question: `I've captured the pin location from the Google Maps link, but "${location}" appears to be a street name. What is the area/neighborhood? (e.g., Agios Athanasios, Kato Paphos, Germasogeia, Mesa Geitonia)`,
      };
    }
  } else if (streetDetected && !locationUrl) {
    // Street name without a Google Maps URL — ask for proper area
    logger.warn(
      "Location appears to be a street address with no Google Maps URL to extract area from",
      {
        category: LogCategory.TOOL,
        operation: "validateAndPrepareFields",
        location,
      }
    );
    await releaseLock();
    return {
      needsInput: true,
      question: `"${location}" appears to be a street address. I need the area/neighborhood name for the listing (e.g., Agios Athanasios, Kato Paphos, Germasogeia). What area is this property in?`,
    };
  }

  // 2.6 CRITICAL: Block city-only locations (e.g., "Limassol, Limassol" or "Paphos")
  // These are too vague — Sophia must ask for the specific area/neighborhood
  if (isCityOnlyLocation(location)) {
    logger.warn("Location rejected: city-only location without specific area", {
      category: LogCategory.TOOL,
      operation: "validateAndPrepareFields",
      location,
    });
    await releaseLock();
    return {
      needsInput: true,
      question: `"${location}" is too general — I need the specific area or neighborhood name (e.g., Agios Athanasios, Kato Paphos, Germasogeia, Mesa Geitonia). What is the exact area/neighborhood for this property?`,
    };
  }

  // 2.7 CRITICAL: Correct district mismatch in location string.
  // AI often writes "Episkopi, Paphos" when Episkopi is actually in Limassol.
  // determineRegion uses specific area names (not district names) first,
  // so it correctly identifies the actual district. Fix the location string to match.
  const districtNames: Record<string, string[]> = {
    paphos: ["paphos", "pafos"],
    limassol: ["limassol", "lemesos"],
    larnaca: ["larnaca", "larnaka"],
    nicosia: ["nicosia", "lefkosia"],
    famagusta: ["famagusta", "ammochostos"],
  };
  const districtDisplayNames: Record<string, string> = {
    paphos: "Paphos",
    limassol: "Limassol",
    larnaca: "Larnaca",
    nicosia: "Nicosia",
    famagusta: "Famagusta",
  };
  const detectedRegion = determineRegion(location);
  if (detectedRegion) {
    // Check if the location string contains a WRONG district name
    const locationLower = location.toLowerCase();
    for (const [wrongRegion, names] of Object.entries(districtNames)) {
      if (wrongRegion === detectedRegion) continue;
      for (const name of names) {
        if (locationLower.includes(name)) {
          const correctName = districtDisplayNames[detectedRegion];
          // Replace wrong district with correct one (case-insensitive)
          const regex = new RegExp(name, "gi");
          const oldLocation = location;
          location = location.replace(regex, correctName);
          logger.warn(
            `Location district corrected: "${oldLocation}" → "${location}" (area is in ${detectedRegion}, not ${wrongRegion})`,
            { category: LogCategory.TOOL, operation: "validateAndPrepareFields" }
          );
          break;
        }
      }
    }
  }

  // 3. Validate regional access
  const regionResult = validateRegionalAccess(agent, location);
  if (!regionResult.allowed) {
    await releaseLock();
    return { error: regionResult.message };
  }

  const propertyRegion =
    regionResult.propertyRegion || detectedRegion || agent.region;

  // 4. Handle special cases
  const specialCase = await handleSpecialCases(
    agent,
    {
      listingType,
      location,
      assignTo: args.assignTo as string | undefined,
    },
    propertyRegion
  );

  if (specialCase.rejected) {
    await releaseLock();
    return { error: specialCase.message };
  }

  if (specialCase.needsInput) {
    await releaseLock();
    return { needsInput: true, question: specialCase.question };
  }

  // 4b. Apply any modifications from special cases (e.g., Michelle rentals → Demetra)
  if (specialCase.modifiedRequest) {
    Object.assign(args, specialCase.modifiedRequest);
    logger.info("Applied modifiedRequest from special case", {
      category: LogCategory.TOOL,
      operation: "validateAndPrepareFields",
      modifications: Object.keys(specialCase.modifiedRequest),
    });
  }

  // 5. Check if management needs to specify assignment
  if (needsAssignmentInput(agent, listingType) && !args.assignTo) {
    await releaseLock();
    return {
      needsInput: true,
      question:
        "To whom would you like me to assign this property as the listing owner?",
    };
  }

  // 5.1 SECURITY: Only management agents can use assignTo — strip it for regular agents
  // This prevents the AI from hallucinating assignments (e.g., "lysandros@zyprus.com" for a Paphos property)
  if (args.assignTo && agent.role !== "management") {
    logger.warn(
      "Stripped assignTo from non-management agent — only management can assign",
      {
        category: LogCategory.TOOL,
        operation: "validateAndPrepareFields",
        agentRole: agent.role,
        agentEmail: agent.communicationEmail,
        attemptedAssignTo: args.assignTo,
      }
    );
    args.assignTo = undefined;
  }

  // 5.2 SECURITY: Validate assignTo is a @zyprus.com email (exact domain match to prevent subdomain bypass)
  if (args.assignTo) {
    const assignToEmail = (args.assignTo as string).toLowerCase().trim();
    const emailParts = assignToEmail.split("@");
    // Must have exactly one @ and domain must be exactly zyprus.com (not a subdomain)
    if (emailParts.length !== 2 || emailParts[1] !== "zyprus.com") {
      await releaseLock();
      return {
        error: "Assignments must be to a @zyprus.com email address.",
      };
    }
    // Verify the email exists as an agent in the database OR is a known regional office email
    const isRegionalOffice =
      Object.values(REGIONAL_EMAILS).includes(assignToEmail);
    if (isRegionalOffice) {
      logger.info(
        "assignTo is a regional office email — skipping agent DB check",
        {
          category: LogCategory.TOOL,
          operation: "validateAndPrepareFields",
          assignToEmail,
        }
      );
    } else {
      const assigneeAgent = await getAgentByEmail(assignToEmail);
      if (!assigneeAgent) {
        logger.warn("assignTo email not found in agents database — stripping", {
          category: LogCategory.TOOL,
          operation: "validateAndPrepareFields",
          assignToEmail,
        });
        args.assignTo = undefined;
      } else {
        // 5.3 REGION CHECK: Validate assignee's region matches property region
        // Prevents assigning e.g. a Limassol property to a Paphos agent
        if (assigneeAgent.region !== "all" && propertyRegion && assigneeAgent.region !== propertyRegion) {
          logger.warn("Assignee region mismatch — blocking assignment", {
            category: LogCategory.TOOL,
            operation: "validateAndPrepareFields",
            assigneeEmail: assignToEmail,
            assigneeRegion: assigneeAgent.region,
            propertyRegion,
          });
          await releaseLock();
          return {
            error: `This property is in ${propertyRegion}, but ${assigneeAgent.fullName} is a ${assigneeAgent.region} agent. Agents can only be assigned properties in their region. Would you like me to assign it to a ${propertyRegion}-based agent instead?`,
          };
        }
      }
    }
  }

  // 6. Get reviewer assignments
  const reviewers = assignReviewers(
    agent,
    listingType,
    propertyRegion,
    args.assignTo as string | undefined
  );

  // 6b. Resolve listing owner name for Reference ID
  // When assignTo is provided (management assigns to specific agent), look up that agent's name
  let listingOwnerName = agent.fullName;
  if (args.assignTo && reviewers.listingOwner !== agent.communicationEmail) {
    try {
      const assignedAgent = await getAgentByEmail(reviewers.listingOwner);
      if (assignedAgent) {
        listingOwnerName = assignedAgent.fullName;
        logger.info("Resolved listing owner name from assignTo", {
          category: LogCategory.TOOL,
          operation: "validateAndPrepareFields",
          listingOwnerName,
          listingOwnerEmail: reviewers.listingOwner,
        });
      }
    } catch {
      // Non-critical — fall back to requesting agent name
    }
  }

  // Success — return validated fields
  return {
    location,
    listingType,
    locationUrl: locationUrl || "",
    streetName: location, // streetName is used for My Notes — same as location
    reviewers: {
      reviewer1Uuid: reviewers.reviewer1,
      reviewer2Uuid: reviewers.reviewer2,
      listingOwner: reviewers.listingOwner,
      listingInstructor: reviewers.listingInstructor,
    },
    listingOwnerName,
    potentialDuplicateNote,
    uploadLockKey: propertyLockKey,
    args,
  };
}
