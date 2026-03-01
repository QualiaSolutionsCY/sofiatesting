/**
 * Test script for sendEmail tool in sophia-bot Edge Function
 *
 * This simulates a WhatsApp message asking SOPHIA to send an email
 */

const SUPABASE_URL = "https://vceeheaxcrhmpqueudqx.supabase.co";
const FUNCTION_ENDPOINT = `${SUPABASE_URL}/functions/v1/sophia-bot`;

// Test phone number - should match an agent in the database
// Using Diana Kultaseva's number (registered Limassol agent)
const TEST_PHONE = "35794042235";

async function testSendEmail() {
  console.log("🧪 Testing sendEmail tool via sophia-bot Edge Function\n");

  // Simulate a WaSend webhook payload asking to send an email
  // WaSend format: { event: "messages.received", data: { messages: {...} } }
  const webhookPayload = {
    event: "messages.received",
    data: {
      messages: {
        key: {
          remoteJid: `${TEST_PHONE}@s.whatsapp.net`,
          fromMe: false,
        },
        messageBody:
          "Send an email to info@qualiasolutions.net with subject 'Test from SOPHIA' and body 'This is a test email sent by SOPHIA AI assistant to verify the email functionality is working correctly.'",
        pushName: "Test Agent",
      },
    },
  };

  console.log("📤 Sending webhook request to:", FUNCTION_ENDPOINT);
  console.log("📝 Message:", webhookPayload.data.messages.messageBody);
  console.log("");

  try {
    const response = await fetch(FUNCTION_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(webhookPayload),
    });

    console.log("📥 Response status:", response.status);

    const responseText = await response.text();
    console.log("📥 Response body:", responseText);

    if (response.ok) {
      console.log("\n✅ Request processed successfully");
      console.log("Check your email inbox for the test email!");
    } else {
      console.log("\n❌ Request failed");
    }
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// Alternative: Direct tool call test (bypasses AI model)
async function testDirectToolCall() {
  console.log("\n🧪 Testing direct sendEmail API call\n");

  // This tests the Resend API directly using the Edge Function's environment
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  if (!RESEND_API_KEY) {
    console.log(
      "⚠️ RESEND_API_KEY not in local env - testing via Edge Function instead"
    );
    return;
  }

  const emailPayload = {
    from: "SOPHIA <sofia@zyprus.com>",
    to: ["fawzi@qualia.solutions"],
    subject: "Direct Test from SOPHIA",
    html:
      "This is a direct test email to verify Resend API connectivity.<br><br>Sent: " +
      new Date().toISOString(),
    text:
      "This is a direct test email to verify Resend API connectivity.\n\nSent: " +
      new Date().toISOString(),
  };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    console.log("📥 Resend API status:", response.status);
    const result = await response.json();
    console.log("📥 Resend API response:", JSON.stringify(result, null, 2));

    if (response.ok) {
      console.log("\n✅ Email sent successfully!");
      console.log("Email ID:", result.id);
    } else {
      console.log("\n❌ Resend API error");
    }
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// Run tests
console.log("=".repeat(60));
console.log("SOPHIA sendEmail Tool Test");
console.log("=".repeat(60));
console.log("");

testSendEmail();
