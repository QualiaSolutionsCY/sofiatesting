/**
 * Location & User Taxonomy Lookups
 * Extracted from taxonomy-cache.ts for better modularity
 */

import { getSupabaseAdmin } from "../../_shared/db.ts";
import {
  AGENT_NAME_MAP,
  DEFAULT_LOCATION_UUID,
  REGION_LOCATIONS,
  SOPHIA_AI_UUID,
  USER_FALLBACKS,
} from "../config/business-rules.ts";
import { LogCategory, logger } from "../utils/logger.ts";
import { loadTaxonomy, type TaxonomyCache } from "./taxonomy-cache.ts";

/**
 * Sanitize email input for use in filter queries
 * Prevents filter injection by only allowing valid email characters
 */
function sanitizeEmailForFilter(email: string): string {
  // Only allow alphanumeric, @, ., _, -, and +
  return email
    .replace(/[^a-zA-Z0-9@._+-]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Lookup agent's Zyprus UUID from Supabase agents table
 * Returns null if not found or no zyprus_user_id set
 */
async function lookupAgentFromSupabase(email: string): Promise<string | null> {
  // Sanitize email to prevent filter injection
  const sanitizedEmail = sanitizeEmailForFilter(email);
  if (!sanitizedEmail || !sanitizedEmail.includes("@")) {
    logger.debug("[Taxonomy] Invalid email format", {
      category: LogCategory.ZYPRUS,
    });
    return null;
  }

  try {
    const supabase = getSupabaseAdmin();

    // Use separate queries to avoid filter injection with .or() string interpolation
    // First try listing_owner_email
    const { data: ownerData, error: ownerError } = await supabase
      .from("agents")
      .select("zyprus_user_id, full_name")
      .eq("listing_owner_email", sanitizedEmail)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!ownerError && ownerData && ownerData.zyprus_user_id) {
      logger.debug(
        `[Taxonomy] Found agent "${ownerData.full_name}" in Supabase with Zyprus UUID: ${ownerData.zyprus_user_id}`
      );
      return ownerData.zyprus_user_id;
    }

    // Then try communication_email
    const { data: commData, error: commError } = await supabase
      .from("agents")
      .select("zyprus_user_id, full_name")
      .eq("communication_email", sanitizedEmail)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!commError && commData && commData.zyprus_user_id) {
      logger.debug(
        `[Taxonomy] Found agent "${commData.full_name}" in Supabase with Zyprus UUID: ${commData.zyprus_user_id}`
      );
      return commData.zyprus_user_id;
    }

    // Check if we found an agent without zyprus_user_id
    if (
      (ownerData && !ownerData.zyprus_user_id) ||
      (commData && !commData.zyprus_user_id)
    ) {
      const agentData = ownerData || commData;
      logger.debug(
        `[Taxonomy] Agent "${agentData!.full_name}" found but no zyprus_user_id set`
      );
    }

    return null;
  } catch (err) {
    logger.error(
      "[Taxonomy] Error looking up agent from Supabase",
      err instanceof Error ? err : new Error(String(err)),
      { category: LogCategory.ZYPRUS }
    );
    return null;
  }
}

/** Result from location UUID lookup — includes matched taxonomy name for title/description */
export interface LocationResult {
  uuid: string;
  /** The taxonomy name Zyprus uses for this location (e.g., "Strovolos, Nicosia") */
  matchedName: string;
  /** The detected district from the input (e.g., "nicosia") */
  district: string | null;
}

/**
 * Find location UUID by name
 * MANDATORY field - always returns a valid UUID
 *
 * CRITICAL FIX FOR DISTRICT DISAMBIGUATION:
 * When a district is explicitly specified (e.g., "Neapoli, Limassol"),
 * we MUST prioritize locations that are in that district over locations
 * with the same name in other districts.
 *
 * e.g., "Neapoli, Limassol" should match "Neapoli" in Limassol district,
 * NOT "Neapoli" in Nicosia district.
 *
 * Returns LocationResult with uuid, matchedName (taxonomy name), and district.
 */
