/**
 * WhatsApp Session Manager
 * Tracks user conversation state and menu context using Redis for persistence
 */

import { Redis } from "@upstash/redis";
import { logger } from "../logger";

const log = logger.whatsapp.child("session");

export type SessionState = {
  currentMenu?:
    | "main"
    | "templates"
    | "calculator"
    | "listing"
    | "listing_type";
  lastMenuSent?: string;
  listingData?: Partial<{
    type: string;
    location: string;
    price: string;
    bedrooms: number;
    bathrooms: number;
    size: string;
    // ... other fields
  }>;
  pendingAction?: {
    type: string;
    data?: Record<string, unknown>;
  };
  lastActivity: number;
};

// Redis configuration
const SESSION_PREFIX = "whatsapp:session:";
const SESSION_TTL_SECONDS = 1800; // 30 minutes

// In-memory fallback cache (used if Redis fails)
const memoryCache = new Map<string, SessionState>();

// Redis client (lazy initialization)
let redisClient: Redis | null = null;

/**
 * Get Redis client with lazy initialization
 */
const getRedis = (): Redis | null => {
  if (redisClient) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    log.warn("REDIS_URL not configured, using in-memory fallback");
    return null;
  }

  try {
    const parsedRedisUrl = new URL(redisUrl);
    const redisToken = parsedRedisUrl.password;

    if (!redisToken) {
      log.warn("REDIS_URL missing password, using in-memory fallback");
      return null;
    }

    redisClient = new Redis({
      url: redisUrl,
      token: redisToken,
    });

    return redisClient;
  } catch (error) {
    log.error("Failed to initialize Redis", error);
    return null;
  }
};

/**
 * Create a default session
 */
const createDefaultSession = (): SessionState => ({
  lastActivity: Date.now(),
});

/**
 * Get or create session for a phone number (async with Redis)
 */
export async function getSession(phoneNumber: string): Promise<SessionState> {
  const redis = getRedis();

  if (redis) {
    try {
      const key = `${SESSION_PREFIX}${phoneNumber}`;
      const session = await redis.get<SessionState>(key);

      if (session) {
        // Update lastActivity and refresh TTL
        session.lastActivity = Date.now();
        await redis.set(key, session, { ex: SESSION_TTL_SECONDS });
        return session;
      }

      // Create new session
      const newSession = createDefaultSession();
      await redis.set(key, newSession, { ex: SESSION_TTL_SECONDS });
      return newSession;
    } catch (error) {
      log.error("Redis get failed", error);
      // Fall through to memory cache
    }
  }

  // Fallback to memory cache
  cleanupMemoryCache();
  const existing = memoryCache.get(phoneNumber);
  if (existing) {
    existing.lastActivity = Date.now();
    return existing;
  }

  const newSession = createDefaultSession();
  memoryCache.set(phoneNumber, newSession);
  return newSession;
}

/**
 * Update session state (async with Redis)
 */
export async function updateSession(
  phoneNumber: string,
  updates: Partial<SessionState>
): Promise<void> {
  const redis = getRedis();
  const key = `${SESSION_PREFIX}${phoneNumber}`;

  if (redis) {
    try {
      const current = await getSession(phoneNumber);
      const updated = { ...current, ...updates, lastActivity: Date.now() };
      await redis.set(key, updated, { ex: SESSION_TTL_SECONDS });
      return;
    } catch (error) {
      log.error("Redis set failed", error);
      // Fall through to memory cache
    }
  }

  // Fallback to memory cache
  const session = memoryCache.get(phoneNumber) || createDefaultSession();
  Object.assign(session, updates, { lastActivity: Date.now() });
  memoryCache.set(phoneNumber, session);
}

/**
 * Clear session (async with Redis)
 */
export async function clearSession(phoneNumber: string): Promise<void> {
  const redis = getRedis();
  const key = `${SESSION_PREFIX}${phoneNumber}`;

  if (redis) {
    try {
      await redis.del(key);
    } catch (error) {
      log.error("Redis del failed", error);
    }
  }

  // Always clear from memory cache too
  memoryCache.delete(phoneNumber);
}

/**
 * Clean up expired sessions in memory cache
 */
const cleanupMemoryCache = (): void => {
  const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;
  const now = Date.now();
  for (const [phone, session] of memoryCache.entries()) {
    if (now - session.lastActivity > SESSION_TTL_MS) {
      memoryCache.delete(phone);
    }
  }
};

/**
 * Handle menu selection based on current context (async)
 */
