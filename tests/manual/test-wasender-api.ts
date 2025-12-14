/**
 * Direct WaSenderAPI Test
 * Tests the API endpoints without Next.js server-only restrictions
 */

import { config } from "dotenv";

config({ path: ".env.local" });

const API_KEY = process.env.WASENDER_API_KEY;
const TEST_PHONE = process.env.TEST_WHATSAPP_NUMBER || "+35799111668";

if (!API_KEY) {
  console.error("ERROR: WASENDER_API_KEY not set in .env.local");
  process.exit(1);
}

console.log("\n=== WaSenderAPI Direct Test ===\n");
console.log("API Key:", API_KEY.substring(0, 10) + "...");
console.log("Test Phone:", TEST_PHONE);

async function testTextMessage() {
  console.log("\n--- Test 1: Send Text Message ---");

  try {
    const response = await fetch(
      "https://api.wasenderapi.com/api/send-message",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          to: TEST_PHONE.replace("+", ""),
          text: `SOFIA Test Message - ${new Date().toISOString()}`,
        }),
      }
    );

    const data = await response.json();
    console.log("Response status:", response.status);
    console.log("Response data:", JSON.stringify(data, null, 2));
    return response.ok;
  } catch (error) {
    console.error("Error:", error);
    return false;
  }
}

async function testUpload() {
  console.log("\n--- Test 2: Upload File ---");

  // Create a simple test document content
  const testContent = "This is a test file from SOFIA WhatsApp integration";
  const base64Content = Buffer.from(testContent).toString("base64");
  const dataUrl = `data:text/plain;base64,${base64Content}`;

  try {
    const response = await fetch("https://api.wasenderapi.com/api/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        base64: dataUrl,
      }),
    });

    const data = await response.json();
    console.log("Upload response status:", response.status);
    console.log("Upload response data:", JSON.stringify(data, null, 2));

    if (response.ok && (data.url || data.publicUrl)) {
      return data.url || data.publicUrl;
    }
    return null;
  } catch (error) {
    console.error("Upload error:", error);
    return null;
  }
}

async function testSendDocument(uploadedUrl: string) {
  console.log("\n--- Test 3: Send Document ---");

  try {
    const response = await fetch(
      "https://api.wasenderapi.com/api/send-message",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          messageType: "document",
          to: TEST_PHONE.replace("+", ""),
          documentUrl: uploadedUrl,
          text: "Test document from SOFIA",
        }),
      }
    );

    const data = await response.json();
    console.log("Send document response status:", response.status);
    console.log("Send document response data:", JSON.stringify(data, null, 2));
    return response.ok;
  } catch (error) {
    console.error("Send document error:", error);
    return false;
  }
}

async function testSendDocxDocument() {
  console.log("\n--- Test 4: Generate and Send DOCX ---");

  // Create a simple DOCX-like content (actually just text for testing upload flow)
  const { Document, Packer, Paragraph, TextRun } = await import("docx");

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: "SOFIA Test Document",
                bold: true,
                size: 28,
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({
            children: [
              new TextRun({ text: `Generated: ${new Date().toISOString()}` }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({
            children: [
              new TextRun({ text: "This is a test document from SOFIA." }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({
            children: [new TextRun({ text: "Test Section:", bold: true })],
          }),
          new Paragraph({ text: "• Property calculations" }),
          new Paragraph({ text: "• Transfer fees" }),
          new Paragraph({ text: "• VAT calculations" }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  console.log("Generated DOCX buffer size:", buffer.length, "bytes");

  // Upload DOCX
  const base64Content = buffer.toString("base64");
  const dataUrl = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${base64Content}`;

  console.log("Uploading DOCX...");
  const uploadResponse = await fetch("https://api.wasenderapi.com/api/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      base64: dataUrl,
    }),
  });

  const uploadData = await uploadResponse.json();
  console.log("DOCX upload status:", uploadResponse.status);
  console.log("DOCX upload data:", JSON.stringify(uploadData, null, 2));

  const docUrl = uploadData.url || uploadData.publicUrl;
  if (!uploadResponse.ok || !docUrl) {
    console.error("DOCX upload failed");
    return false;
  }

  // Send DOCX
  console.log("Sending DOCX via WhatsApp with URL:", docUrl);
  const sendResponse = await fetch(
    "https://api.wasenderapi.com/api/send-message",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        messageType: "document",
        to: TEST_PHONE.replace("+", ""),
        documentUrl: docUrl,
        text: "SOFIA Test DOCX Document",
      }),
    }
  );

  const sendData = await sendResponse.json();
  console.log("DOCX send status:", sendResponse.status);
  console.log("DOCX send data:", JSON.stringify(sendData, null, 2));

  return sendResponse.ok;
}

async function runAllTests() {
  console.log("\n========================================");
  console.log("Starting WaSenderAPI Tests");
  console.log("========================================\n");

  // Test 1: Text message
  const textOk = await testTextMessage();
  console.log("\nText message test:", textOk ? "PASSED" : "FAILED");

  // Wait a bit between tests
  await new Promise((r) => setTimeout(r, 2000));

  // Test 2: Upload
  const uploadedUrl = await testUpload();
  console.log("\nUpload test:", uploadedUrl ? "PASSED" : "FAILED");

  if (uploadedUrl) {
    // Wait a bit
    await new Promise((r) => setTimeout(r, 2000));

    // Test 3: Send document with uploaded URL
    const docOk = await testSendDocument(uploadedUrl);
    console.log("\nSend document test:", docOk ? "PASSED" : "FAILED");
  }

  // Wait a bit
  await new Promise((r) => setTimeout(r, 2000));

  // Test 4: Full DOCX flow
  const docxOk = await testSendDocxDocument();
  console.log("\nDOCX generation and send test:", docxOk ? "PASSED" : "FAILED");

  console.log("\n========================================");
  console.log("Tests Complete");
  console.log("========================================\n");
}

runAllTests().catch(console.error);
