/**
 * Check if Trachoni exists in Zyprus API locations
 * and verify what location was saved for our test property
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const PROPERTY_ID = "b291177c-60b8-4ba7-b878-f1dd66cafccf";

type OAuthToken = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

async function getAccessToken(): Promise<string> {
  const apiUrl = process.env.ZYPRUS_API_URL || "https://dev9.zyprus.com";
  const clientId = process.env.ZYPRUS_CLIENT_ID;
  const clientSecret = process.env.ZYPRUS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("ZYPRUS_CLIENT_ID or ZYPRUS_CLIENT_SECRET not configured");
  }

  const response = await fetch(`${apiUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "SophiaAI",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OAuth failed: ${response.status} - ${errorText}`);
  }

  const tokenData: OAuthToken = await response.json();
  return tokenData.access_token;
}

async function checkTrachoniLocation() {
  console.log("🔍 Checking Trachoni location in Zyprus API...\n");

  const apiUrl = process.env.ZYPRUS_API_URL || "https://dev9.zyprus.com";
  const token = await getAccessToken();
  console.log("✅ Got access token\n");

  // 1. Search for Trachoni in locations
  console.log("📍 Searching for 'Trachoni' in locations...");
  let trachoniFound = false;
  let nextUrl: string | null = `${apiUrl}/jsonapi/node/location?page[limit]=50`;
  const limassolLocations: Array<{id: string; name: string}> = [];

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.api+json",
        "User-Agent": "SophiaAI",
      },
    });

    if (!response.ok) break;

    const data = await response.json();
    for (const item of data.data || []) {
      const name = item.attributes?.title || "";
      if (name.toLowerCase().includes("trachoni")) {
        console.log(`   ✅ FOUND TRACHONI: "${name}" (${item.id})`);
        trachoniFound = true;
      }
      if (name.toLowerCase().includes("limassol") ||
          name.toLowerCase().includes("lemesos")) {
        limassolLocations.push({ id: item.id, name });
      }
    }
    nextUrl = data.links?.next?.href || null;
  }

  if (!trachoniFound) {
    console.log("   ❌ TRACHONI NOT FOUND in Zyprus locations!");
    console.log("\n   Limassol-related locations found:");
    for (const loc of limassolLocations.slice(0, 10)) {
      console.log(`   - ${loc.name} (${loc.id})`);
    }
  }

  // 2. Fetch the test property to see what location was used
  console.log(`\n📦 Fetching test property ${PROPERTY_ID}...`);
  const propertyResponse = await fetch(
    `${apiUrl}/jsonapi/node/property/${PROPERTY_ID}?include=field_location`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.api+json",
        "User-Agent": "SophiaAI",
      },
    }
  );

  if (!propertyResponse.ok) {
    console.log(`   ❌ Property fetch failed: ${propertyResponse.status}`);
    return;
  }

  const propertyData = await propertyResponse.json();

  // Get location from included data
  const locationRef = propertyData.data?.relationships?.field_location?.data;
  console.log(`   Location reference ID: ${locationRef?.id || "NOT SET"}`);

  const includedLocation = propertyData.included?.find(
    (inc: { id: string; type: string }) => inc.type === "node--location" && inc.id === locationRef?.id
  );

  if (includedLocation) {
    console.log(`   ✅ Property location: "${includedLocation.attributes.title}" (${includedLocation.id})`);
  } else {
    console.log("   ❌ Location details not included in response");
    console.log("   Looking up location separately...");

    if (locationRef?.id) {
      const locResponse = await fetch(
        `${apiUrl}/jsonapi/node/location/${locationRef.id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.api+json",
            "User-Agent": "SophiaAI",
          },
        }
      );
      if (locResponse.ok) {
        const locData = await locResponse.json();
        console.log(`   ✅ Property location: "${locData.data.attributes.title}" (${locData.data.id})`);
      }
    }
  }

  // Show property title for context
  console.log(`\n   Property title: ${propertyData.data?.attributes?.title || "N/A"}`);
}

checkTrachoniLocation().catch(console.error);
