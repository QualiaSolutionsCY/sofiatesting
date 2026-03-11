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
import { getNextInRotation } from "./db.js";
import { extractPropertyId, getListingOwnerEmail } from "./zyprus.js";

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

// Paphos agents for 50/50 rotation
const PAPHOS_AGENTS = ["Marios Azinas", "Dimitris Panayiotou"];

// Regional office emails — all non-Paphos regions go to their office
const OFFICE_EMAILS: Record<string, string> = {
  limassol: "requestlimassol@zyprus.com",
  larnaca: "requestlarnaca@zyprus.com",
  nicosia: "requestnicosia@zyprus.com",
  famagusta: "requestfamagusta@zyprus.com",
};

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
  _body: string,
  agents: Agent[]
): Agent | null {
  const subjectLower = subject.toLowerCase();

  for (const agent of agents) {
    if (!agent.full_name || agent.full_name.toLowerCase().includes("office")) continue;
    if (subjectLower.includes(agent.full_name.toLowerCase())) {
      return agent;
    }
  }

  // Check first names only in subject (more lenient)
  for (const agent of agents) {
    if (!agent.full_name) continue;
    const firstName = agent.full_name.split(" ")[0].toLowerCase();
    if (firstName.length < 4) continue;
    const patterns = [`for ${firstName}`, `to ${firstName}`, `@ ${firstName}`, `att: ${firstName}`];
    for (const p of patterns) {
      if (subjectLower.includes(p)) return agent;
    }
  }

  return null;
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
  // Rule 0 (PRIORITY): Check listing owner on Zyprus
  const propertyId = extractPropertyId(subject, body);
  if (propertyId) {
    const ownerEmail = await getListingOwnerEmail(propertyId);
    if (ownerEmail) {
      // Find the agent whose communication_email or listing_owner_email matches
      const ownerAgent = allAgents.find(
        (a) =>
          a.communication_email.toLowerCase() === ownerEmail.toLowerCase() ||
          a.listing_owner_email.toLowerCase() === ownerEmail.toLowerCase()
      );
      if (ownerAgent) {
        return {
          agent: ownerAgent,
          region: ownerAgent.region,
          reason: `Listing owner: ${ownerAgent.full_name} (property ${propertyId})`,
        };
      }
      console.log(`Listing owner email ${ownerEmail} not matched to any agent`);
    }
  }

  // Rule 1: Check if email mentions a specific agent
  const requestedAgent = detectRequestedAgent(subject, body, allAgents);
  if (requestedAgent) {
    return {
      agent: requestedAgent,
      region: requestedAgent.region,
      reason: `Agent mentioned in email: ${requestedAgent.full_name}`,
    };
  }

  // Rule 2: Try to detect region from content
  const region = detectRegionFromContent(subject, body);

  if (region) {
    return routeByRegion(region, subject, body, fromEmail, allAgents);
  }

  // Rule 3: No region detected — route to Paphos (Marios/Dimitris) as default
  return routeByRegion("paphos", subject, body, fromEmail, allAgents);
}

/**
 * Route by detected region using the same logic as Telegram
 */
async function routeByRegion(
  region: string,
  _subject: string,
  _body: string,
  _fromEmail: string,
  allAgents: Agent[]
): Promise<RoutingResult | null> {
  // Paphos: Marios or Dimitris (50/50 rotation)
  if (region === "paphos") {
    const candidates = allAgents.filter(
      (a) => PAPHOS_AGENTS.includes(a.full_name) && a.is_active
    );
    const next = await getNextInRotation(region, candidates);
    if (next) return { agent: next, region, reason: "Paphos rotation (Marios/Dimitris)" };
  }

  // All other regions: forward to regional office email
  const officeEmail = OFFICE_EMAILS[region];
  if (officeEmail) {
    // Find the office agent in the DB (communication_email matches)
    const officeAgent = allAgents.find(
      (a) => a.communication_email.toLowerCase() === officeEmail.toLowerCase()
    );
    if (officeAgent) {
      return { agent: officeAgent, region, reason: `${region} → office (${officeEmail})` };
    }
    // If no agent row, create a synthetic one for forwarding
    return {
      agent: {
        id: `office-${region}`,
        full_name: `${region.charAt(0).toUpperCase() + region.slice(1)} Office`,
        communication_email: officeEmail,
        listing_owner_email: officeEmail,
        region,
        is_active: true,
        can_receive_leads: true,
      },
      region,
      reason: `${region} → office (${officeEmail})`,
    };
  }

  // Unknown region fallback: Paphos rotation
  const candidates = allAgents.filter(
    (a) => PAPHOS_AGENTS.includes(a.full_name) && a.is_active
  );
  const next = await getNextInRotation("paphos", candidates);
  if (next) return { agent: next, region: "paphos", reason: "Unknown region → Paphos fallback" };

  console.warn(`No agents found for region: ${region}`);
  return null;
}
