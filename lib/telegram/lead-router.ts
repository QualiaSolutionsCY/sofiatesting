import "server-only";
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  leadForwardingRotation,
  telegramGroup,
  telegramLead,
  zyprusAgent,
} from "../db/schema";
import { getTelegramClient } from "./client";
import {
  AGENT_REQUEST_PATTERN,
  detectRussianLanguage,
  isLarnacaRegion,
  isLimassolRegion,
  isOthersGroup,
  LARNACA_AGENTS,
  LIMASSOL_AGENTS,
  OTHERS_GROUP_AGENTS,
  PRIORITY_AGENTS,
  RUSSIAN_SPEAKER_AGENT,
} from "./routing-constants";
import type { TelegramMessage } from "./types";

// Top-level regex for lead mention detection
const LEAD_MENTION_PATTERN =
  /\b(lead|client|enquiry|inquiry|interested|viewing|buyer|purchaser)\b/i;

/**
 * Check if the chat type is a group or supergroup
 */
export function isGroupChat(
  chatType: string
): chatType is "group" | "supergroup" {
  return chatType === "group" || chatType === "supergroup";
}

/**
 * Extract property reference IDs from message text
 * Matches patterns like: ZYP-1234, ZYP1234, or zyprus.com/property/xyz links
 */
export function extractPropertyIds(text: string): string[] {
  const ids: string[] = [];

  // Match ZYP-1234 or ZYP1234 patterns
  const refPattern = /ZYP[-]?\d+/gi;
  const refMatches = text.match(refPattern);
  if (refMatches) {
    ids.push(...refMatches.map((m) => m.toUpperCase().replace("-", "-")));
  }

  // Match zyprus.com property links
  const urlPattern =
    /zyprus\.com\/(?:property|properties|listing)\/([a-zA-Z0-9-]+)/gi;
  for (const urlMatch of text.matchAll(urlPattern)) {
    ids.push(urlMatch[1]);
  }

  return [...new Set(ids)]; // Remove duplicates
}

/**
 * Get or create a Telegram group record
 */
async function getOrCreateGroup(
  chatId: number,
  title: string | undefined,
  type: string
): Promise<typeof telegramGroup.$inferSelect | null> {
  try {
    // Try to find existing group
    const [existingGroup] = await db
      .select()
      .from(telegramGroup)
      .where(eq(telegramGroup.groupId, chatId))
      .limit(1);

    if (existingGroup) {
      // Update title if changed
      if (title && existingGroup.groupName !== title) {
        await db
          .update(telegramGroup)
          .set({ groupName: title })
          .where(eq(telegramGroup.id, existingGroup.id));
      }
      return existingGroup;
    }

    // Detect group type from name
    const groupType = detectGroupType(title);

    // Create new group record
    const [newGroup] = await db
      .insert(telegramGroup)
      .values({
        groupId: chatId,
        groupName: title || `Telegram ${type}`,
        groupType,
        region: detectRegionFromName(title),
        isActive: true,
        leadRoutingEnabled: true,
      })
      .returning();

    console.log("Created new Telegram group record:", {
      id: newGroup.id,
      groupName: newGroup.groupName,
      groupId: chatId,
    });

    return newGroup;
  } catch (error) {
    console.error("Error getting/creating Telegram group:", error);
    return null;
  }
}

/**
 * Detect group type from name
 */
function detectGroupType(name: string | undefined): string {
  if (!name) {
    return "others";
  }

  const nameLower = name.toLowerCase();

  if (nameLower.includes("alla") || nameLower.includes("all")) {
    return "all";
  }
  if (nameLower.includes("limassol")) {
    return "limassol";
  }
  if (nameLower.includes("paphos") || nameLower.includes("pafos")) {
    return "paphos";
  }
  if (nameLower.includes("larnaca") || nameLower.includes("larnaka")) {
    return "larnaca";
  }
  if (nameLower.includes("nicosia") || nameLower.includes("lefkosia")) {
    return "nicosia";
  }
  if (nameLower.includes("famagusta") || nameLower.includes("ammochostos")) {
    return "famagusta";
  }

  return "others";
}

/**
 * Detect region from group name
 */
