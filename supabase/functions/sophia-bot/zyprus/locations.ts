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

/**
 * Normalize a location word for fuzzy comparison: lowercase, strip accents,
 * keep letters only. Smooths out Greek transliteration noise.
 */
function normalizeLocWord(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** Levenshtein edit distance (small strings only). */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Fuzzy-equal for area names — true when normalized forms are equal or within
 * a small edit distance (~20%, min 1). Catches transliteration variants like
 * "Omonoia" ↔ "Omonia" and "Mouttagiaka" ↔ "Mouttayiaka". Requires both words
 * to be reasonably long so short generic words don't false-match.
 */
function fuzzyAreaEq(a: string, b: string): boolean {
  const na = normalizeLocWord(a);
  const nb = normalizeLocWord(b);
  if (na.length < 4 || nb.length < 4) return na === nb;
  if (na === nb) return true;
  const d = editDistance(na, nb);
  const tol = Math.max(1, Math.floor(Math.max(na.length, nb.length) * 0.2));
  return d <= tol;
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

    // Try exact match first — but ONLY if there's exactly ONE match
    // If multiple locations share the same name (e.g., two "Episkopi" nodes),
    // fall through to scored matching which uses district detection
    const exactMatches = taxonomy.locations.filter(
      (loc) => loc.name.toLowerCase() === normalized
    );
    if (exactMatches.length === 1) {
      logger.debug(
        `[Taxonomy] Exact match for "${locationName}": ${exactMatches[0].name}`
      );
      return buildResult(exactMatches[0], null);
    }
    if (exactMatches.length > 1) {
      logger.debug(
        `[Taxonomy] Multiple exact matches for "${locationName}" (${exactMatches.length}) — using scored matching with district detection`
      );
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
    // Priority 1: Direct district name match (e.g., "limassol" in "Mandria, Limassol")
    // Priority 2: Location in a district's area list (e.g., "mandria" in paphos list)
    // Direct district names ALWAYS win — "Mandria, Limassol" is Limassol even though
    // "mandria" also appears in the Paphos area list.
    const districtNames: Record<string, string[]> = {
      paphos: ["paphos", "pafos"],
      limassol: ["limassol", "lemesos"],
      larnaca: ["larnaca", "larnaka"],
      nicosia: ["nicosia", "lefkosia"],
      famagusta: ["famagusta", "ammochostos"],
    };

    // Priority 1: Check if any word IS a district name
    for (const [region, aliases] of Object.entries(districtNames)) {
      if (words.some((w) => aliases.includes(w))) {
        specifiedDistrict = region;
        logger.debug(
          `[Taxonomy] Explicitly specified district "${region}" (direct name match) in: ${locationName}`
        );
        break;
      }
    }

    // Priority 2: Only if no direct district name found, check area lists
    if (!specifiedDistrict) {
      for (const [region, locationsList] of Object.entries(REGION_LOCATIONS)) {
        if (words.some((w) => locationsList.some((alias) => w === alias))) {
          specifiedDistrict = region;
          logger.debug(
            `[Taxonomy] Inferred district "${region}" (area list match) in: ${locationName}`
          );
          break;
        }
      }
    }

    // The FIRST word is usually the specific location (e.g., "Neapoli" in "Neapoli, Limassol")
    const firstWord = words[0];

    // Build parentId→district map by finding which parentId is shared by
    // known-district locations. The parentIds are taxonomy term UUIDs (NOT in
    // the locations array), so we can't look up their names directly.
    // Instead: "Limassol City Centre" has parentId X → X = limassol district.
    const regionNameTerms: Record<string, string[]> = {
      paphos: ["paphos", "pafos"],
      limassol: ["limassol", "lemesos"],
      larnaca: ["larnaca", "larnaka"],
      nicosia: ["nicosia", "lefkosia", "strovolos", "lakatamia", "engomi"],
      famagusta: [
        "famagusta",
        "ammochostos",
        "paralimni",
        "protaras",
        "ayia napa",
      ],
    };

    const parentIdToDistrict = new Map<string, string>();
    for (const loc of taxonomy.locations) {
      if (!loc.parentId) continue;
      if (parentIdToDistrict.has(loc.parentId)) continue; // Already mapped
      const locName = loc.name.toLowerCase();
      for (const [district, terms] of Object.entries(regionNameTerms)) {
        if (terms.some((t) => locName.includes(t))) {
          parentIdToDistrict.set(loc.parentId, district);
          break;
        }
      }
    }

    logger.debug(
      `[Taxonomy] parentId→district map: ${parentIdToDistrict.size} entries (${[...parentIdToDistrict.entries()].map(([k, v]) => `${k.slice(0, 8)}=${v}`).join(", ")})`,
      { category: LogCategory.ZYPRUS }
    );

    // Helper: get district for a location via its parentId
    const getLocationDistrict = (
      loc: TaxonomyCache["locations"][0]
    ): string | null => {
      if (!loc.parentId) return null;
      return parentIdToDistrict.get(loc.parentId) || null;
    };

    // Find a location node that can serve as district fallback
    let districtFallbackNode: TaxonomyCache["locations"][0] | null = null;
    if (specifiedDistrict) {
      const terms = regionNameTerms[specifiedDistrict] || [];
      // Prefer the MOST GENERIC district node (e.g. "Limassol City Centre")
      // over a specific-area node that merely contains the district term
      // (e.g. "Agios Nektarios, Limassol City Centre"). Fewest words = most
      // generic. This is the safe fallback when the exact area can't be matched.
      districtFallbackNode =
        taxonomy.locations
          .filter((loc) =>
            terms.some((t) => loc.name.toLowerCase().includes(t))
          )
          .sort(
            (a, b) =>
              a.name.split(/[\s,]+/).filter(Boolean).length -
              b.name.split(/[\s,]+/).filter(Boolean).length
          )[0] || null;
      if (districtFallbackNode) {
        logger.debug(
          `[Taxonomy] District fallback for ${specifiedDistrict}: "${districtFallbackNode.name}"`,
          { category: LogCategory.ZYPRUS }
        );
      }
    }

    // Score all locations by multiple factors
    const scoredMatches: Array<{
      location: TaxonomyCache["locations"][0];
      score: number;
      matchedWords: string[];
      bonusReason: string;
      specificAreaMatched: boolean;
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

      // Did the SPECIFIC area (first word) match — exactly OR via a
      // transliteration-tolerant fuzzy match (e.g. "Omonoia" ↔ "Omonia")?
      // The fuzzy path also rescues nodes that share no exact word with the
      // input so they aren't dropped by the matchedWords check below.
      let specificAreaMatched = false;
      if (firstWord) {
        if (locNameLower.includes(firstWord)) {
          specificAreaMatched = true;
        } else if (locWords.some((lw) => fuzzyAreaEq(firstWord, lw))) {
          specificAreaMatched = true;
          if (!matchedWords.includes(firstWord)) matchedWords.push(firstWord);
          score += 4; // treat the fuzzy area hit like an exact area-word match
          bonusReason += `fuzzy:${firstWord} `;
        }
      }

      if (matchedWords.length === 0) {
        continue; // Skip locations with no matches
      }

      // CRITICAL: Strong bonus for matching the FIRST word (the specific location)
      // "Neapoli" should match "Neapoli" in the specified district
      if (specificAreaMatched) {
        score += 20; // Very strong bonus for matching the specific location name
        bonusReason += `first-word:${firstWord} `;
      }

      // CRITICAL FIX: District-aware scoring using direct parent name lookup
      // For each location, check its parent node's name to determine which district it belongs to
      // This mirrors exactly how the Zyprus dropdown displays "Episkopi, Limassol" vs "Episkopi, Paphos"
      if (specifiedDistrict) {
        const locDistrict = getLocationDistrict(loc);
        if (locDistrict) {
          // Parent name tells us the district definitively
          if (locDistrict === specifiedDistrict) {
            score += 30;
            bonusReason += `parent-district:${specifiedDistrict} `;
          } else {
            score -= 50;
            bonusReason += `WRONG-PARENT:${locDistrict} `;
          }
        } else {
          // No parent or parent name doesn't match any district
          // Fall back to location name and REGION_LOCATIONS checks
          const allDistrictNames: Record<string, string[]> = {
            paphos: ["paphos", "pafos"],
            limassol: ["limassol", "lemesos"],
            larnaca: ["larnaca", "larnaka"],
            nicosia: ["nicosia", "lefkosia"],
            famagusta: ["famagusta", "ammochostos"],
          };

          let nameDistrict: string | null = null;
          for (const [region, variants] of Object.entries(allDistrictNames)) {
            if (variants.some((v) => locWords.includes(v))) {
              nameDistrict = region;
              break;
            }
          }

          if (nameDistrict && nameDistrict !== specifiedDistrict) {
            score -= 50;
            bonusReason += `WRONG-DISTRICT-IN-NAME:${nameDistrict} `;
          } else if (nameDistrict && nameDistrict === specifiedDistrict) {
            score += 30;
            bonusReason += `district-in-name:${specifiedDistrict} `;
          } else {
            const regionLocs = REGION_LOCATIONS[specifiedDistrict] || [];
            const locationIsInDistrict =
              locWords.some((locWord) =>
                regionLocs.some((regLoc) => locWord === regLoc)
              ) ||
              regionLocs.some(
                (regLoc) =>
                  regLoc.includes(" ") && locNameLower.includes(regLoc)
              );

            if (locationIsInDistrict) {
              score += 15;
              bonusReason += `area-match:${specifiedDistrict} `;
            }
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

      scoredMatches.push({
        location: loc,
        score,
        matchedWords,
        bonusReason,
        specificAreaMatched,
      });
    }

    // Sort by score descending, return best match
    if (scoredMatches.length > 0) {
      scoredMatches.sort((a, b) => b.score - a.score);
      const best = scoredMatches[0];

      // GUARD: If the best match never matched the specific AREA (only the
      // district word), do NOT return an arbitrary specific-area node — that is
      // exactly how every unmatched Limassol area used to resolve to "Agios
      // Nektarios". Prefer the generic district node and flag for manual review.
      if (
        specifiedDistrict &&
        !best.specificAreaMatched &&
        districtFallbackNode &&
        districtFallbackNode.id !== best.location.id
      ) {
        logger.warn(
          `[Taxonomy] No specific-area match for "${locationName}" — using district node "${districtFallbackNode.name}" instead of arbitrary "${best.location.name}". Reviewer should set the exact area.`,
          { category: LogCategory.ZYPRUS }
        );
        return buildResult(districtFallbackNode, specifiedDistrict);
      }

      // CRITICAL: When a district is specified, ONLY accept matches in that district
      // If the best match is in the wrong district, discard all matches and use fallback
      if (specifiedDistrict) {
        const bestDistrict = getLocationDistrict(best.location);
        const bestIsInDistrict = bestDistrict
          ? bestDistrict === specifiedDistrict
          : best.score > 0; // If no parent info, trust the score

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

    // Fallback: use a known district location node (e.g., "Limassol" or "Limassol City Centre")
    if (specifiedDistrict && districtFallbackNode) {
      logger.warn(
        `[Taxonomy] "${locationName}" not available in ${specifiedDistrict} dropdown — using "${districtFallbackNode.name}" as fallback. Agent should update manually.`,
        { category: LogCategory.ZYPRUS }
      );
      return buildResult(districtFallbackNode, specifiedDistrict);
    }

    // Secondary fallback: search by name
    if (specifiedDistrict && taxonomy.locations.length > 0) {
      const regionFallback = taxonomy.locations.find((loc) =>
        loc.name.toLowerCase().includes(specifiedDistrict!)
      );
      if (regionFallback) {
        logger.warn(
          `[Taxonomy] Using name-based fallback for "${locationName}" (district: ${specifiedDistrict}): ${regionFallback.name}`,
          { category: LogCategory.ZYPRUS }
        );
        return buildResult(regionFallback, specifiedDistrict);
      }

      logger.warn(
        `[Taxonomy] No location found for district "${specifiedDistrict}" in "${locationName}", will use default`,
        { category: LogCategory.ZYPRUS }
      );
    }

    // NOTE: We deliberately do NOT fall back to taxonomy.locations[0] here.
    // Returning the first location in the API response silently mislabelled
    // every unmatched location as whatever happened to be first in the array
    // (the "Agios Nektarios default" agents reported on bank-portal uploads).
    // Instead we fall through to DEFAULT_LOCATION_UUID below — a consistent,
    // obviously-placeholder value that is easy to spot and correct — while the
    // bank-portal upload rules instruct the AI to confirm the real area with
    // the agent rather than rely on a guess.
    if (!specifiedDistrict && taxonomy.locations.length > 0) {
      logger.warn(
        `[Taxonomy] No confident match for "${locationName}" and no district given — using DEFAULT location (not the arbitrary first taxonomy entry). Agent should confirm the area.`,
        { category: LogCategory.ZYPRUS }
      );
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
