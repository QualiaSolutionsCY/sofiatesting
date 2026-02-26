/**
 * Tool Executor
 * Executes tool calls from OpenRouter and returns results
 */

import { Agent, getAgentsByRegion, getAgentByEmail } from "../agents/identifier.ts";
import { validateRegionalAccess, determineRegion } from "../rules/region-validator.ts";
import { assignReviewers, needsAssignmentInput, RejectionError } from "../rules/reviewer-assignment.ts";
import { handleSpecialCases, handleUnknownSender, validateRequiredFields, getMissingFieldsMessage } from "../rules/special-cases.ts";
import { checkForDuplicates, generateDuplicateWarning, createDuplicateNote } from "../services/duplicate-checker.ts";
import { generateDescription, generateTitle } from "../services/description-generator.ts";
import { generateMyNotes, generateAIAssistantNotes } from "../services/my-notes-generator.ts";
import { processImages, validateImages, generateImageWarnings, hasEnoughImages } from "../services/image-handler.ts";
import { createDraftListing, getZyprusConfig, getAccessToken } from "../zyprus/client.ts";
import { loadTaxonomy, findLocationUuid, findPropertyTypeUuid, getLocationsByRegion, LocationResult } from "../zyprus/taxonomy-cache.ts";
import { clearPendingImages, getPendingImages } from "../services/pending-images.ts";
import { getPendingDocuments, clearPendingDocuments } from "../services/pending-documents.ts";
import { extractFromBazaraki as extractBazarakiListing, isBazarakiUrl, formatBazarakiSummary } from "../services/bazaraki-scraper.ts";
import { logger, LogCategory } from "../utils/logger.ts";
import { classifyError, getUserFriendlyMessage, ErrorType } from "../utils/error-mapper.ts";
import { trackToolUsed, trackPropertyUploaded, trackDocumentGenerated, createTimer } from "../services/analytics.ts";
import { getLastDocument, trackListingUpload } from "../../_shared/db.ts";
import { DEFAULT_COORDINATES, UPLOAD_LOCK_DURATION_MS, REGIONAL_EMAILS } from "../config/business-rules.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

/**
 * Extract area/neighborhood name from a Google Maps URL.
 * Google Maps encodes place names in the !2s... proto buffer segments.
 * E.g., "!2sKato+Paphos,+Paphos,+Cyprus" → "Kato Paphos, Paphos"
 * Returns the first area-level match (not street-level), or null.
 */
