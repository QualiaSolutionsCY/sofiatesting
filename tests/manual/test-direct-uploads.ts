/**
 * Direct Zyprus API Upload Test
 *
 * Bypasses SOPHIA webhook and uploads directly to Zyprus API
 * to test the new description format
 */
import { config } from "dotenv";

config({ path: ".env.local" });

// Get credentials from environment or hardcode for testing
const ZYPRUS_API_URL = process.env.ZYPRUS_API_URL || "https://dev9.zyprus.com";
const ZYPRUS_CLIENT_ID = process.env.ZYPRUS_CLIENT_ID;
const ZYPRUS_CLIENT_SECRET = process.env.ZYPRUS_CLIENT_SECRET;

// UUIDs from taxonomy cache
const SOPHIA_AI_UUID = "7026c7a3-1ef0-419f-9957-15a8c161b614";
const MICHELLE_UUID = "dc2688d2-0ea1-4c13-b03d-3309ee8de6a4";
const LAUREN_UUID = "0caa9a75-362a-4156-b11b-b52839243b74";

// Location UUIDs
const LOCATIONS = {
  tala: "c3f5e7a1-8b2d-4f9e-a6c1-2d3e4f5a6b7c", // Will use fallback
  limassol: "7dbc931e-90eb-4b89-9ac8-b5e593831cf8",
  larnaca: "7dbc931e-90eb-4b89-9ac8-b5e593831cf8",
};

// Property type UUIDs
const PROPERTY_TYPES = {
  villa: "76b4fa8e-de7e-4232-85ac-869dca3620f4",
  apartment: "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44",
  townhouse: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", // Will use fallback
};

const FOR_SALE_ID = "8f187816-a888-4cda-a937-1cee84b9c0ee";
const TITLE_DEED_SEPARATE = "5c553db1-e53d-46a2-b609-093d17e75a7a";
const TITLE_DEED_FINAL = "a2b3c4d5-e6f7-8901-bcde-f23456789012";
const PRICE_MODIFIER_ID = "ab39af2d-c8f5-4971-9fa5-2df6822ab9a9";

// Test properties with full details
const TEST_PROPERTIES = [
  {
    name: "Luxury Villa in Tala",
    title: "4 Bed Detached Villa in Tala",
    type: "detached villa",
    bedrooms: 4,
    bathrooms: 3,
    coveredArea: 280,
    plotSize: 1200,
    price: 695_000,
    location: "Tala",
    yearBuilt: 2019,
    titleDeedStatus: "separate",
    features: [
      "private infinity pool",
      "sea view",
      "mountain view",
      "central heating",
      "air conditioning",
      "double garage",
      "landscaped garden",
      "solar panels",
      "outdoor kitchen",
      "wine cellar",
      "home cinema",
      "smart home system",
    ],
    ownerName: "Andreas Christodoulou",
    ownerPhone: "+357 99 111222",
    ownerEmail: "andreas.ch@example.com",
    notes: "Motivated seller, relocating abroad. Price negotiable.",
    propertyTypeId: PROPERTY_TYPES.villa,
    titleDeedId: TITLE_DEED_SEPARATE,
  },
  {
    name: "Modern Apartment in Limassol",
    title: "2 Bed Apartment in Potamos Germasogeia",
    type: "apartment",
    bedrooms: 2,
    bathrooms: 1,
    coveredArea: 95,
    plotSize: undefined,
    price: 320_000,
    location: "Potamos Germasogeia",
    yearBuilt: 2021,
    floor: "3rd",
    titleDeedStatus: "final approval",
    features: [
      "sea view",
      "communal pool",
      "air conditioning",
      "covered parking",
      "storage room",
      "gym access",
      "double glazing",
      "security system",
      "intercom",
    ],
    ownerName: "Maria Konstantinou",
    ownerPhone: "+357 96 333444",
    ownerEmail: "maria.k@example.com",
    notes: "Tenant in place paying €1,200/month. Good investment.",
    propertyTypeId: PROPERTY_TYPES.apartment,
    titleDeedId: TITLE_DEED_FINAL,
  },
  {
    name: "Townhouse in Larnaca",
    title: "3 Bed Townhouse in Oroklini",
    type: "townhouse",
    bedrooms: 3,
    bathrooms: 2,
    coveredArea: 140,
    plotSize: 180,
    price: 245_000,
    location: "Oroklini",
    yearBuilt: 2015,
    titleDeedStatus: "separate",
    features: [
      "roof terrace",
      "sea view",
      "central heating",
      "air conditioning",
      "private garden",
      "covered parking",
      "storage",
      "bbq area",
      "fly screens",
    ],
    ownerName: "Yiannis Papadopoulos",
    ownerPhone: "+357 97 555666",
    ownerEmail: "yiannis.p@example.com",
    notes: "Close to beach and airport. Great holiday home potential.",
    propertyTypeId: PROPERTY_TYPES.apartment, // Using apartment as fallback
    titleDeedId: TITLE_DEED_SEPARATE,
  },
];

