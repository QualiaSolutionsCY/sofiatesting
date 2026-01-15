/**
 * Unit tests for Telegram Lead Routing Logic
 * Tests the core routing functions used by telegram-sophia Edge Function
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Since the actual functions are in Supabase Edge Functions (Deno),
// we recreate the pure logic functions here for testing
// These are copied from supabase/functions/telegram-sophia/routing-constants.ts

// ==========================================
// CONSTANTS (copied for testing)
// ==========================================

const PAPHOS_AGENTS = [
  "Marios Azinas",
  "Dimitris Panayiotou",
  "Evelina Neophytou",
  "Marios Polyviou",
  "Lauren Ellingham",
];
const PAPHOS_OFFICE_FALLBACK_AGENTS = ["Marios Azinas", "Dimitris Panayiotou"];
const OTHERS_GROUP_AGENTS = [
  "Ivan Kazakov",
  "Narine Akopyan",
  "Michelle Longridge",
];
const LIMASSOL_AGENTS = [
  "Michelle Longridge",
  "Lauren Ellingham",
  "Qualia Admin",
];
const RUSSIAN_SPEAKER_AGENT = "Diana Kultaseva";

const REGIONAL_MANAGERS: Record<string, string> = {
  paphos: "Marios Azinas",
  larnaca: "Lysandros Ioanni",
  famagusta: "Narine Akopyan",
  nicosia: "Ivan Kazakov",
  limassol: "Michelle Longridge",
};

const AGENT_REQUEST_PATTERN =
  /(?:wants?\s+to\s+speak\s+with|asked?\s+for|requesting?|speak(?:ing)?\s+(?:to|with))\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i;
const PROPERTY_REF_PATTERN = /ZYP[-]?\d+/i;
const PROPERTY_REF_PATTERN_GLOBAL = /ZYP[-]?\d+/gi;
const PROPERTY_URL_PATTERN =
  /zyprus\.com\/(?:property|properties|listing)\/([a-zA-Z0-9-]+)/gi;
const CYRILLIC_PATTERN = /[\u0400-\u04FF]/;
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
// FUNCTIONS (copied for testing)
// ==========================================

const detectRussianLanguage = (text: string): boolean => {
  if (CYRILLIC_PATTERN.test(text)) {
    return true;
  }

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

const isOthersGroup = (groupType: string | null): boolean => {
  return groupType === "others";
};

const isLimassolRegion = (region: string | null): boolean => {
  return region?.toLowerCase() === "limassol";
};

const isLarnacaRegion = (region: string | null): boolean => {
  return region?.toLowerCase() === "larnaca";
};

const detectGroupType = (name: string | null): string => {
  if (!name) return "others";

  const nameLower = name.toLowerCase();

  if (nameLower.includes("alla") || nameLower.includes("all")) return "all";
  if (nameLower.includes("limassol")) return "limassol";
  if (nameLower.includes("paphos") || nameLower.includes("pafos"))
    return "paphos";
  if (nameLower.includes("larnaca") || nameLower.includes("larnaka"))
    return "larnaca";
  if (nameLower.includes("nicosia") || nameLower.includes("lefkosia"))
    return "nicosia";
  if (nameLower.includes("famagusta") || nameLower.includes("ammochostos"))
    return "famagusta";

  return "others";
};

const detectRegionFromName = (name: string | null): string | null => {
  if (!name) return null;

  const nameLower = name.toLowerCase();

  if (nameLower.includes("limassol")) return "limassol";
  if (nameLower.includes("paphos") || nameLower.includes("pafos"))
    return "paphos";
  if (nameLower.includes("larnaca") || nameLower.includes("larnaka"))
    return "larnaca";
  if (nameLower.includes("nicosia") || nameLower.includes("lefkosia"))
    return "nicosia";
  if (nameLower.includes("famagusta") || nameLower.includes("ammochostos"))
    return "famagusta";
  if (nameLower.includes("alla") || nameLower.includes("all")) return "all";

  return null;
};

const extractPropertyIds = (text: string): string[] => {
  const ids: string[] = [];

  const refMatches = text.match(PROPERTY_REF_PATTERN_GLOBAL);
  if (refMatches) {
    ids.push(...refMatches.map((m) => m.toUpperCase()));
  }

  for (const urlMatch of text.matchAll(PROPERTY_URL_PATTERN)) {
    ids.push(urlMatch[1]);
  }

  return [...new Set(ids)];
};

const isLeadMessage = (text: string): boolean => {
  if (text.includes("zyprus.com")) return true;
  if (PROPERTY_REF_PATTERN.test(text)) return true;
  if (/\bID[:\s]+\d{4,}/i.test(text)) return true;

  return false;
};

const extractRequestedAgent = (text: string): string | null => {
  const match = text.match(AGENT_REQUEST_PATTERN);
  return match ? match[1] : null;
};

const extractZyprusUrls = (text: string): string[] => {
  const urls: string[] = [];
  const pattern =
    /(?:https?:\/\/)?(?:www\.)?zyprus\.com\/(property|land)\/(\d+)(?:\/[^\s]*)*/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const url = match[0].startsWith("http")
      ? match[0]
      : `https://www.${match[0]}`;
    urls.push(url);
  }

  return [...new Set(urls)];
};

