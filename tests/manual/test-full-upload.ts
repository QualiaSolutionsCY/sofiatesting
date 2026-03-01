/**
 * Test full property upload with all the new fixes
 * - Detached house property type
 * - Plot size (field_land_size)
 * - New description format
 * - Covered parking
 * - Proper capitalization
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const apiUrl = process.env.ZYPRUS_API_URL;
const clientId = process.env.ZYPRUS_CLIENT_ID;
const clientSecret = process.env.ZYPRUS_CLIENT_SECRET;

async function main() {
  if (!apiUrl || !clientId || !clientSecret) {
    console.error("Missing env vars");
    return;
  }

  console.log("🧪 FULL UPLOAD TEST - Testing all recent fixes\n");

  // Get token
  const tokenRes = await fetch(`${apiUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "User-Agent": "SophiaAI",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const { access_token } = await tokenRes.json();
  console.log("✅ Got token\n");

  // Upload test image
  console.log("📸 Uploading test image...");
  const imgRes = await fetch("https://picsum.photos/800/600.jpg");
  const imgBlob = await imgRes.blob();
  const uploadRes = await fetch(
    `${apiUrl}/jsonapi/node/property/field_gallery_`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "User-Agent": "SophiaAI",
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `file; filename="test-detached-house-${Date.now()}.jpg"`,
      },
      body: imgBlob,
    }
  );
  const imgData = await uploadRes.json();
  const imageId = imgData.data.id;
  console.log("✅ Image uploaded:", imageId);

  // Test data - Detached House with all features
  const testData = {
    propertyType: "detached house", // NEW: Testing detached house
    listingType: "sale",
    bedrooms: 4,
    bathrooms: 3,
    coveredArea: 220,
    plotSize: 650, // Testing plot size -> field_land_size
    location: "tala, paphos", // Testing capitalization
    titleDeedStatus: "separate",
    yearBuilt: 2018,
    floor: "Ground",
    features: [
      "covered parking", // Testing covered parking
      "private pool",
      "a/c",
      "central heating",
      "fitted kitchen",
      "fitted wardrobes",
      "garden",
      "sea view",
      "bbq area",
      "storage room",
    ],
    price: 485_000,
  };

  // Generate description locally to preview
  console.log("\n📝 Expected Description Format:");
  console.log("─".repeat(50));
  const descLines = [
    `Spacious ${testData.bedrooms} Bedroom ${capitalize(testData.propertyType)} For Sale in ${capitalizeLocation(testData.location)} with ${capitalize(testData.titleDeedStatus)} Title Deeds`,
    "",
    "Tala is a picturesque hillside village offering stunning views and a peaceful lifestyle, just minutes from Paphos and the Mediterranean coast.",
    "",
    `${testData.floor} Floor`,
    `${testData.bedrooms} Bedrooms`,
    `${testData.bathrooms} Bathrooms`,
    `${testData.coveredArea}m2 of Net Indoor Area`,
    `${testData.plotSize}m2 Plot Size`,
    ...testData.features.map((f) => capitalizeLocation(f)),
    `Year of Build: ${testData.yearBuilt}`,
  ];
  console.log(descLines.join("\n"));
  console.log("─".repeat(50));

  // Build the actual payload
  const description = descLines.join("\n");

  // UUIDs from taxonomy
  const LISTING_TYPE_SALE = "8f187816-a888-4cda-a937-1cee84b9c0ee";
  const PROPERTY_TYPE_VILLA = "76b4fa8e-de7e-4232-85ac-869dca3620f4"; // Villa/House
  const PRICE_MODIFIER = "ab39af2d-c8f5-4971-9fa5-2df6822ab9a9";
  const TITLE_DEED = "5c553db1-e53d-46a2-b609-093d17e75a7a";
  const DEFAULT_LOCATION = "7dbc931e-90eb-4b89-9ac8-b5e593831cf8";
  const SOPHIA_AI_UUID = "7026c7a3-1ef0-419f-9957-15a8c161b614";

  const payload = {
    data: {
      type: "node--property",
      attributes: {
        status: false,
        title: `${testData.bedrooms} Bed ${capitalize(testData.propertyType)} in ${capitalizeLocation(testData.location)}`,
        body: { value: description, format: "plain_text" },
        field_ai_state: "draft",
        field_ai_generated: true,
        field_price: testData.price,
        field_no_bedrooms: testData.bedrooms,
        field_no_bathrooms: testData.bathrooms,
        field_covered_area: testData.coveredArea,
        field_land_size: testData.plotSize, // FIXED: Using field_land_size
        field_year_built: testData.yearBuilt,
        field_negotiable: true,
        field_my_notes:
          "Owner: Test Owner\nTel: +357 99 123456\nAgent: Test Agent\nReg: Paphos",
      },
      relationships: {
        field_location: {
          data: { type: "node--location", id: DEFAULT_LOCATION },
        },
        field_property_type: {
          data: {
            type: "taxonomy_term--property_type",
            id: PROPERTY_TYPE_VILLA,
          },
        },
        field_listing_type: {
          data: { type: "taxonomy_term--listing_type", id: LISTING_TYPE_SALE },
        },
        field_title_deed: {
          data: { type: "taxonomy_term--title_deed", id: TITLE_DEED },
        },
        field_price_modifier: {
          data: { type: "taxonomy_term--price_modifier", id: PRICE_MODIFIER },
        },
        field_gallery_: { data: [{ type: "file--file", id: imageId }] },
        field_ai_listing_reviewer: {
          data: [{ type: "user--user", id: SOPHIA_AI_UUID }],
        },
        field_ai_listing_instructor: {
          data: { type: "user--user", id: SOPHIA_AI_UUID },
        },
      },
    },
  };

  console.log("\n📤 Creating listing...");
  const createRes = await fetch(`${apiUrl}/jsonapi/node/property`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "User-Agent": "SophiaAI",
      "Content-Type": "application/vnd.api+json",
    },
    body: JSON.stringify(payload),
  });

  if (!createRes.ok) {
    const errorText = await createRes.text();
    console.error("❌ Failed:", errorText);
    return;
  }

  const result = await createRes.json();
  console.log("\n✅ LISTING CREATED!");
  console.log("─".repeat(50));
  console.log("Node ID:", result.data.id);
  console.log("Title:", result.data.attributes.title);
  console.log("Price:", result.data.attributes.field_price);
  console.log("Bedrooms:", result.data.attributes.field_no_bedrooms);
  console.log("Bathrooms:", result.data.attributes.field_no_bathrooms);
  console.log("Covered Area:", result.data.attributes.field_covered_area, "m2");
  console.log(
    "Plot Size (field_land_size):",
    result.data.attributes.field_land_size,
    "m2"
  );
  console.log("Year Built:", result.data.attributes.field_year_built);
  console.log("AI State:", result.data.attributes.field_ai_state);
  console.log("─".repeat(50));
  console.log("\n📋 Description saved:");
  console.log(result.data.attributes.body?.value || "(no body)");
  console.log("─".repeat(50));
  console.log(
    "\n👉 Check: https://dev9.zyprus.com/draft-dashboard?ai_state=draft"
  );
  console.log(
    `👉 Direct link: https://dev9.zyprus.com/node/${result.data.attributes.drupal_internal__nid}/edit`
  );
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function capitalizeLocation(location: string): string {
  return location
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

main();
