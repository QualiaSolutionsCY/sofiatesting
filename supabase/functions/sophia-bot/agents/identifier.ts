/**
 * Agent Identifier Module
 * Matches WhatsApp phone numbers to agents in the database
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logger, LogCategory } from "../utils/logger.ts";

export interface Agent {
  id: string;
  fullName: string;
  mobile: string;
  communicationEmail: string;
  listingOwnerEmail: string;
  region: 'paphos' | 'limassol' | 'larnaca' | 'nicosia' | 'famagusta' | 'all';
  role: 'management' | 'manager' | 'agent';
  canUpload: boolean;
}

/**
 * Normalize phone number for comparison
 * Removes spaces, dashes, and +357 prefix
 */
export function normalizePhone(phone: string): string {
  // Remove all non-digit characters
  let normalized = phone.replace(/\D/g, '');

  // Remove Cyprus country code if present
  if (normalized.startsWith('357')) {
    normalized = normalized.slice(3);
  }

  // Remove leading zero if present
  if (normalized.startsWith('0')) {
    normalized = normalized.slice(1);
  }

  return normalized;
}

/**
 * Identify agent by their WhatsApp phone number
 */
export async function identifyAgentByPhone(
  phone: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<Agent | null> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const normalized = normalizePhone(phone);

  // Try exact match first (last 8 digits)
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .or(`mobile.ilike.%${normalized.slice(-8)}%,mobile.ilike.%${normalized}%`)
    .limit(1)
    .single();

  if (error || !data) {
    logger.debug(`[AgentIdentifier] No agent found for phone`, { category: LogCategory.DATABASE, normalized });
    return null;
  }

  logger.debug(`[AgentIdentifier] Found agent: ${data.full_name} (${data.region})`, { category: LogCategory.DATABASE });

  return {
    id: data.id,
    fullName: data.full_name,
    mobile: data.mobile,
    communicationEmail: data.communication_email,
    listingOwnerEmail: data.listing_owner_email,
    region: data.region,
    role: data.role,
    canUpload: data.can_upload
  };
}

/**
 * Get agent by email address
 */
export async function getAgentByEmail(
  email: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<Agent | null> {
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .or(`communication_email.eq.${email},listing_owner_email.eq.${email}`)
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    fullName: data.full_name,
    mobile: data.mobile,
    communicationEmail: data.communication_email,
    listingOwnerEmail: data.listing_owner_email,
    region: data.region,
    role: data.role,
    canUpload: data.can_upload
  };
}

/**
 * Get all agents in a specific region
 */
export async function getAgentsByRegion(
  region: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<Agent[]> {
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('region', region)
    .eq('can_upload', true);

  if (error || !data) {
    return [];
  }

  return data.map(d => ({
    id: d.id,
    fullName: d.full_name,
    mobile: d.mobile,
    communicationEmail: d.communication_email,
    listingOwnerEmail: d.listing_owner_email,
    region: d.region,
    role: d.role,
    canUpload: d.can_upload
  }));
}

