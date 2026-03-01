/**
 * Test property upload through SOPHIA Edge Function
 * Simulates a WhatsApp webhook message with property details
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const EDGE_FUNCTION_URL =
  "https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot";

// Use a known agent phone number from the database (Maria Georgiou - Limassol agent)
const TEST_AGENT_PHONE = "35799581359";

// Test property data - different from previous tests
// Using Limassol location to match agent Maria Georgiou's region
const TEST_PROPERTY = {
  listingType: "rent",
  propertyType: "apartment",
  price: 1200,
  location: "Potamos Germasogeia",
  bedrooms: 2,
  bathrooms: 1,
  coveredArea: 85,
  ownerName: "Test Owner EdgeFunction",
  ownerPhone: "+35799888777",
  titleDeedStatus: "separate",
  features: ["air conditioning", "parking", "balcony"],
  floor: "2nd",
};

// Format as a natural language message (how a user would send it)
const userMessage = `
I want to upload a property for rent:
- Type: ${TEST_PROPERTY.propertyType}
- Location: ${TEST_PROPERTY.location}
- Price: €${TEST_PROPERTY.price}/month
- Bedrooms: ${TEST_PROPERTY.bedrooms}
- Bathrooms: ${TEST_PROPERTY.bathrooms}
- Covered area: ${TEST_PROPERTY.coveredArea} sqm
- Floor: ${TEST_PROPERTY.floor}
- Features: ${TEST_PROPERTY.features.join(", ")}
- Owner: ${TEST_PROPERTY.ownerName}
- Owner phone: ${TEST_PROPERTY.ownerPhone}
- Title deeds: ${TEST_PROPERTY.titleDeedStatus}
`;

// WaSend-style webhook payload with ACTUAL IMAGE ATTACHMENT
// Simulates a WhatsApp message with an image attachment
const webhookPayload = {
  event: "messages.received",
  data: {
    messages: {
      key: {
        cleanedSenderPn: TEST_AGENT_PHONE,
        remoteJid: `${TEST_AGENT_PHONE}@s.whatsapp.net`,
        fromMe: false,
      },
      messageBody: userMessage.trim(),
      message: {
        // Text part
        conversation: userMessage.trim(),
        // Image attachment - this is how WaSend sends image data
        imageMessage: {
          url: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800",
          caption: userMessage.trim(),
          mimetype: "image/jpeg",
        },
      },
    },
  },
};

async function testEdgeFunctionUpload() {
  console.log("🧪 SOPHIA EDGE FUNCTION UPLOAD TEST\n");
  console.log("Testing property upload through sophia-bot Edge Function...\n");
  console.log("Property details:");
  console.log(
    `  Type: ${TEST_PROPERTY.propertyType} for ${TEST_PROPERTY.listingType}`
  );
  console.log(`  Location: ${TEST_PROPERTY.location}`);
  console.log(`  Price: €${TEST_PROPERTY.price}`);
  console.log(
    `  Bedrooms: ${TEST_PROPERTY.bedrooms}, Bathrooms: ${TEST_PROPERTY.bathrooms}`
  );
  console.log(`  Area: ${TEST_PROPERTY.coveredArea} sqm\n`);

  try {
    console.log("📤 Sending webhook to:", EDGE_FUNCTION_URL);
    console.log("📱 Simulating from phone:", TEST_AGENT_PHONE);
    console.log("");

    const response = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "TestScript/1.0",
      },
      body: JSON.stringify(webhookPayload),
    });

    console.log("Response status:", response.status);
    const responseText = await response.text();
    console.log("Response body:", responseText);

    if (response.ok) {
      console.log("\n✅ Webhook accepted (200 OK)");
      console.log("\n⏳ The Edge Function processes asynchronously.");
      console.log("   Check the logs for processing details:");
      console.log(
        "   supabase functions logs sophia-bot --project-ref vceeheaxcrhmpqueudqx\n"
      );
      console.log(
        "👉 Check draft dashboard: https://dev9.zyprus.com/draft-dashboard?ai_state=draft"
      );
    } else {
      console.error("\n❌ Webhook rejected:", response.status, responseText);
    }
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

testEdgeFunctionUpload();
