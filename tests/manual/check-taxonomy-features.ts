/**
 * Check what indoor/outdoor features are available in Zyprus taxonomy
 * Run with: npx tsx tests/manual/check-taxonomy-features.ts
 */

import { config } from "dotenv";

// Load env vars FIRST
config({ path: ".env.local" });

const ZYPRUS_API_URL = process.env.ZYPRUS_API_URL || "https://dev9.zyprus.com";
const ZYPRUS_CLIENT_ID = process.env.ZYPRUS_CLIENT_ID;
const ZYPRUS_CLIENT_SECRET = process.env.ZYPRUS_CLIENT_SECRET;

interface TaxonomyItem {
  id: string;
  name: string;
}

const getAccessToken = async (): Promise<string> => {
  const response = await fetch(`${ZYPRUS_API_URL}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "SophiaAI",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: ZYPRUS_CLIENT_ID!,
      client_secret: ZYPRUS_CLIENT_SECRET!,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token fetch failed: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
};

const fetchTaxonomy = async (
  vocabularyName: string,
  token: string
): Promise<TaxonomyItem[]> => {
  const items: TaxonomyItem[] = [];
  let nextUrl = `${ZYPRUS_API_URL}/jsonapi/taxonomy_term/${vocabularyName}?page[limit]=100`;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.api+json",
        "User-Agent": "SophiaAI",
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${vocabularyName}: ${response.status}`);
      break;
    }

    const data = await response.json();

    for (const item of data.data || []) {
      items.push({
        id: item.id,
        name: item.attributes?.name || "",
      });
    }

    nextUrl = data.links?.next?.href || null;
  }

  return items;
};

const main = async () => {
  console.log("Fetching Zyprus taxonomy data...\n");

  const token = await getAccessToken();

  // Fetch all feature taxonomies
  const [indoorFeatures, outdoorFeatures, propertyViews] = await Promise.all([
    fetchTaxonomy("indoor_property_views", token),
    fetchTaxonomy("outdoor_property_features", token),
    fetchTaxonomy("property_views", token),
  ]);

  console.log("=== INDOOR FEATURES (indoor_property_views) ===");
  console.log(`Total: ${indoorFeatures.length}`);
  for (const f of indoorFeatures.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`  - ${f.name} (${f.id})`);
  }

  console.log("\n=== OUTDOOR FEATURES (outdoor_property_features) ===");
  console.log(`Total: ${outdoorFeatures.length}`);
  for (const f of outdoorFeatures.sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    console.log(`  - ${f.name} (${f.id})`);
  }

  console.log("\n=== PROPERTY VIEWS (property_views) ===");
  console.log(`Total: ${propertyViews.length}`);
  for (const f of propertyViews.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`  - ${f.name} (${f.id})`);
  }

  // Test feature mapping
  console.log("\n=== MAPPING TEST ===");
  const testFeatures = [
    "air conditioning",
    "pool",
    "private pool",
    "sea view",
    "garden",
    "parking",
    "covered parking",
    "on street parking",
    "double garage",
    "central heating",
    "fireplace",
  ];

  console.log("\nTesting common feature terms against taxonomy:");
  for (const feature of testFeatures) {
    const featureLower = feature.toLowerCase();

    // Try indoor
    const indoorMatch = indoorFeatures.find(
      (f) =>
        f.name.toLowerCase() === featureLower ||
        f.name.toLowerCase().includes(featureLower) ||
        featureLower.includes(f.name.toLowerCase())
    );

    // Try outdoor
    const outdoorMatch = outdoorFeatures.find(
      (f) =>
        f.name.toLowerCase() === featureLower ||
        f.name.toLowerCase().includes(featureLower) ||
        featureLower.includes(f.name.toLowerCase())
    );

    // Try views
    const viewMatch = propertyViews.find(
      (f) =>
        f.name.toLowerCase() === featureLower ||
        f.name.toLowerCase().includes(featureLower) ||
        featureLower.includes(f.name.toLowerCase())
    );

    if (indoorMatch) {
      console.log(`  "${feature}" -> INDOOR: "${indoorMatch.name}"`);
    } else if (outdoorMatch) {
      console.log(`  "${feature}" -> OUTDOOR: "${outdoorMatch.name}"`);
    } else if (viewMatch) {
      console.log(`  "${feature}" -> VIEW: "${viewMatch.name}"`);
    } else {
      console.log(`  "${feature}" -> ❌ NO MATCH`);
    }
  }
};

main().catch(console.error);