function detectRegionFromName(name: string | undefined): string | null {
  if (!name) {
    return null;
  }

  const nameLower = name.toLowerCase();

  if (nameLower.includes("limassol")) {
    return "Limassol";
  }
  if (nameLower.includes("paphos") || nameLower.includes("pafos")) {
    return "Paphos";
  }
  if (nameLower.includes("larnaca") || nameLower.includes("larnaka")) {
    return "Larnaca";
  }
  if (nameLower.includes("nicosia") || nameLower.includes("lefkosia")) {
    return "Nicosia";
  }
  if (nameLower.includes("famagusta") || nameLower.includes("ammochostos")) {
    return "Famagusta";
  }
  if (nameLower.includes("alla") || nameLower.includes("all")) {
    return "All";
  }

  return null;
}

/**
 * Get the target agent(s) for lead forwarding based on region
 * Implements SOPHIA spec routing rules:
 * - Limassol: ONLY Michelle Longridge or Diana Kultaseva
 * - Others group: ONLY Lauren Ellingham or Charalambos Pitros
 * - Other regions: Standard regional routing
 */
async function getTargetAgents(
  region: string | null,
  groupType: string | null,
  _propertyId?: string | null
): Promise<(typeof zyprusAgent.$inferSelect)[]> {
  try {
    // RULE 1: Limassol leads go ONLY to Michelle or Diana
    // Per spec: "RULE: Never forward to individual agents, FORWARD TO: Michelle OR Diana (only these two)"
    if (isLimassolRegion(region)) {
      console.log("Limassol region detected - routing to Michelle/Diana only");
      const agents = await db
        .select()
        .from(zyprusAgent)
        .where(
          and(
            inArray(zyprusAgent.fullName, LIMASSOL_AGENTS),
            eq(zyprusAgent.isActive, true)
          )
        );
      return agents;
    }

    // RULE 1.5: Larnaca leads go to Michelle/Diana (same as Limassol)
    if (isLarnacaRegion(region)) {
      console.log("Larnaca region detected - routing to Michelle/Diana");
      const agents = await db
        .select()
        .from(zyprusAgent)
        .where(
          and(
            inArray(zyprusAgent.fullName, LARNACA_AGENTS),
            eq(zyprusAgent.isActive, true)
          )
        );
      return agents;
    }

    // RULE 2: "Zyprus Others" group leads go ONLY to Lauren or Charalambos
    // Per spec: "Restricted to Lauren and Haralambos only"
    if (groupType && isOthersGroup(groupType)) {
      console.log("Others group detected - routing to Lauren/Charalambos only");
      const agents = await db
        .select()
        .from(zyprusAgent)
        .where(
          and(
            inArray(zyprusAgent.fullName, OTHERS_GROUP_AGENTS),
            eq(zyprusAgent.isActive, true)
          )
        );
      return agents;
    }

    // RULE 3: For "All Leads" group, get active agents who can receive leads
    if (!region || region === "All") {
      const agents = await db
        .select()
        .from(zyprusAgent)
        .where(
          and(
            eq(zyprusAgent.isActive, true),
            eq(zyprusAgent.canReceiveLeads, true)
          )
        )
        .limit(5);
      return agents;
    }

    // RULE 4: For other regions (Paphos, Larnaca, Nicosia, Famagusta)
    // Get agents for specific region
    const agents = await db
      .select()
      .from(zyprusAgent)
      .where(
        and(
          eq(zyprusAgent.region, region),
          eq(zyprusAgent.isActive, true),
          eq(zyprusAgent.canReceiveLeads, true)
        )
      );

    return agents;
  } catch (error) {
    console.error("Error getting target agents:", error);
    return [];
  }
}

/**
 * Detect if a client requests a specific agent by name
 * Per spec: "Client wants to speak with [Agent Name]" → Forward directly to named agent
 */
async function detectRequestedAgent(
  messageText: string
): Promise<typeof zyprusAgent.$inferSelect | null> {
  const match = messageText.match(AGENT_REQUEST_PATTERN);
  if (!match) return null;

  const requestedName = match[1].trim();
  console.log(`Detected agent request for: "${requestedName}"`);

  // Look for partial name match (first name or full name)
  const agents = await db
    .select()
    .from(zyprusAgent)
    .where(
      and(
        or(
          ilike(zyprusAgent.fullName, `${requestedName}%`),
          ilike(zyprusAgent.fullName, `% ${requestedName}%`)
        ),
        eq(zyprusAgent.isActive, true)
      )
    )
    .limit(1);

  if (agents.length > 0) {
    console.log(`Found requested agent: ${agents[0].fullName}`);
    return agents[0];
  }

  console.log(`No agent found matching: "${requestedName}"`);
  return null;
}