function extractAreaFromGoogleMapsUrl(url: string): string | null {
  if (!url) return null;

  // Greek → English district name mapping
  const greekToEnglish: Record<string, string> = {
    "lemesos": "Limassol",
    "lefkosia": "Nicosia",
    "larnaka": "Larnaca",
    "pafos": "Paphos",
    "ammochostos": "Famagusta",
  };

  // Street indicators — if a place name contains these, it's a street, not an area
  const streetIndicators = /\b(ave|avenue|street|str|road|rd|drive|dr|boulevard|blvd|lane|ln|way|place|crescent|court|terrace|highway|hwy)\b/i;

  // Cyprus district names for validation (English + Greek)
  const cyprusDistricts = ["paphos", "limassol", "larnaca", "nicosia", "famagusta", "lemesos", "lefkosia", "larnaka", "pafos", "ammochostos"];

  /** Normalize Greek district names to English */
  function normalizeDistrict(text: string): string {
    const lower = text.toLowerCase().replace(/\s*\d+\s*$/, "").trim(); // Remove trailing postcodes
    return greekToEnglish[lower] || text.replace(/\s*\d+\s*$/, "").trim();
  }

  try {
    // Decode any URL encoding first
    const decoded = decodeURIComponent(url);

    // Strategy 1: Extract !2s... segments (place names in Google Maps protobuf data)
    // These contain place names like "Kato Paphos, Paphos, Cyprus"
    const placeMatches = decoded.match(/!2s([^!]+)/g);
    if (placeMatches && placeMatches.length > 0) {
      for (const match of placeMatches) {
        const placeName = match.replace("!2s", "").replace(/\+/g, " ").trim();

        // Skip empty or very short names
        if (placeName.length < 3) continue;

        // Skip if it looks like a street address
        if (streetIndicators.test(placeName)) continue;
        if (/^\d+\s/.test(placeName)) continue; // Starts with house number

        // Check if this contains a Cyprus district
        const parts = placeName.split(",").map(p => p.trim());
        const hasDistrict = parts.some(p =>
          cyprusDistricts.some(d => p.toLowerCase().replace(/\s*\d+\s*$/, "").includes(d))
        );

        if (hasDistrict && parts.length >= 2) {
          // Remove "Cyprus" and normalize district names
          const filtered = parts
            .filter(p => p.toLowerCase() !== "cyprus")
            .map(p => normalizeDistrict(p));
          if (filtered.length >= 2) {
            return filtered.join(", ");
          }
        }
      }
    }

    // Strategy 2: Parse the /place/ segment from the URL path
    // e.g., /place/Michali+Sougioul+21,+Lemesos+3046,+Cyprus/
    // This often contains the street address, but we can extract the district
    const placeSegmentMatch = decoded.match(/\/place\/([^\/]+)/);
    if (placeSegmentMatch) {
      const placeText = placeSegmentMatch[1].replace(/\+/g, " ").trim();
      const parts = placeText.split(",").map(p => p.trim());

      // Find the district part (skip street name and "Cyprus")
      for (const part of parts) {
        const cleaned = part.toLowerCase().replace(/\s*\d+\s*$/, "").trim(); // Remove postcodes
        if (cleaned === "cyprus") continue;
        if (cyprusDistricts.includes(cleaned)) {
          // Found a district — but we only have the district, not the area
          // Return null to force asking the user (district-only is too vague)
          return null;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if the location is just a city/district name without a specific area.
 * "Limassol" or "Paphos" alone is too vague — the agent must specify the neighborhood.
 */
function isCityOnlyLocation(location: string): boolean {
  const normalized = location.toLowerCase().replace(/[,\s]+/g, " ").trim();
  const cityNames = [
    "paphos", "limassol", "larnaca", "nicosia", "famagusta",
    "lemesos", "lefkosia", "larnaka", "pafos", "ammochostos",
    // With district suffix duplicated (e.g., "Limassol, Limassol")
    "paphos paphos", "limassol limassol", "larnaca larnaca", "nicosia nicosia", "famagusta famagusta",
    // Common vague locations
    "limassol city centre", "paphos city centre", "larnaca city centre", "nicosia city centre",
    "limassol city center", "paphos city center", "larnaca city center", "nicosia city center",
    "paphos town", "limassol town", "larnaca town", "nicosia town",
  ];
  return cityNames.includes(normalized);
}

/**
 * Detect if a location string looks like a street address rather than an area/neighborhood.
 * Street addresses should NOT be used as the listing location — areas like "Kato Paphos" should be.
 */
function isStreetAddress(location: string): boolean {
  // Street type indicators (English + Greek transliterated)
  const streetIndicators = /\b(ave|avenue|street|str|road|rd|drive|dr|boulevard|blvd|lane|ln|way|crescent|court|terrace|highway|hwy|leoforos|odos)\b/i;

  if (streetIndicators.test(location)) return true;

  // Detect "Street Name + house number" patterns like "Apostolou Pavlou 46"
  // but NOT postcodes like "Paphos 8046" (4+ digit numbers are likely postcodes)
  // House numbers are typically 1-3 digits at the end or start
  const houseNumberAtEnd = /\s\d{1,3}$/; // "Pavlou Ave 46"
  const houseNumberAtStart = /^\d{1,3}\s/; // "46 Pavlou Ave"
  if (houseNumberAtEnd.test(location.trim()) || houseNumberAtStart.test(location.trim())) {
    // Only flag as street if there are enough words (area names like "Paphos 3" shouldn't trigger)
    const words = location.split(/[\s,]+/).filter(w => w.length > 1);
    if (words.length >= 3) return true;
  }

  // CRITICAL: Detect Greek street name patterns extracted from Google Maps URLs
  // Google Maps uses "Street Name, District" format in /place/ path
  // Common pattern: Two-word name + district (e.g., "Michali Sougioul, Limassol")
  // These are often personal names (street named after a person) rather than area names
  // Area names in Cyprus are typically: single word (Tala, Chloraka) or geographic (Kato Paphos, Mesa Geitonia)
  const parts = location.split(",").map(p => p.trim());
  if (parts.length >= 2) {
    const firstPart = parts[0].toLowerCase();
    const firstWords = firstPart.split(/\s+/);

    // Two-word name patterns that suggest street names (Greek personal names)
    // e.g., "Michali Sougioul", "Apostolou Pavlou", "Georgiou Griva"
    if (firstWords.length === 2) {
      // If both words look like Greek names (common suffixes), likely a street
      const looksLikeGreekName = (word: string) => {
        const endings = ['ou', 'os', 'is', 'as', 'es', 'oul', 'ios', 'ias', 'eas', 'akis'];
        return endings.some(e => word.toLowerCase().endsWith(e));
      };

      if (looksLikeGreekName(firstWords[0]) && looksLikeGreekName(firstWords[1])) {
        // Exception: Known area names that happen to have Greek suffixes
        const knownAreas = [
          "agios tychonas", "agios athanasios", "agios nikolaos", "agios ioannis",
          "agia fyla", "agia napa", "agia zoni", "ayia napa",
          "potamos germasogeias", "mesa geitonia", "kato polemidia",
          "kato paphos", "pano paphos", "mesa chorio"
        ];
        if (!knownAreas.some(area => firstPart.includes(area))) {
          return true; // Likely a street name
        }
      }
    }
  }

  return false;
}

/**
 * Cross-reference the AI's location with the Google Maps URL to detect street names.
 * If the /place/ path in the URL contains the AI's location name followed by a house number,
 * it's a street name (e.g., AI passed "Michali Sougioul, Limassol" and URL has "Michali+Sougioul+21,+Lemesos").
 */
function isLocationAStreetInUrl(location: string, googleMapsUrl: string): boolean {
  try {
    const decoded = decodeURIComponent(googleMapsUrl).replace(/\+/g, " ");
    const placeMatch = decoded.match(/\/place\/([^\/]+)/);
    if (!placeMatch) return false;

    const placePath = placeMatch[1].toLowerCase();

    // Extract the location name part (before the district/comma)
    const locationParts = location.split(",").map(p => p.trim().toLowerCase());
    const locationName = locationParts[0]; // e.g., "michali sougioul"

    if (!locationName || locationName.length < 3) return false;

    // Check if the /place/ path contains the location name followed by a number (house number)
    // e.g., "michali sougioul 21" in the place path
    const nameInPath = placePath.includes(locationName);
    if (!nameInPath) return false;

    // Find the position of the name in the path and check what follows
    const nameIndex = placePath.indexOf(locationName);
    const afterName = placePath.substring(nameIndex + locationName.length).trim();

    // If what follows the name starts with a number (1-4 digits), it's a house number → street
    if (/^\s*\d{1,4}[,\s]/.test(afterName) || /^\s*\d{1,4}$/.test(afterName)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Check if a URL points to a document file (DOCX, PDF, etc.)
 * Used to filter out document URLs that AI might confuse as images
 */
function isDocumentUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    const docExtensions = ['.docx', '.pdf', '.doc', '.xlsx', '.xls', '.pptx', '.ppt'];

    // Check pathname (ignoring query string)
    if (docExtensions.some(ext => pathname.endsWith(ext))) {
      return true;
    }

    // Check for document patterns in path
    if (pathname.includes('/documents/') || pathname.includes('wordprocessingml')) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Atomically acquire a DB-based upload lock for a property.
 * Uses INSERT ... ON CONFLICT to guarantee only ONE concurrent caller wins.
 * Returns { locked: true } if another upload is already in progress.
 */
async function acquireUploadLock(
  lockKey: string,
  agentPhone: string
): Promise<{ acquired: boolean; remainingSeconds?: number }> {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // First clean up expired locks (older than UPLOAD_LOCK_DURATION_MS)
  const expiryTime = new Date(Date.now() - UPLOAD_LOCK_DURATION_MS).toISOString();
  await sb.from("upload_locks").delete().lt("created_at", expiryTime);

  // Try to insert — if fingerprint already exists, the INSERT fails (PRIMARY KEY conflict)
  const { error } = await sb.from("upload_locks").insert({
    fingerprint: lockKey,
    agent_phone: agentPhone,
  });

  if (error) {
    // Lock already exists — check how old it is
    const { data: existing } = await sb
      .from("upload_locks")
      .select("created_at")
      .eq("fingerprint", lockKey)
      .single();

    if (existing) {
      const elapsed = Date.now() - new Date(existing.created_at).getTime();
      if (elapsed < UPLOAD_LOCK_DURATION_MS) {
        const remaining = Math.ceil((UPLOAD_LOCK_DURATION_MS - elapsed) / 1000);
        return { acquired: false, remainingSeconds: remaining };
      }
      // Lock expired — delete and retry insert
      await sb.from("upload_locks").delete().eq("fingerprint", lockKey);
      const { error: retryError } = await sb.from("upload_locks").insert({
        fingerprint: lockKey,
        agent_phone: agentPhone,
      });
      if (retryError) {
        // Another concurrent caller grabbed it — we lose
        return { acquired: false, remainingSeconds: Math.ceil(UPLOAD_LOCK_DURATION_MS / 1000) };
      }
    }
  }

  return { acquired: true };
}

export interface ToolResult {
  success?: boolean;
  error?: string;
  needsInput?: boolean;
  question?: string;
  message?: string;
  data?: unknown;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Execute a tool call with analytics tracking
 */
export async function executeTool(
  tool: ToolCall,
  agent: Agent | null,
  supabaseUrl: string,
  supabaseKey: string,
  phoneNumber?: string
): Promise<ToolResult> {
  const timer = createTimer();

  logger.info("Tool execution started", {
    category: LogCategory.TOOL,
    toolName: tool.name,
    agentName: agent?.fullName,
  });

  try {
    let result: ToolResult;

    switch (tool.name) {
      case "createPropertyListing":
        result = await handleCreatePropertyListing(tool.arguments, agent, supabaseUrl, supabaseKey);
        // Track successful property upload
        if (result.success && phoneNumber) {
          trackPropertyUploaded(phoneNumber, agent?.id, {
            propertyType: tool.arguments.propertyType,
            location: tool.arguments.location,
          });
        }
        break;

      case "getZyprusData":
        result = await handleGetZyprusData(tool.arguments);
        break;

      case "calculateVAT":
        result = handleCalculateVAT(tool.arguments);
        break;

      case "calculateTransferFees":
        result = handleCalculateTransferFees(tool.arguments);
        break;

      case "calculateCapitalGains":
        result = handleCalculateCapitalGains(tool.arguments);
        break;

      case "getRegionalAgents":
        result = await handleGetRegionalAgents(tool.arguments);
        break;

      case "extractFromBazaraki":
        result = await handleExtractFromBazaraki(tool.arguments);
        break;

      case "sendEmail":
        result = await handleSendEmail(tool.arguments, agent, phoneNumber);
        // Track document sent via email
        if (result.success && phoneNumber && (tool.arguments.attachmentUrl || result.data?.attachedDocument)) {
          trackDocumentGenerated(phoneNumber, "email_with_document", agent?.id);
        }
        break;

      default:
        logger.warn("Unknown tool requested", {
          category: LogCategory.TOOL,
          toolName: tool.name,
        });
        return { error: `Unknown tool: ${tool.name}` };
    }

    // Track tool usage (fire-and-forget)
    if (phoneNumber) {
      trackToolUsed(phoneNumber, tool.name, timer.end(), agent?.id, {
        success: result.success ?? !result.error,
      });
    }

    return result;
  } catch (error) {
    // Track tool error
    if (phoneNumber) {
      trackToolUsed(phoneNumber, tool.name, timer.end(), agent?.id, {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (error instanceof RejectionError) {
      // RejectionError messages are already user-friendly
      return { error: error.message };
    }

    // Classify and log the error
    const errorObj = error instanceof Error ? error : new Error(String(error));
    const errorType = classifyError(errorObj);

    logger.error("Tool execution failed", errorObj, {
      category: LogCategory.TOOL,
      toolName: tool.name,
      errorType,
    });

    // Return user-friendly message
    const userMessage = getUserFriendlyMessage(errorType, `while ${tool.name}`);
    return { error: userMessage };
  }
}

/**
 * Handle property listing creation
 */
async function handleCreatePropertyListing(
  args: Record<string, unknown>,
  agent: Agent | null,
  supabaseUrl: string,
  supabaseKey: string
): Promise<ToolResult> {
  logger.info("Create property listing started", {
    category: LogCategory.TOOL,
    operation: "createPropertyListing",
    argsPreview: JSON.stringify(args).substring(0, 500),
  });

  // 1. Check if agent is identified
  if (!agent) {
    logger.warn("Listing creation blocked - no agent identified", {
      category: LogCategory.TOOL,
      operation: "createPropertyListing",
    });
    return handleUnknownSender();
  }

  logger.info("Agent identified for listing creation", {
    category: LogCategory.TOOL,
    operation: "createPropertyListing",
    agentName: agent.fullName,
    agentRegion: agent.region,
  });

  // 1.5 CRITICAL: Acquire DB-based upload lock to prevent duplicate uploads
  // Uses property fingerprint (agent+location+price+owner) so different properties can upload in parallel
  // DB lock is atomic — only ONE concurrent Edge Function invocation wins
  const agentPhone = agent.mobile?.replace(/\D/g, "") || "";
  // Per-agent lock (not per-property) — prevents race conditions where parallel AI calls
  // generate slightly different location names and bypass the fingerprint-based lock
  const propertyLockKey = `upload:${agentPhone}`;
  const lockResult = await acquireUploadLock(propertyLockKey, agentPhone);
  if (!lockResult.acquired) {
    logger.warn("Upload blocked by DB lock - duplicate upload in progress", {
      category: LogCategory.TOOL,
      operation: "createPropertyListing",
      agentName: agent.fullName,
      remainingSeconds: lockResult.remainingSeconds,
    });
    return {
      needsInput: true,
      question: `I'm already processing an upload for this property. Please wait ${lockResult.remainingSeconds} seconds before trying again.`,
    };
  }

  // 1.6 Check listing_uploads for recent duplicates (informational only - never blocks)
  let potentialDuplicateNote = "";

  const sb = createClient(supabaseUrl, supabaseKey);

  {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: recentUploads } = await sb
      .from("listing_uploads")
      .select("id, property_title, created_at, zyprus_listing_id")
      .eq("agent_phone", agentPhone)
      .gte("created_at", twoHoursAgo)
      .order("created_at", { ascending: false })
      .limit(5);

    if (recentUploads && recentUploads.length > 0) {
      const locationLower = (args.location as string || "").toLowerCase();
      const match = recentUploads.find((p: Record<string, unknown>) =>
        locationLower && (p.property_title as string || "").toLowerCase().includes(locationLower)
      );
      if (match) {
        potentialDuplicateNote = `POTENTIAL DUPLICATE - similar listing exists: ${match.property_title} (${match.zyprus_listing_id})`;
        logger.warn("Potential duplicate detected - proceeding with upload anyway", {
          category: LogCategory.TOOL,
          operation: "createPropertyListing",
          existingId: match.zyprus_listing_id,
          existingTitle: match.property_title,
          agentPhone,
        });
      }
    }
  }

  // 2. Validate required fields
  const validation = validateRequiredFields(args);
  if (!validation.valid) {
    return {
      needsInput: true,
      question: getMissingFieldsMessage(validation.missing),
    };
  }

  let location = args.location as string;
  const listingType = args.listingType as "sale" | "rent";
  const locationUrl = args.locationUrl as string | undefined;

  // 2.5 CRITICAL: Correct street addresses to area names
  // AI sometimes passes street names (e.g., "Apostolou Pavlou Ave, Paphos" or "Michali Sougioul, Limassol")
  // instead of area names (e.g., "Kato Paphos, Paphos"). Detect this and fix using the Google Maps URL.
  const streetDetected = isStreetAddress(location) ||
    // Cross-reference with Google Maps URL: if the /place/ path contains the AI's location
    // name alongside a house number, it's a street name (e.g., "Michali Sougioul 21, Lemesos")
    (locationUrl ? isLocationAStreetInUrl(location, locationUrl) : false);

  if (streetDetected && locationUrl) {
    const areaFromUrl = extractAreaFromGoogleMapsUrl(locationUrl);
    if (areaFromUrl) {
      logger.warn("Location corrected: AI passed street address, extracted area from Google Maps URL", {
        category: LogCategory.TOOL,
        operation: "createPropertyListing",
        originalLocation: location,
        correctedLocation: areaFromUrl,
        googleMapsUrl: locationUrl.substring(0, 100),
      });
      location = areaFromUrl;
    } else {
      // Could not extract a specific area — ask the agent
      logger.warn("Location appears to be a street address, asking agent for area name", {
        category: LogCategory.TOOL,
        operation: "createPropertyListing",
        location,
        googleMapsUrl: locationUrl.substring(0, 100),
      });
      return {
        needsInput: true,
        question: `I've captured the pin location from the Google Maps link, but "${location}" appears to be a street name. What is the area/neighborhood? (e.g., Agios Athanasios, Kato Paphos, Germasogeia, Mesa Geitonia)`,
      };
    }
  } else if (streetDetected && !locationUrl) {
    // Street name without a Google Maps URL — ask for proper area
    logger.warn("Location appears to be a street address with no Google Maps URL to extract area from", {
      category: LogCategory.TOOL,
      operation: "createPropertyListing",
      location,
    });
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
      operation: "createPropertyListing",
      location,
    });
    return {
      needsInput: true,
      question: `"${location}" is too general — I need the specific area or neighborhood name (e.g., Agios Athanasios, Kato Paphos, Germasogeia, Mesa Geitonia). What is the exact area/neighborhood for this property?`,
    };
  }

  // 3. Validate regional access
  const regionResult = validateRegionalAccess(agent, location);
  if (!regionResult.allowed) {
    return { error: regionResult.message };
  }

  const propertyRegion = regionResult.propertyRegion || determineRegion(location) || agent.region;

  // 4. Handle special cases
  const specialCase = await handleSpecialCases(
    agent,
    {
      listingType,
      location,
      assignTo: args.assignTo as string | undefined,
    },
    propertyRegion,
    supabaseUrl,
    supabaseKey
  );

  if (specialCase.rejected) {
    return { error: specialCase.message };
  }

  if (specialCase.needsInput) {
    return { needsInput: true, question: specialCase.question };
  }

  // 5. Check if management needs to specify assignment
  if (needsAssignmentInput(agent, listingType) && !args.assignTo) {
    return {
      needsInput: true,
      question: "To whom would you like me to assign this property as the listing owner?",
    };
  }

  // 5.1 SECURITY: Only management agents can use assignTo — strip it for regular agents
  // This prevents the AI from hallucinating assignments (e.g., "lysandros@zyprus.com" for a Paphos property)
  if (args.assignTo && agent.role !== "management") {
    logger.warn("Stripped assignTo from non-management agent — only management can assign", {
      category: LogCategory.TOOL,
      operation: "createPropertyListing",
      agentRole: agent.role,
      agentEmail: agent.communicationEmail,
      attemptedAssignTo: args.assignTo,
    });
    args.assignTo = undefined;
  }

  // 5.2 SECURITY: Validate assignTo is a @zyprus.com email (exact domain match to prevent subdomain bypass)
  if (args.assignTo) {
    const assignToEmail = (args.assignTo as string).toLowerCase().trim();
    const emailParts = assignToEmail.split("@");
    // Must have exactly one @ and domain must be exactly zyprus.com (not a subdomain)
    if (emailParts.length !== 2 || emailParts[1] !== "zyprus.com") {
      return {
        error: "Assignments must be to a @zyprus.com email address.",
      };
    }
    // Verify the email exists as an agent in the database OR is a known regional office email
    const isRegionalOffice = Object.values(REGIONAL_EMAILS).includes(assignToEmail);
    if (!isRegionalOffice) {
      const assigneeAgent = await getAgentByEmail(assignToEmail, supabaseUrl, supabaseKey);
      if (!assigneeAgent) {
        logger.warn("assignTo email not found in agents database — stripping", {
          category: LogCategory.TOOL,
          operation: "createPropertyListing",
          assignToEmail,
        });
        args.assignTo = undefined;
      }
    } else {
      logger.info("assignTo is a regional office email — skipping agent DB check", {
        category: LogCategory.TOOL,
        operation: "createPropertyListing",
        assignToEmail,
      });
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
      const assignedAgent = await getAgentByEmail(
        reviewers.listingOwner,
        supabaseUrl,
        supabaseKey
      );
      if (assignedAgent) {
        listingOwnerName = assignedAgent.fullName;
        logger.info("Resolved listing owner name from assignTo", {
          category: LogCategory.TOOL,
          operation: "createPropertyListing",
          listingOwnerName,
          listingOwnerEmail: reviewers.listingOwner,
        });
      }
    } catch {
      // Non-critical — fall back to requesting agent name
    }
  }

  // 7. Process images (sync classification)
  // CRITICAL FIX: Fetch images from pending_images table instead of trusting AI-provided URLs
  // The AI often hallucinates fake URLs like "images.zyprus.com" or "i.ibb.co/xxx"
  // Real images are stored in Supabase Storage and tracked in pending_images table
  let imageUrls: string[] = [];

  if (agentPhone) {
    const pendingImages = await getPendingImages(agentPhone);
    logger.info("Retrieved pending images", {
      category: LogCategory.IMAGE,
      count: pendingImages.length,
    });

    // Merge pending images with any direct URLs from tool arguments
    // Filter out document URLs (DOCX, PDF) that AI might confuse as images
    const rawDirectUrls = (args.imageUrls as string[]) || [];
    const directUrls = rawDirectUrls.filter(url => {
      if (isDocumentUrl(url)) {
        logger.warn("Filtered out document URL from imageUrls", {
          category: LogCategory.IMAGE,
          operation: "createPropertyListing",
          urlPreview: url.substring(0, 100),
        });
        return false;
      }
      return true;
    });

    if (pendingImages.length > 0) {
      logger.info("Using images from pending_images table", {
        category: LogCategory.IMAGE,
        operation: "createPropertyListing",
        imageCount: pendingImages.length,
        source: "pending_images",
      });
      imageUrls = pendingImages;
    } else {
      // Fallback to AI-provided URLs only if no pending images found
      // Filter out obviously fake URLs (hallucinated by AI)
      imageUrls = directUrls.filter(url => {
        const isFake = url.includes("images.zyprus.com") ||
                       (url.includes("ibb.co") && !url.includes("i.ibb.co")) ||
                       url.includes("placeholder") ||
                       url.includes("example.com");
        if (isFake) {
          logger.warn("Filtered out fake/hallucinated URL", {
            category: LogCategory.IMAGE,
            operation: "createPropertyListing",
            urlPreview: url.substring(0, 100),
          });
        }
        return !isFake;
      });
      logger.info("No pending images - using AI-provided URLs", {
        category: LogCategory.IMAGE,
        operation: "createPropertyListing",
        imageCount: imageUrls.length,
        source: "ai",
      });
    }

    // Log total image count for debugging
    logger.info("Total images for upload", {
      category: LogCategory.IMAGE,
      pending: pendingImages.length,
      direct: directUrls.length,
      total: imageUrls.length,
    });
  } else {
    // Filter out document URLs using shared helper
    const rawUrls = (args.imageUrls as string[]) || [];
    imageUrls = rawUrls.filter(url => !isDocumentUrl(url));
    logger.info("No agent phone - using AI-provided URLs", {
      category: LogCategory.IMAGE,
      operation: "createPropertyListing",
      imageCount: imageUrls.length,
      source: "ai",
    });
  }

  // 7a. Split title deed images from gallery based on agent-identified indices
  const titleDeedImageIndices = (args.titleDeedImageIndices as number[]) || [];
  let titleDeedImageUrls: string[] = [];
  if (titleDeedImageIndices.length > 0 && imageUrls.length > 0) {
    const validIndices = new Set(
      titleDeedImageIndices.map(i => i - 1).filter(i => i >= 0 && i < imageUrls.length)
    );
    titleDeedImageUrls = imageUrls.filter((_, idx) => validIndices.has(idx));
    imageUrls = imageUrls.filter((_, idx) => !validIndices.has(idx));
    logger.info("Split title deed images from gallery", {
      category: LogCategory.IMAGE,
      operation: "createPropertyListing",
      titleDeedCount: titleDeedImageUrls.length,
      remainingGallery: imageUrls.length,
      indices: titleDeedImageIndices,
    });
  }

  // 7a.2 Floor plan images: move to END of gallery AND add to floorPlanUrls
  // Floor plans appear as last photos in the gallery AND in the dedicated floor plans section
  const floorPlanImageIndices = (args.floorPlanImageIndices as number[]) || [];
  let floorPlanImageUrls: string[] = [];
  if (floorPlanImageIndices.length > 0 && imageUrls.length > 0) {
    const validFloorPlanIndices = new Set(
      floorPlanImageIndices.map(i => i - 1).filter(i => i >= 0 && i < imageUrls.length)
    );
    floorPlanImageUrls = imageUrls.filter((_, idx) => validFloorPlanIndices.has(idx));
    // Move floor plans to end of gallery (not removed - they stay in gallery as last photos)
    const nonFloorPlan = imageUrls.filter((_, idx) => !validFloorPlanIndices.has(idx));
    imageUrls = [...nonFloorPlan, ...floorPlanImageUrls];
    logger.info("Floor plans moved to end of gallery and added to floor plan section", {
      category: LogCategory.IMAGE,
      operation: "createPropertyListing",
      floorPlanCount: floorPlanImageUrls.length,
      totalGallery: imageUrls.length,
      indices: floorPlanImageIndices,
    });
  }

  // 7a.3 Apply agent-specified photo ordering (if provided)
  const imageOrder = (args.imageOrder as number[]) || [];
  if (imageOrder.length > 0 && imageUrls.length > 0) {
    const reordered: string[] = [];
    const usedIndices = new Set<number>();
    for (const idx of imageOrder) {
      const zeroIdx = idx - 1; // Convert 1-based to 0-based
      if (zeroIdx >= 0 && zeroIdx < imageUrls.length && !usedIndices.has(zeroIdx)) {
        reordered.push(imageUrls[zeroIdx]);
        usedIndices.add(zeroIdx);
      }
    }
    // Append any images not included in the ordering (don't lose photos)
    for (let i = 0; i < imageUrls.length; i++) {
      if (!usedIndices.has(i)) {
        reordered.push(imageUrls[i]);
      }
    }
    imageUrls = reordered;
    logger.info("Photos reordered per agent classification", {
      category: LogCategory.IMAGE,
      operation: "createPropertyListing",
      orderProvided: imageOrder.length,
      totalImages: imageUrls.length,
    });
  }

  // 7b. Retrieve pending documents (title deeds, PDFs sent via WhatsApp)
  let titleDeedFileUrls: string[] = [...titleDeedImageUrls];
  if (agentPhone) {
    const pendingDocs = await getPendingDocuments(agentPhone);
    if (pendingDocs.length > 0) {
      titleDeedFileUrls = [...titleDeedFileUrls, ...pendingDocs.map(d => d.document_url)];
      logger.info("Retrieved pending documents for upload", {
        category: LogCategory.GENERAL,
        operation: "createPropertyListing",
        documentCount: pendingDocs.length,
        filenames: pendingDocs.map(d => d.filename).filter(Boolean),
      });
    }
  }
  // Also include any document URLs the AI explicitly passed
  const aiTitleDeedUrls = (args.titleDeedFileUrls as string[]) || [];
  if (aiTitleDeedUrls.length > 0) {
    titleDeedFileUrls = [...titleDeedFileUrls, ...aiTitleDeedUrls];
  }

  const processedImages = await processImages(imageUrls);

  // Check minimum images (sync)
  const imageCheck = hasEnoughImages(processedImages, args.propertyType as string);
  if (!imageCheck.enough) {
    return {
      needsInput: true,
      question: `I need at least ${imageCheck.required} ${imageCheck.required === 1 ? "image" : "images"} for a ${args.propertyType}. You've provided ${imageCheck.provided}. Please send more photos.`,
    };
  }

  // 8. Get token once, then run operations in PARALLEL for performance
  logger.info("Getting Zyprus config and token", {
    category: LogCategory.ZYPRUS,
    operation: "createPropertyListing",
  });
  let config;
  let token;
  try {
    config = getZyprusConfig();
    token = await getAccessToken(config);
    logger.info("Got Zyprus access token successfully", {
      category: LogCategory.ZYPRUS,
      operation: "createPropertyListing",
    });
  } catch (tokenError) {
    const err = tokenError instanceof Error ? tokenError : new Error(String(tokenError));
    logger.error("Failed to get Zyprus token", err, {
      category: LogCategory.ZYPRUS,
      operation: "createPropertyListing",
    });
    return { error: `Failed to authenticate with Zyprus API: ${err.message}` };
  }

  const [
    imageValidation,
    duplicates,
    locationResult,
  ] = await Promise.all([
    // Validate images are accessible
    validateImages(processedImages),
    // Check for duplicates
    checkForDuplicates(
      args.ownerPhone as string,
      args.ownerName as string,
      location,
      config.apiUrl,
      token
    ),
    // Find taxonomy UUIDs — returns { uuid, matchedName, district }
    findLocationUuid(location),
  ]);

  const locationUuid = locationResult.uuid;

  // CRITICAL: ALWAYS use the agent's original location name for title/description.
  // The taxonomy UUID is ONLY for the Zyprus API dropdown field.
  // Never override the agent's location — "Mesa Chorio, Paphos" must stay "Mesa Chorio, Paphos"
  // even if the taxonomy resolver mapped it to "Kato Paphos" for the UUID.
  const descriptionLocation = location;

  // Log when taxonomy resolved to a different name (for debugging, NOT for overriding)
  if (locationResult.matchedName && locationResult.matchedName.toLowerCase() !== location.toLowerCase()) {
    logger.info("Taxonomy resolved to different name (UUID only, location text unchanged)", {
      category: LogCategory.TOOL,
      operation: "createPropertyListing",
      agentLocation: location,
      taxonomyMatch: locationResult.matchedName,
    });
  }

  const { valid: validImages, invalid: invalidImages } = imageValidation;
  if (invalidImages.length > 0) {
    logger.warn("Images failed validation", {
      category: LogCategory.IMAGE,
      operation: "createPropertyListing",
      invalidCount: invalidImages.length,
    });
  }

  // 9a. locationUrl already captured in step 2.5 above

  // 9a.5 Build AI message content (for My Notes - includes how listing was created)
  const aiMessageParts: string[] = [];
  if (duplicates.isDuplicate) {
    aiMessageParts.push(generateDuplicateWarning(duplicates.potentialMatches));
  }
  if (args.specialNotes) {
    aiMessageParts.push(`Agent notes: ${args.specialNotes}`);
  }
  // Note taxonomy mismatch in AI notes for reviewer awareness (UUID only, text unchanged)
  if (locationResult.matchedName && locationResult.matchedName.toLowerCase() !== location.toLowerCase()) {
    aiMessageParts.push(`Zyprus location dropdown: "${locationResult.matchedName}" (closest match for "${location}")`);
  }
  const aiMessageContent: string | null = aiMessageParts.length > 0 ? aiMessageParts.join("\n") : null;

  // 9b. Resolve coordinates — from args, from Google Maps URL, or from defaults
  const resolvedCoordinates = (args.coordinates as { lat: number; lon: number } | undefined) ||
    // Try to parse coordinates from Google Maps URL (e.g., @34.828,32.401)
    (() => {
      if (locationUrl) {
        const atMatch = locationUrl.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
        if (atMatch) {
          return { lat: parseFloat(atMatch[1]), lon: parseFloat(atMatch[2]) };
        }
        // Also try "place/lat,lon" format
        const placeMatch = locationUrl.match(/place\/(-?\d+\.?\d*),(-?\d+\.?\d*)/);
        if (placeMatch) {
          return { lat: parseFloat(placeMatch[1]), lon: parseFloat(placeMatch[2]) };
        }
      }
      return undefined;
    })() ||
    // Fallback: use default coordinates based on location name
    (() => {
      const locationLower = location.toLowerCase();
      let bestMatch: { key: string; coords: { lat: number; lon: number } } | null = null;

      for (const [key, coords] of Object.entries(DEFAULT_COORDINATES)) {
        if (locationLower.includes(key)) {
          if (!bestMatch || key.length > bestMatch.key.length) {
            bestMatch = { key, coords };
          }
        }
      }

      if (bestMatch) {
        logger.info("Using default coordinates for location", {
          category: LogCategory.TOOL,
          operation: "createPropertyListing",
          locationKey: bestMatch.key,
          lat: bestMatch.coords.lat,
          lon: bestMatch.coords.lon,
        });
        return bestMatch.coords;
      }
      return undefined;
    })();

  // 9b. CRITICAL: Check we have at least 1 valid image AFTER validation
  // Zyprus API requires field_gallery_ to have at least 1 image
  if (validImages.length === 0) {
    const invalidDetails = invalidImages.length > 0
      ? invalidImages.slice(0, 3).map((img) => `• ${img.error}`).join('\n')
      : "";

    logger.error("No valid images after validation", undefined, {
      category: LogCategory.IMAGE,
      operation: "createPropertyListing",
      invalidCount: invalidImages.length,
    });

    return {
      error: `None of the images could be uploaded.\n\n` +
        (invalidDetails ? `Issues:\n${invalidDetails}\n\n` : "") +
        `Please send photos directly from your phone gallery, or use direct image URLs.`,
    };
  }

  // 9c. VAT SAFEGUARD: AI frequently hallucates plus_vat when agent never mentioned VAT.
  // Business rule: plus_vat ONLY applies to new builds where agent explicitly said +VAT.
  // If AI passed plus_vat but isNewBuild is not true, force to no_vat.
  let safePriceModifier = args.priceModifier as string | undefined;
  if (safePriceModifier === "plus_vat" && !args.isNewBuild) {
    logger.warn("VAT safeguard: AI set plus_vat without isNewBuild=true — overriding to no_vat", {
      category: LogCategory.TOOL,
      operation: "createPropertyListing",
      originalModifier: safePriceModifier,
      isNewBuild: args.isNewBuild,
    });
    safePriceModifier = "no_vat";
  }

  // 9d. Auto-inject "roof garden" for penthouses with uncovered veranda (Issue #5 fix)
  // Penthouses with uncoveredVeranda > 0 should always have "roof garden" in features
  const propertyTypeLower = (args.propertyType as string || "").toLowerCase();
  const effectiveFeatures = [...((args.features as string[]) || [])];
  if (propertyTypeLower.includes("penthouse") && (args.uncoveredVeranda as number) > 0) {
    const hasRoofGarden = effectiveFeatures.some(
      f => f.toLowerCase().includes("roof garden") || f.toLowerCase().includes("roof terrace")
    );
    if (!hasRoofGarden) {
      effectiveFeatures.push("roof garden");
      logger.info("Auto-injected 'roof garden' into features for penthouse with uncoveredVeranda", {
        category: LogCategory.TOOL,
        operation: "createPropertyListing",
        uncoveredVeranda: args.uncoveredVeranda,
      });
    }
  }

  // 9e. Auto-inject correct pool feature based on poolType (don't rely on AI)
  // SAFEGUARD: If specialNotes mentions "provisions for pool" but AI set poolType to "private",
  // auto-correct to "provisions" — the agent explicitly said there's NO pool, just provisions
  let poolType = args.poolType as string | undefined;
  const specialNotesLower = ((args.specialNotes as string) || "").toLowerCase();
  if (poolType === "private" && (
    specialNotesLower.includes("provision") && specialNotesLower.includes("pool")
  )) {
    logger.warn("Pool safeguard: specialNotes mentions 'provisions for pool' but poolType=private — correcting to provisions", {
      category: LogCategory.TOOL,
      operation: "createPropertyListing",
    });
    poolType = "provisions";
  }
  // Remove any generic "pool"/"swimming pool" from features, then inject the correct one
  if (poolType) {
    // Remove any pool-related features the AI might have added incorrectly
    const poolKeywords = ["pool", "swimming pool", "private pool", "communal pool", "provisions for pool", "provisions for swimming pool"];
    const nonPoolFeatures = effectiveFeatures.filter(
      f => !poolKeywords.some(kw => f.toLowerCase() === kw || f.toLowerCase().includes(kw))
    );
    effectiveFeatures.length = 0;
    effectiveFeatures.push(...nonPoolFeatures);

    // Inject the correct pool feature
    switch (poolType) {
      case "private":
        effectiveFeatures.push("private pool");
        break;
      case "communal":
        effectiveFeatures.push("communal pool");
        break;
      case "provisions":
        effectiveFeatures.push("provisions for swimming pool");
        break;
    }
    logger.info("Auto-injected pool feature based on poolType", {
      category: LogCategory.TOOL,
      operation: "createPropertyListing",
      poolType,
    });
  }

  // 10. Generate description
  // For residential buildings, don't default bathrooms to 1 — leave as 0 if not provided
  const isBuilding = propertyTypeLower.includes("building");
  const bathrooms = isBuilding
    ? (args.bathrooms as number) || 0
    : (args.bathrooms as number) || 1;

  // descriptionLocation always equals agent's original location (never overridden by taxonomy)

  const description = generateDescription({
    type: args.propertyType as string,
    listingType,
    bedrooms: args.bedrooms as number,
    bathrooms,
    location: descriptionLocation,
    titleDeedStatus: args.titleDeedStatus as string,
    coveredArea: args.coveredArea as number,
    plotSize: args.plotSize as number | undefined,
    coveredVeranda: args.coveredVeranda as number | undefined,
    uncoveredVeranda: args.uncoveredVeranda as number | undefined,
    features: effectiveFeatures.length > 0 ? effectiveFeatures : undefined,
    price: args.price as number,
    yearBuilt: args.yearBuilt as number | undefined,
    yearRenovated: args.yearRenovated as number | undefined,
    floor: args.floor as string | undefined,
    areaDescription: args.areaDescription as string | undefined,
    condition: args.condition as string | undefined,
    orientation: args.orientation as string | undefined,
    basementRooms: args.basementRooms as number | undefined,
    roofRooms: args.roofRooms as number | undefined,
    parking: args.parkingType as string | undefined,
    poolType: poolType as "private" | "communal" | "provisions" | undefined,
    priceModifier: safePriceModifier,
    unitBreakdown: args.unitBreakdown as string | undefined,
    isNewBuild: args.isNewBuild as boolean | undefined,
    structureDescription: args.structureDescription as string | undefined,
  });

  // 11. Generate My Notes (with listing owner, reviewer, AI message - all in one place)
  const myNotes = generateMyNotes(
    {
      name: args.ownerName as string,
      phone: args.ownerPhone as string,
      email: args.ownerEmail as string | undefined,
      specialNotes: args.specialNotes as string | undefined,
    },
    agent,
    {
      duplicateWarning: potentialDuplicateNote || (duplicates.isDuplicate ? createDuplicateNote(duplicates.potentialMatches) : undefined),
      locationUrl,
      coordinates: resolvedCoordinates,
      listingOwner: reviewers.listingOwner,
      listingOwnerName,
      reviewer1: reviewers.reviewer1,
      reviewer2: reviewers.reviewer2 || undefined,
      // NEW: Pass AI message, listing type, property type, and features to My Notes
      aiMessage: aiMessageContent || undefined,
      listingType,
      propertyType: args.propertyType as string,
      keyFeatures: args.features as string[] | undefined,
      registrationNumber: args.registrationNumber as string | undefined,
    }
  );

  // DEBUG: Log My Notes to verify no "SOPHIA AI"
  logger.debug("My Notes generated", {
    category: LogCategory.TOOL,
    operation: "createPropertyListing",
    notesPreview: myNotes.substring(0, 200),
    containsSophiaAI: myNotes.toLowerCase().includes("sophia ai"),
  });

  // 12. Generate AI Notes (separate field for AI understanding)
  const aiNotes = generateAIAssistantNotes(
    `${listingType === "rent" ? "Rental" : "Sale"} listing from WhatsApp`,
    args.propertyType as string,
    effectiveFeatures,
    args.specialNotes as string | undefined,
    locationUrl, // Google Maps link
    resolvedCoordinates, // Fallback coordinates
  );

  // 13. Create the listing
  logger.info("Creating draft listing", {
    category: LogCategory.ZYPRUS,
    operation: "createPropertyListing",
    propertyType: args.propertyType as string,
    location,
    price: args.price as number,
    imageCount: validImages.length,
  });
  let result;
  try {
    result = await createDraftListing({
    listingType,
    propertyType: args.propertyType as string,
    price: args.price as number,
    location,
    locationUuid, // May be empty if no appropriate location found in Zyprus (e.g., non-Nicosia districts)
    bedrooms: args.bedrooms as number,
    bathrooms,
    coveredArea: args.coveredArea as number,
    plotSize: args.plotSize as number | undefined,
    coveredVeranda: args.coveredVeranda as number | undefined,
    uncoveredVeranda: args.uncoveredVeranda as number | undefined,
    description,
    myNotes,
    aiNotes,
    images: validImages.map((img) => img.url),
    reviewer1: reviewers.reviewer1,
    reviewer2: reviewers.reviewer2,
    listingOwner: reviewers.listingOwner,
    listingInstructor: reviewers.listingInstructor,
    features: effectiveFeatures.length > 0 ? effectiveFeatures : undefined,
    titleDeedStatus: args.titleDeedStatus as string,
    yearBuilt: args.yearBuilt as number | undefined,
    floor: args.floor as string | undefined,
    potentialDuplicate: duplicates.isDuplicate || !!potentialDuplicateNote,
    aiMessage: aiMessageContent,
    // New fields (Feb 2026)
    priceNegotiable: args.priceNegotiable as boolean | undefined,
    isNewBuild: args.isNewBuild as boolean | undefined,
    parkingType: args.parkingType as "covered" | "open" | "garage" | "carport" | "none" | undefined,
    priceModifier: safePriceModifier as "no_vat" | "plus_vat" | "vat_included" | undefined,
    floorPlanUrls: [
      ...(floorPlanImageUrls || []),
      ...((args.floorPlanUrls as string[]) || []),
    ].length > 0 ? [
      ...(floorPlanImageUrls || []),
      ...((args.floorPlanUrls as string[]) || []),
    ] : undefined,
    titleDeedFileUrls: titleDeedFileUrls.length > 0 ? titleDeedFileUrls : undefined,
    // For Own Reference ID: Owner - {Listing Owner} - {Building} - {Seller} - {Phone} - {Email}
    agentName: listingOwnerName,
    ownerName: args.ownerName as string,
    ownerPhone: args.ownerPhone as string,
    ownerEmail: args.ownerEmail as string | undefined,
    registrationNumber: args.registrationNumber as string | undefined,
    buildingName: args.buildingName as string | undefined,
    energyClass: args.energyClass as string | undefined,
    coordinates: resolvedCoordinates,
    });
    logger.info("Draft listing created successfully", {
      category: LogCategory.ZYPRUS,
      operation: "createPropertyListing",
      listingId: result.listingId,
      listingUrl: result.listingUrl,
    });

    // CRITICAL: Clear pending images and documents after successful upload
    // This prevents the same files from being used in the next listing
    // Use agentPhone (cleaned format) to match how files were stored
    await clearPendingImages(agentPhone);
    await clearPendingDocuments(agentPhone);
    logger.info("Cleared pending images and documents after successful upload", {
      category: LogCategory.IMAGE,
    });

    // Track listing for publication notification (non-blocking, fire-and-forget)
    const propertyTitle = `${args.bedrooms} bed ${args.propertyType} in ${location}`;
    trackListingUpload(
      result.listingId,
      agentPhone,
      agent.fullName,
      propertyTitle,
      result.listingUrl,
    ).catch(() => {}); // Swallow errors — tracking is non-critical
  } catch (createError) {
    const err = createError instanceof Error ? createError : new Error(String(createError));
    const errorType = classifyError(err);

    logger.error("Failed to create draft listing", err, {
      category: LogCategory.ZYPRUS,
      operation: "createPropertyListing",
      errorType,
      errorMessage: err.message,
    });

    // User-friendly message based on error type
    if (errorType === ErrorType.NETWORK || errorType === ErrorType.TIMEOUT) {
      return { error: "The property listing service is temporarily slow. Please try again in a moment." };
    } else if (errorType === ErrorType.AUTH) {
      return { error: "There's a configuration issue with the property system. Please contact support." };
    } else {
      // Include truncated error detail for debugging (visible in edge function logs)
      const detail = err.message.length > 200 ? err.message.substring(0, 200) + "..." : err.message;
      return { error: `Unable to create the listing: ${detail}` };
    }
  }

  // 14. Build success message
  let message = `✅ I've uploaded the property as a draft listing.\n\n`;
  message += `**Summary:**\n`;
  message += `• Property: ${args.bedrooms} bed ${args.propertyType} in ${location}\n`;
  message += `• Price: €${(args.price as number).toLocaleString()}\n`;
  message += `• Type: For ${listingType}\n`;
  message += `• Images: ${validImages.length} uploaded\n`;
  if (titleDeedFileUrls.length > 0) {
    message += `• Title deed documents: ${titleDeedFileUrls.length} attached\n`;
  }
  message += `• Assigned to: ${reviewers.listingOwner}\n`;
  message += `• Reviewer: ${reviewers.reviewer1}\n`;
  message += `\n🔗 **Draft URL:** ${result.listingUrl}\n`;

  // Add Google Maps link to response (copy of what's in My Notes)
  if (locationUrl) {
    message += `\n📍 **Google Maps:** ${locationUrl}\n`;
  } else if (resolvedCoordinates) {
    const mapsUrl = `https://www.google.com/maps/place/${resolvedCoordinates.lat},${resolvedCoordinates.lon}`;
    message += `\n📍 **Google Maps:** ${mapsUrl}\n`;
  }

  // Add warnings
  const imageWarnings = generateImageWarnings(validImages);
  if (imageWarnings) {
    message += `\n${imageWarnings}\n`;
  }

  if (duplicates.isDuplicate) {
    message += `\n⚠️ This has been flagged as a potential duplicate. The reviewer will verify before publishing.\n`;
  }

  message += `\nThe property will appear in the system once reviewed. Is there anything else you need?`;

  return {
    success: true,
    message,
    data: {
      listingId: result.listingId,
      listingUrl: result.listingUrl,
    },
  };
}

/**
 * Handle listing available agents in a region (for management assignment)
 */
async function handleGetRegionalAgents(
  args: Record<string, unknown>
): Promise<ToolResult> {
  const region = args.region as string;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const agents = await getAgentsByRegion(region, supabaseUrl, supabaseKey);

    if (agents.length === 0) {
      return {
        success: true,
        data: { message: `No agents found in ${region} region.`, agents: [] },
      };
    }

    const agentList = agents.map((a) => ({
      name: a.fullName,
      email: a.listingOwnerEmail || a.communicationEmail,
      role: a.role,
    }));

    return {
      success: true,
      data: {
        message: `Found ${agentList.length} agent(s) in ${region}:`,
        agents: agentList,
      },
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Failed to get regional agents", err, { category: LogCategory.TOOL });
    return { error: `Failed to retrieve agents for ${region}` };
  }
}

/**
 * Handle Bazaraki link extraction
 */
async function handleExtractFromBazaraki(
  args: Record<string, unknown>
): Promise<ToolResult> {
  const url = args.url as string;

  if (!url || !isBazarakiUrl(url)) {
    return { error: "Please provide a valid Bazaraki URL (bazaraki.com or bazaraki.cy)" };
  }

  try {
    const listing = await extractBazarakiListing(url);
    const summary = formatBazarakiSummary(listing);

    return {
      success: true,
      message: summary,
      data: {
        ...listing,
        // Pass extracted data so AI can pre-fill createPropertyListing
        extractedFields: {
          listingType: listing.listingType,
          propertyType: listing.propertyType,
          price: listing.price,
          location: listing.location,
          bedrooms: listing.bedrooms,
          bathrooms: listing.bathrooms,
          coveredArea: listing.coveredArea,
          plotSize: listing.plotSize,
          imageUrls: listing.imageUrls,
        },
      },
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Bazaraki extraction failed", err, { category: LogCategory.TOOL });
    return {
      error: "I couldn't extract details from that Bazaraki link. Could you please provide the property details directly?",
    };
  }
}

/**
 * Handle Zyprus data retrieval
 */
async function handleGetZyprusData(
  args: Record<string, unknown>
): Promise<ToolResult> {
  const dataType = args.dataType as string;
  const region = args.region as string | undefined;

  try {
    const taxonomy = await loadTaxonomy();

    switch (dataType) {
      case "locations":
        if (region) {
          const locations = await getLocationsByRegion(region);
          return {
            success: true,
            data: locations.map((l) => l.name),
          };
        }
        return {
          success: true,
          data: taxonomy.locations.slice(0, 50).map((l) => l.name),
        };

      case "property_types":
        return {
          success: true,
          data: taxonomy.propertyTypes.map((p) => p.name),
        };

      case "features":
        const allFeatures = [
          ...taxonomy.features,
          ...taxonomy.indoorFeatures,
          ...taxonomy.outdoorFeatures,
        ];
        return {
          success: true,
          data: allFeatures.map((f) => f.name),
        };

      case "listing_types":
        return {
          success: true,
          data: taxonomy.listingTypes.map((l) => l.name),
        };

      default:
        logger.warn("Unknown data type requested", {
          category: LogCategory.ZYPRUS,
          operation: "getZyprusData",
          dataType,
        });
        return { error: `Unknown data type: ${dataType}` };
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Failed to retrieve Zyprus data", err, {
      category: LogCategory.ZYPRUS,
      operation: "getZyprusData",
      dataType,
    });
    return { error: "Failed to retrieve Zyprus data" };
  }
}

/**
 * Calculate VAT - NEW POLICY (From 31 October 2023)
 *
 * For primary residence (EU buyers):
 * - Max floor area for reduced rate: 130 m²
 * - Max value for reduced rate: €350,000
 * - Total price cannot exceed €475,000
 * - Total area cannot exceed 190 m²
 *
 * Formula:
 * areaRatio = min(130, totalArea) / totalArea
 * reducedValueBase = areaRatio * min(price, €350,000)
 * VAT at 5% = reducedValueBase * 0.05
 * VAT at 19% = (price - reducedValueBase) * 0.19
 */
function handleCalculateVAT(args: Record<string, unknown>): ToolResult {
  const price = args.price as number;
  const area = (args.area as number) || 0;
  // Default to primary residence (true) - most VAT calculations are for primary residence
  const isPrimaryResidence = args.isPrimaryResidence !== false;

  // Check if eligible for reduced rate
  const isEligible = isPrimaryResidence &&
    price <= 475000 &&
    area > 0 &&
    area <= 190;

  if (!isEligible) {
    // Standard 19% VAT on full price
    const vat = price * 0.19;

    let reason = "";
    if (!isPrimaryResidence) {
      reason = "Not primary residence - standard rate applies";
    } else if (price > 475000) {
      reason = "Price exceeds €475,000 limit - standard rate applies";
    } else if (area > 190) {
      reason = "Area exceeds 190m² limit - standard rate applies";
    } else if (area === 0) {
      reason = "Area not provided - standard rate applies";
    }

    const formatCurrency = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return {
      success: true,
      message: `VAT Calculation:\n\n` +
        `Property Price: €${price.toLocaleString()}\n` +
        `VAT Rate: 19%\n` +
        `*VAT Amount: €${formatCurrency(vat)}*\n\n` +
        `${reason}\n\n` +
        `_This calculation is indicative only. Please consult a tax advisor for exact figures._`,
      data: { vat, rate: "19%", eligible: false },
    };
  }

  // Calculate with area ratio (NEW POLICY)
  const areaRatio = Math.min(130, area) / area;
  const reducedValueBase = areaRatio * Math.min(price, 350000);
  const vatAt5 = reducedValueBase * 0.05;
  const vatAt19 = (price - reducedValueBase) * 0.19;
  const totalVat = vatAt5 + vatAt19;

  // Format numbers with 2 decimal places
  const formatCurrency = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return {
    success: true,
    message: `VAT Calculation (Primary Residence):\n\n` +
      `Property Price: €${price.toLocaleString()}\n` +
      `Property Area: ${area}m²\n\n` +
      `Area Ratio: ${(areaRatio * 100).toFixed(2)}% (130m² ÷ ${area}m²)\n` +
      `Reduced Value Base: €${formatCurrency(reducedValueBase)}\n\n` +
      `VAT at 5%: €${formatCurrency(vatAt5)}\n` +
      `VAT at 19%: €${formatCurrency(vatAt19)}\n` +
      `*Total VAT: €${formatCurrency(totalVat)}*\n\n` +
      `_This calculation is indicative only. Please consult a tax advisor for exact figures._`,
    data: {
      vat: totalVat,
      vatAt5,
      vatAt19,
      areaRatio,
      reducedValueBase,
      eligible: true,
    },
  };
}

/**
 * Calculate transfer fees using Cyprus progressive bands
 * Bands: 3% up to €85k, 5% €85k-€170k, 8% above €170k
 */
function calculateBandedFee(amount: number): number {
  if (amount <= 85000) {
    return amount * 0.03;
  } else if (amount <= 170000) {
    return 85000 * 0.03 + (amount - 85000) * 0.05;
  } else {
    return 85000 * 0.03 + 85000 * 0.05 + (amount - 170000) * 0.08;
  }
}

/**
 * Calculate Transfer Fees
 * Joint names: price is split equally between 2 buyers, each taxed separately
 * This results in lower total fees due to progressive rate bands
 */
function handleCalculateTransferFees(args: Record<string, unknown>): ToolResult {
  const price = args.price as number;
  const jointNames = args.jointNames as boolean;
  const isFirstProperty = args.isFirstProperty as boolean;
  const hasVAT = args.hasVAT as boolean;

  // No transfer fees if VAT applies
  if (hasVAT) {
    return {
      success: true,
      message: "No transfer fees apply when VAT is paid on the property.",
      data: { fee: 0, note: "VAT property - no transfer fees" },
    };
  }

  let fee: number;
  let perPersonFee: number | undefined;

  if (jointNames) {
    // Joint names: split price between 2 buyers, calculate each separately
    const halfPrice = price / 2;
    perPersonFee = calculateBandedFee(halfPrice);
    fee = perPersonFee * 2;
  } else {
    fee = calculateBandedFee(price);
  }

  const baseFee = fee;

  // 50% discount always applies (contract deposited at Dept of Lands & Surveys - standard practice)
  fee = fee * 0.5;
  if (perPersonFee !== undefined) {
    perPersonFee = perPersonFee * 0.5;
  }

  const formatCurrency = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  let message = `Transfer Fees for €${price.toLocaleString()}`;
  if (jointNames) message += ` (Joint Names)`;
  message += `:\n\n`;

  message += `*Total Transfer Fees: €${formatCurrency(fee)}*\n\n`;
  message += `_This calculation is indicative only. Please consult a lawyer for exact figures._`;

  return {
    success: true,
    message,
    data: { fee, baseFee, jointNames: !!jointNames, isFirstProperty, perPersonFee },
  };
}

/**
 * Calculate Capital Gains Tax
 */
function handleCalculateCapitalGains(args: Record<string, unknown>): ToolResult {
  const purchasePrice = args.purchasePrice as number;
  const salePrice = args.salePrice as number;
  const purchaseYear = args.purchaseYear as number;
  const improvements = (args.improvements as number) || 0;
  const isMainResidence = args.isMainResidence as boolean;

  // Inflation adjustment (simplified)
  const currentYear = new Date().getFullYear();
  const yearsHeld = currentYear - purchaseYear;
  const inflationRate = 0.03; // Approximate
  const adjustedPurchase = purchasePrice * Math.pow(1 + inflationRate, yearsHeld);

  // Calculate gain
  const totalCosts = adjustedPurchase + improvements;
  const gain = salePrice - totalCosts;

  if (gain <= 0) {
    return {
      success: true,
      message: "No capital gains tax applies - no profit on sale.",
      data: { tax: 0, gain: 0 },
    };
  }

  // Exemptions
  let exemption = 0;
  if (isMainResidence) {
    exemption = Math.min(gain, 85430); // Main residence exemption
  }

  const taxableGain = Math.max(0, gain - exemption);
  const tax = taxableGain * 0.20; // 20% CGT rate

  return {
    success: true,
    message: `Capital Gains Tax calculation:\n` +
      `• Sale price: €${salePrice.toLocaleString()}\n` +
      `• Adjusted purchase: €${adjustedPurchase.toLocaleString()}\n` +
      `• Improvements: €${improvements.toLocaleString()}\n` +
      `• Gross gain: €${gain.toLocaleString()}\n` +
      (exemption > 0 ? `• Main residence exemption: -€${exemption.toLocaleString()}\n` : "") +
      `• Taxable gain: €${taxableGain.toLocaleString()}\n` +
      `• **CGT (20%): €${tax.toLocaleString()}**`,
    data: { tax, gain, taxableGain, exemption },
  };
}

/**
 * Send Email via Resend API
 * Automatically uses agent's communicationEmail - ignores any 'to' parameter from AI
 * If no attachmentUrl is provided, automatically attaches the most recent document
 */
async function handleSendEmail(
  args: Record<string, unknown>,
  agent: Agent | null,
  phoneNumber?: string
): Promise<ToolResult> {
  // ALWAYS use agent's communicationEmail - ignore any 'to' parameter
  if (!agent?.communicationEmail) {
    logger.error("No agent communicationEmail available", undefined, {
      category: LogCategory.TOOL,
      operation: "sendEmail",
    });
    return { error: "Unable to send email - agent email not found. Please contact support." };
  }

  const to = agent.communicationEmail;  // Force use of agent's registered email
  const subject = String(args.subject || "");
  const body = String(args.body || "");
  let attachmentUrl = args.attachmentUrl as string | undefined;
  let attachmentName = args.attachmentName as string | undefined;
  let attachedFromLastDocument = false;

  // AUTO-ATTACH: If no explicit attachment provided, check for recently generated document
  if (!attachmentUrl && phoneNumber) {
    try {
      // Documents are saved with user_id = bare digits (e.g., "35799111668")
      // but phoneNumber here is formatted with + prefix (e.g., "+35799111668").
      // Try formatted first, then bare digits to match how saveLastDocument stores them.
      let lastDoc = await getLastDocument(phoneNumber);
      if (!lastDoc) {
        const bareDigits = phoneNumber.replace(/^\+/, "");
        lastDoc = await getLastDocument(bareDigits);
      }
      if (lastDoc) {
        // Only auto-attach if document was created within last 30 minutes
        const docAge = Date.now() - new Date(lastDoc.created_at).getTime();
        const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

        if (docAge < MAX_AGE_MS) {
          logger.info("Auto-attaching recent document to email", {
            category: LogCategory.TOOL,
            operation: "sendEmail",
            documentName: lastDoc.document_name,
            documentType: lastDoc.document_type,
            ageMinutes: Math.round(docAge / 60000),
          });
          attachmentUrl = lastDoc.document_url;
          attachmentName = lastDoc.document_name;
          attachedFromLastDocument = true;
        } else {
          logger.info("Last document too old, not auto-attaching", {
            category: LogCategory.TOOL,
            operation: "sendEmail",
            ageMinutes: Math.round(docAge / 60000),
          });
        }
      }
    } catch (err) {
      logger.warn("Failed to fetch last document for auto-attach", {
        category: LogCategory.TOOL,
        operation: "sendEmail",
        error: err instanceof Error ? err.message : String(err),
      });
      // Continue without attachment - don't block email sending
    }
  }

  // Validate email (defensive check, should always be valid from DB)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    logger.error("Invalid agent email format", undefined, {
      category: LogCategory.TOOL,
      operation: "sendEmail",
    });
    return { error: "Invalid agent email format. Please contact support." };
  }

  // Get Resend API key from environment
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    logger.error("RESEND_API_KEY not set in environment", undefined, {
      category: LogCategory.TOOL,
      operation: "sendEmail",
    });
    return { error: "Email service not configured. Please contact admin." };
  }

  logger.info("Sending email via Resend", {
    category: LogCategory.TOOL,
    operation: "sendEmail",
    subject,
    hasAttachment: !!attachmentUrl,
  });

  // Build email payload
  const emailPayload: {
    from: string;
    to: string[];
    subject: string;
    html: string;
    text: string;
    attachments?: { filename: string; content: string }[];
  } = {
    from: "SOPHIA <sofia@zyprus.com>",
    to: [to],
    subject,
    html: body.replace(/\*([^*]+)\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>"),
    text: body.replace(/\*([^*]+)\*/g, "$1"),
  };

  // Handle attachment if provided
  if (attachmentUrl) {
    try {
      logger.info("Fetching email attachment", {
        category: LogCategory.TOOL,
        operation: "sendEmail",
        attachmentName: attachmentName || "attachment.docx",
      });
      const attachmentResponse = await fetch(attachmentUrl);
      if (!attachmentResponse.ok) {
        logger.error("Failed to fetch email attachment", undefined, {
          category: LogCategory.TOOL,
          operation: "sendEmail",
          status: attachmentResponse.status,
        });
        return { error: `Failed to fetch attachment from URL: ${attachmentResponse.status}` };
      }
      const attachmentBuffer = await attachmentResponse.arrayBuffer();
      const attachmentBase64 = btoa(
        String.fromCharCode(...new Uint8Array(attachmentBuffer))
      );

      emailPayload.attachments = [{
        filename: attachmentName || "attachment.docx",
        content: attachmentBase64,
      }];
      logger.info("Attachment prepared for email", {
        category: LogCategory.TOOL,
        operation: "sendEmail",
        filename: attachmentName || "attachment.docx",
      });
    } catch (attachError) {
      const err = attachError instanceof Error ? attachError : new Error(String(attachError));
      logger.error("Error fetching email attachment", err, {
        category: LogCategory.TOOL,
        operation: "sendEmail",
      });
      return { error: `Failed to process attachment: ${err.message}` };
    }
  }

  // Send via Resend API
  try {
    logger.info("Calling Resend API", {
      category: LogCategory.TOOL,
      operation: "sendEmail",
    });
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const responseText = await response.text();
    logger.info("Resend API response received", {
      category: LogCategory.TOOL,
      operation: "sendEmail",
      status: response.status,
    });

    if (!response.ok) {
      let errorDetail = responseText;
      try {
        const errorJson = JSON.parse(responseText);
        errorDetail = errorJson.message || errorJson.error || responseText;
      } catch {
        // Use raw text
      }
      logger.error("Resend API error", undefined, {
        category: LogCategory.TOOL,
        operation: "sendEmail",
        status: response.status,
        errorDetail: errorDetail.substring(0, 200),
      });
      return {
        error: attachmentUrl
          ? "Unable to send the email with attachment. Please try again."
          : "Unable to send the email. Please try again in a moment.",
      };
    }

    const result = JSON.parse(responseText);
    logger.info("Email sent successfully", {
      category: LogCategory.TOOL,
      operation: "sendEmail",
      emailId: result.id,
      hadAttachment: !!attachmentUrl,
      autoAttached: attachedFromLastDocument,
    });

    return {
      success: true,
      message: `✅ Sent to your email\n\nSubject: ${subject}` +
        (attachmentName ? `\nAttachment: ${attachmentName}` : ""),
      data: { emailId: result.id, subject, attachedDocument: attachedFromLastDocument ? attachmentName : undefined },
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error sending email", err, {
      category: LogCategory.TOOL,
      operation: "sendEmail",
    });
    return {
      error: args.attachmentUrl
        ? "Unable to send the email with attachment. Please try again."
        : "Unable to send the email. Please try again in a moment.",
    };
  }
}