export async function findLocationUuid(
  locationName: string
): Promise<LocationResult> {
  const normalized = locationName.toLowerCase().trim();
  let specifiedDistrict: string | null = null; // Declare outside try for error logging

  try {
    const taxonomy = await loadTaxonomy();

    // Helper to build LocationResult from a matched location
    const buildResult = (
      loc: TaxonomyCache["locations"][0],
      district: string | null
    ): LocationResult => ({
      uuid: loc.id,
      matchedName: loc.name,
      district,
    });

    // Try exact match first
    const exact = taxonomy.locations.find(
      (loc) => loc.name.toLowerCase() === normalized
    );
    if (exact) {
      logger.debug(
        `[Taxonomy] Exact match for "${locationName}": ${exact.name}`
      );
      return buildResult(exact, null);
    }

    // Extract words from input (filter short words)
    const words = normalized.split(/[\s,]+/).filter((w) => w.length > 2);

    if (words.length === 0) {
      // No meaningful words, use default
      logger.debug(
        `[Taxonomy] No meaningful words in "${locationName}", using default`
      );
      return {
        uuid: DEFAULT_LOCATION_UUID,
        matchedName: locationName,
        district: null,
      };
    }

    // CRITICAL: Detect the EXPLICITLY SPECIFIED district from input
    // This is the district name that appears AFTER the comma or as one of the words
    for (const [region, locationsList] of Object.entries(REGION_LOCATIONS)) {
      // Check if any region name or aliases appear in the input
      const regionAliases = [region, ...locationsList];
      if (
        words.some((w) =>
          regionAliases.some(
            (alias) => w === alias || w.includes(alias) || alias.includes(w)
          )
        )
      ) {
        specifiedDistrict = region;
        logger.debug(
          `[Taxonomy] Explicitly specified district "${region}" in input: ${locationName}`
        );
        break;
      }
    }

    // The FIRST word is usually the specific location (e.g., "Neapoli" in "Neapoli, Limassol")
    const firstWord = words[0];

    // Score all locations by multiple factors
    const scoredMatches: Array<{
      location: TaxonomyCache["locations"][0];
      score: number;
      matchedWords: string[];
      bonusReason: string;
    }> = [];

    for (const loc of taxonomy.locations) {
      const locNameLower = loc.name.toLowerCase();
      const locWords = locNameLower.split(/[\s,]+/).filter((w) => w.length > 1);
      const matchedWords: string[] = [];
      let score = 0;
      let bonusReason = "";

      // Check each input word for matches in the location name
      for (const word of words) {
        if (locNameLower.includes(word)) {
          matchedWords.push(word);
          // Exact word match gets more points than substring
          if (locWords.includes(word)) {
            score += 5; // Strong bonus for exact word match
            bonusReason += `exact:${word} `;
          } else {
            score += 1; // Weaker bonus for substring match
          }
        }
      }

      if (matchedWords.length === 0) {
        continue; // Skip locations with no matches
      }

      // CRITICAL: Strong bonus for matching the FIRST word (the specific location)
      // "Neapoli" should match "Neapoli" in the specified district
      if (firstWord && locNameLower.includes(firstWord)) {
        score += 20; // Very strong bonus for matching the specific location name
        bonusReason += `first-word:${firstWord} `;
      }

      // CRITICAL FIX: District-aware scoring
      // If user specified a district, heavily penalize locations NOT in that district
      if (specifiedDistrict) {
        const regionLocs = REGION_LOCATIONS[specifiedDistrict] || [];

        // Check if this location is in the specified district
        // CRITICAL: Use EXACT word match, not substring, to avoid "neapoli" matching "neapolis"
        // Also check multi-word entries (e.g., "mesa chorio", "kato paphos") against full name
        const locationIsInDistrict =
          locWords.some((locWord) =>
            regionLocs.some((regLoc) => locWord === regLoc)
          ) ||
          regionLocs.some(
            (regLoc) => regLoc.includes(" ") && locNameLower.includes(regLoc)
          );

        if (locationIsInDistrict) {
          score += 30; // HUGE bonus for being in the specified district
          bonusReason += `district-match:${specifiedDistrict} `;
        } else {
          // Check if location is in a DIFFERENT district
          let locationInOtherDistrict: string | null = null;
          for (const [otherRegion, otherLocs] of Object.entries(
            REGION_LOCATIONS
          )) {
            if (otherRegion === specifiedDistrict) continue;
            if (
              locWords.some((locWord) =>
                otherLocs.some((otherLoc) => locWord === otherLoc)
              ) ||
              otherLocs.some(
                (otherLoc) =>
                  otherLoc.includes(" ") && locNameLower.includes(otherLoc)
              )
            ) {
              locationInOtherDistrict = otherRegion;
              break;
            }
          }

          // HEAVY PENALTY for locations in the wrong district
          if (locationInOtherDistrict) {
            score -= 50; // Massive penalty for wrong district
            bonusReason += `WRONG-DISTRICT:${locationInOtherDistrict} `;
            logger.debug(
              `[Taxonomy] Penalizing "${loc.name}" - in ${locationInOtherDistrict}, user wants ${specifiedDistrict}`
            );
          }
        }
      }

      // Region bonus: Give moderate bonus if this location is in a detected region (when no explicit district)
      if (!specifiedDistrict) {
        for (const [region, locationsList] of Object.entries(
          REGION_LOCATIONS
        )) {
          const regionLocs = locationsList;
          const locationIsInRegion = locWords.some((locWord) =>
            regionLocs.some(
              (regLoc) => locWord.includes(regLoc) || regLoc.includes(locWord)
            )
          );

          if (locationIsInRegion) {
            score += 5; // Moderate bonus for being in any region
            bonusReason += `region:${region} `;
            break; // Only count one region bonus
          }
        }
      }

      scoredMatches.push({ location: loc, score, matchedWords, bonusReason });
    }

    // Sort by score descending, return best match
    if (scoredMatches.length > 0) {
      scoredMatches.sort((a, b) => b.score - a.score);
      const best = scoredMatches[0];

      // CRITICAL: When a district is specified, ONLY accept matches in that district
      // If the best match is in the wrong district, discard all matches and use fallback
      if (specifiedDistrict) {
        const regionLocs = REGION_LOCATIONS[specifiedDistrict] || [];
        const bestLocWords = best.location.name
          .toLowerCase()
          .split(/[\s,]+/)
          .filter((w) => w.length > 1);
        const bestLocNameLower = best.location.name.toLowerCase();
        // CRITICAL: Use EXACT word match for district detection + multi-word entries
        const bestIsInDistrict =
          bestLocWords.some((locWord) =>
            regionLocs.some((regLoc) => locWord === regLoc)
          ) ||
          regionLocs.some(
            (regLoc) =>
              regLoc.includes(" ") && bestLocNameLower.includes(regLoc)
          );

        if (bestIsInDistrict) {
          logger.debug(
            `[Taxonomy] Best match for "${locationName}": ${best.location.name} (score: ${best.score}, matched: ${best.matchedWords.join(", ")}, bonus: ${best.bonusReason})`
          );

          // Log top 3 alternatives for debugging
          for (let i = 1; i < Math.min(4, scoredMatches.length); i++) {
            const alt = scoredMatches[i];
            logger.debug(
              `[Taxonomy] Alternative ${i}: ${alt.location.name} (score: ${alt.score}, ${alt.bonusReason})`
            );
          }

          return buildResult(best.location, specifiedDistrict);
        }
        logger.warn(
          `[Taxonomy] Best match "${best.location.name}" is NOT in specified district "${specifiedDistrict}" - discarding and using fallback`,
          { category: LogCategory.ZYPRUS }
        );
      } else {
        logger.debug(
          `[Taxonomy] Best match for "${locationName}": ${best.location.name} (score: ${best.score}, matched: ${best.matchedWords.join(", ")}, bonus: ${best.bonusReason})`
        );

        // Log top 3 alternatives for debugging
        for (let i = 1; i < Math.min(4, scoredMatches.length); i++) {
          const alt = scoredMatches[i];
          logger.debug(
            `[Taxonomy] Alternative ${i}: ${alt.location.name} (score: ${alt.score}, ${alt.bonusReason})`
          );
        }

        return buildResult(best.location, specifiedDistrict);
      }
    }

    // Fallback: try to find a general location in the detected region
    if (specifiedDistrict && taxonomy.locations.length > 0) {
      // Get all location names that belong to this district from REGION_LOCATIONS
      const regionLocs = REGION_LOCATIONS[specifiedDistrict] || [];

      // First try: direct name match with district name (e.g., "Limassol")
      let regionFallback = taxonomy.locations.find((loc) =>
        loc.name.toLowerCase().includes(specifiedDistrict!)
      );

      // Second try: match ANY location name that appears in REGION_LOCATIONS for this district
      // CRITICAL: Use EXACT word match to avoid "neapoli" matching "neapolis" + multi-word entries
      if (!regionFallback && regionLocs.length > 0) {
        regionFallback = taxonomy.locations.find((loc) => {
          const locNameLower = loc.name.toLowerCase();
          const locWords = locNameLower
            .split(/[\s,]+/)
            .filter((w) => w.length > 1);
          return (
            locWords.some((locWord) => regionLocs.includes(locWord)) ||
            regionLocs.some(
              (regLoc) => regLoc.includes(" ") && locNameLower.includes(regLoc)
            )
          );
        });
      }

      // Third try: just find the first location that STARTS with the district name
      if (!regionFallback) {
        regionFallback = taxonomy.locations.find((loc) =>
          loc.name.toLowerCase().startsWith(specifiedDistrict!)
        );
      }

      if (regionFallback) {
        logger.debug(
          `[Taxonomy] Using region fallback for "${locationName}" (district: ${specifiedDistrict}): ${regionFallback.name}`
        );
        return buildResult(regionFallback, specifiedDistrict);
      }

      logger.warn(
        `[Taxonomy] No location found for district "${specifiedDistrict}" in "${locationName}", will use default`,
        { category: LogCategory.ZYPRUS }
      );
    }

    // Ultimate fallback: return first location if available (ONLY when no district specified)
    if (!specifiedDistrict && taxonomy.locations.length > 0) {
      logger.debug(
        `[Taxonomy] WARNING: Using first available location for "${locationName}": ${taxonomy.locations[0].name}`
      );
      return buildResult(taxonomy.locations[0], null);
    }
  } catch (error) {
    logger.error(
      "[Taxonomy] Error finding location",
      error instanceof Error ? error : new Error(String(error)),
      { category: LogCategory.ZYPRUS }
    );
  }

  // Ultimate fallback: use default location UUID
  // NOTE: Zyprus API REQUIRES field_location to be non-null (422 error if missing)
  // Since Zyprus only has Nicosia locations in the database, we must use Nicosia as fallback
  // even for other districts. The location mismatch will be noted in AI message for manual correction.
  if (specifiedDistrict) {
    logger.warn(
      `[Taxonomy] No location found for district "${specifiedDistrict}" in "${locationName}" - using Nicosia default as API requires non-null location`,
      { category: LogCategory.ZYPRUS }
    );
  } else {
    logger.debug(
      `[Taxonomy] Using hardcoded default location UUID for: ${locationName}`
    );
  }
  return {
    uuid: DEFAULT_LOCATION_UUID,
    matchedName: locationName,
    district: specifiedDistrict,
  };
}