/**
 * Select the best agent for Limassol leads, considering Russian language preference
 * Per spec: "CONDITION: If lead appears Russian-speaking → prefer Diana"
 */
function selectLimassolAgent(
  agents: (typeof zyprusAgent.$inferSelect)[],
  isRussianSpeaking: boolean
): typeof zyprusAgent.$inferSelect | null {
  if (agents.length === 0) return null;

  // If Russian-speaking, prefer Diana
  if (isRussianSpeaking) {
    const diana = agents.find((a) => a.fullName === RUSSIAN_SPEAKER_AGENT);
    if (diana) {
      console.log("Russian-speaking lead detected - routing to Diana");
      return diana;
    }
  }

  // Otherwise return first available (will be rotated)
  return agents[0];
}

/**
 * Get the next agent in rotation for fair lead distribution
 * Uses round-robin algorithm based on stored rotation state
 */
async function getNextAgentInRotation(
  region: string,
  availableAgents: (typeof zyprusAgent.$inferSelect)[]
): Promise<typeof zyprusAgent.$inferSelect | null> {
  if (availableAgents.length === 0) {
    return null;
  }
  if (availableAgents.length === 1) {
    return availableAgents[0];
  }

  // Get current rotation state for this region
  const rotationState = await db
    .select()
    .from(leadForwardingRotation)
    .where(eq(leadForwardingRotation.region, region.toLowerCase()))
    .limit(1);

  // Sort agents by ID for consistent ordering across calls
  const sortedAgents = [...availableAgents].sort((a, b) =>
    a.id.localeCompare(b.id)
  );

  if (rotationState.length === 0 || !rotationState[0].lastForwardedToAgentId) {
    // First lead for this region - start with first agent
    console.log(
      `First lead for region ${region}, starting with ${sortedAgents[0].fullName}`
    );
    return sortedAgents[0];
  }

  const lastAgentId = rotationState[0].lastForwardedToAgentId;
  const lastIndex = sortedAgents.findIndex((a) => a.id === lastAgentId);

  if (lastIndex === -1) {
    // Last agent no longer available - start fresh
    console.log(
      `Previous agent no longer available for ${region}, restarting rotation`
    );
    return sortedAgents[0];
  }

  // Round-robin: next agent in sequence
  const nextIndex = (lastIndex + 1) % sortedAgents.length;
  const nextAgent = sortedAgents[nextIndex];

  console.log(
    `Rotation for ${region}: last was ${sortedAgents[lastIndex].fullName}, next is ${nextAgent.fullName}`
  );

  return nextAgent;
}

/**
 * Update the rotation state after successfully forwarding a lead
 */
async function updateRotationState(
  region: string,
  agentId: string
): Promise<void> {
  const now = new Date();

  try {
    await db
      .insert(leadForwardingRotation)
      .values({
        region: region.toLowerCase(),
        lastForwardedToAgentId: agentId,
        forwardCount: 1,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: leadForwardingRotation.region,
        set: {
          lastForwardedToAgentId: agentId,
          forwardCount: sql`${leadForwardingRotation.forwardCount} + 1`,
          updatedAt: now,
        },
      });

    console.log(`Updated rotation state for ${region}: agent ${agentId}`);
  } catch (error) {
    console.error(`Failed to update rotation state for ${region}:`, error);
    // Don't throw - rotation state update is non-critical
  }
}

/**
 * Check if a lead was already forwarded recently (deduplication)
 * Prevents the same property from being forwarded multiple times within 10 minutes
 */
async function isRecentDuplicate(
  propertyId: string | null,
  sourceGroupId: number
): Promise<boolean> {
  if (!propertyId) return false;

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  try {
    const recentLeads = await db
      .select({ id: telegramLead.id })
      .from(telegramLead)
      .where(
        and(
          eq(telegramLead.propertyReferenceId, propertyId),
          eq(telegramLead.sourceGroupId, sourceGroupId),
          sql`${telegramLead.createdAt} > ${tenMinutesAgo}`
        )
      )
      .limit(1);

    if (recentLeads.length > 0) {
      console.log(
        `Duplicate lead detected: ${propertyId} already forwarded within last 10 minutes`
      );
      return true;
    }

    return false;
  } catch (error) {
    console.error("Error checking for duplicate lead:", error);
    return false; // On error, allow the lead through
  }
}

