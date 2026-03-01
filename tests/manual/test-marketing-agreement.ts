/**
 * Test Marketing Agreement DOCX Generation
 *
 * This tests that SOPHIA generates Template 15 (Non-Exclusive Marketing Agreement)
 * as a DOCX file when user requests a "marketing agreement"
 */

const SUPABASE_URL =
  "https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot";
const TEST_PHONE = "+35794042235"; // Diana Kultaseva - valid agent

interface WebhookPayload {
  event: string;
  instanceId: string;
  data: {
    message: {
      _data: {
        id: { _serialized: string };
        from: string;
        body: string;
        type: string;
        timestamp: number;
      };
    };
  };
}

async function testMarketingAgreement() {
  console.log("=== Testing Marketing Agreement DOCX Generation ===\n");

  // Test 1: Request "marketing agreement" - should trigger Template 15 (DOCX)
  const testMessage =
    "I need a marketing agreement for John Smith, property Reg No. 0/12345 Tala, Paphos, marketing price 350000";

  console.log(`Phone: ${TEST_PHONE}`);
  console.log(`Message: "${testMessage}"\n`);

  const payload: WebhookPayload = {
    event: "message",
    instanceId: "test-instance",
    data: {
      message: {
        _data: {
          id: { _serialized: `test-${Date.now()}` },
          from: TEST_PHONE.replace("+", "") + "@c.us",
          body: testMessage,
          type: "chat",
          timestamp: Math.floor(Date.now() / 1000),
        },
      },
    },
  };

  try {
    console.log("Sending webhook request...\n");

    const response = await fetch(SUPABASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    console.log(`Status: ${response.status}`);
    console.log(`Response: ${responseText.substring(0, 500)}`);

    // Parse response to check what SOPHIA generated
    try {
      const responseJson = JSON.parse(responseText);
      console.log("\n=== Response Analysis ===");
      console.log("Full response:", JSON.stringify(responseJson, null, 2));

      if (responseJson.aiResponse) {
        console.log("\n=== AI Response ===");
        console.log(responseJson.aiResponse.substring(0, 1000));

        // Check if it contains DOCX markers
        const aiResp = responseJson.aiResponse.toLowerCase();
        if (
          aiResp.includes("marketing agreement") &&
          aiResp.includes("csc zyprus")
        ) {
          console.log("\n✅ Response contains DOCX template content!");
        } else if (aiResp.includes("subject:")) {
          console.log(
            "\n❌ Response appears to be Template 14 (email) - has Subject: line"
          );
        } else {
          console.log("\n⚠️ Response unclear - checking content...");
        }
      }
    } catch {
      console.log("\nResponse is not JSON:", responseText);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

testMarketingAgreement();
