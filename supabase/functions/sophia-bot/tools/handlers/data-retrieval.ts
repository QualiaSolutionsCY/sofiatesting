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
    const summary =
      formatPortalSummary(listing) +
      `\n\nBANK-PORTAL UPLOAD RULES (read before asking the agent anything):\n` +
      `- Owner name: bank-owned listings NEVER disclose an owner. Use the source URL itself ("${url}") as the owner_name when calling createPropertyListing. Do NOT ask the agent for the owner's name or phone.\n` +
      `- Owner phone: leave empty / use the same source URL. Do NOT ask the agent.\n` +
      `- Photos: ${listing.imageUrls.length} image URL(s) were extracted from the listing. They ARE usable for the Zyprus upload — pass them through. Do NOT ask the agent to resend photos via WhatsApp.\n` +
      `- Title deed status: bank listings do not show this. Default to "pending" / "in process" and proceed; do not block on it.\n` +
      `- Bank name: detect from the URL host (altamira, altia, remu, gogordian) and set bank_name accordingly.\n` +
      `- NEVER claim "Cloudflare protection" — these portals are NOT Cloudflare-protected. If a field is missing, say so plainly (e.g. "Price wasn't shown on the listing page") and proceed with what you have.`;

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
