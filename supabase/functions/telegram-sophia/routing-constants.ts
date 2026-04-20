/**
 * Routing Constants for Telegram Lead Forwarding
 * Based on SOPHIA spec routing rules
 */

// ==========================================
// AGENT GROUP LISTS
// ==========================================

/**
 * Paphos region leads - Actual Paphos team + Lauren for testing
 * Marios A (Listings), Dimitris (Listings), Evelina (Rentals+Listings), Marios P (Invoices+Listings)
 */
export const PAPHOS_AGENTS = ["Marios Azinas", "Dimitris Panayiotou", "Evelina Neophytou", "Marios Polyviou", "Lauren Ellingham"];

/**
 * Paphos office-owned fallback agents (50/50 when listing belongs to office)
 * Only Marios A and Dimitris receive office-owned leads
 */
export const PAPHOS_OFFICE_FALLBACK_AGENTS = ["Marios Azinas", "Dimitris Panayiotou"];

/**
 * "Others" group leads (Nicosia, Famagusta)
 * Evan (Ivan Kazakov), Narime (Narine Akopyan), Michelle Longridge
 * Note: Vasia receives forwarded enquiries (people who call/enquire)
 */
export const OTHERS_GROUP_AGENTS = ["Ivan Kazakov", "Narine Akopyan", "Michelle Longridge"];

/**
 * Limassol region leads - Michelle is the Limassol manager
 * TODO: Add Diana Kultaseva once Telegram ID is available
 */
export const LIMASSOL_AGENTS = ["Michelle Longridge", "Lauren Ellingham", "Qualia Admin"];

/**
 * Larnaca region leads - Same as Limassol for now
 */
export const LARNACA_AGENTS = ["Michelle Longridge", "Lauren Ellingham", "Qualia Admin"];

/**
 * Russian-speaking agent preference
 */
export const RUSSIAN_SPEAKER_AGENT = "Diana Kultaseva";

/**
 * Regional managers for fallback routing
 */
export const REGIONAL_MANAGERS: Record<string, string> = {
  paphos: "Marios Azinas",
  larnaca: "Lysandros Ioanni",
  famagusta: "Narine Akopyan",
  nicosia: "Ivan Kazakov",
  limassol: "Michelle Longridge",
};

// ==========================================
// DETECTION PATTERNS
// ==========================================

/**
 * Pattern to detect when client requests a specific agent by name
 * Matches: "wants to speak with John", "asked for Maria", "requesting Diana"
 */
export const AGENT_REQUEST_PATTERN =
  /(?:wants?\s+to\s+speak\s+with|asked?\s+for|requesting?|speak(?:ing)?\s+(?:to|with))\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i;

/**
 * Pattern to detect lead-related messages
 * Matches: lead, client, enquiry, interested, viewing, buyer
 */
export const LEAD_MENTION_PATTERN =
  /\b(lead|client|enquiry|inquiry|interested|viewing|buyer|purchaser|customer|prospect)\b/i;

/**
 * Pattern to extract property reference IDs
 * Matches: ZYP-1234, ZYP1234, zyprus.com/property/xyz
 * Note: Use PROPERTY_REF_PATTERN_GLOBAL for .match()/.matchAll(), use PROPERTY_REF_PATTERN for .test()
 */
export const PROPERTY_REF_PATTERN = /ZYP[-]?\d+/i; // For .test() - no global flag
export const PROPERTY_REF_PATTERN_GLOBAL = /ZYP[-]?\d+/gi; // For .match() - with global flag
export const PROPERTY_URL_PATTERN =
  /zyprus\.com\/(?:property|properties|listing)\/([a-zA-Z0-9-]+)/gi;

/**
 * Cyrillic character range for Russian detection
 */
const CYRILLIC_PATTERN = /[\u0400-\u04FF]/;

/**
 * Slavic name suffixes for Russian speaker detection
 */
const SLAVIC_SUFFIXES = [
  "ova",
  "eva",
  "ina",
  "aya",
  "sky",
  "ski",
  "vich",
  "enko",
  "uk",
  "ko",
];

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Detect if text contains Russian language (Cyrillic or Slavic names)
 */
export const detectRussianLanguage = (text: string): boolean => {
  // Check for Cyrillic characters
  if (CYRILLIC_PATTERN.test(text)) {
    return true;
  }

  // Check for Slavic name patterns
  const words = text.toLowerCase().split(/\s+/);
  for (const word of words) {
    for (const suffix of SLAVIC_SUFFIXES) {
      if (word.endsWith(suffix) && word.length > suffix.length + 2) {
        return true;
      }
    }
  }

  return false;
};

/**
 * Check if group type is "others" (Nicosia, Famagusta)
 */
export const isOthersGroup = (groupType: string | null): boolean => {
  return groupType === "others";
};

/**
 * Check if region is Limassol (case-insensitive)
 */
export const isLimassolRegion = (region: string | null): boolean => {
  return region?.toLowerCase() === "limassol";
};

/**
 * Check if region is Larnaca (case-insensitive)
 */
export const isLarnacaRegion = (region: string | null): boolean => {
  return region?.toLowerCase() === "larnaca";
};

/**
 * Detect group type from group name
 */
export const detectGroupType = (
  name: string | null
): string => {
  if (!name) return "others";

  const nameLower = name.toLowerCase();

  if (nameLower.includes("alla") || nameLower.includes("all")) return "all";
  if (nameLower.includes("limassol")) return "limassol";
  if (nameLower.includes("paphos") || nameLower.includes("pafos")) return "paphos";
  if (nameLower.includes("larnaca") || nameLower.includes("larnaka")) return "larnaca";
  if (nameLower.includes("nicosia") || nameLower.includes("lefkosia")) return "nicosia";
  if (nameLower.includes("famagusta") || nameLower.includes("ammochostos")) return "famagusta";

  return "others";
};