// Description generator (matching the deployed version)
function generateDescription(details: {
  type: string;
  listingType: "sale" | "rent";
  bedrooms: number;
  bathrooms: number;
  location: string;
  titleDeedStatus?: string;
  coveredArea: number;
  plotSize?: number;
  floor?: string;
  features?: string[];
  price: number;
  yearBuilt?: number;
}): string {
  const ADJECTIVES = [
    "Stunning",
    "Beautiful",
    "Spacious",
    "Modern",
    "Elegant",
    "Charming",
    "Impressive",
    "Exceptional",
  ];
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];

  const capitalize = (s: string) =>
    s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  const capitalizeLocation = (loc: string) =>
    loc
      .split(" ")
      .map((w) => capitalize(w))
      .join(" ");

  const LOCATION_DESCRIPTIONS: Record<string, string> = {
    tala: "Tala is a picturesque hillside village offering stunning views and a peaceful lifestyle, just minutes from Paphos and the Mediterranean coast.",
    "potamos germasogeia":
      "Potamos Germasogeia is a prime tourist area known for its beautiful beach, hotels, and proximity to amenities.",
    oroklini:
      "Oroklini is a peaceful residential area known for its nature reserve, beach, and family-friendly environment.",
  };

  const getLocationDesc = (loc: string) => {
    const normalized = loc.toLowerCase().trim();
    for (const [key, desc] of Object.entries(LOCATION_DESCRIPTIONS)) {
      if (normalized.includes(key) || key.includes(normalized)) return desc;
    }
    return `${capitalize(loc)} offers an excellent location combining convenience with quality of life.`;
  };

  const formatTitleDeed = (status?: string) => {
    switch (status?.toLowerCase()) {
      case "separate":
      case "full":
        return "Separate Title Deeds";
      case "final_approval":
      case "final approval":
        return "Final Approval";
      default:
        return "";
    }
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-CY", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);

  // Categorize features
  const indoor: string[] = [];
  const outdoor: string[] = [];
  const views: string[] = [];

  const outdoorKeywords = [
    "pool",
    "swimming",
    "garden",
    "terrace",
    "balcony",
    "parking",
    "garage",
    "bbq",
    "patio",
    "outdoor",
    "solar",
    "roof",
  ];
  const viewKeywords = ["view", "sea", "mountain", "city", "panoramic"];
  const indoorKeywords = [
    "heating",
    "cooling",
    "a/c",
    "ac",
    "air",
    "storage",
    "gym",
    "cinema",
    "wine",
    "smart",
    "security",
    "intercom",
    "glazing",
  ];

  if (details.features) {
    for (const feature of details.features) {
      const lower = feature.toLowerCase();
      const formatted = feature
        .split(" ")
        .map((w) => capitalize(w))
        .join(" ");

      if (viewKeywords.some((kw) => lower.includes(kw))) {
        views.push(formatted);
      } else if (outdoorKeywords.some((kw) => lower.includes(kw))) {
        outdoor.push(formatted);
      } else if (indoorKeywords.some((kw) => lower.includes(kw))) {
        indoor.push(formatted);
      } else {
        indoor.push(formatted);
      }
    }
  }

  const sections: string[] = [];
  const propertyType = capitalize(details.type);
  const location = capitalizeLocation(details.location);
  const listingTypeText =
    details.listingType === "rent" ? "For Rent" : "For Sale";
  const bedroomText =
    details.bedrooms === 1 ? "1 Bedroom" : `${details.bedrooms} Bedroom`;

  // 1. Headline
  let headline = `${adjective} ${bedroomText} ${propertyType} ${listingTypeText} in ${location}`;
  const titleDeedFormatted = formatTitleDeed(details.titleDeedStatus);
  if (titleDeedFormatted && details.listingType === "sale") {
    headline += ` with ${titleDeedFormatted}`;
  }
  sections.push(headline);

  // 2. Location paragraph
  sections.push(getLocationDesc(details.location));

  // 3. KEY FEATURES
  const keyFeatures: string[] = [];
  keyFeatures.push(
    `${details.bedrooms} ${details.bedrooms === 1 ? "Bedroom" : "Bedrooms"}`
  );
  keyFeatures.push(
    `${details.bathrooms} ${details.bathrooms === 1 ? "Bathroom" : "Bathrooms"}`
  );
  keyFeatures.push(`${details.coveredArea}m² Covered Area`);
  if (details.plotSize) keyFeatures.push(`${details.plotSize}m² Plot Size`);
  if (details.yearBuilt) keyFeatures.push(`Built in ${details.yearBuilt}`);
  if (details.floor) keyFeatures.push(`${capitalize(details.floor)} Floor`);
  if (titleDeedFormatted) keyFeatures.push(titleDeedFormatted);

  sections.push(
    "KEY FEATURES:\n" + keyFeatures.map((f) => `• ${f}`).join("\n")
  );

  // 4. INDOOR FEATURES
  if (indoor.length > 0) {
    sections.push(
      "INDOOR FEATURES:\n" + indoor.map((f) => `• ${f}`).join("\n")
    );
  }

  // 5. OUTDOOR FEATURES
  if (outdoor.length > 0) {
    sections.push(
      "OUTDOOR FEATURES:\n" + outdoor.map((f) => `• ${f}`).join("\n")
    );
  }

  // 6. PROPERTY VIEWS
  if (views.length > 0) {
    sections.push("PROPERTY VIEWS:\n" + views.map((f) => `• ${f}`).join("\n"));
  }

  // 7. Closing
  const priceFormatted = formatPrice(details.price);
  let closing = `This ${propertyType.toLowerCase()} represents an excellent investment opportunity in ${location}.`;
  closing += `\n\nOffered at ${priceFormatted}. Contact us today to arrange a viewing.`;
  sections.push(closing);

  return sections.join("\n\n");
}

