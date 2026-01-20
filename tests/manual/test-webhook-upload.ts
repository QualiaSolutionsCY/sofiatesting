/**
 * Test SOPHIA via Webhook Simulation
 *
 * This test simulates a WhatsApp webhook message to SOPHIA
 * to trigger a full property upload flow.
 */
import { config } from "dotenv";
import crypto from "crypto";
config({ path: ".env.local" });

const SUPABASE_URL = "https://vceeheaxcrhmpqueudqx.supabase.co";
const WEBHOOK_SECRET = process.env.WASEND_WEBHOOK_SECRET || "test-secret";

// Michelle's phone number (known agent)
const AGENT_PHONE = "35799458212"; // Michelle's WhatsApp

// Property details as a natural conversation
const PROPERTY_MESSAGE = `Hi SOPHIA, I'd like to upload a new property:

Property Type: 4 bedroom detached house
Location: Tala, Paphos
Price: €485,000

Details:
- 3 bathrooms
- 220 sqm covered area
- 850 sqm plot size
- Year built: 2018
- Title deeds: Separate

Features:
- Private swimming pool
- Sea view
- Mountain view
- Central heating
- Air conditioning
- Covered parking for 2 cars
- Landscaped garden
- Solar panels
- Storage room
- BBQ area

Owner Details:
Name: Konstantinos Papadopoulos
Phone: +357 99 876543
Email: kpapadopoulos@example.com

Notes: Owner is motivated to sell. Open to reasonable offers.

Images:
https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800
https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800
https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800

Please create this listing as a draft.`;

function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

async function sendWebhookMessage(message: string, phoneNumber: string) {
  // WaSender webhook payload format
  const webhookPayload = {
    event: "messages.received",
    timestamp: Date.now(),
    data: {
      messages: {
        key: {
          remoteJid: `${phoneNumber}@s.whatsapp.net`,
          fromMe: false,
          id: `TEST_${Date.now()}`
        },
        pushName: "Test Agent",
        message: {
          conversation: message
        },
        messageTimestamp: Math.floor(Date.now() / 1000)
      }
    }
  };

  const payloadString = JSON.stringify(webhookPayload);
  const signature = generateSignature(payloadString, WEBHOOK_SECRET);

  console.log("📤 Sending webhook to SOPHIA...");
  console.log(`   Phone: ${phoneNumber}`);
  console.log(`   Message length: ${message.length} chars`);

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/sophia-bot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wasend-signature": signature,
      },
      body: payloadString
    });

    const responseText = await response.text();

    console.log("\n📥 Response:");
    console.log(`   Status: ${response.status}`);

    try {
      const responseJson = JSON.parse(responseText);
      console.log(`   Body: ${JSON.stringify(responseJson, null, 2)}`);
    } catch {
      console.log(`   Body: ${responseText.substring(0, 500)}`);
    }

    return response;
  } catch (error) {
    console.error("❌ Error:", error);
    throw error;
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("SOPHIA WEBHOOK UPLOAD TEST");
  console.log("=".repeat(60));
  console.log("");
  console.log("This test simulates a WhatsApp message to SOPHIA");
  console.log("to trigger a full property upload with all new fields.");
  console.log("");
  console.log("Expected new fields to be populated:");
  console.log("- field_listing_owner (Michelle's UUID)");
  console.log("- field_ai_draft_own_reference_id (SOPHIA-YYYYMMDD-...)");
  console.log("- field_property_views (Sea View, Mountain View)");
  console.log("");

  await sendWebhookMessage(PROPERTY_MESSAGE, AGENT_PHONE);

  console.log("\n" + "=".repeat(60));
  console.log("After upload, check:");
  console.log("https://dev9.zyprus.com/draft-dashboard?ai_state=draft");
  console.log("=".repeat(60));
}

main().catch(console.error);