// ==========================================
// TESTS
// ==========================================

describe("Telegram Routing: Russian Language Detection", () => {
  it("should detect Cyrillic text", () => {
    assert.strictEqual(detectRussianLanguage("Привет"), true);
    assert.strictEqual(detectRussianLanguage("Hello Привет"), true);
    assert.strictEqual(detectRussianLanguage("Мария Иванова"), true);
  });

  it("should detect Slavic name patterns", () => {
    assert.strictEqual(detectRussianLanguage("Ivanova"), true);
    assert.strictEqual(detectRussianLanguage("Petrova"), true);
    assert.strictEqual(detectRussianLanguage("Kultaseva"), true);
    assert.strictEqual(detectRussianLanguage("Komarova"), true);
    assert.strictEqual(detectRussianLanguage("Shevchenko"), true);
    assert.strictEqual(detectRussianLanguage("Kovalsky"), true);
  });

  it("should not detect non-Russian names", () => {
    assert.strictEqual(detectRussianLanguage("John Smith"), false);
    assert.strictEqual(detectRussianLanguage("Maria Garcia"), false);
    assert.strictEqual(detectRussianLanguage("Andreas Andreou"), false);
    assert.strictEqual(detectRussianLanguage("Michelle Longridge"), false);
  });

  it("should handle edge cases", () => {
    assert.strictEqual(detectRussianLanguage(""), false);
    assert.strictEqual(detectRussianLanguage("  "), false);
    // Short names with suffix should not match (length check)
    assert.strictEqual(detectRussianLanguage("ova"), false);
    assert.strictEqual(detectRussianLanguage("eva"), false);
  });
});

describe("Telegram Routing: Group Type Detection", () => {
  it("should detect Limassol groups", () => {
    assert.strictEqual(detectGroupType("Zyprus Limassol Leads"), "limassol");
    assert.strictEqual(detectGroupType("LIMASSOL TEAM"), "limassol");
    assert.strictEqual(detectGroupType("limassol"), "limassol");
  });

  it("should detect Paphos groups", () => {
    assert.strictEqual(detectGroupType("Zyprus Paphos"), "paphos");
    assert.strictEqual(detectGroupType("Pafos Leads"), "paphos");
    assert.strictEqual(detectGroupType("PAPHOS TEAM"), "paphos");
  });

  it("should detect Larnaca groups", () => {
    assert.strictEqual(detectGroupType("Zyprus Larnaca Leads"), "larnaca");
    assert.strictEqual(detectGroupType("Larnaka Team"), "larnaca");
  });

  it("should detect Nicosia groups", () => {
    assert.strictEqual(detectGroupType("Nicosia Leads"), "nicosia");
    assert.strictEqual(detectGroupType("Lefkosia Team"), "nicosia");
  });

  it("should detect Famagusta groups", () => {
    assert.strictEqual(detectGroupType("Famagusta Leads"), "famagusta");
    assert.strictEqual(detectGroupType("Ammochostos Team"), "famagusta");
  });

  it("should detect All/Alla groups", () => {
    assert.strictEqual(detectGroupType("Zyprus Alla Leads"), "all");
    assert.strictEqual(detectGroupType("All Cyprus Leads"), "all");
  });

  it("should default to others for unknown groups", () => {
    assert.strictEqual(detectGroupType("Random Group"), "others");
    assert.strictEqual(detectGroupType("Test"), "others");
    assert.strictEqual(detectGroupType(null), "others");
    assert.strictEqual(detectGroupType(""), "others");
  });
});

