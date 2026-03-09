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
  "paphos", "pafos",
  "limassol", "lemesos",
  "larnaca", "larnaka",
  "nicosia", "lefkosia", "lefkosa",
  "famagusta", "ammochostos", "gazimagusa",
];

export interface FilterResult {
  skip: boolean;
  reason: string | null;
}

/**
 * Check if an email should be skipped
 */
export function shouldSkipEmail(
  subject: string,
  bodyText: string,
  agents: Agent[]
): FilterResult {
  const combined = `${subject}\n${bodyText}`.toLowerCase();

  // Check for city names
  for (const city of CITY_PATTERNS) {
    // Use word boundary to avoid partial matches (e.g., "paphos" in "paphosburg")
    const regex = new RegExp(`\\b${city}\\b`, "i");
    if (regex.test(combined)) {
      return { skip: true, reason: `Contains city name: ${city}` };
    }
  }

  // Check for agent full names
  for (const agent of agents) {
    if (!agent.full_name) continue;
    // Skip "Office" entries (e.g., "Paphos Office") — they're not real agents
    if (agent.full_name.toLowerCase().includes("office")) continue;
    if (agent.full_name.toLowerCase() === "qualia admin") continue;

    if (combined.includes(agent.full_name.toLowerCase())) {
      return { skip: true, reason: `Contains agent name: ${agent.full_name}` };
    }
  }

  return { skip: false, reason: null };
}
