import { config } from "dotenv";
config({ path: ".env.local" });

const apiUrl = process.env.ZYPRUS_API_URL;
const clientId = process.env.ZYPRUS_CLIENT_ID;
const clientSecret = process.env.ZYPRUS_CLIENT_SECRET;

const SOPHIA_AI_UUID = "7026c7a3-1ef0-419f-9957-15a8c161b614";
const DEFAULT_LOCATION_ID = "7dbc931e-90eb-4b89-9ac8-b5e593831cf8";
const DEFAULT_PROPERTY_TYPE_ID = "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44";
const DEFAULT_LISTING_TYPE_ID = "8f187816-a888-4cda-a937-1cee84b9c0ee";
const DEFAULT_TITLE_DEED_ID = "5c553db1-e53d-46a2-b609-093d17e75a7a";
const DEFAULT_PRICE_MODIFIER_ID = "ab39af2d-c8f5-4971-9fa5-2df6822ab9a9";

async function main() {
  // Get token
  const tokenRes = await fetch(`${apiUrl}/oauth/token`, {
    method: "POST",
    headers: { "User-Agent": "SophiaAI", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId!, client_secret: clientSecret! }),
  });
  const { access_token } = await tokenRes.json();
  console.log("✅ Got token");

  // Upload image
  const imgRes = await fetch("https://picsum.photos/800/600.jpg");
  const imgBlob = await imgRes.blob();
  const uploadRes = await fetch(`${apiUrl}/jsonapi/node/property/field_gallery_`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "User-Agent": "SophiaAI",
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `file; filename="sophia-test-${Date.now()}.jpg"`,
    },
    body: imgBlob,
  });
  const imgData = await uploadRes.json();
  const imageId = imgData.data.id;
  console.log("✅ Image uploaded:", imageId);

  // Create listing with SOPHIA_AI as instructor/reviewer
  const payload = {
    data: {
      type: "node--property",
      attributes: {
        status: false,
        title: "SOPHIA TEST - 3 Bed Villa Limassol",
        body: { value: "Test listing uploaded via Sophia AI account", format: "plain_text" },
        field_ai_state: "draft",
        field_ai_generated: true,
        field_own_reference_id: `SOPHIA-${Date.now()}`,
        field_price: "350000",
        field_no_bedrooms: 3,
        field_no_bathrooms: 2,
        field_covered_area: 150,
      },
      relationships: {
        field_location: { data: { type: "node--location", id: DEFAULT_LOCATION_ID } },
        field_property_type: { data: { type: "taxonomy_term--property_type", id: DEFAULT_PROPERTY_TYPE_ID } },
        field_listing_type: { data: { type: "taxonomy_term--listing_type", id: DEFAULT_LISTING_TYPE_ID } },
        field_title_deed: { data: { type: "taxonomy_term--title_deed", id: DEFAULT_TITLE_DEED_ID } },
        field_price_modifier: { data: { type: "taxonomy_term--price_modifier", id: DEFAULT_PRICE_MODIFIER_ID } },
        field_gallery_: { data: [{ type: "file--file", id: imageId }] },
        field_ai_listing_reviewer: { data: [{ type: "user--user", id: SOPHIA_AI_UUID }] },
        field_ai_listing_instructor: { data: { type: "user--user", id: SOPHIA_AI_UUID } },
      },
    },
  };

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
    console.error("❌ Failed:", await createRes.text());
    return;
  }

  const result = await createRes.json();
  console.log("\n✅ LISTING CREATED!");
  console.log("Node ID:", result.data.id);
  console.log("Title:", result.data.attributes.title);
  console.log("AI State:", result.data.attributes.field_ai_state);
  console.log("\n👉 Check: https://dev9.zyprus.com/draft-dashboard?ai_state=draft");
}
main();
