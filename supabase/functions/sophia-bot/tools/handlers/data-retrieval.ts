/**
 * Data Retrieval Handlers
 * Handles Zyprus data retrieval, regional agents, and Bazaraki extraction
 */

import type { Agent } from "../../agents/identifier.ts";
import { getAgentsByRegion } from "../../agents/identifier.ts";
import {
  extractFromBazaraki as extractBazarakiListing,
  formatBazarakiSummary,
  isBazarakiUrl,
} from "../../services/bazaraki-scraper.ts";
import {
  detectPortal,
  extractFromBankPortal,
  formatPortalSummary,
} from "../../services/portal-scraper.ts";
import { LogCategory, logger } from "../../utils/logger.ts";
import {
  getLocationsByRegion,
  loadTaxonomy,
} from "../../zyprus/taxonomy-cache.ts";

export interface ToolResult {
  success?: boolean;
  error?: string;
  needsInput?: boolean;
  question?: string;
  message?: string;
  data?: unknown;
}

/**
 * Map a bank-portal page's title-deed wording to the createPropertyListing
 * titleDeedStatus enum. Only the page's own words are used — never inferred.
 * Returns "unknown" for anything not clearly recognisable so the AI asks the
 * agent rather than guessing.
 */
function mapDeedHintToStatus(hint: string): string {
  const h = hint.toLowerCase();
  if (/share\s+of\s+land/.test(h)) return "share_of_land";
  if (/not\s+available/.test(h)) return "pending"; // Zyprus maps "pending" → "Not Available"
  if (/pending|under\s+division|in\s+process/.test(h)) return "in_process";
  if (/separate|available/.test(h)) return "separate";
  return "unknown";
}

/**
 * Handle Zyprus data retrieval
 */