/**
 * Detect region from group name
 */
export const detectRegionFromName = (name: string | null): string | null => {
  if (!name) return null;

  const nameLower = name.toLowerCase();

  if (nameLower.includes("limassol")) return "limassol";
  if (nameLower.includes("paphos") || nameLower.includes("pafos")) return "paphos";
  if (nameLower.includes("larnaca") || nameLower.includes("larnaka")) return "larnaca";
  if (nameLower.includes("nicosia") || nameLower.includes("lefkosia")) return "nicosia";
  if (nameLower.includes("famagusta") || nameLower.includes("ammochostos")) return "famagusta";
  if (nameLower.includes("alla") || nameLower.includes("all")) return "all";

  return null;
};

/**
 * Extract property reference IDs from message text
 */
export const extractPropertyIds = (text: string): string[] => {
  const ids: string[] = [];

  // Match ZYP-1234 or ZYP1234 patterns (use global pattern for .match())
  const refMatches = text.match(PROPERTY_REF_PATTERN_GLOBAL);
  if (refMatches) {
    ids.push(...refMatches.map((m) => m.toUpperCase()));
  }

  // Match zyprus.com property links
  for (const urlMatch of text.matchAll(PROPERTY_URL_PATTERN)) {
    ids.push(urlMatch[1]);
  }

  return [...new Set(ids)]; // Remove duplicates
};

/**
 * Check if message is lead-related
 * ONLY triggers on: zyprus.com URL or property ID
 * Does NOT trigger on generic keywords like "lead", "client", etc.
 */
export const isLeadMessage = (text: string): boolean => {
  // Has zyprus.com URL (property or land)
  if (text.includes("zyprus.com")) return true;

  // Has property reference ID (ZYP-1234 or ZYP1234)
  if (PROPERTY_REF_PATTERN.test(text)) return true;

  // Has numeric ID pattern like "ID: 32417" or "ID:32417"
  if (/\bID[:\s]+\d{4,}/i.test(text)) return true;

  return false;
};

/**
 * Extract requested agent name from message
 */
export const extractRequestedAgent = (text: string): string | null => {
  const match = text.match(AGENT_REQUEST_PATTERN);
  return match ? match[1] : null;
};

/**
 * Normalise a phone number into search variants.
 *
 * Examples:
 *   00447748700937 -> ["00447748700937", "447748700937"]
 *   +35796565606   -> ["+35796565606", "35796565606", "96565606"]
 *   96565606       -> ["96565606", "35796565606", "+35796565606"]
 */
export const normalizePhoneForSearch = (phone: string): string[] => {
  const cleaned = phone.replace(/[\s\-()]/g, "");
  const variants = new Set<string>();
  variants.add(cleaned);

  if (cleaned.startsWith("+")) {
    const noPlus = cleaned.slice(1);
    variants.add(noPlus);
    if (noPlus.startsWith("357") && noPlus.length > 3) variants.add(noPlus.slice(3));
  }
  if (cleaned.startsWith("00")) {
    const no00 = cleaned.slice(2);
    variants.add(no00);
    if (no00.startsWith("357") && no00.length > 3) variants.add(no00.slice(3));
  }
  if (/^357\d+/.test(cleaned) && cleaned.length > 3) {
    variants.add(cleaned.slice(3));
  }
  // Cyprus local number -> add 357 and +357 variants
  if (/^9\d{7}$/.test(cleaned)) {
    variants.add(`357${cleaned}`);
    variants.add(`+357${cleaned}`);
  }

  return [...variants];
};

/**
 * Extract the caller's phone number from a forwarded lead message.
 *
 * Prefers international-format numbers (+XX... or 00XX...) because those are
 * what the call-tracker pastes into Telegram (e.g. "00447748700937").
 * Falls back to 8-digit Cyprus local numbers only when the digits aren't
 * part of a Zyprus property ID (`ID: 39777`, `zyprus.com/property/12345`).
 *
 * Returns the digits-only canonical form. Leading `+` is dropped; leading
 * `00` is kept (the normalizer strips it later when building search variants).
 * `null` if nothing reliable was found.
 */
export const extractCallerPhone = (text: string): string | null => {
  if (!text) return null;

  const masked = text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\bID[:\s]+\d{3,}/gi, " ")
    .replace(PROPERTY_REF_PATTERN_GLOBAL, " ");

  const international = masked.match(/(?:\+|00)\s?\d[\d\s().-]{8,18}/);
  if (international) {
    const digits = international[0].replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15) return digits;
  }

  const cyLocal = masked.match(/(?<!\d)(9[5-9]\d{6})(?!\d)/);
  if (cyLocal) return cyLocal[1];

  return null;
};

/**
 * Pattern to extract full Zyprus URLs for API lookup
 * Matches: www.zyprus.com/land/32417/... or zyprus.com/property/12345/...
 */
export const ZYPRUS_URL_PATTERN =
  /(?:https?:\/\/)?(?:www\.)?zyprus\.com\/(property|land)\/(\d+)(?:\/[^\s]*)*/gi;

/**
 * Extract full Zyprus URLs from message text
 * Returns array of URLs like ["www.zyprus.com/land/32417/..."]
 */
export const extractZyprusUrls = (text: string): string[] => {
  const urls: string[] = [];

  // Reset regex state
  ZYPRUS_URL_PATTERN.lastIndex = 0;

  let match;
  while ((match = ZYPRUS_URL_PATTERN.exec(text)) !== null) {
    // Normalize to full URL
    const url = match[0].startsWith("http")
      ? match[0]
      : `https://www.${match[0]}`;
    urls.push(url);
  }

  return [...new Set(urls)]; // Remove duplicates
};

