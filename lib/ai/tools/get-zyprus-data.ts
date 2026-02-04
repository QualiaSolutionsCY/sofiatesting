import { tool } from "ai";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const logger = createLogger("ai:get-zyprus-data");
import {
  forceRefreshCache,
  getAllIndoorFeatures,
  getAllInfrastructure,
  // NEW: Land and shared taxonomies
  getAllLandTypes,
  getAllListingTypes,
  getAllLocations,
  getAllOutdoorFeatures,
  getAllPriceModifiers,
  getAllPropertyStatus,
  getAllPropertyTypes,
  getAllPropertyViews,
  getAllTitleDeeds,
  hasCacheData,
} from "@/lib/zyprus/taxonomy-cache";

export const getZyprusDataTool = tool({
  description:
    "Get available taxonomy data from zyprus.com for property and land listings. Use this when users ask about available locations, property types, features, or other options. When taxonomy fields are empty or users need to see options, call this tool to fetch and present choices. Supports: Cyprus locations, property types (villa, apartment), land types (plot, field), indoor/outdoor features, property views (sea view, mountain view), property status (resale, new build), infrastructure (water, electricity), listing types (for sale, for rent), price modifiers, and title deeds.",
  inputSchema: z.object({
    resourceType: z
      .enum([
        "locations",
        "property_types",
        "indoor_features",
        "outdoor_features",
        "price_modifiers",
        "title_deeds",
        // NEW: Land and shared taxonomies
        "land_types",
        "infrastructure",
        "property_views",
        "property_status",
        "listing_types",
        "all",
        "all_land", // New: Only land-related taxonomies
      ])
      .describe(
        "Type of taxonomy data to fetch from zyprus.com. Use 'all' for property listings, 'all_land' for land listings, or specific types when user asks about particular options."
      ),
    refreshCache: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "Force refresh the taxonomy cache. Only set to true if user suspects data on zyprus.com has changed or cache seems stale."
      ),
  }),
  execute: async ({ resourceType, refreshCache: shouldRefresh }) => {
    try {
      // Force refresh if requested
      if (shouldRefresh) {
        await forceRefreshCache();
      }

      // Initialize cache if empty
      if (!hasCacheData()) {
        await forceRefreshCache();
      }

      // Fetch requested data
      switch (resourceType) {
        case "locations": {
          const locations = await getAllLocations();
          return {
            success: true,
            data: {
              locations: locations.map((loc) => ({
                name: loc.name,
                id: loc.id,
                description: `Location: ${loc.name}`,
              })),
            },
            message: `Found ${locations.length} locations on zyprus.com`,
          };
        }

        case "property_types": {
          const propertyTypes = await getAllPropertyTypes();
          return {
            success: true,
            data: {
              propertyTypes: propertyTypes.map((type) => ({
                name: type.name,
                id: type.id,
                description: `Property type: ${type.name}`,
              })),
            },
            message: `Found ${propertyTypes.length} property types on zyprus.com`,
          };
        }

        case "indoor_features": {
          const indoorFeatures = await getAllIndoorFeatures();
          return {
            success: true,
            data: {
              indoorFeatures: indoorFeatures.map((feature) => ({
                name: feature.name,
                id: feature.id,
                description: `Indoor feature: ${feature.name}`,
              })),
            },
            message: `Found ${indoorFeatures.length} indoor features on zyprus.com`,
          };
        }

        case "outdoor_features": {
          const outdoorFeatures = await getAllOutdoorFeatures();
          return {
            success: true,
            data: {
              outdoorFeatures: outdoorFeatures.map((feature) => ({
                name: feature.name,
                id: feature.id,
                description: `Outdoor feature: ${feature.name}`,
              })),
            },
            message: `Found ${outdoorFeatures.length} outdoor features on zyprus.com`,
          };
        }

        case "price_modifiers": {
          const priceModifiers = await getAllPriceModifiers();
          return {
            success: true,
            data: {
              priceModifiers: priceModifiers.map((modifier) => ({
                name: modifier.name,
                id: modifier.id,
                description: `Price modifier: ${modifier.name}`,
              })),
            },
            message: `Found ${priceModifiers.length} price modifiers on zyprus.com`,
          };
        }

        case "title_deeds": {
          const titleDeeds = await getAllTitleDeeds();
          return {
            success: true,
            data: {
              titleDeeds: titleDeeds.map((deed) => ({
                name: deed.name,
                id: deed.id,
                description: `Title deed: ${deed.name}`,
              })),
            },
            message: `Found ${titleDeeds.length} title deed types on zyprus.com`,
          };
        }

        // NEW: Land-specific and shared taxonomies
        case "land_types": {
          const landTypes = await getAllLandTypes();
          return {
            success: true,
            data: {
              landTypes: landTypes.map((type) => ({
                name: type.name,
                id: type.id,
                description: `Land type: ${type.name}`,
              })),
            },
            message: `Found ${landTypes.length} land types on zyprus.com`,
          };
        }

        case "infrastructure": {
          const infrastructure = await getAllInfrastructure();
          return {
            success: true,
            data: {
              infrastructure: infrastructure.map((item) => ({
                name: item.name,
                id: item.id,
                description: `Infrastructure: ${item.name}`,
              })),
            },
            message: `Found ${infrastructure.length} infrastructure options on zyprus.com`,
          };
        }

        case "property_views": {
          const propertyViews = await getAllPropertyViews();
          return {
            success: true,
            data: {
              propertyViews: propertyViews.map((view) => ({
                name: view.name,
                id: view.id,
                description: `Property view: ${view.name}`,
              })),
            },
            message: `Found ${propertyViews.length} property view types on zyprus.com`,
          };
        }

        case "property_status": {
          const propertyStatus = await getAllPropertyStatus();
          return {
            success: true,
            data: {
              propertyStatus: propertyStatus.map((status) => ({
                name: status.name,
                id: status.id,
                description: `Property status: ${status.name}`,
              })),
            },
            message: `Found ${propertyStatus.length} property status options on zyprus.com`,
          };
        }

        case "listing_types": {
          const listingTypes = await getAllListingTypes();
          return {
            success: true,
            data: {
              listingTypes: listingTypes.map((type) => ({
                name: type.name,
                id: type.id,
                description: `Listing type: ${type.name}`,
              })),
            },
            message: `Found ${listingTypes.length} listing types on zyprus.com`,
          };
        }

        case "all": {
          const [
            allLocations,
            allPropertyTypes,
            allIndoorFeatures,
            allOutdoorFeatures,
            allPriceModifiers,
            allTitleDeeds,
            // NEW: Include shared taxonomies
            allPropertyViews,
            allPropertyStatus,
            allListingTypes,
          ] = await Promise.all([
            getAllLocations(),
            getAllPropertyTypes(),
            getAllIndoorFeatures(),
            getAllOutdoorFeatures(),
            getAllPriceModifiers(),
            getAllTitleDeeds(),
            getAllPropertyViews(),
            getAllPropertyStatus(),
            getAllListingTypes(),
          ]);

          return {
            success: true,
            data: {
              locations: allLocations.map((loc) => ({
                name: loc.name,
                id: loc.id,
              })),
              propertyTypes: allPropertyTypes.map((type) => ({
                name: type.name,
                id: type.id,
              })),
              indoorFeatures: allIndoorFeatures.map((feature) => ({
                name: feature.name,
                id: feature.id,
              })),
              outdoorFeatures: allOutdoorFeatures.map((feature) => ({
                name: feature.name,
                id: feature.id,
              })),
              priceModifiers: allPriceModifiers.map((modifier) => ({
                name: modifier.name,
                id: modifier.id,
              })),
              titleDeeds: allTitleDeeds.map((deed) => ({
                name: deed.name,
                id: deed.id,
              })),
              // NEW: Shared taxonomies
              propertyViews: allPropertyViews.map((view) => ({
                name: view.name,
                id: view.id,
              })),
              propertyStatus: allPropertyStatus.map((status) => ({
                name: status.name,
                id: status.id,
              })),
              listingTypes: allListingTypes.map((type) => ({
                name: type.name,
                id: type.id,
              })),
            },
            message: `Fetched complete property taxonomy from zyprus.com: ${allLocations.length} locations, ${allPropertyTypes.length} property types, ${allIndoorFeatures.length} indoor features, ${allOutdoorFeatures.length} outdoor features, ${allPriceModifiers.length} price modifiers, ${allTitleDeeds.length} title deeds, ${allPropertyViews.length} views, ${allPropertyStatus.length} status options, ${allListingTypes.length} listing types`,
          };
        }

        case "all_land": {
          const [
            allLocations,
            allLandTypes,
            allInfrastructure,
            allPropertyViews,
            allPriceModifiers,
            allTitleDeeds,
            allListingTypes,
          ] = await Promise.all([
            getAllLocations(),
            getAllLandTypes(),
            getAllInfrastructure(),
            getAllPropertyViews(),
            getAllPriceModifiers(),
            getAllTitleDeeds(),
            getAllListingTypes(),
          ]);

          return {
            success: true,
            data: {
              locations: allLocations.map((loc) => ({
                name: loc.name,
                id: loc.id,
              })),
              landTypes: allLandTypes.map((type) => ({
                name: type.name,
                id: type.id,
              })),
              infrastructure: allInfrastructure.map((item) => ({
                name: item.name,
                id: item.id,
              })),
              propertyViews: allPropertyViews.map((view) => ({
                name: view.name,
                id: view.id,
              })),
              priceModifiers: allPriceModifiers.map((modifier) => ({
                name: modifier.name,
                id: modifier.id,
              })),
              titleDeeds: allTitleDeeds.map((deed) => ({
                name: deed.name,
                id: deed.id,
              })),
              listingTypes: allListingTypes.map((type) => ({
                name: type.name,
                id: type.id,
              })),
            },
            message: `Fetched complete land taxonomy from zyprus.com: ${allLocations.length} locations, ${allLandTypes.length} land types, ${allInfrastructure.length} infrastructure options, ${allPropertyViews.length} views, ${allPriceModifiers.length} price modifiers, ${allTitleDeeds.length} title deeds, ${allListingTypes.length} listing types`,
          };
        }

        default:
          return {
            success: false,
            error: `Unknown resource type: ${resourceType}`,
          };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Error fetching Zyprus taxonomy", { errorMessage });
      return {
        success: false,
        error: `Failed to fetch data from zyprus.com: ${errorMessage}`,
      };
    }
  },
});
