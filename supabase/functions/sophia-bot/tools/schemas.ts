/**
 * Tool Input Validation Schemas
 * Zod schemas for validating tool arguments against malicious payloads (SEC-04)
 *
 * NOTE: URL fields use z.string() instead of z.string().url() because:
 * - AI sometimes passes empty strings for optional fields
 * - WhatsApp media URLs may not pass strict URL validation
 * - Image URLs from pending_images are validated downstream anyway
 * Bounds checks (max length, positive numbers) still catch injection attacks.
 */

import { z } from "https://esm.sh/zod@3.22.4";

/** Coerce empty string to undefined for optional fields */
const optionalString = (maxLen: number) =>
  z
    .string()
    .max(maxLen)
    .optional()
    .transform((v) => (v === "" ? undefined : v));

const optionalUrl = () =>
  z
    .string()
    .max(2000)
    .optional()
    .transform((v) => (v === "" ? undefined : v));

const optionalEmail = () =>
  z
    .string()
    .max(200)
    .optional()
    .transform((v) => (v === "" ? undefined : v));

/**
 * Schema for createPropertyListing tool
 * Validates property listing inputs with runtime constraints
 */
export const createPropertyListingSchema = z.object({
  listingType: z.enum(["sale", "rent"]),
  propertyType: z
    .enum([
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
      "semi-detached house",
      "residential building",
      "commercial building",
      "mixed-use building",
      "office",
      "shop",
      "warehouse",
      "industrial",
      "building",
      "hotel",
      "flat",
      "entire floor apartment",
    ])
    .optional(),
  price: z
    .number()
    .positive()
    .max(100_000_000, "Price must be under 100M EUR")
    .optional(),
  location: z.string().min(2).max(200).optional(),
  bedrooms: z.number().int().min(0).max(50).optional(),
  bathrooms: z.number().int().min(0).max(50).optional(),
  coveredArea: z
    .number()
    .positive()
    .max(1_000_000, "Covered area must be under 1,000,000 sqm")
    .optional(),
  plotSize: z
    .number()
    .positive()
    .max(1_000_000, "Plot size must be under 1,000,000 sqm")
    .optional(),
  coveredVeranda: z
    .number()
    .nonnegative()
    .max(10_000, "Veranda area must be under 10,000 sqm")
    .optional(),
  uncoveredVeranda: z
    .number()
    .nonnegative()
    .max(10_000, "Veranda area must be under 10,000 sqm")
    .optional(),
  ownerName: z.string().min(1).max(200),
  ownerPhone: z.string().min(4).max(40),
  ownerEmail: optionalEmail(),
  titleDeedStatus: z
    .enum([
      "separate",
      "final_approval",
      "in_process",
      "pending",
      "share_of_land",
      "permits_only",
      "unknown",
      "do_not_display",
    ])
    .optional()
    .default("unknown"),
  priceNegotiable: z.boolean().optional(),
  isNewBuild: z.boolean().optional(),
  parkingType: z
    .enum(["covered", "open", "garage", "carport", "none"])
    .optional(),
  condition: z
    .enum(["new", "excellent", "good", "fair", "needs_renovation"])
    .optional(),
  orientation: z
    .enum([
      "north",
      "south",
      "east",
      "west",
      "northeast",
      "northwest",
      "southeast",
      "southwest",
    ])
    .optional(),
  priceModifier: z.enum(["no_vat", "plus_vat", "vat_included"]).optional(),
  registrationNumber: optionalString(100),
  imageUrls: z
    .array(z.string().max(2000))
    .max(100, "Maximum 100 images allowed")
    .default([]),
  floorPlanUrls: z.array(z.string().max(2000)).max(50).optional(),
  titleDeedFileUrls: z.array(z.string().max(2000)).max(20).optional(),
  titleDeedImageIndices: z
    .array(z.number().int().positive())
    .max(100)
    .optional(),
  floorPlanImageIndices: z
    .array(z.number().int().positive())
    .max(100)
    .optional(),
  imageOrder: z.array(z.number().int().positive()).max(100).optional(),
  mainPhotoIndex: z.number().int().positive().max(100).optional(),
  unitBreakdown: optionalString(5000),
  poolType: z.enum(["private", "communal", "provisions", "none"]).optional(),
  features: z.array(z.string().max(100)).max(100).optional(),
  energyClass: optionalString(10),
  yearBuilt: z
    .number()
    .int()
    .min(0)
    .max(2100)
    .optional()
    .transform((v) => (v && v < 1800 ? undefined : v)),
  yearRenovated: z
    .number()
    .int()
    .min(0)
    .max(2100)
    .optional()
    .transform((v) => (v && v < 1800 ? undefined : v)),
  floor: optionalString(20),
  basementRooms: z.number().int().min(0).max(20).optional(),
  roofRooms: z.number().int().min(0).max(20).optional(),
  confirmDuplicate: z.boolean().optional(),
  assignTo: optionalEmail(),
  buildingName: optionalString(200),
  specialNotes: optionalString(10_000),
  structureDescription: optionalString(2000),
  areaDescription: optionalString(5000),
  locationUrl: optionalUrl(),
  coordinates: z
    .object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
    })
    .optional(),
  // Bank-owned property scraped from a bank portal (Gordian/Altamira/REMU/Bank
  // of Cyprus/Hellenic). When present, signals a bank listing: used as the
  // listing Reference ID and to assign the regional office as listing owner.
  bankUrl: optionalUrl(),
});