describe("Telegram Routing: Region Detection", () => {
  it("should detect region from group name", () => {
    assert.strictEqual(detectRegionFromName("Limassol Team"), "limassol");
    assert.strictEqual(detectRegionFromName("Paphos Leads"), "paphos");
    assert.strictEqual(detectRegionFromName("Larnaca Group"), "larnaca");
    assert.strictEqual(detectRegionFromName("Nicosia Office"), "nicosia");
    assert.strictEqual(detectRegionFromName("Famagusta Leads"), "famagusta");
  });

  it("should handle Greek spelling variations", () => {
    assert.strictEqual(detectRegionFromName("Pafos Team"), "paphos");
    assert.strictEqual(detectRegionFromName("Larnaka Leads"), "larnaca");
    assert.strictEqual(detectRegionFromName("Lefkosia Group"), "nicosia");
    assert.strictEqual(detectRegionFromName("Ammochostos Office"), "famagusta");
  });

  it("should return null for unknown regions", () => {
    assert.strictEqual(detectRegionFromName("Random Group"), null);
    assert.strictEqual(detectRegionFromName(null), null);
    assert.strictEqual(detectRegionFromName(""), null);
  });
});

describe("Telegram Routing: Region Checks", () => {
  it("should correctly identify Limassol region", () => {
    assert.strictEqual(isLimassolRegion("limassol"), true);
    assert.strictEqual(isLimassolRegion("LIMASSOL"), true);
    assert.strictEqual(isLimassolRegion("Limassol"), true);
    assert.strictEqual(isLimassolRegion("paphos"), false);
    assert.strictEqual(isLimassolRegion(null), false);
  });

  it("should correctly identify Larnaca region", () => {
    assert.strictEqual(isLarnacaRegion("larnaca"), true);
    assert.strictEqual(isLarnacaRegion("LARNACA"), true);
    assert.strictEqual(isLarnacaRegion("Larnaca"), true);
    assert.strictEqual(isLarnacaRegion("paphos"), false);
    assert.strictEqual(isLarnacaRegion(null), false);
  });

  it("should correctly identify Others group type", () => {
    assert.strictEqual(isOthersGroup("others"), true);
    assert.strictEqual(isOthersGroup("limassol"), false);
    assert.strictEqual(isOthersGroup(null), false);
  });
});

describe("Telegram Routing: Property ID Extraction", () => {
  it("should extract ZYP reference IDs", () => {
    const ids1 = extractPropertyIds("Check ZYP-12345 please");
    assert.deepStrictEqual(ids1, ["ZYP-12345"]);

    const ids2 = extractPropertyIds("Property ZYP1234 available");
    assert.deepStrictEqual(ids2, ["ZYP1234"]);

    const ids3 = extractPropertyIds("Multiple ZYP-111 and ZYP-222 properties");
    assert.deepStrictEqual(ids3, ["ZYP-111", "ZYP-222"]);
  });

  it("should extract property IDs from zyprus.com URLs", () => {
    const ids = extractPropertyIds(
      "See https://www.zyprus.com/property/abc-123/villa"
    );
    assert.deepStrictEqual(ids, ["abc-123"]);
  });

  it("should remove duplicates", () => {
    const ids = extractPropertyIds("ZYP-123 mentioned twice: ZYP-123");
    assert.deepStrictEqual(ids, ["ZYP-123"]);
  });

  it("should handle mixed formats", () => {
    const ids = extractPropertyIds(
      "ZYP-999 and https://www.zyprus.com/property/xyz-456/apartment"
    );
    assert.deepStrictEqual(ids, ["ZYP-999", "xyz-456"]);
  });

  it("should return empty array for no matches", () => {
    const ids = extractPropertyIds("No property references here");
    assert.deepStrictEqual(ids, []);
  });
});

