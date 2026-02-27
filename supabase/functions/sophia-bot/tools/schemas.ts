/**
 * Tool Input Validation Schemas
 * Zod schemas for validating tool arguments against malicious payloads (SEC-04)
 */

import { z } from "https://esm.sh/zod@3.22.4";

/**
 * Schema for createPropertyListing tool
 * Validates property listing inputs with runtime constraints
 */
export const createPropertyListingSchema = z.object({
  listingType: z.enum(["sale", "rent"]),
  propertyType: z.enum([
    "apartment",
    "house",
    "detached house",
    "villa",
    "maisonette",
    "bungalow",
    "penthouse",
    "townhouse",
    "studio",
    "semi-detached",
    "residential building",
  ]),
  price: z.number().positive().max(100000000, "Price must be under 100M EUR"),
  location: z.string().min(2).max(200),
  bedrooms: z.number().int().min(0).max(50),
  bathrooms: z.number().int().min(0).max(50).optional(),
  coveredArea: z.number().positive().max(1000000, "Covered area must be under 1,000,000 sqm"),
  plotSize: z.number().positive().max(1000000, "Plot size must be under 1,000,000 sqm").optional(),
  coveredVeranda: z.number().nonnegative().max(10000, "Veranda area must be under 10,000 sqm").optional(),
  uncoveredVeranda: z.number().nonnegative().max(10000, "Veranda area must be under 10,000 sqm").optional(),
  ownerName: z.string().min(1).max(200),
  ownerPhone: z.string().min(6).max(20),
  ownerEmail: z.string().email().optional(),
  titleDeedStatus: z.enum([
    "separate",
    "final_approval",
    "in_process",
    "pending",
    "share_of_land",
    "permits_only",
    "unknown",
    "do_not_display",
  ]),
  priceNegotiable: z.boolean().optional(),
  isNewBuild: z.boolean().optional(),
  parkingType: z.enum(["covered", "open", "garage", "carport", "none"]).optional(),
  condition: z.enum(["new", "excellent", "good", "fair", "needs_renovation"]).optional(),
  orientation: z.enum([
    "north",
    "south",
    "east",
    "west",
    "northeast",
    "northwest",
    "southeast",
    "southwest",
  ]).optional(),
  priceModifier: z.enum(["no_vat", "plus_vat", "vat_included"]).optional(),
  registrationNumber: z.string().max(100).optional(),
  imageUrls: z.array(z.string().url()).min(1).max(100, "Maximum 100 images allowed"),
  floorPlanUrls: z.array(z.string().url()).max(50).optional(),
  titleDeedFileUrls: z.array(z.string().url()).max(20).optional(),
  titleDeedImageIndices: z.array(z.number().int().positive()).max(100).optional(),
  floorPlanImageIndices: z.array(z.number().int().positive()).max(100).optional(),
  imageOrder: z.array(z.number().int().positive()).max(100).optional(),
  mainPhotoIndex: z.number().int().positive().max(100).optional(),
  unitBreakdown: z.string().max(5000).optional(),
  poolType: z.enum(["private", "communal", "provisions"]).optional(),
  features: z.array(z.string().max(100)).max(100).optional(),
  energyClass: z.string().max(10).optional(),
  yearBuilt: z.number().int().min(1800).max(2100).optional(),
  yearRenovated: z.number().int().min(1800).max(2100).optional(),
  floor: z.string().max(20).optional(),
  basementRooms: z.number().int().min(0).max(20).optional(),
  roofRooms: z.number().int().min(0).max(20).optional(),
  assignTo: z.string().email().optional(),
  buildingName: z.string().max(200).optional(),
  specialNotes: z.string().max(10000).optional(),
  structureDescription: z.string().max(2000).optional(),
  areaDescription: z.string().max(5000).optional(),
  locationUrl: z.string().url().optional(),
  coordinates: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
  }).optional(),
});

/**
 * Schema for createLandListing tool
 * Validates land listing inputs with runtime constraints
 */