async function getAccessToken(): Promise<string> {
  if (!ZYPRUS_CLIENT_ID || !ZYPRUS_CLIENT_SECRET) {
    throw new Error(
      "Missing ZYPRUS_CLIENT_ID or ZYPRUS_CLIENT_SECRET in environment"
    );
  }

  const response = await fetch(`${ZYPRUS_API_URL}/oauth/token`, {
    method: "POST",
    headers: {
      "User-Agent": "SophiaAI",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: ZYPRUS_CLIENT_ID,
      client_secret: ZYPRUS_CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function uploadImage(
  token: string,
  imageUrl: string
): Promise<string | null> {
  try {
    console.log(`   Fetching image: ${imageUrl.substring(0, 50)}...`);
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) return null;

    const blob = await imgResponse.blob();
    const filename = `sophia-test-${Date.now()}.jpg`;

    const uploadResponse = await fetch(
      `${ZYPRUS_API_URL}/jsonapi/node/property/field_gallery_`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "SophiaAI",
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `file; filename="${filename}"`,
        },
        body: blob,
      }
    );

    if (!uploadResponse.ok) {
      console.log(`   ⚠️ Image upload failed: ${uploadResponse.status}`);
      return null;
    }

    const imgData = await uploadResponse.json();
    return imgData.data.id;
  } catch (error) {
    console.log(`   ⚠️ Image error: ${error}`);
    return null;
  }
}

async function createListing(
  token: string,
  property: (typeof TEST_PROPERTIES)[0]
): Promise<void> {
  console.log(`\n📤 Creating: ${property.name}`);

  // Generate description using new format
  const description = generateDescription({
    type: property.type,
    listingType: "sale",
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    location: property.location,
    titleDeedStatus: property.titleDeedStatus,
    coveredArea: property.coveredArea,
    plotSize: property.plotSize,
    features: property.features,
    price: property.price,
    yearBuilt: property.yearBuilt,
    floor: (property as any).floor,
  });

  console.log("\n   📝 Generated Description Preview:");
  console.log(
    "   " + description.split("\n").slice(0, 8).join("\n   ") + "..."
  );

  // Upload one test image
  const imageId = await uploadImage(
    token,
    "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800"
  );

  // Generate reference ID
  const now = new Date();
  const draftRefId = `SOPHIA-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${now.toISOString().slice(11, 19).replace(/:/g, "")}-${property.type.substring(0, 3).toUpperCase()}`;

  // Build payload
  const payload = {
    data: {
      type: "node--property",
      attributes: {
        status: false,
        title: property.title,
        body: { value: description, format: "plain_text" },
        field_ai_state: "draft",
        field_ai_generated: true,
        field_negotiable: true,
        field_price: property.price,
        field_no_bedrooms: property.bedrooms,
        field_no_bathrooms: property.bathrooms,
        field_covered_area: property.coveredArea,
        field_land_size: property.plotSize || null,
        field_year_built: property.yearBuilt || null,
        field_ai_draft_own_reference_id: draftRefId,
        field_my_notes: `Owner: ${property.ownerName}\nTel: ${property.ownerPhone}\nEmail: ${property.ownerEmail}\n\nOwner Notes:\n${property.notes}\n\nCreated via SOPHIA AI Test: ${now.toISOString().split("T")[0]}`,
        field_ai_assistant_notes: `=== AI UPLOAD SUMMARY ===\n\nProperty Type: ${property.type}\nKey Features: ${property.features.slice(0, 5).join(", ")}\n\n---\nThis listing was created by SOPHIA AI test script.`,
      },
      relationships: {
        field_location: {
          data: { type: "node--location", id: LOCATIONS.limassol },
        },
        field_property_type: {
          data: {
            type: "taxonomy_term--property_type",
            id: property.propertyTypeId,
          },
        },
        field_listing_type: {
          data: { type: "taxonomy_term--listing_type", id: FOR_SALE_ID },
        },
        field_title_deed: {
          data: { type: "taxonomy_term--title_deed", id: property.titleDeedId },
        },
        field_price_modifier: {
          data: {
            type: "taxonomy_term--price_modifier",
            id: PRICE_MODIFIER_ID,
          },
        },
        field_ai_listing_instructor: {
          data: { type: "user--user", id: SOPHIA_AI_UUID },
        },
        field_ai_listing_reviewer: {
          data: [{ type: "user--user", id: LAUREN_UUID }],
        },
        field_listing_owner: {
          data: { type: "user--user", id: MICHELLE_UUID },
        },
        ...(imageId
          ? { field_gallery_: { data: [{ type: "file--file", id: imageId }] } }
          : {}),
      },
    },
  };

  console.log("\n   Sending to Zyprus API...");

  const response = await fetch(`${ZYPRUS_API_URL}/jsonapi/node/property`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "SophiaAI",
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    console.log(`   ❌ Failed: ${response.status}`);
    try {
      const errorJson = JSON.parse(error);
      if (errorJson.errors) {
        for (const err of errorJson.errors) {
          console.log(`      - ${err.title}: ${err.detail}`);
        }
      }
    } catch {
      console.log(`      ${error.substring(0, 200)}`);
    }
    return;
  }

  const result = await response.json();
  console.log("   ✅ SUCCESS!");
  console.log(`      Node ID: ${result.data.id}`);
  console.log(`      Title: ${result.data.attributes.title}`);
  console.log(`      Reference: ${draftRefId}`);
}

async function main() {
  console.log("=".repeat(60));
  console.log("DIRECT ZYPRUS API UPLOAD TEST");
  console.log("Testing New Description Format");
  console.log("=".repeat(60));

  if (!ZYPRUS_CLIENT_ID || !ZYPRUS_CLIENT_SECRET) {
    console.log("\n❌ Missing Zyprus credentials!");
    console.log(
      "   Set ZYPRUS_CLIENT_ID and ZYPRUS_CLIENT_SECRET in .env.local"
    );
    console.log("\n   Or add them to Supabase secrets and test via webhook.");
    return;
  }

  try {
    console.log("\n🔑 Getting access token...");
    const token = await getAccessToken();
    console.log("   ✅ Token obtained");

    for (const property of TEST_PROPERTIES) {
      await createListing(token, property);
      // Small delay between uploads
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log("\n" + "=".repeat(60));
    console.log("ALL UPLOADS COMPLETE");
    console.log("=".repeat(60));
    console.log("\n📋 Check the draft dashboard:");
    console.log("   https://dev9.zyprus.com/draft-dashboard?ai_state=draft");
  } catch (error) {
    console.error("\n❌ Error:", error);
  }
}

main().catch(console.error);
