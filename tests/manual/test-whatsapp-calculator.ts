/**
 * Test WhatsApp Calculator Responses
 *
 * This script tests that calculator queries return text responses, not documents
 */

async function testCalculatorResponses() {
  const webhookUrl = "https://sofiatesting.vercel.app/api/whatsapp/webhook";
  const testQueries = [
    {
      name: "VAT Calculation",
      message: "What is the VAT for a €300,000 property in Cyprus?",
      expectedType: "text",
    },
    {
      name: "Transfer Fees",
      message: "Calculate transfer fees for a €200,000 apartment",
      expectedType: "text",
    },
    {
      name: "Capital Gains",
      message: "What are the capital gains tax if I sell for €400,000?",
      expectedType: "text",
    },
    {
      name: "General Knowledge",
      message: "What are the property taxes in Cyprus?",
      expectedType: "text",
    },
  ];

  console.log("=== WhatsApp Calculator Response Tests ===\n");

  for (const test of testQueries) {
    console.log(`--- Testing: ${test.name} ---`);
    console.log(`Query: ${test.message}`);

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event: "messages.received",
          sessionId: "test-calculator",
          data: {
            messages: {
              key: {
                id: `test-${Date.now()}-${test.name.replace(/\s+/g, "-")}`,
                fromMe: false,
                remoteJid: "35799111668@s.whatsapp.net",
              },
              pushName: "Calculator Test",
              message: {
                conversation: test.message,
              },
              messageBody: test.message,
            },
          },
        }),
      });

      if (response.ok) {
        console.log("✅ Webhook received successfully");
        console.log(`Expected: ${test.expectedType} response\n`);
      } else {
        console.log(`❌ Failed: ${response.status} ${response.statusText}\n`);
      }
    } catch (error) {
      console.log(`❌ Error: ${error}\n`);
    }

    // Wait between requests to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log("=== Test Complete ===");
  console.log(
    "\nCheck WhatsApp to verify all calculator responses are text, not documents!"
  );
}

// Run the test
testCalculatorResponses().catch(console.error);
