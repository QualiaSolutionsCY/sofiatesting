import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { supabaseAgent } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const log = createLogger("agents");

/**
 * Agent Identification Utilities
 *
 * These functions identify Zyprus agents across different platforms
 * (web, Telegram, WhatsApp).
 *
 * NOTE: AgentChatSession tracking was removed in quick-18. The phantom
 * agentChatSession table never existed in production. Session tracking
 * happens via the web app's chat table.
 */

export type IdentifiedAgent = {
  id: string;
  fullName: string;
  mobile: string | null;
  communicationEmail: string | null;
  listingOwnerEmail: string | null;
  region: string | null;
  role: string | null;
  isActive: boolean | null;
  telegramUserId: number | null; // bigint53 mode = JavaScript number
  canReceiveLeads: boolean | null;
  canUpload: boolean | null;
  zyprusUserId: string | null;
  createdAt: Date | null;
};

/**
 * Identify agent by Telegram user ID
 */
export async function identifyAgentByTelegram(
  telegramUserId: string | number
): Promise<IdentifiedAgent | null> {
  // Convert to number (bigint53 mode uses JavaScript numbers)
  const telegramIdNumber =
    typeof telegramUserId === "string"
      ? Number(telegramUserId)
      : telegramUserId;
  try {
    const [agent] = await db
      .select()
      .from(supabaseAgent)
      .where(
        and(
          eq(supabaseAgent.telegramUserId, telegramIdNumber),
          eq(supabaseAgent.isActive, true)
        )
      )
      .limit(1);

    if (!agent) {
      return null;
    }

    return agent;
  } catch (error) {
    log.error("Error identifying agent by Telegram", error, { telegramUserId });
    return null;
  }
}

/**
 * Identify agent by WhatsApp phone number
 * NOTE: The agents table doesn't have a whatsappPhoneNumber field.
 * This is a placeholder for when that field is added.
 */
export async function identifyAgentByWhatsApp(
  phoneNumber: string
): Promise<IdentifiedAgent | null> {
  try {
    log.warn(
      "identifyAgentByWhatsApp called but agents table has no whatsappPhoneNumber field",
      { phoneNumber }
    );
    return null;
  } catch (error) {
    log.error("Error identifying agent by WhatsApp", error, { phoneNumber });
    return null;
  }
}

/**
 * Identify agent by email (for web authentication)
 */
export async function identifyAgentByEmail(
  email: string
): Promise<IdentifiedAgent | null> {
  try {
    const [agent] = await db
      .select()
      .from(supabaseAgent)
      .where(
        and(
          eq(supabaseAgent.communicationEmail, email.toLowerCase()),
          eq(supabaseAgent.isActive, true)
        )
      )
      .limit(1);

    if (!agent) {
      return null;
    }

    return agent;
  } catch (error) {
    log.error("Error identifying agent by email", error, { email });
    return null;
  }
}

/**
 * Check if user is a Zyprus agent
 * NOTE: The agents table doesn't have a userId field yet. This function
 * is a placeholder for when agent registration is implemented.
 */
export async function isZyprusAgent(userId: string): Promise<boolean> {
  try {
    // TODO: Add userId field to agents table when agent registration is implemented
    log.warn("isZyprusAgent called but agents table has no userId field", {
      userId,
    });
    return false;
  } catch (error) {
    log.error("Error checking agent status", error, { userId });
    return false;
  }
}

/**
 * Get agent's current entitlements
 * NOTE: This function is a placeholder until agent registration is implemented
 * with userId field in agents table.
 */
export type AgentEntitlements = {
  isAgent: boolean;
  maxMessagesPerDay: number;
  availableModels: string[];
  hasPriorityQueue: boolean;
  hasInternalTools: boolean;
};

export async function getAgentEntitlements(
  userId: string
): Promise<AgentEntitlements> {
  // TODO: Implement when agents table has userId field
  return {
    isAgent: false,
    maxMessagesPerDay: 10_000, // Regular user limit
    availableModels: ["chat-model", "chat-model-sonnet", "chat-model-gpt4o"],
    hasPriorityQueue: false,
    hasInternalTools: false,
  };
}
