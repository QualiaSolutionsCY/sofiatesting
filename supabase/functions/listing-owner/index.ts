/**
 * Listing Owner Lookup — Edge Function proxy
 *
 * Takes a Zyprus node ID, fetches the listing owner from the Zyprus API
 * (which is behind Cloudflare and only accessible from whitelisted IPs).
 *
 * GET /listing-owner?nid=42206
 * Returns: { owner_email: "azinas@zyprus.com", owner_name: "Marios Azinas" }
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const ZYPRUS_API_URL = Deno.env.get("ZYPRUS_API_URL") || "https://dev9.zyprus.com";
const ZYPRUS_CLIENT_ID = Deno.env.get("ZYPRUS_CLIENT_ID");
const ZYPRUS_CLIENT_SECRET = Deno.env.get("ZYPRUS_CLIENT_SECRET");
const ADMIN_SECRET = Deno.env.get("SOPHIA_ADMIN_SECRET");

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const response = await fetch(`${ZYPRUS_API_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "SophiaAI" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: ZYPRUS_CLIENT_ID!,
      client_secret: ZYPRUS_CLIENT_SECRET!,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) throw new Error(`Token error: ${response.status}`);
  const data = await response.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return cachedToken.token;
}

function constantTimeCompare(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  let result = a.length ^ b.length;
  for (let i = 0; i < maxLen; i++) {
    const charA = i < a.length ? a.charCodeAt(i) : 0;
    const charB = i < b.length ? b.charCodeAt(i) : 0;
    result |= charA ^ charB;
  }
  return result === 0;
}

serve(async (req: Request) => {
  // Auth check — constant-time comparison to prevent timing attacks
  const secret = req.headers.get("x-admin-secret");
  if (!ADMIN_SECRET || !secret || !constantTimeCompare(secret, ADMIN_SECRET)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const url = new URL(req.url);
  const nid = url.searchParams.get("nid");

  if (!nid || !/^\d+$/.test(nid)) {
    return new Response(JSON.stringify({ error: "Invalid nid parameter" }), { status: 400 });
  }

  try {
    const token = await getAccessToken();

    // Fetch property by node ID with owner relationship
    const apiUrl = `${ZYPRUS_API_URL}/jsonapi/node/property?filter[drupal_internal__nid]=${nid}&include=uid&fields[user--user]=mail,name&page[limit]=1`;

    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.api+json",
        "User-Agent": "SophiaAI",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Zyprus API: ${response.status}` }), { status: 502 });
    }

    const data = await response.json();

    if (data.included?.length > 0) {
      const owner = data.included[0];
      return new Response(JSON.stringify({
        owner_email: owner.attributes?.mail || null,
        owner_name: owner.attributes?.name || null,
        nid,
      }), { headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ owner_email: null, owner_name: null, nid }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