/**
 * Schema for createLandListing tool
 * Validates land listing inputs with runtime constraints
 */
export const createLandListingSchema = z.object({
  listingType: z.enum(["sale", "rent"]),
  landType: z.enum([
    "plot",
    "field",
    "agricultural",
    "commercial",
    "industrial",
  ]),
  price: z.number().positive().max(100_000_000, "Price must be under 100M EUR"),
  location: z.string().min(2).max(200),
  landSize: z
    .number()
    .positive()
    .max(10_000_000, "Land size must be under 10,000,000 sqm"),
  ownerName: z.string().min(1).max(200),
  ownerPhone: z.string().min(4).max(40),
  ownerEmail: optionalEmail(),
  titleDeedStatus: z
    .enum([
      "separate",
      "final_approval",
      "in_process",
      "pending",
      "share_of_land",
      "permits_only",
      "unknown",
      "do_not_display",
    ])
    .optional()
    .default("unknown"),
  priceModifier: z.enum(["no_vat", "plus_vat", "vat_included"]).optional(),
  registrationNumber: optionalString(100),
  imageUrls: z
    .array(z.string().max(2000))
    .max(100, "Maximum 100 images allowed")
    .default([]),
  titleDeedFileUrls: z.array(z.string().max(2000)).max(20).optional(),
  titleDeedImageIndices: z
    .array(z.number().int().positive())
    .max(100)
    .optional(),
  buildingDensity: z.number().int().min(0).max(100).optional(),
  siteCoverage: z.number().int().min(0).max(100).optional(),
  maxFloors: z.number().int().min(0).max(50).optional(),
  maxHeight: z
    .number()
    .positive()
    .max(500, "Max height must be under 500m")
    .optional(),
  roadFrontage: z
    .number()
    .positive()
    .max(10_000, "Road frontage must be under 10,000m")
    .optional(),
  infrastructure: z.array(z.string().max(50)).max(20).optional(),
  features: z.array(z.string().max(100)).max(100).optional(),
  confirmDuplicate: z.boolean().optional(),
  assignTo: optionalEmail(),
  specialNotes: optionalString(10_000),
  areaDescription: optionalString(5000),
  locationUrl: optionalUrl(),
  coordinates: z
    .object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
    })
    .optional(),
  // Bank-owned land scraped from a bank portal (Gordian/Altamira/REMU/Bank of
  // Cyprus/Hellenic). When present, signals a bank listing: used as the listing
  // Reference ID and to assign the regional office as listing owner.
  bankUrl: optionalUrl(),
});

/**
 * Schema for calculateVAT tool
 * Validates VAT calculation inputs
 */
export const calculateVATSchema = z.object({
  price: z.number().positive().max(100_000_000, "Price must be under 100M EUR"),
  area: z.number().positive().max(100_000, "Area must be under 100,000 sqm"),
  isPrimaryResidence: z.boolean().optional(),
});

/**
 * Schema for calculateTransferFees tool
 * Validates transfer fees calculation inputs
 */
export const calculateTransferFeesSchema = z.object({
  price: z.number().positive().max(100_000_000, "Price must be under 100M EUR"),
  jointNames: z.boolean().optional(),
  isFirstProperty: z.boolean().optional(),
  hasVAT: z.boolean().optional(),
});

/**
 * Schema for calculateCapitalGains tool
 * Validates capital gains calculation inputs
 */
