/**
 * Tool Argument Validation
 * Validates tool inputs against Zod schemas to prevent injection attacks (SEC-04)
 */

import { z } from "https://esm.sh/zod@3.22.4";
import { TOOL_SCHEMAS } from "./schemas.ts";

/**
 * Result of tool argument validation
 */
export type ValidationResult =
  | { valid: true; data: Record<string, unknown> }
  | { valid: false; error: string; issues?: string[] };

/**
 * Validates tool arguments against their Zod schema
 *
 * Prevents malicious payloads (negative numbers, oversized strings, SQL injection)
 * from reaching tool handlers by validating all inputs before execution.
 *
 * @param toolName - Name of the tool being called
 * @param args - Tool arguments from OpenRouter
 * @returns Validation result with typed data or error details
 *
 * @example
 * ```typescript
 * const result = validateToolArguments("createPropertyListing", {
 *   price: -1000,  // Invalid: negative price
 *   location: "Paphos"
 * });
 * if (!result.valid) {
 *   console.error(result.error, result.issues);
 *   // "Invalid arguments" ["price: Number must be greater than 0"]
 * }
 * ```
 */
export function validateToolArguments(
  toolName: string,
  args: Record<string, unknown>
): ValidationResult {
  // Look up schema for this tool
  const schema = TOOL_SCHEMAS[toolName];

  if (!schema) {
    return {
      valid: false,
      error: `Unknown tool: ${toolName}`,
    };
  }

  // Pre-validation: fix common AI mistakes that cause Zod rejections
  if (toolName === "createPropertyListing" || toolName === "createLandListing") {
    // coveredArea: < 10 → remove (Zyprus API rejects < 10 sqm, forces AI to ask agent)
    if (typeof args.coveredArea === "number" && args.coveredArea < 10) delete args.coveredArea;
    // mainPhotoIndex: 0 → remove (Zod requires positive)
    if (args.mainPhotoIndex === 0) delete args.mainPhotoIndex;
    // price: reject absurd values (likely phone numbers parsed as price)
    if (typeof args.price === "number" && args.price > 50_000_000) {
      return {
        valid: false,
        error: `Price €${args.price.toLocaleString()} exceeds €50M limit — this is likely a phone number, not a price`,
      };
    }
  }

  // Validate arguments against schema
  const result = schema.safeParse(args);

  if (result.success) {
    return {
      valid: true,
      data: result.data as Record<string, unknown>,
    };
  }

  // Extract validation issues for logging
  const issues = result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`
  );

  return {
    valid: false,
    error: "Invalid arguments",
    issues,
  };
}