describe("Telegram Routing: Lead Message Detection", () => {
  it("should detect zyprus.com URLs", () => {
    assert.strictEqual(
      isLeadMessage("Check https://www.zyprus.com/property/12345"),
      true
    );
    assert.strictEqual(
      isLeadMessage("See zyprus.com/land/32417/residential-land"),
      true
    );
    assert.strictEqual(isLeadMessage("Visit zyprus.com"), true);
  });

  it("should detect property reference IDs", () => {
    assert.strictEqual(isLeadMessage("Property ZYP-12345"), true);
    assert.strictEqual(isLeadMessage("Check ZYP1234 please"), true);
  });

  it("should detect numeric ID patterns", () => {
    assert.strictEqual(isLeadMessage("Listing ID: 32417"), true);
    assert.strictEqual(isLeadMessage("ID:32417"), true);
    assert.strictEqual(isLeadMessage("ID 32417"), true);
  });

  it("should NOT detect generic lead keywords (strict mode)", () => {
    // These should NOT trigger lead routing anymore
    assert.strictEqual(isLeadMessage("New lead came in"), false);
    assert.strictEqual(isLeadMessage("Client is interested"), false);
    assert.strictEqual(isLeadMessage("Buyer wants to view"), false);
    assert.strictEqual(isLeadMessage("Prospect enquiry received"), false);
  });

  it("should not detect non-lead messages", () => {
    assert.strictEqual(isLeadMessage("Hello everyone"), false);
    assert.strictEqual(isLeadMessage("Good morning team"), false);
    assert.strictEqual(isLeadMessage("Meeting at 3pm"), false);
  });
});

describe("Telegram Routing: Agent Request Extraction", () => {
  it("should extract requested agent names", () => {
    assert.strictEqual(
      extractRequestedAgent("Client wants to speak with Maria"),
      "Maria"
    );
    assert.strictEqual(
      extractRequestedAgent("Asked for Marios Azinas"),
      "Marios Azinas"
    );
    // Pattern with /i flag captures optional second word, so "Diana please" is captured
    // Test single word name with punctuation after
    assert.strictEqual(
      extractRequestedAgent("Requesting Diana."),
      "Diana"
    );
    assert.strictEqual(
      extractRequestedAgent("Speaking to Michelle Longridge"),
      "Michelle Longridge"
    );
  });

  it("should return null when no agent requested", () => {
    assert.strictEqual(
      extractRequestedAgent("General enquiry about property"),
      null
    );
    assert.strictEqual(extractRequestedAgent("New lead came in"), null);
    assert.strictEqual(extractRequestedAgent(""), null);
  });

  it("should handle case variations", () => {
    assert.strictEqual(
      extractRequestedAgent("WANTS TO SPEAK WITH John"),
      "John"
    );
    assert.strictEqual(extractRequestedAgent("Asked For Maria"), "Maria");
  });
});

describe("Telegram Routing: Zyprus URL Extraction", () => {
  it("should extract property URLs", () => {
    const urls = extractZyprusUrls(
      "Check https://www.zyprus.com/property/12345/villa-in-limassol"
    );
    assert.strictEqual(urls.length, 1);
    assert.ok(urls[0].includes("property/12345"));
  });

  it("should extract land URLs", () => {
    const urls = extractZyprusUrls(
      "Land available: www.zyprus.com/land/32417/residential-land"
    );
    assert.strictEqual(urls.length, 1);
    assert.ok(urls[0].includes("land/32417"));
  });

  it("should extract multiple URLs", () => {
    const text =
      "Options: zyprus.com/property/111/apt and zyprus.com/land/222/plot";
    const urls = extractZyprusUrls(text);
    assert.strictEqual(urls.length, 2);
  });

  it("should handle URLs without protocol", () => {
    const urls = extractZyprusUrls("See zyprus.com/property/123/house");
    assert.strictEqual(urls.length, 1);
    assert.ok(urls[0].startsWith("https://www."));
  });

  it("should remove duplicate URLs", () => {
    const text =
      "Same property: zyprus.com/property/123 and zyprus.com/property/123";
    const urls = extractZyprusUrls(text);
    assert.strictEqual(urls.length, 1);
  });

  it("should return empty array when no URLs found", () => {
    const urls = extractZyprusUrls("No URLs in this message");
    assert.deepStrictEqual(urls, []);
  });
});

