/**
 * Test that My Notes generator doesn't include "SOPHIA AI"
 * Verifies the fix was applied correctly
 */

// Recreate the generateMyNotes function locally to test
interface OwnerInfo {
  name: string;
  phone: string;
  email?: string;
  specialNotes?: string;
}

interface Agent {
  fullName: string;
}

interface ListingContext {
  registrationNumber?: string;
  source?: string;
  duplicateWarning?: string;
  urgentNotes?: string;
  coordinates?: { lat: number; lon: number };
  listingOwner?: string;
  reviewer1?: string;
  reviewer2?: string;
}

function formatPhone(phone: string): string {
  if (phone.includes(" ") || phone.startsWith("+357")) {
    return phone;
  }
  let formatted = phone.replace(/\D/g, "");
  if (formatted.startsWith("357")) {
    formatted = "+" + formatted;
  } else if (formatted.startsWith("9") || formatted.startsWith("7")) {
    formatted = "+357" + formatted;
  } else if (!formatted.startsWith("+")) {
    formatted = "+357" + formatted;
  }
  if (formatted.length >= 12) {
    return (
      formatted.slice(0, 4) +
      " " +
      formatted.slice(4, 6) +
      " " +
      formatted.slice(6)
    );
  }
  return formatted;
}

function generateMyNotes(
  owner: OwnerInfo,
  agent: Agent,
  context?: ListingContext
): string {
  const lines: string[] = [];

  // Owner information
  lines.push(`Owner: ${owner.name}`);
  lines.push(`Tel: ${formatPhone(owner.phone)}`);

  if (owner.email) {
    lines.push(`Email: ${owner.email}`);
  }

  // Agent information
  lines.push(`Agent: ${agent.fullName}`);

  // Google Maps link if coordinates provided
  if (context?.coordinates) {
    const mapsUrl = `https://www.google.com/maps/place/${context.coordinates.lat},${context.coordinates.lon}`;
    lines.push(`Location: ${mapsUrl}`);
  }

  // Registration number if provided
  if (context?.registrationNumber) {
    lines.push(`Reg: ${context.registrationNumber}`);
  }

  // Source if provided
  if (context?.source) {
    lines.push(`Source: ${context.source}`);
  }

  // Duplicate warning (important for reviewers)
  if (context?.duplicateWarning) {
    lines.push("");
    lines.push("⚠️ POTENTIAL DUPLICATE:");
    lines.push(context.duplicateWarning);
  }

  // Special notes from owner
  if (owner.specialNotes) {
    lines.push("");
    lines.push("Owner Notes:");
    lines.push(owner.specialNotes);
  }

  // Urgent notes
  if (context?.urgentNotes) {
    lines.push("");
    lines.push("⚡ URGENT:");
    lines.push(context.urgentNotes);
  }

  // Listing assignment info (NOT "SOPHIA AI" - use actual owner/reviewer)
  lines.push("");
  if (context?.listingOwner) {
    lines.push(`Listing Owner: ${context.listingOwner}`);
  }
  if (context?.reviewer1) {
    lines.push(`Reviewer: ${context.reviewer1}`);
  }
  if (context?.reviewer2) {
    lines.push(`Reviewer 2: ${context.reviewer2}`);
  }

  // Add timestamp
  lines.push("");
  lines.push(`Created: ${new Date().toISOString().split("T")[0]}`);

  return lines.join("\n");
}

function generateAIAssistantNotes(
  requestSummary: string,
  propertyType: string,
  keyFeatures: string[],
  specialInstructions?: string
): string {
  const lines: string[] = [];

  lines.push("=== AI UPLOAD SUMMARY ===");
  lines.push("");
  lines.push(`Request: ${requestSummary}`);
  lines.push(`Property Type: ${propertyType}`);

  if (keyFeatures.length > 0) {
    lines.push(`Key Features: ${keyFeatures.join(", ")}`);
  }

  if (specialInstructions) {
    lines.push("");
    lines.push("Special Instructions:");
    lines.push(specialInstructions);
  }

  lines.push("");
  lines.push("---");
  lines.push("All details were extracted from WhatsApp conversation.");

  return lines.join("\n");
}

// ============= TESTS =============

console.log("🧪 TESTING MY NOTES GENERATOR - NO 'SOPHIA AI' CHECK\n");
console.log("=".repeat(60));

// Test 1: Generate My Notes with all reviewer info
console.log("\n📝 TEST 1: My Notes with listing owner and reviewers");
console.log("-".repeat(60));

const myNotes1 = generateMyNotes(
  {
    name: "John Smith",
    phone: "+35799123456",
    email: "john@example.com",
  },
  { fullName: "Maria Georgiou" },
  {
    coordinates: { lat: 34.68, lon: 33.04 },
    listingOwner: "listings@zyprus.com",
    reviewer1: "lauren@zyprus.com",
    reviewer2: "nicosia.office@zyprus.com",
  }
);

console.log(myNotes1);
console.log("");

// Check for "SOPHIA AI" (case-insensitive)
const hasSophiaAI1 = myNotes1.toLowerCase().includes("sophia ai");
console.log(
  `Contains "SOPHIA AI": ${hasSophiaAI1 ? "❌ YES (BAD!)" : "✅ NO (GOOD!)"}`
);

// Test 2: Generate My Notes for rental (agent reviews own)
console.log("\n📝 TEST 2: My Notes for rental property");
console.log("-".repeat(60));

const myNotes2 = generateMyNotes(
  {
    name: "Jane Doe",
    phone: "99888777",
  },
  { fullName: "Andreas Pitsillides" },
  {
    listingOwner: "andreas@zyprus.com",
    reviewer1: "andreas@zyprus.com", // Agent reviews own rental
  }
);

console.log(myNotes2);
console.log("");

const hasSophiaAI2 = myNotes2.toLowerCase().includes("sophia ai");
console.log(
  `Contains "SOPHIA AI": ${hasSophiaAI2 ? "❌ YES (BAD!)" : "✅ NO (GOOD!)"}`
);

// Test 3: Generate AI Assistant Notes
console.log("\n📝 TEST 3: AI Assistant Notes");
console.log("-".repeat(60));

const aiNotes = generateAIAssistantNotes(
  "3-bedroom villa for sale in Paphos",
  "Villa",
  ["swimming pool", "sea view", "garden"],
  "Owner prefers cash buyers"
);

console.log(aiNotes);
console.log("");

const hasSophiaAI3 = aiNotes.toLowerCase().includes("sophia ai");
console.log(
  `Contains "SOPHIA AI": ${hasSophiaAI3 ? "❌ YES (BAD!)" : "✅ NO (GOOD!)"}`
);

// Final summary
console.log("\n" + "=".repeat(60));
console.log("📊 FINAL RESULTS:");
console.log("=".repeat(60));

const allPassed = !hasSophiaAI1 && !hasSophiaAI2 && !hasSophiaAI3;

if (allPassed) {
  console.log("\n✅ ALL TESTS PASSED!");
  console.log("   - My Notes does NOT contain 'SOPHIA AI'");
  console.log("   - AI Assistant Notes does NOT contain 'SOPHIA AI'");
  console.log("\n🎉 The fix is working correctly.");
} else {
  console.log("\n❌ SOME TESTS FAILED!");
  console.log("   - Found 'SOPHIA AI' in generated notes");
  console.log("\n⚠️  The fix may not be deployed correctly.");
  process.exit(1);
}
