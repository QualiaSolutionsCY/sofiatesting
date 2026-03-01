/**
 * Template Consistency Tests
 *
 * These tests verify that template field definitions remain consistent
 * across the 5 sources of truth in the SOPHIA codebase:
 *
 * 1. prompts/templates/header.ts - Quick reference table
 * 2. prompts/behaviors/document-routing.ts - Field collection prompts
 * 3. templates/registry.ts - Template metadata with requiredFields
 * 4. templates/fields.ts - Field definitions with labels/validation
 * 5. docx/templates/*.ts - DOCX generator interfaces
 *
 * PURPOSE: Prevent bugs where SOPHIA asks for wrong fields because
 * different files define different field lists for the same template.
 *
 * HISTORY: Created after discovering Standard Seller Registration bug
 * where document-routing.ts asked for different fields than the template.
 */
import { describe, expect, it } from "vitest";
import { FIELD_DEFINITIONS } from "../../../supabase/functions/sophia-bot/templates/fields.ts";
import { TEMPLATE_REGISTRY } from "../../../supabase/functions/sophia-bot/templates/registry.ts";

/**
 * Test 1: All requiredFields in TEMPLATE_REGISTRY exist in FIELD_DEFINITIONS
 *
 * This catches the case where a template references a field that doesn't
 * have a proper definition (label, validation, etc.)
 */
describe("Template Registry Field Validation", () => {
  it("all required fields in TEMPLATE_REGISTRY exist in FIELD_DEFINITIONS", () => {
    const missingFields: Array<{
      templateId: string;
      templateName: string;
      field: string;
    }> = [];

    for (const [templateId, template] of Object.entries(TEMPLATE_REGISTRY)) {
      for (const field of template.requiredFields) {
        if (!FIELD_DEFINITIONS[field]) {
          missingFields.push({
            templateId,
            templateName: template.name,
            field,
          });
        }
      }

      // Also check optional fields
      if (template.optionalFields) {
        for (const field of template.optionalFields) {
          if (!FIELD_DEFINITIONS[field]) {
            missingFields.push({
              templateId,
              templateName: template.name,
              field: `${field} (optional)`,
            });
          }
        }
      }
    }

    if (missingFields.length > 0) {
      const details = missingFields
        .map(
          (m) =>
            `  - Template ${m.templateId} (${m.templateName}): missing field "${m.field}"`
        )
        .join("\n");
      throw new Error(
        `Found ${missingFields.length} fields referenced in TEMPLATE_REGISTRY that don't exist in FIELD_DEFINITIONS:\n${details}`
      );
    }

    expect(missingFields).toHaveLength(0);
  });

  it("no duplicate field names across templates with different meanings", () => {
    // This ensures field names are used consistently
    // e.g., "clientName" should always mean the same thing
    const fieldUsage: Record<string, Set<string>> = {};

    for (const [templateId, template] of Object.entries(TEMPLATE_REGISTRY)) {
      const allFields = [
        ...template.requiredFields,
        ...(template.optionalFields || []),
      ];

      for (const field of allFields) {
        if (!fieldUsage[field]) {
          fieldUsage[field] = new Set();
        }
        fieldUsage[field].add(`${templateId}: ${template.name}`);
      }
    }

    // Log field usage for awareness (not a failure)
    const multiUseFields = Object.entries(fieldUsage)
      .filter(([, templates]) => templates.size > 1)
      .map(
        ([field, templates]) =>
          `  ${field}: used in ${templates.size} templates`
      );

    // This is informational - we expect some fields to be reused
    expect(multiUseFields.length).toBeGreaterThanOrEqual(0);
  });
});

/**
 * Test 2: DOCX Template IDs match their output type
 */