/**
 * Get all locations for a region
 */
export async function getLocationsByRegion(
  region: string
): Promise<TaxonomyCache["locations"]> {
  const taxonomy = await loadTaxonomy();

  // Region to parent location mapping
  const regionParents: Record<string, string[]> = {
    paphos: ["paphos", "pafos"],
    limassol: ["limassol", "lemesos"],
    larnaca: ["larnaca", "larnaka"],
    nicosia: ["nicosia", "lefkosia"],
    famagusta: ["famagusta", "ammochostos"],
  };

  const parentTerms = regionParents[region.toLowerCase()] || [];

  // Find parent location IDs
  const parentIds = taxonomy.locations
    .filter((loc) =>
      parentTerms.some((term) => loc.name.toLowerCase().includes(term))
    )
    .map((loc) => loc.id);

  // Return all locations that have these parents
  return taxonomy.locations.filter(
    (loc) => loc.parentId && parentIds.includes(loc.parentId)
  );
}

/**
 * Find user UUID by email address
 * Uses multiple lookup strategies:
 * 0. Supabase agents table (NEW - highest priority)
 * 1. Direct email match from Zyprus API
 * 2. Name/display_name match using AGENT_NAME_MAP
 * 3. Hardcoded UUID fallbacks
 * 4. SOPHIA_AI_UUID as ultimate fallback
 */
