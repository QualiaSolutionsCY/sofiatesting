/**
 * Routing Constants for SOPHIA AI Lead Distribution
 *
 * Based on SOPHIA_AI_SPECIFICATION.md.pdf requirements:
 * - Limassol leads go ONLY to Michelle or Diana
 * - "Zyprus Others" group leads go ONLY to Lauren or Charalambos
 * - Russian-speaking clients prefer Diana
 */

// Limassol region: ONLY these two managers receive leads
// Per spec: "RULE: Never forward to individual agents, FORWARD TO: Michelle OR Diana (only these two)"
export const LIMASSOL_AGENTS = ["Michelle Longridge", "Diana Kultaseva"];

// Larnaca region: Use same agents as Limassol (Michelle/Diana)
export const LARNACA_AGENTS = ["Michelle Longridge", "Diana Kultaseva"];

// "Zyprus Others" group (Nicosia, Larnaca, Famagusta): Lauren, Charalambos, and Lysandros
// Per spec: "RULE: Forward to regional manager of that area"
export const OTHERS_GROUP_AGENTS = ["Lauren Ellingham", "Charalambos Pitros", "Lysandros Ioanni"];

// Priority agents for office listings
export const PRIORITY_AGENTS = ["Marios Azinas", "Dimitris Panayiotou"];

// Regional account mappings for office listings
export const REGIONAL_ACCOUNTS: Record<string, string> = {
  Nicosia: "requestnicosia@zyprus.com",
  Limassol: "requestlimassol@zyprus.com",
  Larnaca: "requestlarnaca@zyprus.com",
  Famagusta: "requestfamagusta@zyprus.com",
  Paphos: "requestpaphos@zyprus.com",
};

// Reviewer assignments based on meeting notes
export const REVIEWER_RULES = {
  // For sale properties (Paphos, Limassol, Larnaca, Nicosia)
  SALE_PRIMARY_REVIEWER: "listings@zyprus.com", // Lauren's account
  SALE_SECONDARY_REVIEWER: "regional_manager", // Regional manager email

  // For sale properties (Famagusta only)
  FAMAGUSTA_REVIEWER: "regional_manager", // Only one reviewer

  // For rent properties (all areas)
  RENT_REVIEWER: "listing_owner", // Same person who sent it
};

// Russian-speaking preference
// Per spec: "CONDITION: If lead appears Russian-speaking → prefer Diana"
export const RUSSIAN_SPEAKER_AGENT = "Diana Kultaseva";

// Regional managers for fallback routing
export const REGIONAL_MANAGERS: Record<string, string> = {
  Paphos: "Marios Azinas",
  Larnaca: "Lysandros Ioanni",
  Famagusta: "Narine Akopyan",
  Nicosia: "Ivan Kazakov",
  Limassol: "Michelle Longridge", // Fallback
};

// Regex pattern for detecting when client requests a specific agent
// Per spec: "Client wants to speak with [Agent Name]" → Forward directly to named agent
export const AGENT_REQUEST_PATTERN =
  /(?:wants?\s+to\s+speak\s+with|asked?\s+for|requesting?|speak(?:ing)?\s+(?:to|with)|(?:this\s+(?:is\s+)?for)|(?:for))\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i;

/**
 * Detect if a message contains Russian language indicators
 * Checks for Cyrillic characters and common Russian name patterns
 */
export function detectRussianLanguage(
  text: string,
  senderName: string
): boolean {
  // Check for Cyrillic characters in message or sender name
  const cyrillicPattern = /[\u0400-\u04FF]/;
  if (cyrillicPattern.test(text) || cyrillicPattern.test(senderName)) {
    return true;
  }

  // Check for common Russian/Ukrainian/Slavic name suffixes
  const slavicNamePattern =
    /\b\w*(ov|ova|ev|eva|enko|sky|skaya|ich|ovich|ovna|uk|yuk|ko)\b/i;
  if (slavicNamePattern.test(senderName)) {
    return true;
  }

  return false;
}

/**
 * Check if the group type is "others" (Nicosia, Larnaca, Famagusta)
 * These leads should ONLY go to Lauren or Charalambos per spec
 */
export function isOthersGroup(groupType: string): boolean {
  return groupType === "others";
}

/**
 * Check if region is Limassol - special routing applies
 */
export function isLimassolRegion(region: string | null): boolean {
  return region?.toLowerCase() === "limassol";
}

/**
 * Check if region is Larnaca - uses Michelle/Diana rotation
 */
export function isLarnacaRegion(region: string | null): boolean {
  return region?.toLowerCase() === "larnaca";
}

/**
 * Check if agent is a priority agent (Marios/Dimitris)
 */
export function isPriorityAgent(agentName: string | null): boolean {
  if (!agentName) return false;
  return PRIORITY_AGENTS.some((priority) =>
    agentName.toLowerCase().includes(priority.toLowerCase())
  );
}
