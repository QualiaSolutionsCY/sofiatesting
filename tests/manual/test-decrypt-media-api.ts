/**
 * Test WaSend decrypt-media API
 * Verifies the endpoint and request format for decrypting WhatsApp media
 */

import { config } from "dotenv";

config({ path: ".env.local" });

const API_KEY = process.env.WASENDER_API_KEY;

if (!API_KEY) {
  console.error("ERROR: WASENDER_API_KEY not set in .env.local");
  process.exit(1);
}

console.log("\n=== WaSend Decrypt Media API Test ===\n");
console.log("API Key:", API_KEY.substring(0, 10) + "...");

// Test both possible endpoints
const ENDPOINTS = [
  "https://www.wasenderapi.com/api/decrypt-media",
  "https://api.wasenderapi.com/api/decrypt-media",
];

// Simulated WhatsApp encrypted image data (from real webhook would have actual encrypted URL)
const MOCK_IMAGE_DATA = {
  messageId: "TEST_MSG_" + Date.now(),
  url: "https://mmg.whatsapp.net/test-encrypted-url.enc",
  mimetype: "image/jpeg",
  mediaKey: "dGVzdC1tZWRpYS1rZXktZm9yLWRlYnVnZ2luZw==", // base64 test key
  fileSha256: "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo=",
  fileLength: "123456",
};

async function testDecryptEndpoint(endpoint: string) {
  console.log(`\n--- Testing endpoint: ${endpoint} ---\n`);

  // Format 1: The format currently used in media-decryptor.ts
  const requestBody1 = {
    data: {
      messages: {
        key: {
          id: MOCK_IMAGE_DATA.messageId,
        },
        message: {
          imageMessage: {
            url: MOCK_IMAGE_DATA.url,
            mimetype: MOCK_IMAGE_DATA.mimetype,
            mediaKey: MOCK_IMAGE_DATA.mediaKey,
            fileSha256: MOCK_IMAGE_DATA.fileSha256,
            fileLength: MOCK_IMAGE_DATA.fileLength,
          },
        },
      },
    },
  };

  console.log("Request format 1 (nested data.messages):");
  console.log(JSON.stringify(requestBody1, null, 2));

  try {
    const response1 = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody1),
    });

    const responseText1 = await response1.text();
    console.log("\nResponse status:", response1.status);
    console.log(
      "Response headers:",
      Object.fromEntries(response1.headers.entries())
    );
    console.log("Response body:", responseText1.substring(0, 500));

    if (response1.status === 404) {
      console.log("\n⚠️  Endpoint not found (404)");
    } else if (response1.status === 400) {
      console.log("\n⚠️  Bad request - check request format");
    } else if (response1.status === 401) {
      console.log("\n⚠️  Unauthorized - check API key");
    } else if (response1.status === 422) {
      console.log(
        "\n⚠️  Unprocessable - invalid data (expected with mock data)"
      );
    }

    return { status: response1.status, body: responseText1 };
  } catch (error) {
    console.error("Error:", error);
    return { status: 0, body: String(error) };
  }
}

async function testAlternativeFormat(endpoint: string) {
  console.log("\n--- Testing alternative request format ---\n");

  // Format 2: Simpler flat format (in case the API changed)
  const requestBody2 = {
    messageId: MOCK_IMAGE_DATA.messageId,
    imageMessage: {
      url: MOCK_IMAGE_DATA.url,
      mimetype: MOCK_IMAGE_DATA.mimetype,
      mediaKey: MOCK_IMAGE_DATA.mediaKey,
      fileSha256: MOCK_IMAGE_DATA.fileSha256,
      fileLength: MOCK_IMAGE_DATA.fileLength,
    },
  };

  console.log("Request format 2 (flat structure):");
  console.log(JSON.stringify(requestBody2, null, 2));

  try {
    const response2 = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody2),
    });

    const responseText2 = await response2.text();
    console.log("\nResponse status:", response2.status);
    console.log("Response body:", responseText2.substring(0, 500));

    return { status: response2.status, body: responseText2 };
  } catch (error) {
    console.error("Error:", error);
    return { status: 0, body: String(error) };
  }
}

async function checkApiDocumentation() {
  console.log("\n--- Checking WaSend API documentation ---\n");

  // Try to access API documentation endpoints
  const docUrls = [
    "https://www.wasenderapi.com/docs",
    "https://api.wasenderapi.com/docs",
    "https://www.wasenderapi.com/api/docs",
    "https://api.wasenderapi.com/swagger",
  ];

  for (const url of docUrls) {
    try {
      const response = await fetch(url, { method: "GET" });
      console.log(`${url}: ${response.status}`);
      if (response.status === 200) {
        const text = await response.text();
        console.log(`  Content length: ${text.length} chars`);
        if (text.includes("decrypt") || text.includes("media")) {
          console.log("  ✅ Contains decrypt/media references");
        }
      }
    } catch (error) {
      console.log(`${url}: ERROR - ${error}`);
    }
  }
}

async function main() {
  console.log("\n========================================");
  console.log("WaSend Decrypt Media API Investigation");
  console.log("========================================\n");

  // Test both endpoints
  console.log("\n=== Testing www.wasenderapi.com endpoint ===");
  const result1 = await testDecryptEndpoint(ENDPOINTS[0]);

  console.log("\n=== Testing api.wasenderapi.com endpoint ===");
  const result2 = await testDecryptEndpoint(ENDPOINTS[1]);

  // If first endpoint works better, try alternative format
  if (result1.status === 400 || result1.status === 422) {
    console.log("\n=== Trying alternative request format ===");
    await testAlternativeFormat(ENDPOINTS[0]);
  }

  // Check documentation
  await checkApiDocumentation();

  console.log("\n========================================");
  console.log("Summary");
  console.log("========================================");
  console.log(`www.wasenderapi.com: ${result1.status}`);
  console.log(`api.wasenderapi.com: ${result2.status}`);
  console.log("\nNote: With mock data, 422/400 errors are expected.");
  console.log(
    "The key is determining which endpoint returns a valid response structure."
  );
  console.log("\nTo test with REAL data, capture a webhook with imageMessage");
  console.log("from webhook_debug_logs and use those actual values.");
}

main().catch(console.error);