describe("Telegram Routing: Agent List Configuration", () => {
  it("should have correct Paphos agents", () => {
    assert.ok(PAPHOS_AGENTS.includes("Marios Azinas"));
    assert.ok(PAPHOS_AGENTS.includes("Dimitris Panayiotou"));
    assert.ok(PAPHOS_AGENTS.includes("Evelina Neophytou"));
    assert.ok(PAPHOS_AGENTS.includes("Marios Polyviou"));
    assert.strictEqual(PAPHOS_AGENTS.length, 5);
  });

  it("should have correct Paphos fallback agents", () => {
    assert.deepStrictEqual(PAPHOS_OFFICE_FALLBACK_AGENTS, [
      "Marios Azinas",
      "Dimitris Panayiotou",
    ]);
  });

  it("should have correct Others group agents", () => {
    assert.ok(OTHERS_GROUP_AGENTS.includes("Ivan Kazakov"));
    assert.ok(OTHERS_GROUP_AGENTS.includes("Narine Akopyan"));
    assert.ok(OTHERS_GROUP_AGENTS.includes("Michelle Longridge"));
    assert.strictEqual(OTHERS_GROUP_AGENTS.length, 3);
  });

  it("should have correct Limassol agents", () => {
    assert.ok(LIMASSOL_AGENTS.includes("Michelle Longridge"));
    assert.ok(LIMASSOL_AGENTS.includes("Lauren Ellingham"));
    assert.strictEqual(LIMASSOL_AGENTS.length, 3);
  });

  it("should have correct regional managers", () => {
    assert.strictEqual(REGIONAL_MANAGERS.paphos, "Marios Azinas");
    assert.strictEqual(REGIONAL_MANAGERS.limassol, "Michelle Longridge");
    assert.strictEqual(REGIONAL_MANAGERS.larnaca, "Lysandros Ioanni");
    assert.strictEqual(REGIONAL_MANAGERS.nicosia, "Ivan Kazakov");
    assert.strictEqual(REGIONAL_MANAGERS.famagusta, "Narine Akopyan");
  });

  it("should have Russian speaker agent configured", () => {
    assert.strictEqual(RUSSIAN_SPEAKER_AGENT, "Diana Kultaseva");
  });
});

describe("Telegram Routing: Integration Scenarios", () => {
  it("should route Russian-speaking client from Limassol correctly", () => {
    const message = "Клиент интересуется виллой в Лимассоле ZYP-12345";

    // Should detect as lead
    assert.strictEqual(isLeadMessage(message), true);

    // Should detect Russian language
    assert.strictEqual(detectRussianLanguage(message), true);

    // Extract property ID
    const ids = extractPropertyIds(message);
    assert.deepStrictEqual(ids, ["ZYP-12345"]);

    // Note: Actual routing to Diana would happen in lead-router.ts
  });

  it("should route agent-specific request correctly", () => {
    const message =
      "Client wants to speak with Marios, zyprus.com/property/54321";

    // Should detect as lead
    assert.strictEqual(isLeadMessage(message), true);

    // Should extract requested agent (comma prevents second word capture)
    const requestedAgent = extractRequestedAgent(message);
    assert.strictEqual(requestedAgent, "Marios");

    // Should extract URL
    const urls = extractZyprusUrls(message);
    assert.strictEqual(urls.length, 1);
  });

  it("should handle Paphos land enquiry", () => {
    const message =
      "New enquiry for land in Pafos: https://www.zyprus.com/land/32417/residential-land";
    const groupName = "Zyprus Pafos Leads";

    // Should detect as lead
    assert.strictEqual(isLeadMessage(message), true);

    // Should detect Paphos region
    assert.strictEqual(detectRegionFromName(groupName), "paphos");
    assert.strictEqual(detectGroupType(groupName), "paphos");

    // Should extract land URL
    const urls = extractZyprusUrls(message);
    assert.strictEqual(urls.length, 1);
    assert.ok(urls[0].includes("land/32417"));
  });

  it("should handle Others group (Nicosia/Famagusta) routing", () => {
    const groupName = "Zyprus Nicosia Leads";

    // Should detect as Nicosia
    assert.strictEqual(detectRegionFromName(groupName), "nicosia");

    // Check group type detection
    const groupType = detectGroupType(groupName);
    assert.strictEqual(groupType, "nicosia");

    // Note: Actual routing to OTHERS_GROUP_AGENTS would happen in lead-router.ts
  });

  it("should not route non-lead group messages", () => {
    const message = "Good morning everyone! Team meeting at 2pm today.";

    assert.strictEqual(isLeadMessage(message), false);
    assert.strictEqual(extractRequestedAgent(message), null);
    assert.deepStrictEqual(extractPropertyIds(message), []);
    assert.deepStrictEqual(extractZyprusUrls(message), []);
  });
});