export async function handleGetZyprusData(
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

      case "features": {
        const allFeatures = [
          ...taxonomy.features,
          ...taxonomy.indoorFeatures,
          ...taxonomy.outdoorFeatures,
        ];
        return {
          success: true,
          data: allFeatures.map((f) => f.name),
        };
      }

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
 * Handle listing available agents in a region (for management assignment)
 */
export async function handleGetRegionalAgents(
  args: Record<string, unknown>
): Promise<ToolResult> {
  const region = args.region as string;

  try {
    const agents = await getAgentsByRegion(region);

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
    logger.error("Failed to get regional agents", err, {
      category: LogCategory.TOOL,
    });
    return { error: `Failed to retrieve agents for ${region}` };
  }
}

/**
 * Handle property portal link extraction (Bazaraki + bank portals)
 */
export async function handleExtractFromBazaraki(
  args: Record<string, unknown>,
  agent?: Agent | null
): Promise<ToolResult> {
  const url = args.url as string;

  // Detect which portal the URL belongs to
  const portal = url ? detectPortal(url) : null;

  if (!portal) {
    return {
      error:
        "Please provide a valid property portal URL (Bazaraki, Altia, Altamira, REMU, or Gordian)",
    };
  }

  // Bazaraki — unchanged path, works for all users
  if (portal === "bazaraki") {
    if (!isBazarakiUrl(url)) {
      return {
        error:
          "Please provide a valid Bazaraki URL (bazaraki.com or bazaraki.cy)",
      };
    }

    try {
      const listing = await extractBazarakiListing(url);
      const summary = formatBazarakiSummary(listing);

      // NOTE: Do NOT set `message` here — that would bypass the AI and send
      // the raw summary directly to the user. Instead, put everything in `data`
      // so the AI processes it and composes a human-friendly response.
      return {
        success: true,
        data: {
          summary,
          // Strip Bazaraki image URLs — CDN blocks external access, they always fail.
          // The prompt tells the AI to ask the agent for photos via WhatsApp instead.
          imageUrls: [],
          imageCount: listing.imageUrls.length,
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
            description: listing.description,
            features: listing.features,
            warnings: listing.warnings,
          },
        },
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error("Bazaraki extraction failed", err, {
        category: LogCategory.TOOL,
      });
      return {
        error:
          "I couldn't extract details from that Bazaraki link. Could you please provide the property details directly?",
      };
    }
  }

  // Bank portal (Altia, Altamira, REMU, Gordian) — management only
  if (agent?.role !== "management") {
    return {
      error:
        "Bank portal extraction (Altia, Altamira, REMU, Gordian) is only available to management. Please ask Lauren or Charalambos to extract this listing for you.",
    };
  }

  try {
    const listing = await extractFromBankPortal(url);

    // Build a machine-readable, MUST-COPY block. The AI must transfer
    // every value below verbatim into createPropertyListing — re-asking
    // the agent for a field that appears here is a violation.
    const mustCopy: string[] = [];
    if (listing.listingType)
      mustCopy.push(`  listing_type: "${listing.listingType}"`);
    if (listing.propertyType)
      mustCopy.push(`  property_type: "${listing.propertyType}"`);
    if (listing.price) mustCopy.push(`  price: ${listing.price}`);
    if (listing.location)
      mustCopy.push(`  location: "${listing.location}"`);
    if (listing.latitude && listing.longitude) {
      mustCopy.push(`  latitude: ${listing.latitude}`);
      mustCopy.push(`  longitude: ${listing.longitude}`);
    }
    if (listing.bedrooms !== undefined)
      mustCopy.push(`  bedrooms: ${listing.bedrooms}`);
    if (listing.bathrooms)
      mustCopy.push(`  bathrooms: ${listing.bathrooms}`);
    if (listing.coveredArea)
      mustCopy.push(`  covered_area: ${listing.coveredArea}`);
    if (listing.plotSize) mustCopy.push(`  plot_size: ${listing.plotSize}`);
    if (listing.coveredVeranda)
      mustCopy.push(`  covered_veranda: ${listing.coveredVeranda}`);
    if (listing.uncoveredVeranda)
      mustCopy.push(`  uncovered_veranda: ${listing.uncoveredVeranda}`);
    if (listing.energyCategory)
      mustCopy.push(`  energy_class: "${listing.energyCategory}"`);
    if (listing.features.length > 0)
      mustCopy.push(`  features: ${JSON.stringify(listing.features)}`);
    if (listing.imageUrls.length > 0)
      mustCopy.push(`  imageUrls: [${listing.imageUrls.length} URLs — pass through verbatim]`);
    mustCopy.push(`  bankUrl: "${url}"    // bank portal link — becomes the Reference ID automatically AND assigns the regional office as listing owner`);
    mustCopy.push(`  owner_name: ""       // bank-owned: no private seller, leave empty`);
    mustCopy.push(`  owner_phone: ""`);
    mustCopy.push(`  locationUrl: ""    // IMPORTANT: leave empty. The bank URL goes in bankUrl only — it must NOT appear in locationUrl/owner_name or My Notes will leak it.`);
    if (listing.yearBuilt)
      mustCopy.push(`  year_built: ${listing.yearBuilt}`);
    // Title deed: ONLY from the page's stated wording — never hardcode. Bank
    // pages rarely state it; when absent, leave "unknown" and ask the agent.
    // (Previously hardcoded "pending", which maps to "Not Available" on Zyprus
    // and was wrong for properties that actually have a separate deed.)
    if (listing.titleDeedHint) {
      mustCopy.push(
        `  title_deed_status: "${mapDeedHintToStatus(listing.titleDeedHint)}"    // from page wording: "${listing.titleDeedHint}"`
      );
    } else {
      mustCopy.push(
        `  title_deed_status: "unknown"    // page did NOT state deeds — confirm with agent; do NOT default to "pending"`
      );
    }

    const summary =
      formatPortalSummary(listing) +
      `\n\n=== MUST-COPY into createPropertyListing (verbatim — these fields are EXTRACTED, do NOT ask the agent for them) ===\n` +
      mustCopy.join("\n") +
      `\n=== END MUST-COPY ===\n` +
      `\nBANK-PORTAL UPLOAD RULES:\n` +
      `1. EVERY field in MUST-COPY above is already known. Copy each value into your createPropertyListing call exactly as shown. NEVER re-ask the agent for an already-extracted field that has a real value — the ONLY exceptions are fields explicitly flagged "unknown" or "confirm" (see rules 4 & 5 for title deed and location).\n` +
      `2. Bank link + owner: pass the source URL ("${url}") as the bankUrl argument — it automatically becomes the Own Reference ID AND assigns the regional office (request{region}@zyprus.com) as the listing owner. Bank-owned listings NEVER disclose a private seller: leave owner_name and owner_phone EMPTY and NEVER ask the agent for them. Do NOT pass the URL as locationUrl or owner_name — bankUrl is the only place it belongs.\n` +
      `2b. Location pin: if a "COORDINATES (bank map ...)" line appears in the summary above, pass those EXACT latitude/longitude values as the coordinates argument. NEVER guess coordinates from the area name — a guessed pin lands kilometres away.\n` +
      (listing.imageUrls.length > 0
        ? `3. Photos: ${listing.imageUrls.length} image URL(s) extracted — pass them through. Do NOT ask the agent to resend photos via WhatsApp.\n`
        : `3. Photos: 0 images were auto-read from the bank page. ⛔ Bank images ARE usable — NEVER claim "CDN blocks external access", "Cloudflare protection", or any similar invented reason for a bank link (that excuse is ONLY ever valid for Bazaraki, NEVER for bank portals). Say plainly: the gallery on this bank page could not be auto-read, and ask the agent to PASTE the photo URLs directly from the bank page (right-click each photo → copy image address). Do NOT say the images failed, are blocked, or are inaccessible.\n`) +
      `4. Title deed: use ONLY the title_deed_status value in MUST-COPY (it reflects the page wording, or "unknown" if the page was silent). NEVER default to "pending" or "available" yourself. If it is "unknown", ASK the agent for the deed status before finalising — but do not block the other fields on it.\n` +
      `5. Location: if the location in MUST-COPY is missing or only a city/district (no specific area), ASK the agent to confirm the exact area before uploading. Never substitute a default area.\n` +
      `6. Features: include ONLY the features listed in MUST-COPY. If an amenity (pool, garden, gym…) is NOT in MUST-COPY, it is NOT on the page — do NOT add it. Never invent "common pool", "swimming pool", or any amenity the page does not list.\n` +
      `7. Bank name: detect from URL host (altamira/altia/remu/gogordian).\n` +
      `8. NEVER claim "Cloudflare protection", "page didn't show price", or any other invented reason if a value IS in MUST-COPY above. State plainly only what is genuinely absent.\n` +
      `9. Bank-owned listings are owned by the regional office (assigned automatically from the property's region via bankUrl) — you do NOT need to ask who to route it to. Proceed to create the draft once everything in MUST-COPY is set; the only things you may still ask for are fields flagged "unknown"/"confirm" above (title deed, vague location).`;

    return {
      success: true,
      data: {
        summary,
        sourceUrl: url,
        bankPortal: portal,
        // Bank portals don't have CDN blocks — keep the image URLs
        imageUrls: listing.imageUrls,
        imageCount: listing.imageUrls.length,
        extractedFields: {
          listingType: listing.listingType,
          propertyType: listing.propertyType,
          price: listing.price,
          location: listing.location,
          latitude: listing.latitude,
          longitude: listing.longitude,
          bedrooms: listing.bedrooms,
          bathrooms: listing.bathrooms,
          coveredArea: listing.coveredArea,
          plotSize: listing.plotSize,
          coveredVeranda: listing.coveredVeranda,
          uncoveredVeranda: listing.uncoveredVeranda,
          energyCategory: listing.energyCategory,
          reference: listing.reference,
          description: listing.description,
          features: listing.features,
          warnings: listing.warnings,
        },
        ownerPlaceholder: url,
      },
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`Bank portal extraction failed (${portal})`, err, {
      category: LogCategory.TOOL,
    });
    return {
      error:
        "I couldn't extract details from that listing. Could you please provide the property details directly?",
    };
  }
}
