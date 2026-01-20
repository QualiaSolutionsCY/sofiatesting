/**
 * Test reviewer assignment with actual staff UUIDs
 * Verifies that listings are assigned to the correct staff based on region
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const apiUrl = process.env.ZYPRUS_API_URL;
const clientId = process.env.ZYPRUS_CLIENT_ID;
const clientSecret = process.env.ZYPRUS_CLIENT_SECRET;

// Staff UUIDs from taxonomy-cache.ts USER_FALLBACKS
const STAFF_UUIDS = {
  "listings@zyprus.com": "0caa9a75-362a-4156-b11b-b52839243b74", // Lauren
  "michelle@zyprus.com": "dc2688d2-0ea1-4c13-b03d-3309ee8de6a4", // Michelle
  "demetra@zyprus.com": "b72a0f7c-62d8-4f69-89f3-aaebee31676a", // Demetra
  "azinas@zyprus.com": "c8e05e2a-56e6-4d1f-9a20-31235feaec54", // Azinas
  "charalambos@zyprus.com": "71ac4784-238f-45b2-ac15-5f74200601ce", // Charalambos
  "sophia_ai": "7026c7a3-1ef0-419f-9957-15a8c161b614", // SOPHIA AI
};

// Test: Upload with Lauren as reviewer (Paphos region)
async function main() {
  if (!apiUrl || !clientId || !clientSecret) {
    console.error("Missing env vars");
    return;
  }

  console.log("🧪 REVIEWER ASSIGNMENT TEST\n");
  console.log("Testing: Paphos listing should be assigned to Lauren (listings@zyprus.com)\n");

  // Get token
  const tokenRes = await fetch(`${apiUrl}/oauth/token`, {
    method: "POST",
    headers: { "User-Agent": "SophiaAI", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
  });
  const { access_token } = await tokenRes.json();
  console.log("✅ Got token\n");

  // Upload test image
  console.log("📸 Uploading test image...");
  const imgRes = await fetch("https://picsum.photos/800/600.jpg");
  const imgBlob = await imgRes.blob();
  const uploadRes = await fetch(`${apiUrl}/jsonapi/node/property/field_gallery_`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "User-Agent": "SophiaAI",
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `file; filename="test-reviewer-${Date.now()}.jpg"`,
    },
    body: imgBlob,
  });
  const imgData = await uploadRes.json();
  const imageId = imgData.data.id;
  console.log("✅ Image uploaded:", imageId);

  // Test with Lauren (listings@zyprus.com) as reviewer for Paphos listing
  const LAUREN_UUID = STAFF_UUIDS["listings@zyprus.com"];

  const payload = {
    data: {
      type: "node--property",
      attributes: {
        status: false,
        title: "2 Bed Apartment in Paphos - Reviewer Test",
        body: { value: "Testing reviewer assignment\n\n2 Bedrooms\n1 Bathroom\n80m2 Covered Area", format: "plain_text" },
        field_ai_state: "draft",
        field_ai_generated: true,
        field_price: 150000,
        field_no_bedrooms: 2,
        field_no_bathrooms: 1,
        field_covered_area: 80,
        field_negotiable: true,
        field_my_notes: "Owner: Test Owner\nTel: +357 99 123456\nAgent: Test Agent\nReg: Paphos",
      },
      relationships: {
        field_location: { data: { type: "node--location", id: "7dbc931e-90eb-4b89-9ac8-b5e593831cf8" } },
        field_property_type: { data: { type: "taxonomy_term--property_type", id: "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44" } },
        field_listing_type: { data: { type: "taxonomy_term--listing_type", id: "8f187816-a888-4cda-a937-1cee84b9c0ee" } },
        field_title_deed: { data: { type: "taxonomy_term--title_deed", id: "5c553db1-e53d-46a2-b609-093d17e75a7a" } },
        field_price_modifier: { data: { type: "taxonomy_term--price_modifier", id: "ab39af2d-c8f5-4971-9fa5-2df6822ab9a9" } },
        field_gallery_: { data: [{ type: "file--file", id: imageId }] },
        // KEY TEST: Using Lauren's UUID instead of SOPHIA_AI_UUID
        field_ai_listing_reviewer: { data: [{ type: "user--user", id: LAUREN_UUID }] },
        field_ai_listing_instructor: { data: { type: "user--user", id: LAUREN_UUID } },
      },
    },
  };

  console.log("\n📤 Creating listing with Lauren as reviewer...");
  console.log("Lauren UUID:", LAUREN_UUID);

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
  console.log("Drupal NID:", result.data.attributes.drupal_internal__nid);
  console.log("─".repeat(50));

  // Now fetch the listing to verify reviewer was set correctly
  console.log("\n🔍 Verifying reviewer assignment...");
  const verifyRes = await fetch(
    `${apiUrl}/jsonapi/node/property/${result.data.id}?include=field_ai_listing_reviewer,field_ai_listing_instructor`,
    {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: "application/vnd.api+json",
        "User-Agent": "SophiaAI",
      },
    }
  );

  const verifyData = await verifyRes.json();

  // Check reviewer relationships
  const reviewerRel = verifyData.data.relationships?.field_ai_listing_reviewer?.data;
  const instructorRel = verifyData.data.relationships?.field_ai_listing_instructor?.data;

  console.log("\nReviewer relationship:", JSON.stringify(reviewerRel, null, 2));
  console.log("Instructor relationship:", JSON.stringify(instructorRel, null, 2));

  // Check included users
  const includedUsers = verifyData.included?.filter((i: any) => i.type === "user--user") || [];
  console.log("\nIncluded users:");
  for (const user of includedUsers) {
    console.log(`  - ${user.attributes?.display_name || user.attributes?.name}: ${user.id}`);
  }

  // Verify
  const reviewerUuid = Array.isArray(reviewerRel) ? reviewerRel[0]?.id : reviewerRel?.id;
  const instructorUuid = instructorRel?.id;

  if (reviewerUuid === LAUREN_UUID && instructorUuid === LAUREN_UUID) {
    console.log("\n✅ SUCCESS: Reviewer assignment works correctly!");
    console.log("  - Reviewer UUID matches Lauren:", reviewerUuid);
    console.log("  - Instructor UUID matches Lauren:", instructorUuid);
  } else {
    console.log("\n❌ MISMATCH:");
    console.log("  - Expected:", LAUREN_UUID);
    console.log("  - Got reviewer:", reviewerUuid);
    console.log("  - Got instructor:", instructorUuid);
  }

  console.log("\n─".repeat(50));
  console.log("👉 Check in Zyprus backend:");
  console.log(`   https://dev9.zyprus.com/node/${result.data.attributes.drupal_internal__nid}/edit`);
  console.log("👉 Draft Dashboard:");
  console.log("   https://dev9.zyprus.com/draft-dashboard?ai_state=draft");
}

main();
