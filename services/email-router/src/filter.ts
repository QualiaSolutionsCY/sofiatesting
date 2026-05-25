/**
 * Email Filter
 *
 * Determines which emails should be skipped (already routed) vs processed.
 * Skip if the email subject or body contains:
 * - A Cyprus city name (Paphos, Limassol, etc.) — already region-tagged
 * - An agent's full name — already assigned
 */

import type { Agent } from "./db.js";

// City names and common variants
const CITY_PATTERNS = [
  "paphos",
  "pafos",
  "limassol",
  "lemesos",
  "larnaca",
  "larnaka",
  "nicosia",
  "lefkosia",
  "lefkosa",
  "famagusta",
  "ammochostos",
  "gazimagusa",
];

export interface FilterResult {
  skip: boolean;
  reason: string | null;
}

/**
 * Check if an email should be skipped
 *
 * IMPORTANT: Only check the SUBJECT for city names, NOT the body.
 * The body almost always contains city names in the Zyprus signature/footer
 * (e.g., "Zyprus Property Group, Paphos"), which would cause every lead to be skipped.
 * Already-routed emails have the city in the subject (e.g., "Request (Name) - Paphos").
 */
export function shouldSkipEmail(
  subject: string,
  bodyText: string,
  agents: Agent[]
): FilterResult {
  const subjectLower = subject.toLowerCase();

  // Check for city names in SUBJECT ONLY
  // Already-routed emails have format: "Request (Name) - Paphos" or "Request (Name) - Limassol"
  for (const city of CITY_PATTERNS) {
    const regex = new RegExp(`\\b${city}\\b`, "i");
    if (regex.test(subjectLower)) {
      return { skip: true, reason: `Subject contains city name: ${city}` };
    }
  }

  // Check for agent full names in subject + body (these are genuinely already-assigned)
  const combined = `${subject}\n${bodyText}`.toLowerCase();
  for (const agent of agents) {
    if (!agent.full_name) continue;
    // Skip "Office" entries (e.g., "Paphos Office") — they're not real agents
    if (agent.full_name.toLowerCase().includes("office")) continue;
    if (agent.full_name.toLowerCase() === "qualia admin") continue;

    if (combined.includes(agent.full_name.toLowerCase())) {
      return { skip: true, reason: `Contains agent name: ${agent.full_name}` };
    }
  }

  // Check for agent FIRST names in SUBJECT only
  // Already-routed emails use format: "Request (ClientName) - AgentFirstName"
  for (const agent of agents) {
    if (!agent.full_name) continue;
    if (agent.full_name.toLowerCase().includes("office")) continue;
    if (agent.full_name.toLowerCase() === "qualia admin") continue;

    const firstName = agent.full_name.split(" ")[0].toLowerCase();
    if (firstName.length < 4) continue; // Skip very short names to avoid false matches

    // Only match first name at the end of subject after " - " separator (already-routed format)
    if (subjectLower.includes(` - ${firstName}`)) {
      return {
        skip: true,
        reason: `Subject contains agent first name: ${agent.full_name}`,
      };
    }
  }

  // Check for non-RE / spam / marketing emails that should not be routed
  const spamPatterns = [
    /are you interested/i,
    /unsubscribe/i,
    /marketing/i,
    /newsletter/i,
    /\bsurvey\b/i,
    /\bpoll\b/i,
    /no[- ]?reply/i,
    /auto[- ]?reply/i,
    /out of office/i,
    /delivery (failed|status|notification)/i,
    /mailer[- ]?daemon/i,
  ];

  for (const pattern of spamPatterns) {
    if (pattern.test(subject) || pattern.test(bodyText)) {
      return { skip: true, reason: `Non-RE/spam content: ${pattern.source}` };
    }
  }

  return { skip: false, reason: null };
}