/**
 * Log a lead in the database
 */
async function logLead(data: {
  propertyReferenceId: string | null;
  sourceGroupId: number;
  sourceGroupName: string | null;
  originalMessageId: string;
  originalMessageText: string | null;
  senderTelegramId: number | null;
  senderName: string | null;
  forwardedToAgentId: string | null;
  forwardedToTelegramId: string | null;
  region: string | null;
  clientLanguage?: string;
}): Promise<void> {
  try {
    await db.insert(telegramLead).values({
      propertyReferenceId: data.propertyReferenceId,
      sourceGroupId: data.sourceGroupId,
      sourceGroupName: data.sourceGroupName,
      originalMessageId: data.originalMessageId,
      originalMessageText: data.originalMessageText,
      senderTelegramId: data.senderTelegramId,
      senderName: data.senderName,
      forwardedToAgentId: data.forwardedToAgentId,
      forwardedToTelegramId: data.forwardedToTelegramId
        ? Number(data.forwardedToTelegramId)
        : null,
      propertyRegion: data.region,
      clientLanguage: data.clientLanguage || null,
      status: "forwarded",
    });
  } catch (error) {
    console.error("Error logging lead:", error);
  }
}

/**
 * Handle messages from Telegram groups
 * Main entry point for lead management
 *
 * Implements SOPHIA AI spec routing rules:
 * 1. If client requests specific agent → route directly to that agent
 * 2. Limassol leads → Michelle or Diana only (prefer Diana for Russian speakers)
 * 3. "Zyprus Others" group → Lauren or Charalambos only
 * 4. Other regions → standard regional routing with fair rotation
 */
export async function handleGroupMessage(
  message: TelegramMessage
): Promise<void> {
  const telegramClient = getTelegramClient();
  const chatId = message.chat.id;
  const messageText = message.text || message.caption || "";

  // Get or create group record
  const group = await getOrCreateGroup(
    chatId,
    message.chat.title,
    message.chat.type
  );

  // Extract property IDs from message
  const propertyIds = extractPropertyIds(messageText);

  // If no property IDs found, we don't process as a lead
  if (propertyIds.length === 0) {
    // Check if message mentions "lead", "client", "enquiry", etc.
    const isLeadMention = LEAD_MENTION_PATTERN.test(messageText);

    if (!isLeadMention) {
      // Not a lead message, ignore silently
      return;
    }
  }

  const region = group?.region || detectRegionFromName(message.chat.title);
  const groupType = group?.groupType || detectGroupType(message.chat.title);
  const primaryPropertyId = propertyIds[0] || null;

  // Check for duplicate lead (same property forwarded within 10 minutes)
  if (primaryPropertyId) {
    const isDuplicate = await isRecentDuplicate(primaryPropertyId, chatId);
    if (isDuplicate) {
      // Silently ignore duplicate leads
      console.log(`Skipping duplicate lead for property: ${primaryPropertyId}`);
      return;
    }
  }

  // Detect client language (Russian vs other)
  const senderName = message.from
    ? `${message.from.first_name || ""} ${message.from.last_name || ""}`.trim()
    : "";
  const isRussianSpeaking = detectRussianLanguage(messageText, senderName);
  const clientLanguage = isRussianSpeaking ? "russian" : "english";

  // RULE 0: Check if client requests a specific agent
  // Per spec: "Client wants to speak with [Agent Name]" → Forward directly to named agent
  const requestedAgent = await detectRequestedAgent(messageText);
  if (requestedAgent) {
    console.log(`Client requested specific agent: ${requestedAgent.fullName}`);
    await forwardLeadToAgent(
      telegramClient,
      message,
      requestedAgent,
      primaryPropertyId,
      region,
      clientLanguage,
      "Requested by client"
    );
    return;
  }

  // Get target agents based on region and group type
  const targetAgents = await getTargetAgents(
    region,
    groupType,
    primaryPropertyId
  );

  if (targetAgents.length === 0) {
    console.log("No target agents found for region:", region);
    // Acknowledge in group but note no agents available
    try {
      await telegramClient.sendMessage({
        chatId,
        text: `Lead noted. No agents currently assigned for ${region || "this region"}.`,
        replyToMessageId: message.message_id,
      });
    } catch (error) {
      console.error("Failed to send acknowledgment:", error);
    }
    return;
  }

  // Filter to agents with Telegram IDs
  const agentsWithTelegram = targetAgents.filter((a) => a.telegramUserId);

  if (agentsWithTelegram.length === 0) {
    console.log("No agents with Telegram IDs for region:", region);
    try {
      await telegramClient.sendMessage({
        chatId,
        text: `Lead noted. Agents for ${region || "this region"} are not connected to Telegram.`,
        replyToMessageId: message.message_id,
      });
    } catch (error) {
      console.error("Failed to send acknowledgment:", error);
    }
    return;
  }

  // Select agent based on routing rules
  let selectedAgent: typeof zyprusAgent.$inferSelect | null = null;
  const effectiveRegion = region || "all";

  // For Limassol, apply Russian-speaking preference
  if (isLimassolRegion(region)) {
    selectedAgent = selectLimassolAgent(agentsWithTelegram, isRussianSpeaking);
    // If Russian speaker selected Diana, don't use rotation
    if (!isRussianSpeaking) {
      selectedAgent = await getNextAgentInRotation(
        "limassol",
        agentsWithTelegram
      );
    }
  } else if (isLarnacaRegion(region)) {
    // For Larnaca, use same logic as Limassol but without Russian preference
    selectedAgent = await getNextAgentInRotation("larnaca", agentsWithTelegram);
  } else {
    // Standard rotation for other regions
    selectedAgent = await getNextAgentInRotation(
      effectiveRegion,
      agentsWithTelegram
    );
  }

  if (!selectedAgent) {
    console.log("No agent selected after rotation");
    return;
  }

  // Forward the lead
  await forwardLeadToAgent(
    telegramClient,
    message,
    selectedAgent,
    primaryPropertyId,
    region,
    clientLanguage,
    effectiveRegion
  );

  // Update rotation state for fair distribution (skip for Russian-speaking Limassol)
  if (!(isLimassolRegion(region) && isRussianSpeaking)) {
    await updateRotationState(effectiveRegion, selectedAgent.id);
  }
}

