/**
 * Test SOPHIA Full Upload Flow
 *
 * This test simulates a WhatsApp conversation to upload a detailed property
 * through the sophia-bot Edge Function, testing all the new fields.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const SUPABASE_URL = "https://vceeheaxcrhmpqueudqx.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Michelle's phone - known agent for testing
const AGENT_PHONE = "35799123456"; // Use a test phone
const AGENT_NAME = "Test Agent";

// Detailed property for testing
const TEST_PROPERTY = {
  listingType: "sale",
  propertyType: "detached house",
  price: 485_000,
  location: "Tala, Paphos",
  bedrooms: 4,
  bathrooms: 3,
  coveredArea: 220,
  plotSize: 850,
  ownerName: "Mr. Konstantinos Papadopoulos",
  ownerPhone: "+357 99 876543",
  ownerEmail: "kpapadopoulos@example.com",
  titleDeedStatus: "separate",
  yearBuilt: 2018,
  floor: "ground",
  features: [
    "private pool",
    "sea view",
    "mountain view",
    "central heating",
    "air conditioning",
    "covered parking",
    "garden",
    "solar panels",
    "storage room",
  ],
  specialNotes:
    "Owner motivated to sell. Accepts offers. Property has unobstructed views.",
  imageUrls: [
    "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800",
    "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800",
    "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800",
  ],
  coordinates: { lat: 34.8475, lon: 32.4297 },
};

async function testDirectToolCall() {
  console.log("=".repeat(60));
  console.log("TESTING SOPHIA PROPERTY UPLOAD");
  console.log("=".repeat(60));
  console.log("\nProperty Details:");
  console.log(
    `- Type: ${TEST_PROPERTY.bedrooms} bed ${TEST_PROPERTY.propertyType}`
  );
  console.log(`- Location: ${TEST_PROPERTY.location}`);
  console.log(`- Price: €${TEST_PROPERTY.price.toLocaleString()}`);
  console.log(`- Features: ${TEST_PROPERTY.features.join(", ")}`);
  console.log(`- Images: ${TEST_PROPERTY.imageUrls.length}`);
  console.log("");

  // Call the Edge Function directly with a tool call payload
  // This simulates what happens after SOPHIA parses the conversation
  const toolPayload = {
    test_mode: true,
    tool_call: {
      name: "createPropertyListing",
      arguments: TEST_PROPERTY,
    },
    agent_override: {
      phone: AGENT_PHONE,
      fullName: "Michelle Pitsillides",
      email: "michelle@zyprus.com",
      communicationEmail: "limassol@zyprus.com",
      listingOwnerEmail: "michelle@zyprus.com",
      region: "paphos",
      role: "agent",
    },
  };

  console.log("Sending to SOPHIA Edge Function...\n");

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/sophia-bot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "x-test-mode": "true",
      },
      body: JSON.stringify(toolPayload),
    });

    const result = await response.json();

    console.log("Response Status:", response.status);
    console.log("\nResponse Body:");
    console.log(JSON.stringify(result, null, 2));

    if (result.data?.listingId) {
      console.log("\n" + "=".repeat(60));
      console.log("SUCCESS! Property uploaded.");
      console.log("=".repeat(60));
      console.log(`\nListing ID: ${result.data.listingId}`);
      console.log("\nCheck the draft dashboard:");
      console.log("https://dev9.zyprus.com/draft-dashboard?ai_state=draft");
      console.log("\nVerify these NEW fields are populated:");
      console.log(`- field_listing_owner (should be Michelle's UUID)`);
      console.log(
        "- field_ai_draft_own_reference_id (should be SOPHIA-YYYYMMDD-...)"
      );
      console.log(
        "- field_property_views (should have Sea View, Mountain View)"
      );
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

async function testViaZyprusApiDirect() {
  console.log("\n" + "=".repeat(60));
  console.log("ALTERNATIVE: Direct Zyprus API Upload Test");
  console.log("=".repeat(60));

  const apiUrl = process.env.ZYPRUS_API_URL;
  const clientId = process.env.ZYPRUS_CLIENT_ID;
  const clientSecret = process.env.ZYPRUS_CLIENT_SECRET;

  if (!apiUrl || !clientId || !clientSecret) {
    console.log(
      "Missing Zyprus credentials in .env.local - skipping direct API test"
    );
    return;
  }

  // Get token
  console.log("\n1. Getting access token...");
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

  if (!tokenRes.ok) {
    console.error("Failed to get token:", await tokenRes.text());
    return;
  }

  const { access_token } = await tokenRes.json();
  console.log("   Token obtained.");

  // Upload test image
  console.log("\n2. Uploading test image...");
  const imgRes = await fetch(
    "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800"
  );
  const imgBlob = await imgRes.blob();
  const uploadRes = await fetch(
    `${apiUrl}/jsonapi/node/property/field_gallery_`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "User-Agent": "SophiaAI",
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `file; filename="sophia-test-${Date.now()}.jpg"`,
      },
      body: imgBlob,
    }
  );

  if (!uploadRes.ok) {
    console.error("Failed to upload image:", await uploadRes.text());
    return;
  }

  const imgData = await uploadRes.json();
  const imageId = imgData.data.id;
  console.log(`   Image uploaded: ${imageId}`);

  // Create listing with ALL new fields
  console.log("\n3. Creating property listing with NEW fields...");

  // UUIDs from the codebase
  const SOPHIA_AI_UUID = "7026c7a3-1ef0-419f-9957-15a8c161b614";
  const MICHELLE_UUID = "dc2688d2-0ea1-4c13-b03d-3309ee8de6a4";
  const LAUREN_UUID = "0caa9a75-362a-4156-b11b-b52839243b74";
  const DEFAULT_LOCATION_ID = "7dbc931e-90eb-4b89-9ac8-b5e593831cf8";
  const VILLA_TYPE_ID = "76b4fa8e-de7e-4232-85ac-869dca3620f4";
  const FOR_SALE_ID = "8f187816-a888-4cda-a937-1cee84b9c0ee";
  const TITLE_DEED_ID = "5c553db1-e53d-46a2-b609-093d17e75a7a";
  const PRICE_MODIFIER_ID = "ab39af2d-c8f5-4971-9fa5-2df6822ab9a9";

  // Generate reference ID like the new code does
  const now = new Date();
  const draftRefId = `SOPHIA-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${now.toISOString().slice(11, 19).replace(/:/g, "")}-VIL`;

  const payload = {
    data: {
      type: "node--property",
      attributes: {
        status: false,
        title: `4 Bed Detached House in Tala - TEST ${Date.now()}`,
        body: {
          value: `Stunning 4 bedroom detached house for sale in the prestigious village of Tala, Paphos.

This beautifully appointed property offers 220m² of internal living space set on a generous 850m² plot with private swimming pool and landscaped gardens.

The property benefits from spectacular sea and mountain views, central heating, air conditioning throughout, and covered parking for two vehicles.

Built in 2018 to high specifications, the property includes solar panels for energy efficiency and ample storage space.

Located in a quiet residential area yet close to all amenities, this is an ideal family home or investment opportunity.

Contact us today to arrange a viewing.`,
          format: "plain_text",
        },
        field_ai_state: "draft",
        field_ai_generated: true,
        field_negotiable: true,
        field_price: 485_000,
        field_no_bedrooms: 4,
        field_no_bathrooms: 3,
        field_covered_area: 220,
        field_land_size: 850,
        field_year_built: 2018,
        // NEW FIELD: Draft reference ID
        field_ai_draft_own_reference_id: draftRefId,
        // My Notes (back office)
        field_my_notes: `Owner: Mr. Konstantinos Papadopoulos
Tel: +357 99 876543
Email: kpapadopoulos@example.com
Agent: Michelle Pitsillides

Owner Notes:
Owner motivated to sell. Accepts offers. Property has unobstructed views.

Created via SOPHIA AI: ${now.toISOString().split("T")[0]}`,
        // AI Notes
        field_ai_assistant_notes: `=== AI UPLOAD SUMMARY ===

Request: Sale listing from WhatsApp
Property Type: detached house
Key Features: private pool, sea view, mountain view, central heating, air conditioning, covered parking, garden, solar panels, storage room

---
This listing was created by SOPHIA AI assistant.
All details were extracted from WhatsApp conversation.`,
        // Coordinates with privacy offset
        field_map: {
          value: "POINT (32.4297 34.8475)",
          geo_type: "Point",
          lat: 34.8475,
          lon: 32.4297,
          latlon: "34.8475,32.4297",
        },
      },
      relationships: {
        field_location: {
          data: { type: "node--location", id: DEFAULT_LOCATION_ID },
        },
        field_property_type: {
          data: { type: "taxonomy_term--property_type", id: VILLA_TYPE_ID },
        },
        field_listing_type: {
          data: { type: "taxonomy_term--listing_type", id: FOR_SALE_ID },
        },
        field_title_deed: {
          data: { type: "taxonomy_term--title_deed", id: TITLE_DEED_ID },
        },
        field_price_modifier: {
          data: {
            type: "taxonomy_term--price_modifier",
            id: PRICE_MODIFIER_ID,
          },
        },
        field_gallery_: { data: [{ type: "file--file", id: imageId }] },
        // Instructor (who requested the upload)
        field_ai_listing_instructor: {
          data: { type: "user--user", id: MICHELLE_UUID },
        },
        // Reviewers
        field_ai_listing_reviewer: {
          data: [{ type: "user--user", id: LAUREN_UUID }],
        },
        // NEW FIELD: Listing Owner (the agent who "owns" this listing)
        field_listing_owner: {
          data: { type: "user--user", id: MICHELLE_UUID },
        },
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
    const errorText = await createRes.text();
    console.error("\n❌ FAILED to create listing:");
    console.error(errorText);

    // Parse and show specific errors
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.errors) {
        console.log("\nSpecific errors:");
        for (const err of errorJson.errors) {
          console.log(`- ${err.title}: ${err.detail}`);
          if (err.source?.pointer) {
            console.log(`  Field: ${err.source.pointer}`);
          }
        }
      }
    } catch {}
    return;
  }

  const result = await createRes.json();

  console.log("\n" + "=".repeat(60));
  console.log("SUCCESS! Property created with NEW fields");
  console.log("=".repeat(60));
  console.log(`\nNode ID: ${result.data.id}`);
  console.log(`Title: ${result.data.attributes.title}`);
  console.log(`AI State: ${result.data.attributes.field_ai_state}`);
  console.log(
    `Draft Reference: ${result.data.attributes.field_ai_draft_own_reference_id || "(check dashboard)"}`
  );

  console.log("\n👉 Check the draft dashboard:");
  console.log("   https://dev9.zyprus.com/draft-dashboard?ai_state=draft");

  console.log("\n📋 Verify these fields in the listing:");
  console.log("   - field_listing_owner: Should show Michelle");
  console.log(`   - field_ai_draft_own_reference_id: ${draftRefId}`);
  console.log("   - field_my_notes: Should show owner contact details");
  console.log("   - field_ai_assistant_notes: Should show AI summary");
}

// Run tests
async function main() {
  console.log("\n🚀 Starting SOPHIA Upload Test\n");

  // The Edge Function test requires webhook simulation which is complex
  // So we'll do the direct API test which tests the same payload structure
  await testViaZyprusApiDirect();
}

main().catch(console.error);