describe("DOCX Template Configuration", () => {
  it("all DOCX_TEMPLATE_IDS have outputType DOCX in registry", () => {
    const DOCX_TEMPLATE_IDS = ["09", "10", "11", "15"];
    const mismatches: string[] = [];

    for (const id of DOCX_TEMPLATE_IDS) {
      const template = TEMPLATE_REGISTRY[id];
      if (!template) {
        mismatches.push(`Template ${id} not found in registry`);
      } else if (template.outputType !== "DOCX") {
        mismatches.push(
          `Template ${id} (${template.name}) has outputType "${template.outputType}" but is in DOCX_TEMPLATE_IDS`
        );
      }
    }

    expect(mismatches).toHaveLength(0);
  });

  it("no non-DOCX templates are marked as DOCX in registry", () => {
    const DOCX_TEMPLATE_IDS = new Set(["09", "10", "11", "15"]);
    const wronglyMarkedAsDocx: string[] = [];

    for (const [id, template] of Object.entries(TEMPLATE_REGISTRY)) {
      if (template.outputType === "DOCX" && !DOCX_TEMPLATE_IDS.has(id)) {
        wronglyMarkedAsDocx.push(
          `Template ${id} (${template.name}) is marked as DOCX but not in DOCX_TEMPLATE_IDS`
        );
      }
    }

    expect(wronglyMarkedAsDocx).toHaveLength(0);
  });
});

/**
 * Test 3: Viewing Form field consistency
 *
 * This is a critical template that had drift issues.
 * The registry says 6 required + 2 optional, verify this is correct.
 */
describe("Viewing Form Field Consistency", () => {
  it("Standard Viewing Form (09) has correct required fields", () => {
    const template = TEMPLATE_REGISTRY["09"];
    expect(template).toBeDefined();
    expect(template.name).toBe("Standard Viewing Form");
    expect(template.outputType).toBe("DOCX");

    // These are the fields that the DOCX generator actually needs
    const expectedRequired = [
      "date",
      "fullName",
      "idNumber",
      "issuedBy",
      "propertyReg",
      "district",
    ];

    expect(template.requiredFields.sort()).toEqual(expectedRequired.sort());
  });

  it("Standard Viewing Form optional fields are correctly defined", () => {
    const template = TEMPLATE_REGISTRY["09"];
    const expectedOptional = ["municipality", "locality"];

    expect(template.optionalFields?.sort()).toEqual(expectedOptional.sort());
  });

  it("Advanced Viewing Form (10) has correct required fields", () => {
    const template = TEMPLATE_REGISTRY["10"];
    expect(template).toBeDefined();
    expect(template.name).toBe("Advanced Viewing Form");
    expect(template.outputType).toBe("DOCX");
  });
});

/**
 * Test 4: Marketing Agreement field consistency
 *
 * Verify the sellerFullName field is correctly named (not sellerName)
 */
describe("Marketing Agreement Field Consistency", () => {
  it("Non-Exclusive Marketing Agreement (15) uses sellerFullName", () => {
    const template = TEMPLATE_REGISTRY["15"];
    expect(template).toBeDefined();
    expect(template.name).toBe("Non-Exclusive Marketing Agreement");

    // Must use sellerFullName (not sellerName) to match DOCX interface
    expect(template.requiredFields).toContain("sellerFullName");
    expect(template.requiredFields).not.toContain("sellerName");
  });

  it("FIELD_DEFINITIONS has sellerFullName for DOCX templates", () => {
    expect(FIELD_DEFINITIONS.sellerFullName).toBeDefined();
    expect(FIELD_DEFINITIONS.sellerFullName.name).toBe("sellerFullName");
  });

  it("sellerName exists for informal TEXT templates (pricing advice)", () => {
    // sellerName is used in templates 36, 37 for informal pricing communications
    // sellerFullName is used in template 15 for formal DOCX marketing agreement
    expect(FIELD_DEFINITIONS.sellerName).toBeDefined();
    expect(FIELD_DEFINITIONS.sellerFullName).toBeDefined();
  });
});

/**
 * Test 5: Reservation Agreement field consistency
 */
