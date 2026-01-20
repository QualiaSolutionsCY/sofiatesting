/**
 * Direct test of the createPropertyListing tool flow
 * This bypasses the AI and tests the tool executor directly
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const ZYPRUS_API_URL = process.env.ZYPRUS_API_URL!;
const ZYPRUS_CLIENT_ID = process.env.ZYPRUS_CLIENT_ID!;
const ZYPRUS_CLIENT_SECRET = process.env.ZYPRUS_CLIENT_SECRET!;

const SOPHIA_AI_UUID = "7026c7a3-1ef0-419f-9957-15a8c161b614";
const DEFAULT_LOCATION_ID = "7dbc931e-90eb-4b89-9ac8-b5e593831cf8";
const DEFAULT_PROPERTY_TYPE_ID = "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44";
const DEFAULT_LISTING_TYPE_ID = "8f187816-a888-4cda-a937-1cee84b9c0ee";
const DEFAULT_TITLE_DEED_ID = "5c553db1-e53d-46a2-b609-093d17e75a7a";
const DEFAULT_PRICE_MODIFIER_ID = "ab39af2d-c8f5-4971-9fa5-2df6822ab9a9";

async function getToken(): Promise<string> {
  const res = await fetch(`${ZYPRUS_API_URL}/oauth/token`, {
    method: "POST",
    headers: { "User-Agent": "SophiaAI", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: ZYPRUS_CLIENT_ID,
      client_secret: ZYPRUS_CLIENT_SECRET
    }),
  });
  const data = await res.json();
  return data.access_token;
}

async function uploadImage(token: string): Promise<string> {
  console.log("📸 Uploading test image...");
  const imgRes = await fetch("https://picsum.photos/800/600.jpg");
  const imgBlob = await imgRes.blob();

  const uploadRes = await fetch(`${ZYPRUS_API_URL}/jsonapi/node/property/field_gallery_`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "SophiaAI",
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `file; filename="test-image-${Date.now()}.jpg"`,
    },
    body: imgBlob,
  });

  const data = await uploadRes.json();
  console.log("✅ Image uploaded:", data.data.id);
  return data.data.id;
}

async function createListing(token: string, imageId: string) {
  console.log("📤 Creating listing...");

  const payload = {
    data: {
      type: "node--property",
      attributes: {
        status: false,
        title: "DIRECT TOOL TEST - 3 Bed Apartment Nicosia",
        body: { value: "Test listing from direct tool test - bypassing AI", format: "plain_text" },
        field_ai_state: "draft",
        field_ai_generated: true,
        field_ai_message: { value: "Direct tool test - no AI involved" },
        field_ai_probably_exists: false,
        field_own_reference_id: `TOOL-TEST-${Date.now()}`,
        field_price: "180000",
        field_no_bedrooms: 3,
        field_no_bathrooms: 2,
        field_covered_area: 120,
        field_map: {
          value: "POINT (33.3823 35.1856)",
          geo_type: "Point",
          lat: 35.1856,
          lon: 33.3823,
          latlon: "35.1856,33.3823"
        },
      },
      relationships: {
        field_location: { data: { type: "node--location", id: DEFAULT_LOCATION_ID } },
        field_property_type: { data: { type: "taxonomy_term--property_type", id: DEFAULT_PROPERTY_TYPE_ID } },
        field_listing_type: { data: { type: "taxonomy_term--listing_type", id: DEFAULT_LISTING_TYPE_ID } },
        field_title_deed: { data: { type: "taxonomy_term--title_deed", id: DEFAULT_TITLE_DEED_ID } },
        field_price_modifier: { data: { type: "taxonomy_term--price_modifier", id: DEFAULT_PRICE_MODIFIER_ID } },
        field_gallery_: { data: [{ type: "file--file", id: imageId }] },
        field_ai_listing_instructor: { data: { type: "user--user", id: SOPHIA_AI_UUID } },
        field_ai_listing_reviewer: { data: [{ type: "user--user", id: SOPHIA_AI_UUID }] },
      },
    },
  };

  const res = await fetch(`${ZYPRUS_API_URL}/jsonapi/node/property`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "SophiaAI",
      "Content-Type": "application/vnd.api+json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await res.text();
    console.error("❌ Create failed:", error);
    throw new Error(error);
  }

  const data = await res.json();
  return data;
}

async function main() {
  console.log("🧪 DIRECT TOOL TEST\n");
  console.log("Testing Zyprus API upload directly (bypassing AI)...\n");

  try {
    const token = await getToken();
    console.log("✅ Got OAuth token\n");

    const imageId = await uploadImage(token);
    const result = await createListing(token, imageId);

    console.log("\n✅ LISTING CREATED!");
    console.log("Node ID:", result.data.id);
    console.log("Title:", result.data.attributes.title);
    console.log("AI State:", result.data.attributes.field_ai_state);
    console.log("\n👉 Check draft dashboard: https://dev9.zyprus.com/draft-dashboard?ai_state=draft");
    console.log("👉 API URL:", `${ZYPRUS_API_URL}/jsonapi/node/property/${result.data.id}`);
  } catch (err) {
    console.error("❌ TEST FAILED:", err);
    process.exit(1);
  }
}

main();
