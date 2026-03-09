/**
 * Email Routing Engine
 *
 * Same logic as Telegram lead routing:
 * - Paphos: Marios Azinas / Dimitris Panayiotou (50/50 rotation)
 * - Limassol: Michelle Longridge / Diana Kultaseva (prefer Diana for Russian)
 * - Larnaca: Michelle/Diana rotation
 * - Nicosia: Regional agents rotation
 * - Famagusta: Regional agents rotation
 * - If agent name detected in email → route directly to them
 * - If no region detected → use "all" region agents
 */

import type { Agent } from "./db.js";
import { getAgentsForRegion, getNextInRotation } from "./db.js";

// City name → canonical region mapping
const REGION_MAP: Record<string, string> = {
  paphos: "paphos",
  pafos: "paphos",
  limassol: "limassol",
  lemesos: "limassol",
  larnaca: "larnaca",
  larnaka: "larnaca",
  nicosia: "nicosia",
  lefkosia: "nicosia",
  famagusta: "famagusta",
  ammochostos: "famagusta",
};

// Agents for specific region routing (names must match DB exactly)
const LIMASSOL_AGENTS = ["Michelle Longridge", "Diana Kultaseva"];
const LARNACA_AGENTS = ["Michelle Longridge", "Diana Kultaseva"];
const PAPHOS_AGENTS = ["Marios Azinas", "Dimitris Panayiotou"];

// Cyrillic detection for Russian-speaking preference
const CYRILLIC_PATTERN = /[\u0400-\u04FF]/;

export interface RoutingResult {
  agent: Agent;
  region: string;
  reason: string;
}

/**
 * Detect region from email content
 * NOTE: This is only used for emails that passed the filter (no city name in them).
 * So this function looks for subtler region hints.
 */
export function detectRegionFromContent(subject: string, body: string): string | null {
  const combined = `${subject}\n${body}`.toLowerCase();

  for (const [variant, canonical] of Object.entries(REGION_MAP)) {
    const regex = new RegExp(`\\b${variant}\\b`, "i");
    if (regex.test(combined)) {
      return canonical;
    }
  }

  return null;
}

/**
 * Check if the email mentions a specific agent by name
 */
export function detectRequestedAgent(
  subject: string,
  body: string,
  agents: Agent[]
): Agent | null {
  const combined = `${subject}\n${body}`.toLowerCase();

  for (const agent of agents) {
    if (!agent.full_name || agent.full_name.toLowerCase().includes("office")) continue;
    if (combined.includes(agent.full_name.toLowerCase())) {
      return agent;
    }
  }

  // Check first names only (more lenient)
  for (const agent of agents) {
    if (!agent.full_name) continue;
    const firstName = agent.full_name.split(" ")[0].toLowerCase();
    if (firstName.length < 4) continue; // Skip very short names
    // Look for "for Marios" or "to Marios" patterns
    const patterns = [`for ${firstName}`, `to ${firstName}`, `@ ${firstName}`, `att: ${firstName}`];
    for (const p of patterns) {
      if (combined.includes(p)) return agent;
    }
  }

  return null;
}

/**
 * Detect if email content contains Russian/Cyrillic text
 */
function isRussianContent(subject: string, body: string, fromEmail: string): boolean {
  return CYRILLIC_PATTERN.test(subject) || CYRILLIC_PATTERN.test(body) || CYRILLIC_PATTERN.test(fromEmail);
}

/**
 * Route an email to the appropriate agent
 */
export async function routeEmail(
  subject: string,
  body: string,
  fromEmail: string,
  allAgents: Agent[]
): Promise<RoutingResult | null> {
  // Rule 0: Check if email mentions a specific agent
  const requestedAgent = detectRequestedAgent(subject, body, allAgents);
  if (requestedAgent) {
    return {
      agent: requestedAgent,
      region: requestedAgent.region,
      reason: `Agent mentioned in email: ${requestedAgent.full_name}`,
    };
  }

  // Rule 1: Try to detect region from content
  const region = detectRegionFromContent(subject, body);

  if (region) {
    return routeByRegion(region, subject, body, fromEmail, allAgents);
  }

  // Rule 2: No region detected — route to Paphos (Marios/Dimitris) as default
  // since most office listings come through Paphos
  return routeByRegion("paphos", subject, body, fromEmail, allAgents);
}

/**
 * Route by detected region using the same logic as Telegram
 */
async function routeByRegion(
  region: string,
  subject: string,
  body: string,
  fromEmail: string,
  allAgents: Agent[]
): Promise<RoutingResult | null> {
  const isRussian = isRussianContent(subject, body, fromEmail);

  // Limassol: Michelle or Diana (prefer Diana for Russian)
  if (region === "limassol") {
    const candidates = allAgents.filter(
      (a) => LIMASSOL_AGENTS.includes(a.full_name) && a.is_active
    );
    if (isRussian) {
      const diana = candidates.find((a) => a.full_name === "Diana Kultaseva");
      if (diana) return { agent: diana, region, reason: "Limassol + Russian speaker → Diana" };
    }
    const next = await getNextInRotation("email_limassol", candidates);
    if (next) return { agent: next, region, reason: "Limassol rotation" };
  }

  // Larnaca: Michelle or Diana
  if (region === "larnaca") {
    const candidates = allAgents.filter(
      (a) => LARNACA_AGENTS.includes(a.full_name) && a.is_active
    );
    const next = await getNextInRotation("email_larnaca", candidates);
    if (next) return { agent: next, region, reason: "Larnaca rotation" };
  }

  // Paphos: Marios or Dimitris
  if (region === "paphos") {
    const candidates = allAgents.filter(
      (a) => PAPHOS_AGENTS.includes(a.full_name) && a.is_active
    );
    const next = await getNextInRotation("email_paphos", candidates);
    if (next) return { agent: next, region, reason: "Paphos rotation (Marios/Dimitris)" };
  }

  // Nicosia / Famagusta / other: get regional agents
  const regionAgents = await getAgentsForRegion(region);
  const candidates = regionAgents.filter((a) => a.can_receive_leads);

  if (candidates.length > 0) {
    const next = await getNextInRotation(`email_${region}`, candidates);
    if (next) return { agent: next, region, reason: `${region} rotation` };
  }

  // Fallback: no agents found for region
  console.warn(`No agents found for region: ${region}`);
  return null;
}