/**
 * Forward a lead to a specific agent
 * Handles the actual Telegram forwarding and logging
 */
async function forwardLeadToAgent(
  telegramClient: ReturnType<typeof getTelegramClient>,
  message: TelegramMessage,
  agent: typeof zyprusAgent.$inferSelect,
  propertyId: string | null,
  region: string | null,
  clientLanguage: string,
  routingReason: string
): Promise<void> {
  const chatId = message.chat.id;
  const messageText = message.text || message.caption || "";

  if (!agent.telegramUserId) {
    console.log(`Agent ${agent.fullName} has no Telegram ID`);
    return;
  }

  try {
    // Forward the original message
    await telegramClient.forwardMessage({
      chatId: agent.telegramUserId,
      fromChatId: chatId,
      messageId: message.message_id,
    });

    // Send context message with property and sender info
    await telegramClient.sendMessage({
      chatId: agent.telegramUserId,
      text: `New lead from ${message.chat.title || "Zyprus Group"}${
        propertyId ? `\nProperty: ${propertyId}` : ""
      }\nFrom: ${message.from?.first_name || "Unknown"} ${
        message.from?.last_name || ""
      }\nRegion: ${region || "Unknown"}${
        clientLanguage === "russian" ? "\nLanguage: Russian" : ""
      }`,
    });

    console.log(`Lead forwarded to ${agent.fullName} (${routingReason})`);

    // Log the lead
    await logLead({
      propertyReferenceId: propertyId,
      sourceGroupId: chatId,
      sourceGroupName: message.chat.title || null,
      originalMessageId: message.message_id.toString(),
      originalMessageText: messageText.substring(0, 2000),
      senderTelegramId: message.from?.id || null,
      senderName: message.from
        ? `${message.from.first_name} ${message.from.last_name || ""}`.trim()
        : null,
      forwardedToAgentId: agent.id,
      forwardedToTelegramId: agent.telegramUserId,
      region,
      clientLanguage,
    });

    // Acknowledge in group
    try {
      await telegramClient.sendMessage({
        chatId,
        text: `Lead forwarded to ${agent.fullName}`,
        replyToMessageId: message.message_id,
      });
    } catch (error) {
      console.error("Failed to send acknowledgment:", error);
    }
  } catch (error) {
    console.error(`Failed to forward to agent ${agent.fullName}:`, error);
  }
}
