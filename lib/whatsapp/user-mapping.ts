import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { chat, user, supabaseAgent } from "@/lib/db/schema";
import { generateUUID } from "@/lib/utils";

/**
 * Get or create a user for a WhatsApp phone number.
 * First checks if the phone is a registered Zyprus agent, otherwise creates a guest user.
 */
export async function getOrCreateWhatsAppUser(phoneNumber: string): Promise<{
  id: string;
  email: string;
  name: string | null;
  type: "regular";
  isAgent: boolean;
  agentId?: string;
}> {
  // Normalize phone number (remove spaces, ensure + prefix)
  const normalizedPhone = phoneNumber.replace(/\s+/g, "");

  // TODO: WhatsApp agent identification - agents table doesn't have whatsappPhoneNumber field
  // For now, treat all WhatsApp users as guests
  // When agents.whatsapp_phone_number is added, uncomment this block:
  /*
  const [agent] = await db
    .select()
    .from(supabaseAgent)
    .where(
      and(
        eq(supabaseAgent.whatsappPhoneNumber, normalizedPhone),
        eq(supabaseAgent.isActive, true)
      )
    )
    .limit(1);

  if (agent) {
    const email = agent.communicationEmail || `whatsapp_${normalizedPhone}@sofia.zyprus.local`;
    const newUserId = generateUUID();

    await db.insert(user).values({
      id: newUserId,
      email,
    });

    return {
      id: newUserId,
      email,
      name: agent.fullName,
      type: "regular",
      isAgent: true,
      agentId: agent.id,
    };
  }
  */

  // Not a registered agent - create/find guest user
  const guestEmail = `whatsapp_${normalizedPhone}@sofia.guest.local`;

  const [existingUser] = await db
    .select()
    .from(user)
    .where(eq(user.email, guestEmail))
    .limit(1);

  if (existingUser) {
    return {
      id: existingUser.id,
      email: existingUser.email,
      name: `WhatsApp User ${normalizedPhone.slice(-4)}`, // Display name for UI
      type: "regular",
      isAgent: false,
    };
  }

  // Create new guest user
  const newUserId = generateUUID();
  const displayName = `WhatsApp User ${normalizedPhone.slice(-4)}`;

  await db.insert(user).values({
    id: newUserId,
    email: guestEmail,
  });

  return {
    id: newUserId,
    email: guestEmail,
    name: displayName, // Display name for UI purposes, not stored in user table
    type: "regular",
    isAgent: false,
  };
}

/**
 * Get or create a chat session for a WhatsApp user.
 * Each WhatsApp conversation gets a persistent chat for history.
 */
export async function getOrCreateWhatsAppChat(
  userId: string,
  phoneNumber: string
): Promise<{ id: string; title: string; isNew: boolean }> {
  // Find the most recent chat for this user
  const [existingChat] = await db
    .select()
    .from(chat)
    .where(eq(chat.userId, userId))
    .orderBy(desc(chat.createdAt))
    .limit(1);

  // Reuse existing chat if it's recent (within 24 hours)
  if (existingChat) {
    const chatAge = Date.now() - existingChat.createdAt.getTime();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    if (chatAge < maxAge) {
      return {
        id: existingChat.id,
        title: existingChat.title,
        isNew: false,
      };
    }
  }

  // Create new chat
  const newChatId = generateUUID();
  const phoneLastFour = phoneNumber.slice(-4);
  const title = `WhatsApp Chat ${phoneLastFour} - ${new Date().toLocaleDateString()}`;

  await db.insert(chat).values({
    id: newChatId,
    userId,
    title,
    visibility: "private",
    createdAt: new Date(),
  });

  return {
    id: newChatId,
    title,
    isNew: true,
  };
}

/**
 * Check if a WhatsApp phone number is a registered Zyprus agent.
 * Used to determine permissions and capabilities.
 * NOTE: agents table doesn't have whatsappPhoneNumber field yet.
 */
export async function isRegisteredAgent(phoneNumber: string): Promise<boolean> {
  // TODO: Implement when agents.whatsapp_phone_number is added
  return false;
}

/**
 * Update last active timestamp for a WhatsApp user's agent record.
 * NOTE: agents table doesn't have lastActiveAt field. Function is a no-op.
 */
export async function updateAgentLastActive(agentId: string): Promise<void> {
  // TODO: Add last_active_at to agents table if needed
  // No-op for now
}
