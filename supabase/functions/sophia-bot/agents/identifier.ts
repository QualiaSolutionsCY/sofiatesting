/**
 * Agent Identifier Module
 * Matches WhatsApp phone numbers to agents in the database
 */

import { getSupabaseAdmin } from "../../_shared/db.ts";
import { USER_FALLBACKS } from "../config/business-rules.ts";
import { LogCategory, logger } from "../utils/logger.ts";

export interface Agent {
  id: string;
  fullName: string;
  mobile: string;
  communicationEmail: string;
  listingOwnerEmail: string;
  region: "paphos" | "limassol" | "larnaca" | "nicosia" | "famagusta" | "all";
  role: "management" | "manager" | "agent";
  canUpload: boolean;
  landline?: string; // Office landline for CREA compliance
}

/**
 * Normalize phone number for comparison
 * Removes spaces, dashes, and +357 prefix
 */
export function normalizePhone(phone: string): string {
  // Remove all non-digit characters
  let normalized = phone.replace(/\D/g, "");

  // Remove Cyprus country code if present
  if (normalized.startsWith("357")) {
    normalized = normalized.slice(3);
  }

  // Remove leading zero if present
  if (normalized.startsWith("0")) {
    normalized = normalized.slice(1);
  }

  return normalized;
}

/**
 * Identify agent by their WhatsApp phone number
 * Uses normalized phone matching to handle various formats
 */
export async function identifyAgentByPhone(
  phone: string
): Promise<Agent | null> {
  const supabase = getSupabaseAdmin();
  const normalized = normalizePhone(phone);

  // Validate normalized phone contains only digits (defense in depth)
  if (!/^\d+$/.test(normalized) || normalized.length < 6) {
    logger.debug("[AgentIdentifier] Invalid normalized phone", {
      category: LogCategory.DATABASE,
    });
    return null;
  }

  // Try using the last 8 digits for matching (normalized is already digit-only, safe for filter)
  const last8 = normalized.slice(-8);

  // Use separate ilike queries to avoid filter injection with .or() string interpolation
  // First try with last 8 digits
  const { data: partialData, error: partialError } = await supabase
    .from("agents")
    .select("*")
    .ilike("mobile", `%${last8}%`)
    .limit(1)
    .maybeSingle();

  if (!partialError && partialData) {
    logger.debug(
      `[AgentIdentifier] Found agent: ${partialData.full_name} (${partialData.region})`,
      { category: LogCategory.DATABASE }
    );
    return mapAgentData(partialData);
  }

  // Try with full normalized number
  const { data: fullData, error: fullError } = await supabase
    .from("agents")
    .select("*")
    .ilike("mobile", `%${normalized}%`)
    .limit(1)
    .maybeSingle();

  if (!fullError && fullData) {
    logger.debug(
      `[AgentIdentifier] Found agent: ${fullData.full_name} (${fullData.region})`,
      { category: LogCategory.DATABASE }
    );
    return mapAgentData(fullData);
  }

  logger.debug("[AgentIdentifier] No agent found for phone", {
    category: LogCategory.DATABASE,
    normalized,
  });
  return null;
}

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
 * Get agent by email address
 * Uses separate queries to avoid filter injection vulnerabilities
 */
export async function getAgentByEmail(email: string): Promise<Agent | null> {
  const supabase = getSupabaseAdmin();

  // Sanitize email to prevent filter injection
  const sanitizedEmail = sanitizeEmailForFilter(email);
  if (!sanitizedEmail || !sanitizedEmail.includes("@")) {
    logger.debug("[AgentIdentifier] Invalid email format", {
      category: LogCategory.DATABASE,
    });
    return null;
  }

  // Use separate queries to avoid filter injection with .or() string interpolation
  // First try communication_email
  const { data: commData, error: commError } = await supabase
    .from("agents")
    .select("*")
    .eq("communication_email", sanitizedEmail)
    .limit(1)
    .maybeSingle();

  if (!commError && commData) {
    return mapAgentData(commData);
  }

  // Then try listing_owner_email
  const { data: ownerData, error: ownerError } = await supabase
    .from("agents")
    .select("*")
    .eq("listing_owner_email", sanitizedEmail)
    .limit(1)
    .maybeSingle();

  if (!ownerError && ownerData) {
    return mapAgentData(ownerData);
  }

  // Fallback: check USER_FALLBACKS alias map (e.g. listings@zyprus.com → Lauren's UUID)
  // Some agents use multiple email addresses not stored in the agents table
  const fallbackUuid = USER_FALLBACKS[sanitizedEmail];
  if (fallbackUuid) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("agents")
      .select("*")
      .eq("zyprus_user_id", fallbackUuid)
      .limit(1)
      .maybeSingle();

    if (!fallbackError && fallbackData) {
      logger.info(
        `[AgentIdentifier] Found agent via USER_FALLBACKS alias: ${fallbackData.full_name}`,
        {
          category: LogCategory.DATABASE,
          aliasEmail: sanitizedEmail,
        }
      );
      return mapAgentData(fallbackData);
    }
  }

  return null;
}

/**
 * Map database row to Agent interface
 */
function mapAgentData(data: Record<string, unknown>): Agent {
  return {
    id: data.id as string,
    fullName: data.full_name as string,
    mobile: data.mobile as string,
    communicationEmail: data.communication_email as string,
    listingOwnerEmail: data.listing_owner_email as string,
    region: data.region as Agent["region"],
    role: data.role as Agent["role"],
    canUpload: data.can_upload as boolean,
    landline: data.landline as string | undefined,
  };
}

/**
 * Get all agents in a specific region
 */
export async function getAgentsByRegion(region: string): Promise<Agent[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("region", region)
    .eq("can_upload", true);

  if (error || !data) {
    return [];
  }

  return data.map((d: Record<string, unknown>) => mapAgentData(d));
}