export async function findUserUuid(email: string): Promise<string> {
  if (!email) {
    logger.debug("[Taxonomy] No email provided, using SOPHIA_AI_UUID", {
      category: LogCategory.ZYPRUS,
    });
    return SOPHIA_AI_UUID;
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Strategy 0: Check Supabase agents table FIRST (most reliable)
  const supabaseUuid = await lookupAgentFromSupabase(normalizedEmail);
  if (supabaseUuid) {
    return supabaseUuid;
  }

  try {
    const taxonomy = await loadTaxonomy();

    // Strategy 1: Direct email match from Zyprus API
    const userByEmail = taxonomy.users.find((u) => u.email === normalizedEmail);
    if (userByEmail) {
      logger.debug(
        `[Taxonomy] Found user by email ${normalizedEmail}: ${userByEmail.id}`
      );
      return userByEmail.id;
    }

    // Strategy 2: Match by name/display_name using AGENT_NAME_MAP
    const possibleNames = AGENT_NAME_MAP[normalizedEmail];
    if (possibleNames && possibleNames.length > 0) {
      for (const name of possibleNames) {
        const normalizedName = name.toLowerCase();
        const userByName = taxonomy.users.find(
          (u) =>
            u.name.toLowerCase() === normalizedName ||
            u.name.toLowerCase().includes(normalizedName) ||
            normalizedName.includes(u.name.toLowerCase())
        );
        if (userByName) {
          logger.debug(
            `[Taxonomy] Found user by name "${name}" for ${normalizedEmail}: ${userByName.id}`
          );
          return userByName.id;
        }
      }
    }

    // Strategy 3: Try matching just the username part of email (e.g., "evelina" from "evelina@zyprus.com")
    const emailUsername = normalizedEmail.split("@")[0];
    if (emailUsername && emailUsername.length > 2) {
      const userByUsername = taxonomy.users.find(
        (u) =>
          u.name.toLowerCase() === emailUsername ||
          u.name.toLowerCase().includes(emailUsername)
      );
      if (userByUsername) {
        logger.debug(
          `[Taxonomy] Found user by username "${emailUsername}" for ${normalizedEmail}: ${userByUsername.id}`
        );
        return userByUsername.id;
      }
    }

    logger.debug(
      `[Taxonomy] User not found in API for ${normalizedEmail}, checking fallbacks`
    );
  } catch (error) {
    logger.error(
      "[Taxonomy] Error finding user",
      error instanceof Error ? error : new Error(String(error)),
      { category: LogCategory.ZYPRUS }
    );
  }

  // Strategy 4: Check hardcoded fallbacks
  const fallback = USER_FALLBACKS[normalizedEmail];
  if (fallback) {
    logger.debug(
      `[Taxonomy] Using hardcoded fallback for ${normalizedEmail}: ${fallback}`
    );
    return fallback;
  }

  // Ultimate fallback: use SOPHIA_AI_UUID
  logger.debug(
    `[Taxonomy] Using SOPHIA_AI_UUID fallback for ${normalizedEmail}`
  );
  return SOPHIA_AI_UUID;
}

/**
 * Find multiple user UUIDs for reviewers
 * IMPORTANT: Excludes SOPHIA_AI_UUID from results to prevent "Sophia AI ()" showing as reviewer
 * Only returns UUIDs for emails that can be resolved to actual users
 */
export async function findUserUuids(emails: string[]): Promise<string[]> {
  const validEmails = emails.filter(Boolean);
  const results = await Promise.all(
    validEmails.map((email) => findUserUuid(email))
  );

  const uuids: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const uuid = results[i];
    if (uuid !== SOPHIA_AI_UUID && !uuids.includes(uuid)) {
      uuids.push(uuid);
    } else if (uuid === SOPHIA_AI_UUID) {
      logger.debug(
        `[Taxonomy] Skipping SOPHIA_AI_UUID for reviewer email: ${validEmails[i]}`
      );
    }
  }
  return uuids;
}