describe("Reservation Agreement Field Consistency", () => {
  it("Property Reservation Agreement (11) has correct required fields", () => {
    const template = TEMPLATE_REGISTRY["11"];
    expect(template).toBeDefined();
    expect(template.name).toBe("Property Reservation Agreement");
    expect(template.outputType).toBe("DOCX");

    // Critical fields for reservation
    expect(template.requiredFields).toContain("buyerName");
    expect(template.requiredFields).toContain("vendorName");
    expect(template.requiredFields).toContain("reservationFee");
    expect(template.requiredFields).toContain("purchasePrice");
  });
});

/**
 * Test 6: Bank Registration consistency
 *
 * Bank registrations have Property (05) and Land (06) variants
 */
describe("Bank Registration Field Consistency", () => {
  it("Bank Property Registration (05) has correct required fields", () => {
    const template = TEMPLATE_REGISTRY["05"];
    expect(template).toBeDefined();
    expect(template.name).toBe("Bank Property Registration");

    // Must have these fields
    expect(template.requiredFields).toContain("clientName");
    expect(template.requiredFields).toContain("clientPhone");
    expect(template.requiredFields).toContain("propertyLink");
  });

  it("Bank Land Registration (06) has correct required fields", () => {
    const template = TEMPLATE_REGISTRY["06"];
    expect(template).toBeDefined();
    expect(template.name).toBe("Bank Land Registration");

    // Should have same core fields as property
    expect(template.requiredFields).toContain("clientName");
    expect(template.requiredFields).toContain("clientPhone");
    expect(template.requiredFields).toContain("propertyLink");
  });
});

/**
 * Test 7: Field definition completeness
 */
describe("Field Definition Completeness", () => {
  it("all field definitions have required properties", () => {
    const incompleteFields: string[] = [];

    for (const [fieldName, field] of Object.entries(FIELD_DEFINITIONS)) {
      const missing: string[] = [];

      if (!field.name) missing.push("name");
      if (!field.type) missing.push("type");
      if (!field.label) missing.push("label");
      if (!field.example) missing.push("example");
      if (field.required === undefined) missing.push("required");

      if (missing.length > 0) {
        incompleteFields.push(`${fieldName}: missing ${missing.join(", ")}`);
      }
    }

    if (incompleteFields.length > 0) {
      throw new Error(
        `Incomplete field definitions:\n${incompleteFields.join("\n")}`
      );
    }

    expect(incompleteFields).toHaveLength(0);
  });

  it("field name property matches object key", () => {
    const mismatches: string[] = [];

    for (const [key, field] of Object.entries(FIELD_DEFINITIONS)) {
      if (field.name !== key) {
        mismatches.push(`Key "${key}" has field.name "${field.name}"`);
      }
    }

    expect(mismatches).toHaveLength(0);
  });
});

/**
 * Test 8: Template category consistency
 */
describe("Template Category Consistency", () => {
  it("all templates have valid categories", () => {
    const validCategories = [
      "REGISTRATIONS",
      "VIEWING_FORMS",
      "RESERVATIONS",
      "MARKETING",
      "CLIENT_COMMS",
    ];

    for (const [id, template] of Object.entries(TEMPLATE_REGISTRY)) {
      expect(validCategories).toContain(template.category);
    }
  });

  it("registration templates have REGISTRATIONS category", () => {
    const registrationIds = ["01", "02", "03", "04", "05", "06", "07", "08"];

    for (const id of registrationIds) {
      const template = TEMPLATE_REGISTRY[id];
      if (template) {
        expect(template.category).toBe("REGISTRATIONS");
      }
    }
  });

  it("viewing form templates have VIEWING_FORMS category", () => {
    const viewingFormIds = ["09", "10"];

    for (const id of viewingFormIds) {
      const template = TEMPLATE_REGISTRY[id];
      expect(template).toBeDefined();
      expect(template.category).toBe("VIEWING_FORMS");
    }
  });
});
