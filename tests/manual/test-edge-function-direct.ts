/**
 * Direct test of SOPHIA edge function
 * Sends a property upload request and monitors the response
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const EDGE_FUNCTION_URL = "https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot";

// Use Maria Georgiou's phone (Limassol agent)
const AGENT_PHONE = "35799581359";

// Simple property with all required fields
const uploadMessage = `Upload property for sale:
- Type: apartment
- Location: Potamos Germasogeia, Limassol
- Price: €195,000
- Bedrooms: 2
- Bathrooms: 1
- Covered area: 80 sqm
- Title deeds: separate
- Owner: Test Owner
- Owner phone: +357 99 111222
- Image: https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800`;

async function testDirectUpload() {
  console.log("🧪 DIRECT EDGE FUNCTION TEST\n");
  console.log("=" .repeat(60));
  console.log("This test sends a property upload request to verify:");
  console.log("1. Edge function processes the request");
  console.log("2. My Notes contains actual reviewer emails (not 'SOPHIA AI')");
  console.log("=" .repeat(60));

  const payload = {
    event: "messages.received",
    data: {
      messages: {
        key: {
          cleanedSenderPn: AGENT_PHONE,
          remoteJid: `${AGENT_PHONE}@s.whatsapp.net`,
          fromMe: false,
          id: `TEST_${Date.now()}`,
        },
        pushName: "Maria Test",
        messageBody: uploadMessage,
        message: {
          conversation: uploadMessage,
        },
        messageTimestamp: Math.floor(Date.now() / 1000),
      },
    },
  };

  console.log("\n📤 Sending request...");
  console.log(`   Agent: ${AGENT_PHONE} (Limassol)`);
  console.log(`   Property: 2-bed apartment, €195,000`);

  try {
    const startTime = Date.now();
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "TestScript/1.0",
      },
      body: JSON.stringify(payload),
    });

    const elapsed = Date.now() - startTime;
    const responseText = await response.text();

    console.log(`\n📥 Response (${elapsed}ms):`);
    console.log(`   Status: ${response.status}`);
    console.log(`   Body: ${responseText}`);

    if (response.status === 200) {
      console.log("\n✅ Webhook accepted!");
      console.log("\n⏳ The edge function processes asynchronously.");
      console.log("   The debug logs should now show:");
      console.log("   [ToolExecutor] === MY NOTES CONTENT ===");
      console.log("   <actual my notes without SOPHIA AI>");
      console.log("   [ToolExecutor] === END MY NOTES ===");
      console.log("   [ToolExecutor] My Notes contains 'SOPHIA AI': false");

      console.log("\n📊 Check Supabase Dashboard for logs:");
      console.log("   https://supabase.com/dashboard/project/vceeheaxcrhmpqueudqx/logs/edge-logs");

      console.log("\n📝 Check draft on Zyprus:");
      console.log("   https://dev9.zyprus.com/draft-dashboard?ai_state=draft");

      console.log("\n🔍 What to verify in the logs:");
      console.log("   1. Look for '[ToolExecutor] === MY NOTES CONTENT ==='");
      console.log("   2. My Notes should show:");
      console.log("      Listing Owner: <email>@zyprus.com");
      console.log("      Reviewer: <email>@zyprus.com");
      console.log("   3. Should NOT show 'SOPHIA AI' anywhere");
      console.log("   4. Line 'My Notes contains SOPHIA AI: false' confirms fix");
    }
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

testDirectUpload();