export const createLandListingSchema = z.object({
  listingType: z.enum(["sale", "rent"]),
  landType: z.enum(["plot", "field", "agricultural"]),
  price: z.number().positive().max(100000000, "Price must be under 100M EUR"),
  location: z.string().min(2).max(200),
  landSize: z.number().positive().max(10000000, "Land size must be under 10,000,000 sqm"),
  ownerName: z.string().min(1).max(200),
  ownerPhone: z.string().min(6).max(20),
  ownerEmail: z.string().email().optional(),
  titleDeedStatus: z.enum([
    "separate",
    "final_approval",
    "in_process",
    "pending",
    "share_of_land",
    "permits_only",
    "unknown",
    "do_not_display",
  ]),
  priceModifier: z.enum(["no_vat", "plus_vat", "vat_included"]).optional(),
  registrationNumber: z.string().max(100).optional(),
  imageUrls: z.array(z.string().url()).min(1).max(100, "Maximum 100 images allowed"),
  titleDeedFileUrls: z.array(z.string().url()).max(20).optional(),
  titleDeedImageIndices: z.array(z.number().int().positive()).max(100).optional(),
  buildingDensity: z.number().int().min(0).max(100).optional(),
  siteCoverage: z.number().int().min(0).max(100).optional(),
  maxFloors: z.number().int().min(0).max(50).optional(),
  maxHeight: z.number().positive().max(500, "Max height must be under 500m").optional(),
  infrastructure: z.array(z.string().max(50)).max(20).optional(),
  features: z.array(z.string().max(100)).max(100).optional(),
  assignTo: z.string().email().optional(),
  specialNotes: z.string().max(10000).optional(),
  areaDescription: z.string().max(5000).optional(),
  locationUrl: z.string().url().optional(),
  coordinates: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
  }).optional(),
});

/**
 * Schema for calculateVAT tool
 * Validates VAT calculation inputs
 */
export const calculateVATSchema = z.object({
  price: z.number().positive().max(100000000, "Price must be under 100M EUR"),
  area: z.number().positive().max(100000, "Area must be under 100,000 sqm"),
  isPrimaryResidence: z.boolean().optional(),
});

/**
 * Schema for calculateTransferFees tool
 * Validates transfer fees calculation inputs
 */
export const calculateTransferFeesSchema = z.object({
  price: z.number().positive().max(100000000, "Price must be under 100M EUR"),
  jointNames: z.boolean().optional(),
  isFirstProperty: z.boolean().optional(),
  hasVAT: z.boolean().optional(),
});

/**
 * Schema for calculateCapitalGains tool
 * Validates capital gains calculation inputs
 */
export const calculateCapitalGainsSchema = z.object({
  purchasePrice: z.number().positive().max(100000000, "Purchase price must be under 100M EUR"),
  salePrice: z.number().positive().max(100000000, "Sale price must be under 100M EUR"),
  purchaseYear: z.number().int().min(1900).max(2100),
  improvements: z.number().nonnegative().max(100000000, "Improvements must be under 100M EUR").optional(),
  isMainResidence: z.boolean().optional(),
});

/**
 * Schema for getZyprusData tool
 * Validates data retrieval inputs
 */
export const getZyprusDataSchema = z.object({
  dataType: z.enum(["locations", "property_types", "features", "listing_types"]),
  region: z.enum(["paphos", "limassol", "larnaca", "nicosia", "famagusta"]).optional(),
});

/**
 * Schema for getRegionalAgents tool
 * Validates regional agents query inputs
 */
export const getRegionalAgentsSchema = z.object({
  region: z.enum(["paphos", "limassol", "larnaca", "nicosia", "famagusta"]),
});

/**
 * Schema for extractFromBazaraki tool
 * Validates Bazaraki extraction inputs
 */
export const extractFromBazarakiSchema = z.object({
  url: z.string().url().refine(
    (url) => url.includes("bazaraki.com") || url.includes("bazaraki.cy"),
    "URL must be a Bazaraki listing"
  ),
});

/**
 * Schema for sendEmail tool
 * Validates email sending inputs
 */
export const sendEmailSchema = z.object({
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(10240, "Email body must be under 10KB"),
  attachmentUrl: z.string().url().optional(),
  attachmentName: z.string().max(200).optional(),
});

/**
 * Lookup map for all tool schemas
 * Used by validation.ts to find the appropriate schema
 */
export const TOOL_SCHEMAS: Record<string, z.ZodSchema> = {
  createPropertyListing: createPropertyListingSchema,
  createLandListing: createLandListingSchema,
  calculateVAT: calculateVATSchema,
  calculateTransferFees: calculateTransferFeesSchema,
  calculateCapitalGains: calculateCapitalGainsSchema,
  getZyprusData: getZyprusDataSchema,
  getRegionalAgents: getRegionalAgentsSchema,
  extractFromBazaraki: extractFromBazarakiSchema,
  sendEmail: sendEmailSchema,
};
