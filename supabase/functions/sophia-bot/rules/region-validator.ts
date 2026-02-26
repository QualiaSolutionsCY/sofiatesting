/**
 * Region Validator
 * Enforces regional boundaries for property uploads
 */

import { Agent } from "../agents/identifier.ts";
import { logger, LogCategory } from "../utils/logger.ts";
import { REGION_LOCATIONS } from "../config/business-rules.ts";

export interface ValidationResult {
  allowed: boolean;
  message?: string;
  propertyRegion?: string;
}

/**
 * Determine which region a location belongs to
 */
export function determineRegion(location: string): string | null {
  const normalizedLocation = location.toLowerCase().trim();

  for (const [region, locations] of Object.entries(REGION_LOCATIONS)) {
    for (const loc of locations) {
      if (normalizedLocation.includes(loc) || loc.includes(normalizedLocation)) {
        return region;
      }
    }
  }

  // If no match, try to infer from partial matches
  if (normalizedLocation.includes('paphos') || normalizedLocation.includes('pafos')) {
    return 'paphos';
  }
  if (normalizedLocation.includes('limassol') || normalizedLocation.includes('lemesos')) {
    return 'limassol';
  }
  if (normalizedLocation.includes('larnaca') || normalizedLocation.includes('larnaka')) {
    return 'larnaca';
  }
  if (normalizedLocation.includes('nicosia') || normalizedLocation.includes('lefkosia')) {
    return 'nicosia';
  }
  if (normalizedLocation.includes('famagusta') || normalizedLocation.includes('ammochostos')) {
    return 'famagusta';
  }

  return null;
}

/**
 * Validate if an agent is authorized to upload a property in a given location
 */
export function validateRegionalAccess(
  agent: Agent,
  propertyLocation: string
): ValidationResult {
  // Management can upload anywhere
  if (agent.region === 'all') {
    const propertyRegion = determineRegion(propertyLocation);
    return {
      allowed: true,
      propertyRegion: propertyRegion || 'unknown'
    };
  }

  // Determine property region
  const propertyRegion = determineRegion(propertyLocation);

  // If we can't determine the region, trust the agent (they know their region)
  if (!propertyRegion) {
    logger.debug(`[RegionValidator] Could not determine region for: ${propertyLocation}, trusting agent`, { category: LogCategory.GENERAL });
    return {
      allowed: true,
      propertyRegion: agent.region
    };
  }

  // Check if agent's region matches property region
  if (agent.region !== propertyRegion) {
    return {
      allowed: false,
      propertyRegion,
      message: "Unfortunately, you are not allowed to market a property outside your region. Please contact the relevant regional manager for assistance."
    };
  }

  return {
    allowed: true,
    propertyRegion
  };
}

/**
 * Validate if a management user can assign a property to a specific agent/region
 */
export function validateAssignment(
  propertyRegion: string,
  assigneeRegion: string
): ValidationResult {
  // If assignee can work anywhere (management), allow
  if (assigneeRegion === 'all') {
    return { allowed: true };
  }

  // Check if assignee's region matches property region
  if (assigneeRegion !== propertyRegion) {
    return {
      allowed: false,
      message: `I'm not able to assign this ${propertyRegion} property to an agent in ${assigneeRegion}. Would you like me to assign it to a ${propertyRegion}-based agent instead?`
    };
  }

  return { allowed: true };
}

/**
 * Get the regional office email for a region
 */
export function getRegionalOfficeEmail(region: string): string {
  const officeEmails: Record<string, string> = {
    paphos: 'requestpaphos@zyprus.com',
    limassol: 'requestlimassol@zyprus.com',
    larnaca: 'requestlarnaca@zyprus.com',
    nicosia: 'requestnicosia@zyprus.com',
    famagusta: 'requestfamagusta@zyprus.com'
  };

  return officeEmails[region] || 'listings@zyprus.com';
}