export const calculateCapitalGainsSchema = z.object({
  purchasePrice: z
    .number()
    .positive()
    .max(100_000_000, "Purchase price must be under 100M EUR"),
  salePrice: z
    .number()
    .positive()
    .max(100_000_000, "Sale price must be under 100M EUR"),
  purchaseYear: z.number().int().min(1900).max(2100),
  improvements: z
    .number()
    .nonnegative()
    .max(100_000_000, "Improvements must be under 100M EUR")
    .optional(),
  isMainResidence: z.boolean().optional(),
});

/**
 * Schema for getZyprusData tool
 * Validates data retrieval inputs
 */
export const getZyprusDataSchema = z.object({
  dataType: z.enum([
    "locations",
    "property_types",
    "features",
    "listing_types",
  ]),
  region: z
    .enum(["paphos", "limassol", "larnaca", "nicosia", "famagusta"])
    .optional(),
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
  url: z
    .string()
    .url()
    .refine((url) => {
      try {
        const host = new URL(url).hostname.replace(/^www\./, "");
        return (
          host.includes("bazaraki.com") ||
          host.includes("bazaraki.cy") ||
          host === "marketplace.altia.com.cy" ||
          host.endsWith("altia.com.cy") ||
          host.includes("altamirarealestate.com.cy") ||
          host.includes("remuproperties.com") ||
          host.includes("gogordian.com")
        );
      } catch {
        return false;
      }
    }, "URL must be a supported property portal (Bazaraki, Altia, Altamira, REMU, or Gordian)"),
});

/**
 * Schema for sendEmail tool
 * Validates email sending inputs
 */
export const sendEmailSchema = z.object({
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(10_240, "Email body must be under 10KB"),
  attachmentUrl: optionalUrl(),
  attachmentName: optionalString(200),
});

const manageInvoiceSchema = z.object({
  intent: z.enum([
    "create_draft",
    "list_drafts",
    "query_status",
    "approve",
    "edit_invoice",
    "request_correction",
    "mark_paid",
    "issue_receipt",
    "issue_credit_note",
    "resend",
    "send_pdf",
  ]),
  client: z.string().max(200).optional(),
  amount: z.number().min(0).max(100_000_000).optional(),
  vatMode: z.enum(["plus", "included", "none"]).optional(),
  description: z.string().max(2000).optional(),
  documentId: z.string().max(120).optional(),
  officialNumber: z.string().max(120).optional(),
  correctionReason: z.string().max(1000).optional(),
  groupMessage: z.string().max(2000).optional(),
  dueDate: z.string().max(40).optional(),
  dueDays: z.number().int().min(0).max(365).optional(),
  recurrence: z.enum(["none", "monthly", "yearly"]).optional(),
  recurrenceDay: z.number().int().min(1).max(31).optional(),
});

/**
 * Schema for addAgent tool (admin-only)
 * Validates agent-registry inserts triggered from WhatsApp.
 */
export const addAgentSchema = z.object({
  fullName: z
    .string()
    .min(2, "Full name must be at least 2 characters")
    .max(120),
  phoneNumber: z
    .string()
    .min(8, "Phone number must include at least 8 digits")
    .max(20),
  region: z
    .string()
    .max(20)
    .transform((v) => v.toLowerCase()),
  role: z
    .string()
    .max(20)
    .optional()
    .transform((v) => (v ? v.toLowerCase() : "agent")),
  email: optionalEmail(),
  landline: optionalString(20),
});

/**
 * Schema for removeAgent tool (admin-only)
 * Validates the soft-deactivate request — at least one identifier is required,
 * and the handler enforces an explicit confirm step.
 */
export const removeAgentSchema = z
  .object({
    fullName: optionalString(120),
    phoneNumber: optionalString(20),
    confirm: z.union([z.boolean(), z.string()]).optional(),
  })
  .refine((v) => !!v.fullName || !!v.phoneNumber, {
    message: "Either fullName or phoneNumber is required",
  });

/**
 * Lookup map for all tool schemas
 * Used by validation.ts to find the appropriate schema
 */
export const TOOL_SCHEMAS: Record<string, z.ZodSchema> = {
  manageInvoice: manageInvoiceSchema,
  createPropertyListing: createPropertyListingSchema,
  createLandListing: createLandListingSchema,
  calculateVAT: calculateVATSchema,
  calculateTransferFees: calculateTransferFeesSchema,
  calculateCapitalGains: calculateCapitalGainsSchema,
  getZyprusData: getZyprusDataSchema,
  getRegionalAgents: getRegionalAgentsSchema,
  extractFromBazaraki: extractFromBazarakiSchema,
  sendEmail: sendEmailSchema,
  addAgent: addAgentSchema,
  removeAgent: removeAgentSchema,
};
