/**
 * Test Multiple Property Uploads via SOPHIA
 *
 * Uploads 3 different property types to test the new description format
 */

import crypto from "crypto";
import { config } from "dotenv";

config({ path: ".env.local" });

const SUPABASE_URL = "https://vceeheaxcrhmpqueudqx.supabase.co";
const WEBHOOK_SECRET = process.env.WASEND_WEBHOOK_SECRET || "test-secret";

// Michelle Longridge's phone number (registered agent)
const AGENT_PHONE = "35799206651";

// Property 1: Luxury Villa in Agios Tychonas (Limassol)
const PROPERTY_1 = `Hi SOPHIA, please upload this property:

Type: 4 bedroom detached villa
Location: Agios Tychonas, Limassol
Price: €895,000
Listing Type: Sale

Details:
- 4 bedrooms
- 3 bathrooms
- 280 sqm covered area
- 1200 sqm plot
- Built in 2019
- Title deeds: Separate

Features:
- Private infinity pool
- Sea view
- Mountain view
- Central heating
- Air conditioning
- Double garage
- Landscaped garden with irrigation
- Solar panels
- Outdoor kitchen with BBQ
- Wine cellar
- Home cinema room
- Smart home system

Owner:
Name: Andreas Christodoulou
Phone: +357 99 111222
Email: andreas.ch@example.com

Notes: Motivated seller, relocating abroad. Price negotiable.

Images:
https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800
https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800
https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800`;

// Property 2: Modern Apartment in Limassol
const PROPERTY_2 = `SOPHIA, upload this apartment:

Type: 2 bedroom apartment
Location: Potamos Germasogeia, Limassol
Price: €320,000
Listing Type: Sale

Details:
- 2 bedrooms
- 1 bathroom
- 95 sqm covered area
- 3rd floor
- Built in 2021
- Title deeds: Final Approval

Features:
- Sea view
- Communal pool
- Air conditioning
- Covered parking
- Storage room
- Gym access
- Double glazing
- Security system
- Intercom

Owner:
Name: Maria Konstantinou
Phone: +357 96 333444
Email: maria.k@example.com

Notes: Tenant in place paying €1,200/month. Good investment.

Images:
https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800
https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800`;

// Property 3: Townhouse in Mesa Geitonia (Limassol)
const PROPERTY_3 = `Upload this property please:

Type: 3 bedroom townhouse
Location: Mesa Geitonia, Limassol
Price: €285,000
Listing Type: Sale

Details:
- 3 bedrooms
- 2 bathrooms
- 155 sqm covered area
- 200 sqm plot
- Built in 2017
- Title deeds: Separate

Features:
- Roof terrace
- Central heating
- Air conditioning
- Private garden
- Covered parking
- Storage
- BBQ area
- Fly screens
- Double glazing

Owner:
Name: Yiannis Papadopoulos
Phone: +357 97 555666
Email: yiannis.p@example.com

Notes: Family home in quiet neighborhood. Close to schools and amenities.

Images:
https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=800
https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800`;

function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

async function sendWebhookMessage(
  message: string,
  phoneNumber: string,
  propertyName: string
) {
  const webhookPayload = {
    event: "messages.received",
    timestamp: Date.now(),
    data: {
      messages: {
        key: {
          remoteJid: `${phoneNumber}@s.whatsapp.net`,
          fromMe: false,
          id: `TEST_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        },
        pushName: "Michelle Test",
        message: {
          conversation: message,
        },
        messageTimestamp: Math.floor(Date.now() / 1000),
      },
    },
  };

  const payloadString = JSON.stringify(webhookPayload);
  const signature = generateSignature(payloadString, WEBHOOK_SECRET);

  console.log(`\n📤 Uploading: ${propertyName}`);
  console.log(`   Message length: ${message.length} chars`);

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/sophia-bot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wasend-signature": signature,
      },
      body: payloadString,
    });

    const responseText = await response.text();
    console.log(`   Status: ${response.status}`);

    try {
      const responseJson = JSON.parse(responseText);
      if (responseJson.success) {
        console.log("   ✅ Success!");
      } else {
        console.log(
          `   Response: ${JSON.stringify(responseJson, null, 2).substring(0, 300)}`
        );
      }
    } catch {
      console.log(`   Body: ${responseText.substring(0, 200)}`);
    }

    return response;
  } catch (error) {
    console.error("   ❌ Error:", error);
    throw error;
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("SOPHIA MULTI-PROPERTY UPLOAD TEST");
  console.log("=".repeat(60));
  console.log(
    "\nTesting new comprehensive description format with 3 Limassol properties:"
  );
  console.log("1. Luxury Villa in Agios Tychonas (4 bed)");
  console.log("2. Modern Apartment in Potamos Germasogeia (2 bed)");
  console.log("3. Townhouse in Mesa Geitonia (3 bed)");
  console.log("");

  // Upload property 1
  await sendWebhookMessage(
    PROPERTY_1,
    AGENT_PHONE,
    "Luxury Villa in Agios Tychonas"
  );

  // Wait a bit between uploads
  console.log("\n⏳ Waiting 5 seconds...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Upload property 2
  await sendWebhookMessage(
    PROPERTY_2,
    AGENT_PHONE,
    "Modern Apartment in Potamos Germasogeia"
  );

  // Wait a bit between uploads
  console.log("\n⏳ Waiting 5 seconds...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Upload property 3
  await sendWebhookMessage(
    PROPERTY_3,
    AGENT_PHONE,
    "Townhouse in Mesa Geitonia"
  );

  console.log("\n" + "=".repeat(60));
  console.log("UPLOADS COMPLETE");
  console.log("=".repeat(60));
  console.log("\n📋 Check the draft dashboard:");
  console.log("   https://dev9.zyprus.com/draft-dashboard?ai_state=draft");
  console.log("\n🔍 Verify each listing has:");
  console.log("   - KEY FEATURES section with bullet points");
  console.log("   - INDOOR FEATURES section");
  console.log("   - OUTDOOR FEATURES section");
  console.log("   - PROPERTY VIEWS section");
  console.log("   - field_listing_owner populated");
  console.log("   - field_ai_draft_own_reference_id set");
}

main().catch(console.error);
