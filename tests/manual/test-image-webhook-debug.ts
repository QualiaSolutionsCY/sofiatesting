/**
 * Test image webhook to verify debug logging
 * Simulates a WaSend image-only webhook (like from phone gallery)
 */

const WEBHOOK_URL = "https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot";

// Test phone number (must be a registered agent)
const TEST_PHONE = "+35799206651"; // Michelle Longridge - Limassol agent

async function testImageWebhook() {
  console.log("Testing sophia-bot webhook with simulated image message...\n");

  // Simulate WaSend webhook format for image-only message (like from phone gallery)
  // This mimics the format WaSend sends for WhatsApp encrypted images
  const webhookPayload = {
    event: "messages.received",
    data: {
      messages: {
        key: {
          remoteJid: `${TEST_PHONE.replace("+", "")}@s.whatsapp.net`,
          fromMe: false,
          id: `TEST_IMAGE_${Date.now()}`,
          cleanedSenderPn: TEST_PHONE.replace("+", ""),
        },
        message: {
          imageMessage: {
            url: "https://mmg.whatsapp.net/test-encrypted-url.enc",
            mimetype: "image/jpeg",
            mediaKey: "dGVzdC1tZWRpYS1rZXktZm9yLWRlYnVnZ2luZw==",
            fileSha256: "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo=",
            fileLength: "123456",
            caption: "", // No caption - image only
          },
        },
        messageBody: "", // Empty for image-only messages
        pushName: "Test User",
      },
    },
  };

  console.log("Sending webhook request with imageMessage...");
  console.log("Phone:", TEST_PHONE);
  console.log("Payload:", JSON.stringify(webhookPayload, null, 2).substring(0, 500) + "...\n");

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(webhookPayload),
    });

    const responseText = await response.text();

    console.log("Response status:", response.status);
    console.log("Response body:", responseText.substring(0, 500));

    if (response.status === 200) {
      console.log("\nWebhook accepted!");
      console.log("Check webhook_debug_logs table for captured payload.");
    } else {
      console.log("\nWebhook failed:", response.status);
    }

  } catch (error) {
    console.error("Error:", error);
  }
}

// Also test a variant with the image at a different location
async function testImageVariant() {
  console.log("\n\n=== Testing variant payload format ===\n");

  const webhookPayload2 = {
    event: "messages.upsert",
    data: {
      messages: {
        key: {
          remoteJid: `${TEST_PHONE.replace("+", "")}@s.whatsapp.net`,
          fromMe: false,
          id: `TEST_IMAGE_VAR_${Date.now()}`,
          cleanedSenderPn: TEST_PHONE.replace("+", ""),
        },
        // imageMessage at top level instead of nested in message
        imageMessage: {
          url: "https://mmg.whatsapp.net/test-variant-encrypted.enc",
          mimetype: "image/jpeg",
          mediaKey: "dmFyaWFudC1tZWRpYS1rZXktZm9yLXRlc3Rpbmc=",
          fileSha256: "YWJjMTIzNDU2Nzg5MA==",
          fileLength: "98765",
        },
        messageBody: "",
        pushName: "Test User Variant",
      },
    },
  };

  console.log("Sending variant payload with imageMessage at different location...");
  console.log("Payload:", JSON.stringify(webhookPayload2, null, 2).substring(0, 400) + "...\n");

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(webhookPayload2),
    });

    const responseText = await response.text();
    console.log("Response status:", response.status);
    console.log("Response body:", responseText.substring(0, 300));

  } catch (error) {
    console.error("Error:", error);
  }
}

// Run both tests
async function main() {
  await testImageWebhook();
  await testImageVariant();

  console.log("\n\n=== Check debug logs after 5 seconds ===");
  await new Promise(resolve => setTimeout(resolve, 5000));
  console.log("\nRun this SQL to see captured payloads:");
  console.log("SELECT * FROM webhook_debug_logs ORDER BY created_at DESC LIMIT 10;");
}

main();
