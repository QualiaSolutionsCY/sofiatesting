/**
 * Data Retrieval Handlers
 * Handles Zyprus data retrieval, regional agents, and Bazaraki extraction
 */

import { getAgentsByRegion } from "../../agents/identifier.ts";
import { loadTaxonomy, getLocationsByRegion } from "../../zyprus/taxonomy-cache.ts";
import { extractFromBazaraki as extractBazarakiListing, isBazarakiUrl, formatBazarakiSummary } from "../../services/bazaraki-scraper.ts";
import { logger, LogCategory } from "../../utils/logger.ts";

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
 * Handle listing available agents in a region (for management assignment)
 */
export async function handleGetRegionalAgents(
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
export async function handleExtractFromBazaraki(
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