export async function handleMenuSelection(
  phoneNumber: string,
  selection: number
): Promise<{ action: string; data?: Record<string, unknown> } | null> {
  const session = await getSession(phoneNumber);

  if (!session.currentMenu) {
    // Main menu selection
    switch (selection) {
      case 1:
        await updateSession(phoneNumber, { currentMenu: "templates" });
        return { action: "show_templates" };
      case 2:
        await updateSession(phoneNumber, { currentMenu: "listing" });
        return { action: "start_listing" };
      case 3:
        await updateSession(phoneNumber, { currentMenu: "calculator" });
        return { action: "show_calculators" };
      case 4:
        return { action: "show_status" };
      default:
        return null;
    }
  }

  switch (session.currentMenu) {
    case "templates":
      return await handleTemplateSelection(phoneNumber, selection);
    case "calculator":
      return await handleCalculatorSelection(phoneNumber, selection);
    case "listing_type":
      return await handleListingTypeSelection(phoneNumber, selection);
    default:
      return null;
  }
}

/**
 * Handle template menu selection (async)
 */
async function handleTemplateSelection(
  phoneNumber: string,
  selection: number
): Promise<{ action: string; data?: Record<string, unknown> } | null> {
  // Updated to match actual template-config.json keys
  const templates = [
    "seller_registration",
    "bank_registration_property", // Fixed: was "bank_registration"
    "viewing_form",
    "marketing_agreement_exclusive", // Fixed: was "marketing_agreement"
    "followup_viewed", // Fixed: was "followup_email"
    "valuation_report", // Fixed: was "valuation_email"
    "offer_submission",
    "other",
  ];

  if (selection < 1 || selection > templates.length) {
    return null;
  }

  const templateId = templates[selection - 1];

  if (templateId === "other") {
    // Show extended template list
    return { action: "show_more_templates" };
  }

  // Check if it's an email template (text) or document (DOCX)
  const emailTemplates = [
    "followup_viewed",
    "valuation_report",
    "introduction_email",
    "welcome_email",
    "property_match",
    "price_reduction",
  ];

  const isEmail = emailTemplates.includes(templateId);

  await clearSession(phoneNumber); // Reset after selection
  return {
    action: isEmail ? "generate_email_template" : "generate_document",
    data: { template: templateId },
  };
}

/**
 * Handle calculator menu selection (async)
 */
async function handleCalculatorSelection(
  phoneNumber: string,
  selection: number
): Promise<{ action: string; data?: Record<string, unknown> } | null> {
  const calculators = ["vat", "transfer_fees", "capital_gains"];

  if (selection < 1 || selection > calculators.length) {
    return null;
  }

  const calcType = calculators[selection - 1];
  await clearSession(phoneNumber);

  return {
    action: "start_calculator",
    data: { type: calcType },
  };
}

/**
 * Handle listing type selection (async)
 */
async function handleListingTypeSelection(
  phoneNumber: string,
  selection: number
): Promise<{ action: string; data?: Record<string, unknown> } | null> {
  const types = ["apartment", "house", "land", "commercial"];

  if (selection < 1 || selection > types.length) {
    return null;
  }

  const propertyType = types[selection - 1];
  await updateSession(phoneNumber, {
    listingData: { type: propertyType },
    currentMenu: "listing",
  });

  return {
    action: "continue_listing",
    data: { type: propertyType },
  };
}

/**
 * Build listing progress message (async)
 */
export async function getListingProgress(phoneNumber: string): Promise<string> {
  const session = await getSession(phoneNumber);
  const data = session.listingData || {};

  const required = [
    { field: "type", label: "Property Type", value: data.type },
    { field: "location", label: "Location", value: data.location },
    { field: "price", label: "Price", value: data.price },
    { field: "size", label: "Size (sqm)", value: data.size },
    { field: "bedrooms", label: "Bedrooms", value: data.bedrooms },
    { field: "bathrooms", label: "Bathrooms", value: data.bathrooms },
  ];

  let message = "📋 *Property Listing Progress*\n\n";
  let nextNeeded: string | null = null;

  for (const field of required) {
    if (field.value) {
      message += `✅ ${field.label}: ${field.value}\n`;
    } else {
      message += `⏳ ${field.label}: _needed_\n`;
      if (!nextNeeded) {
        nextNeeded = field.label;
      }
    }
  }

  if (nextNeeded) {
    message += `\n*Please provide the ${nextNeeded}:*`;
  } else {
    message += "\n✨ *All basic info collected!*\nNow I need:\n";
    message += "- Swimming pool (yes/no/communal)\n";
    message += "- Parking (yes/no)\n";
    message += "- Air conditioning (yes/no)\n";
    message += "- Owner name & phone\n";
  }

  return message;
}
