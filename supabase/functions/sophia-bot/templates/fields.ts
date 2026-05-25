/**
 * Field Definitions - Single Source of Truth for Template Fields
 *
 * This module defines all field types, validation rules, and prompt generation
 * for SOPHIA templates. All field-related logic should import from here.
 */

import { TEMPLATE_REGISTRY, type TemplateDefinition } from "./registry.ts";

/**
 * Field type definitions
 */
export type FieldType =
  | "text"
  | "name"
  | "phone"
  | "email"
  | "date"
  | "currency"
  | "id_document"
  | "property_registration"
  | "url"
  | "boolean"
  | "enum";

/**
 * Field definition
 */
export interface FieldDefinition {
  name: string;
  type: FieldType;
  label: string;
  example: string;
  validation?: RegExp;
  required: boolean;
  description?: string;
}

/**
 * Master field definitions
 * These are reusable across multiple templates
 */
export const FIELD_DEFINITIONS: Record<string, FieldDefinition> = {
  // === NAME FIELDS ===
  clientName: {
    name: "clientName",
    type: "name",
    label: "Client's name",
    example: "Andreas Andreou",
    validation: /^[A-Za-z\s\-']+$/,
    required: true,
  },
  buyerName: {
    name: "buyerName",
    type: "name",
    label: "Buyer's name",
    example: "John Smith",
    validation: /^[A-Za-z\s\-']+$/,
    required: true,
    description: "Single buyer name for reservation agreements",
  },
  buyerNames: {
    name: "buyerNames",
    type: "name",
    label: "Buyer names",
    example: "John Smith",
    validation: /^[A-Za-z\s\-'&,]+$/,
    required: true,
  },
  clientNames: {
    name: "clientNames",
    type: "name",
    label: "Client names",
    example: "John Smith and Maria Smith",
    validation: /^[A-Za-z\s\-'&,]+$/,
    required: true,
    description: "Multiple client names for developer registrations",
  },
  sellerName: {
    name: "sellerName",
    type: "name",
    label: "Seller's name",
    example: "Maria Papadopoulos",
    validation: /^[A-Za-z\s\-']+$/,
    required: true,
    description: "Informal seller name for pricing advice templates",
  },
  sellerFullName: {
    name: "sellerFullName",
    type: "name",
    label: "Seller's full name",
    example: "Maria Papadopoulos",
    validation: /^[A-Za-z\s\-']+$/,
    required: true,
  },
  tenantNames: {
    name: "tenantNames",
    type: "name",
    label: "Tenant names",
    example: "John Smith",
    validation: /^[A-Za-z\s\-'&,]+$/,
    required: true,
  },
  vendorName: {
    name: "vendorName",
    type: "name",
    label: "Vendor's full name",
    example: "Papapetrou Filitsa",
    validation: /^[A-Za-z\s\-']+$/,
    required: true,
  },
  estateAgentName: {
    name: "estateAgentName",
    type: "name",
    label: "Estate agent's name",
    example: "Andreas from ABC Realty",
    required: true,
  },
  potentialSellerName: {
    name: "potentialSellerName",
    type: "name",
    label: "Potential seller's name",
    example: "Marios Charalambous",
    required: true,
  },

  // === PHONE FIELDS ===
  clientPhone: {
    name: "clientPhone",
    type: "phone",
    label: "Client's phone number",
    example: "+357 99 123456",
    validation: /^\+?[0-9\s-]+$/,
    required: true,
    description: "Full format with country code",
  },

  // === ID DOCUMENT FIELDS ===
  idNumber: {
    name: "idNumber",
    type: "id_document",
    label: "ID number",
    example: "123456",
    validation: /^[A-Z0-9]+$/i,
    required: true,
  },
  issuedBy: {
    name: "issuedBy",
    type: "text",
    label: "Issued by",
    example: "Cyprus",
    required: true,
    description: "Country that issued the ID",
  },
  buyerIdType: {
    name: "buyerIdType",
    type: "enum",
    label: "Buyer's ID type",
    example: "Cyprus ID or Passport",
    required: true,
  },
  buyerIdNumber: {
    name: "buyerIdNumber",
    type: "id_document",
    label: "Buyer's ID number",
    example: "945119",
    required: true,
  },
  vendorIdType: {
    name: "vendorIdType",
    type: "enum",
    label: "Vendor's ID type",
    example: "Cyprus ID or HE number",
    required: true,
  },
  vendorIdNumber: {
    name: "vendorIdNumber",
    type: "id_document",
    label: "Vendor's ID number",
    example: "945119",
    required: true,
  },

  // === DATE/TIME FIELDS ===
  date: {
    name: "date",
    type: "date",
    label: "Date",
    example: "20/12/2025",
    validation: /^\d{1,2}\/\d{1,2}\/\d{4}$/,
    required: true,
  },
  viewingDateTime: {
    name: "viewingDateTime",
    type: "date",
    label: "Viewing date and time",
    example: "Monday 20th January at 14:00",
    required: true,
  },

  // === PROPERTY FIELDS ===
  propertyInfo: {
    name: "propertyInfo",
    type: "property_registration",
    label: "Property to be introduced",
    example:
      "Reg. No. 0/1789 Germasogeia, Limassol OR Limas Building Flat No. 103 Tala, Paphos OR 2-bedroom apartment in Germasogeia",
    required: true,
    description:
      "Property registration info for sales OR property description for rentals",
  },
  propertyReg: {
    name: "propertyReg",
    type: "property_registration",
    label: "Property registration number",
    example: "0/1234",
    validation: /^\d+\/\d+$/,
    required: true,
  },
  propertyDescription: {
    name: "propertyDescription",
    type: "text",
    label: "Full property description",
    example:
      "Apartment with Registration Number 0/9029, situated in Mouttayiaka, Limassol",
    required: true,
  },
  propertyRegistration: {
    name: "propertyRegistration",
    type: "property_registration",
    label: "Property registration",
    example: "Reg No. 0/12345 Tala, Paphos",
    required: true,
  },

  // === LOCATION FIELDS ===
  district: {
    name: "district",
    type: "text",
    label: "District",
    example: "Paphos",
    required: true,
  },
  municipality: {
    name: "municipality",
    type: "text",
    label: "Municipality",
    example: "Germasogeia",
    required: false,
  },
  locality: {
    name: "locality",
    type: "text",
    label: "Locality",
    example: "Universal",
    required: false,
  },
  location: {
    name: "location",
    type: "text",
    label: "Location",
    example: "Paphos",
    required: true,
  },
  region: {
    name: "region",
    type: "text",
    label: "Region",
    example: "Paphos",
    required: true,
  },
  cityRegion: {
    name: "cityRegion",
    type: "text",
    label: "City/Region",
    example: "Cyprus",
    required: true,
  },

  // === CURRENCY FIELDS ===
  marketingPrice: {
    name: "marketingPrice",
    type: "currency",
    label: "Marketing price",
    example: "350,000",
    validation: /^[€$]?\s*[\d,]+$/,
    required: true,
  },
  reservationFee: {
    name: "reservationFee",
    type: "currency",
    label: "Reservation fee",
    example: "10,000",
    required: true,
  },
  purchasePrice: {
    name: "purchasePrice",
    type: "currency",
    label: "Purchase price",
    example: "435,000",
    required: true,
  },
  valuationFee: {
    name: "valuationFee",
    type: "currency",
    label: "Valuation fee",
    example: "250 + VAT",
    required: true,
    description: "Always include + VAT",
  },
  recommendedPrice: {
    name: "recommendedPrice",
    type: "currency",
    label: "Recommended asking price",
    example: "350,000",
    required: true,
  },
  sellingPriceRange: {
    name: "sellingPriceRange",
    type: "text",
    label: "Likely selling price range",
    example: "320,000 - 340,000",
    required: true,
  },

  // === URL FIELDS ===
  propertyLink: {
    name: "propertyLink",
    type: "url",
    label: "Property link",
    example: "https://www.zyprus.com/property/12345",
    validation: /^https?:\/\/.+/,
    required: false,
  },
  link: {
    name: "link",
    type: "url",
    label: "Property link",
    example: "https://www.zyprus.com/property/12345",
    validation: /^https?:\/\/.+/,
    required: true,
  },
  links: {
    name: "links",
    type: "url",
    label: "Property links",
    example: "Link 1, Link 2",
    required: true,
    description: "Two or more property links",
  },

  // === BOOLEAN FIELDS ===
  hasLoan: {
    name: "hasLoan",
    type: "boolean",
    label: "Loan clause",
    example: "Yes/No",
    required: true,
    description: "Is the buyer getting a bank loan/mortgage?",
  },
  hasVat: {
    name: "hasVat",
    type: "boolean",
    label: "VAT clause",
    example: "Yes/No",
    required: true,
    description: "Is VAT applicable to this property?",
  },

  // === OTHER FIELDS ===
  fullName: {
    name: "fullName",
    type: "name",
    label: "Client's full name",
    example: "Andreas Andreou",
    required: true,
  },
  projectName: {
    name: "projectName",
    type: "text",
    label: "Project name",
    example: "Limas Project",
    required: false,
  },
  agencyFee: {
    name: "agencyFee",
    type: "text",
    label: "Agency fee",
    example: "5%",
    required: false,
    description: "Default 5% if not provided",
  },
  paymentPercentage: {
    name: "paymentPercentage",
    type: "text",
    label: "Payment percentage",
    example: "50%",
    required: false,
    description: "Default 50% if not provided",
  },
  invoiceNumber: {
    name: "invoiceNumber",
    type: "text",
    label: "Invoice number",
    example: "11271",
    required: true,
  },
  transactionType: {
    name: "transactionType",
    type: "enum",
    label: "Transaction type",
    example: "sale or rent",
    required: true,
  },
  propertyType: {
    name: "propertyType",
    type: "text",
    label: "Property type",
    example: "apartment",
    required: true,
  },
};

/**
 * Get field definition by name
 */
export function getFieldDefinition(fieldName: string): FieldDefinition | null {
  return FIELD_DEFINITIONS[fieldName] ?? null;
}

/**
 * Validate a field value
 */
export function validateField(fieldName: string, value: string): boolean {
  const field = FIELD_DEFINITIONS[fieldName];
  if (!field) return true; // Unknown field, allow

  if (field.required && (!value || value.trim() === "")) {
    return false;
  }

  if (field.validation && value) {
    return field.validation.test(value);
  }

  return true;
}

/**
 * Generate field prompt for a template
 * Returns the text to ask the user for missing fields
 */
export function generateFieldPrompt(
  templateId: string,
  missingFields: string[]
): string {
  const template = TEMPLATE_REGISTRY[templateId.padStart(2, "0")];
  if (!template || missingFields.length === 0) return "";

  const lines: string[] = [];
  lines.push(`I'll create the ${template.name} for you. Please provide:`);
  lines.push("");

  for (const fieldName of missingFields) {
    const field = FIELD_DEFINITIONS[fieldName];
    if (field) {
      lines.push(`**${field.label}** (e.g., ${field.example})`);
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}

/**
 * Get required fields for a template
 */
export function getRequiredFields(templateId: string): FieldDefinition[] {
  const template = TEMPLATE_REGISTRY[templateId.padStart(2, "0")];
  if (!template) return [];

  return template.requiredFields
    .map((name) => FIELD_DEFINITIONS[name])
    .filter((f): f is FieldDefinition => f !== undefined);
}

/**
 * Get optional fields for a template
 */
export function getOptionalFields(templateId: string): FieldDefinition[] {
  const template = TEMPLATE_REGISTRY[templateId.padStart(2, "0")];
  if (!template?.optionalFields) return [];

  return template.optionalFields
    .map((name) => FIELD_DEFINITIONS[name])
    .filter((f): f is FieldDefinition => f !== undefined);
}

/**
 * Check if all required fields are present in extracted data
 */
export function hasAllRequiredFields(
  templateId: string,
  extractedFields: Record<string, string>
): boolean {
  const template = TEMPLATE_REGISTRY[templateId.padStart(2, "0")];
  if (!template) return false;

  for (const fieldName of template.requiredFields) {
    const value = extractedFields[fieldName];
    if (!value || value.trim() === "") {
      return false;
    }
  }

  return true;
}

/**
 * Get list of missing required fields
 */
export function getMissingFields(
  templateId: string,
  extractedFields: Record<string, string>
): string[] {
  const template = TEMPLATE_REGISTRY[templateId.padStart(2, "0")];
  if (!template) return [];

  const missing: string[] = [];
  for (const fieldName of template.requiredFields) {
    const value = extractedFields[fieldName];
    if (!value || value.trim() === "") {
      missing.push(fieldName);
    }
  }

  return missing;
}
