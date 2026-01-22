/**
 * Test webhook with images
 * Simulates a property upload request with images
 */

const WEBHOOK_URL = "https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot";

// Test phone number (must be a registered agent)
const TEST_PHONE = "+35799206651"; // Michelle Longridge - Limassol agent

// Test image URLs (using public test images)
const TEST_IMAGES = [
  "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800",
];

async function testWebhook() {
  console.log("🧪 Testing sophia-bot webhook with Trachoni location...\n");

  // Simulate WaSend webhook format - testing TRACHONI location
  const webhookPayload = {
    from: TEST_PHONE,
    body: `Hi Sophia, please upload a property:
3 Bedroom Detached House For Sale in Trachoni, Limassol with Title Deeds.
Price: 475000
2 Bathrooms
180m2 covered area
800m2 plot
Features: Private Pool, Garden, Air Conditioning, Solar Panels
Owner: Test Owner - 99123456`,
    media: TEST_IMAGES,
    messageId: `test_${Date.now()}`,
  };

  console.log("📤 Sending webhook request...");
  console.log("Phone:", TEST_PHONE);
  console.log("Images:", TEST_IMAGES.length);
  console.log("Message:", webhookPayload.body.substring(0, 100) + "...\n");

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(webhookPayload),
    });

    const responseText = await response.text();

    console.log("📥 Response status:", response.status);
    console.log("📥 Response body:", responseText.substring(0, 500));

    if (response.status === 200) {
      console.log("\n✅ Webhook accepted! Check WaSend logs for AI response.");
    } else {
      console.log("\n❌ Webhook failed:", response.status);
    }

    // Wait a bit and check for errors in logs
    console.log("\n⏳ Waiting 15 seconds for processing...");
    await new Promise(resolve => setTimeout(resolve, 15000));

    console.log("\n📋 Check Supabase logs for full details:");
    console.log("https://supabase.com/dashboard/project/vceeheaxcrhmpqueudqx/functions/sophia-bot/logs");

  } catch (error) {
    console.error("❌ Error:", error);
  }
}

testWebhook();
