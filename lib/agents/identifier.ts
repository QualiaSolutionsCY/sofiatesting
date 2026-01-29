import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agentChatSession, zyprusAgent } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const log = createLogger("agents");

/**
 * Agent Identification Utilities
 *
 * These functions identify Zyprus agents across different platforms
 * (web, Telegram, WhatsApp) and track their chat sessions.
 */

export type IdentifiedAgent = {
  id: string;
  userId: string | null;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  region: string;
  role: string;
  isActive: boolean;
  telegramUserId: string | null; // Stored as varchar(64) for Telegram user IDs
  whatsappPhoneNumber: string | null;
  lastActiveAt: Date | null;
  registeredAt: Date | null;
};

/**
 * Identify agent by Telegram user ID
 */
export async function identifyAgentByTelegram(
  telegramUserId: string | number
): Promise<IdentifiedAgent | null> {
  // Convert number to string if needed (Telegram sends numbers)
  const userIdStr =
    typeof telegramUserId === "number"
      ? String(telegramUserId)
      : telegramUserId;
  try {
    const [agent] = await db
      .select()
      .from(zyprusAgent)
      .where(
        and(
          eq(zyprusAgent.telegramUserId, userIdStr),
          eq(zyprusAgent.isActive, true)
        )
      )
      .limit(1);

    if (!agent) {
      return null;
    }

    // Update last active timestamp
    await db
      .update(zyprusAgent)
      .set({ lastActiveAt: new Date() })
      .where(eq(zyprusAgent.id, agent.id));

    return agent;
  } catch (error) {
    log.error("Error identifying agent by Telegram", error, { telegramUserId });
    return null;
  }
}

/**
 * Identify agent by WhatsApp phone number
 */
export async function identifyAgentByWhatsApp(
  phoneNumber: string
): Promise<IdentifiedAgent | null> {
  try {
    // Normalize phone number (remove spaces, ensure +357 prefix)
    const normalized = phoneNumber.trim();

    const [agent] = await db
      .select()
      .from(zyprusAgent)
      .where(
        and(
          eq(zyprusAgent.whatsappPhoneNumber, normalized),
          eq(zyprusAgent.isActive, true)
        )
      )
      .limit(1);

    if (!agent) {
      return null;
    }

    // Update last active timestamp
    await db
      .update(zyprusAgent)
      .set({ lastActiveAt: new Date() })
      .where(eq(zyprusAgent.id, agent.id));

    return agent;
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
      .from(zyprusAgent)
      .where(
        and(
          eq(zyprusAgent.email, email.toLowerCase()),
          eq(zyprusAgent.isActive, true)
        )
      )
      .limit(1);

    if (!agent) {
      return null;
    }

    // Update last active timestamp
    await db
      .update(zyprusAgent)
      .set({ lastActiveAt: new Date() })
      .where(eq(zyprusAgent.id, agent.id));

    return agent;
  } catch (error) {
    log.error("Error identifying agent by email", error, { email });
    return null;
  }
}

/**
 * Identify agent by user ID (for registered agents)
 */
export async function identifyAgentByUserId(
  userId: string
): Promise<IdentifiedAgent | null> {
  try {
    const [agent] = await db
      .select()
      .from(zyprusAgent)
      .where(
        and(eq(zyprusAgent.userId, userId), eq(zyprusAgent.isActive, true))
      )
      .limit(1);

    if (!agent) {
      return null;
    }

    // Update last active timestamp
    await db
      .update(zyprusAgent)
      .set({ lastActiveAt: new Date() })
      .where(eq(zyprusAgent.id, agent.id));

    return agent;
  } catch (error) {
    log.error("Error identifying agent by user ID", error, { userId });
    return null;
  }
}

/**
 * Track agent chat session (creates or updates session)
 */
export async function trackAgentSession(params: {
  agentId: string;
  chatId: string;
  platform: "web" | "telegram" | "whatsapp";
  platformUserId: string;
}): Promise<string> {
  try {
    const { agentId, chatId, platform, platformUserId } = params;

    // Check if session exists for this agent + chat
    const [existingSession] = await db
      .select()
      .from(agentChatSession)
      .where(
        and(
          eq(agentChatSession.agentId, agentId),
          eq(agentChatSession.chatId, chatId)
        )
      )
      .limit(1);

    if (existingSession) {
      // Update existing session
      await db
        .update(agentChatSession)
        .set({
          endedAt: null, // Session is ongoing
        })
        .where(eq(agentChatSession.id, existingSession.id));

      return existingSession.id;
    }

    // Create new session
    const [session] = await db
      .insert(agentChatSession)
      .values({
        agentId,
        chatId,
        platform,
        platformUserId,
        startedAt: new Date(),
        messageCount: 0,
        documentCount: 0,
        calculatorCount: 0,
        listingCount: 0,
        totalTokensUsed: 0,
        totalCostUsd: "0",
      })
      .returning();

    return session.id;
  } catch (error) {
    log.error("Error tracking agent session", error);
    throw error;
  }
}

/**
 * Update agent session statistics
 */
export async function updateAgentSessionStats(
  sessionId: string,
  updates: {
    messageCount?: number;
    documentCount?: number;
    calculatorCount?: number;
    listingCount?: number;
    tokensUsed?: number;
    costUsd?: string;
  }
): Promise<void> {
  try {
    const updateData: any = {};

    if (updates.messageCount !== undefined) {
      updateData.messageCount = updates.messageCount;
    }
    if (updates.documentCount !== undefined) {
      updateData.documentCount = updates.documentCount;
    }
    if (updates.calculatorCount !== undefined) {
      updateData.calculatorCount = updates.calculatorCount;
    }
    if (updates.listingCount !== undefined) {
      updateData.listingCount = updates.listingCount;
    }
    if (updates.tokensUsed !== undefined) {
      updateData.totalTokensUsed = updates.tokensUsed;
    }
    if (updates.costUsd !== undefined) {
      updateData.totalCostUsd = updates.costUsd;
    }

    await db
      .update(agentChatSession)
      .set(updateData)
      .where(eq(agentChatSession.id, sessionId));
  } catch (error) {
    log.error("Error updating agent session stats", error, { sessionId });
    // Don't throw - stats updates shouldn't break the flow
  }
}

/**
 * End agent session
 */
export async function endAgentSession(sessionId: string): Promise<void> {
  try {
    await db
      .update(agentChatSession)
      .set({ endedAt: new Date() })
      .where(eq(agentChatSession.id, sessionId));
  } catch (error) {
    log.error("Error ending agent session", error, { sessionId });
    // Don't throw - session end shouldn't break the flow
  }
}

/**
 * Check if user is a Zyprus agent
 */
export async function isZyprusAgent(userId: string): Promise<boolean> {
  try {
    const agent = await identifyAgentByUserId(userId);
    return agent !== null;
  } catch (error) {
    log.error("Error checking agent status", error, { userId });
    return false;
  }
}

/**
 * Get agent's current entitlements
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
  const agent = await identifyAgentByUserId(userId);

  if (!agent) {
    return {
      isAgent: false,
      maxMessagesPerDay: 10_000, // Regular user limit
      availableModels: ["chat-model", "chat-model-sonnet", "chat-model-gpt4o"],
      hasPriorityQueue: false,
      hasInternalTools: false,
    };
  }

  // Zyprus agents get unlimited access
  return {
    isAgent: true,
    maxMessagesPerDay: 100_000, // Effectively unlimited
    availableModels: ["chat-model", "chat-model-sonnet", "chat-model-gpt4o"],
    hasPriorityQueue: true,
    hasInternalTools: true,
  };
}
