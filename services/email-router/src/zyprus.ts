/**
 * Zyprus Listing Owner Lookup
 * Uses the listing-owner Supabase Edge Function proxy
 * (Zyprus API is behind Cloudflare, inaccessible from Railway directly)
 */

import { config } from "./config.js";

const EDGE_FUNCTION_URL = `${config.supabase.url}/functions/v1/listing-owner`;

/**
 * Extract Zyprus property/node ID from email content.
 * Looks for patterns like:
 * - zyprus.com/node/41856
 * - ID: 42206
 * - (ID: 42206)
 * - property/42206
 */
export function extractPropertyId(
  subject: string,
  body: string
): string | null {
  const combined = `${subject}\n${body}`;

  // Match zyprus.com/node/XXXXX
  const nodeMatch = combined.match(/zyprus\.com\/node\/(\d+)/i);
  if (nodeMatch) return nodeMatch[1];

  // Match (ID: XXXXX) pattern from Zyprus emails
  const idMatch = combined.match(/\(ID:\s*(\d+)\)/i);
  if (idMatch) return idMatch[1];

  // Match property/XXXXX
  const propMatch = combined.match(/property\/(\d+)/i);
  if (propMatch) return propMatch[1];

  return null;
}

/**
 * Fetch listing owner email via the listing-owner Edge Function proxy
 */
export async function getListingOwnerEmail(
  nodeId: string
): Promise<string | null> {
  try {
    const url = `${EDGE_FUNCTION_URL}?nid=${nodeId}`;
    const response = await fetch(url, {
      headers: {
        "x-admin-secret": config.supabase.adminSecret,
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      console.error(
        `Listing owner proxy error for node ${nodeId}: ${response.status}`
      );
      return null;
    }

    const data = await response.json();

    if (data.owner_email) {
      console.log(
        `Listing ${nodeId} owner: ${data.owner_name} (${data.owner_email})`
      );
      return data.owner_email;
    }

    console.log(`No owner found for listing ${nodeId}`);
    return null;
  } catch (err) {
    console.error(`Failed to fetch listing owner for ${nodeId}:`, err);
    return null;
  }
}
