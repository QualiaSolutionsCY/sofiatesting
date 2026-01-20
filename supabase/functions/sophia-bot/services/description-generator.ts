/**
 * Property Description Generator
 * Creates professional marketing descriptions for listings
 */

export interface PropertyDetails {
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
  condition?: string;
  orientation?: string;
  parking?: string;
  storage?: boolean;
  airConditioning?: boolean;
  centralHeating?: boolean;
  pool?: boolean;
  garden?: boolean;
  seaView?: boolean;
  mountainView?: boolean;
}

// Location descriptions for common Cyprus areas
const LOCATION_DESCRIPTIONS: Record<string, string> = {
  // Paphos
  tala: "Tala is a picturesque hillside village offering stunning views and a peaceful lifestyle, just minutes from Paphos and the Mediterranean coast.",
  peyia: "Peyia is a popular hillside town known for its pleasant climate, beautiful sunsets, and proximity to the famous Coral Bay beaches.",
  "coral bay": "Coral Bay is one of Cyprus's most sought-after beach destinations, offering crystal-clear waters and a vibrant atmosphere.",
  chloraka: "Chloraka is a charming coastal suburb of Paphos, offering easy access to beaches, amenities, and the historic harbor area.",
  "kato paphos": "Kato Paphos is the cosmopolitan heart of the region, home to the famous archaeological park, harbor, and excellent restaurants.",
  universal: "Universal is a prestigious area of Paphos known for its quality developments and convenient location near the town center.",
  yeroskipou: "Yeroskipou is a family-friendly area known for its traditional character, excellent schools, and proximity to Paphos town.",

  // Limassol
  limassol: "Limassol is Cyprus's vibrant second city, combining business energy with beachfront living and a rich cultural scene.",
  "potamos germasogeia": "Potamos Germasogeia is a prime tourist area known for its beautiful beach, hotels, and proximity to amenities.",
  "agios tychonas": "Agios Tychonas is an upscale coastal area offering luxury properties with stunning sea views and exclusive amenities.",
  "mesa geitonia": "Mesa Geitonia is a well-established residential area offering excellent schools, shops, and a strong community feel.",

  // Larnaca
  larnaca: "Larnaca combines rich history with modern convenience, featuring a beautiful seafront promenade and excellent connectivity.",
  oroklini: "Oroklini is a peaceful residential area known for its nature reserve, beach, and family-friendly environment.",
  pervolia: "Pervolia is a charming coastal village offering a relaxed lifestyle near Larnaca airport and beautiful beaches.",

  // Famagusta
  paralimni: "Paralimni is a thriving town in the Famagusta district, serving as a hub for the popular resort areas of Protaras and Ayia Napa.",
  "ayia napa": "Ayia Napa is world-famous for its stunning beaches, vibrant nightlife, and excellent tourist facilities.",
  protaras: "Protaras is a family-friendly resort area known for its golden beaches, clear waters, and peaceful atmosphere.",
};

// Opening adjectives for variety
const ADJECTIVES = [
  "Stunning",
  "Beautiful",
  "Spacious",
  "Modern",
  "Elegant",
  "Charming",
  "Impressive",
  "Exceptional",
  "Superb",
  "Attractive",
];

/**
 * Get a random adjective for the opening line
 */
function getRandomAdjective(): string {
  return ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
}

/**
 * Capitalize first letter
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Capitalize location name properly (handles multi-word names)
 * Examples: "paphos" -> "Paphos", "potamos germasogeia" -> "Potamos Germasogeia"
 */
function capitalizeLocation(location: string): string {
  return location
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Format feature names with proper capitalization
 * Handles abbreviations: A/C, BBQ, etc.
 */
function formatFeature(feature: string): string {
  // Common abbreviations that should be uppercase
  const abbreviations: Record<string, string> = {
    "a/c": "A/C",
    "ac": "A/C",
    "bbq": "BBQ",
    "tv": "TV",
    "dvd": "DVD",
    "wifi": "WiFi",
    "wi-fi": "WiFi",
    "jacuzzi": "Jacuzzi",
    "en-suite": "En-Suite",
    "ensuite": "En-Suite",
  };

  const lower = feature.toLowerCase().trim();

  // Check if entire feature is an abbreviation
  if (abbreviations[lower]) {
    return abbreviations[lower];
  }

  // Otherwise capitalize each word, but check for abbreviations within
  return feature
    .split(" ")
    .map(word => {
      const wordLower = word.toLowerCase();
      if (abbreviations[wordLower]) {
        return abbreviations[wordLower];
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Format price in EUR
 */
function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-CY", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

/**
 * Get location description paragraph
 */
function getLocationParagraph(location: string): string {
  const normalizedLocation = location.toLowerCase().trim();

  // Check for exact match
  if (LOCATION_DESCRIPTIONS[normalizedLocation]) {
    return LOCATION_DESCRIPTIONS[normalizedLocation];
  }

  // Check for partial match
  for (const [key, desc] of Object.entries(LOCATION_DESCRIPTIONS)) {
    if (normalizedLocation.includes(key) || key.includes(normalizedLocation)) {
      return desc;
    }
  }

  // Default generic location paragraph
  return `${capitalize(location)} offers an excellent location combining convenience with quality of life, close to local amenities and transport links.`;
}

/**
 * Categorize features into indoor, outdoor, and views
 */
function categorizeFeatures(details: PropertyDetails): {
  indoor: string[];
  outdoor: string[];
  views: string[];
} {
  const indoor: string[] = [];
  const outdoor: string[] = [];
  const views: string[] = [];

  // Boolean features - categorized
  if (details.airConditioning) indoor.push("Air Conditioning");
  if (details.centralHeating) indoor.push("Central Heating");
  if (details.storage) indoor.push("Storage Room");

  if (details.pool) outdoor.push("Private Swimming Pool");
  if (details.garden) outdoor.push("Landscaped Garden");
  if (details.parking) outdoor.push(formatFeature(details.parking + " Parking"));

  if (details.seaView) views.push("Sea View");
  if (details.mountainView) views.push("Mountain View");

  // Categorize custom features
  if (details.features && details.features.length > 0) {
    const outdoorKeywords = [
      "pool", "swimming", "garden", "terrace", "balcony", "veranda",
      "parking", "garage", "carport", "bbq", "patio", "deck", "pergola",
      "outdoor", "solar", "panels", "roof"
    ];
    const viewKeywords = ["view", "sea", "mountain", "city", "panoramic", "unobstructed"];
    const indoorKeywords = [
      "heating", "cooling", "a/c", "ac", "air", "fireplace", "storage",
      "basement", "attic", "laundry", "utility", "pantry", "wine",
      "gym", "sauna", "jacuzzi", "ensuite", "en-suite", "fitted",
      "marble", "parquet", "floor", "ceiling", "double glazing",
      "security", "alarm", "intercom", "elevator", "lift"
    ];

    for (const feature of details.features) {
      const lower = feature.toLowerCase().trim();
      const formatted = formatFeature(feature);

      // Check if already added via boolean flags
      const alreadyAdded = [...indoor, ...outdoor, ...views].some(
        (f) => f.toLowerCase().includes(lower) || lower.includes(f.toLowerCase())
      );
      if (alreadyAdded) continue;

      // Categorize based on keywords
      if (viewKeywords.some((kw) => lower.includes(kw))) {
        views.push(formatted);
      } else if (outdoorKeywords.some((kw) => lower.includes(kw))) {
        outdoor.push(formatted);
      } else if (indoorKeywords.some((kw) => lower.includes(kw))) {
        indoor.push(formatted);
      } else {
        // Default to indoor for uncategorized features
        indoor.push(formatted);
      }
    }
  }

  return { indoor, outdoor, views };
}

/**
 * Format title deed status for display
 */
function formatTitleDeedStatus(status?: string): string {
  switch (status?.toLowerCase()) {
    case "separate":
    case "full":
      return "Separate Title Deeds";
    case "final_approval":
    case "final approval":
      return "Final Approval";
    case "pending":
    case "application":
      return "Title Deed Pending";
    default:
      return "";
  }
}

/**
 * Generate full property description with comprehensive itemized format
 * Creates professional listings matching Zyprus website style
 */
export function generateDescription(details: PropertyDetails): string {
  const adjective = getRandomAdjective();
  const propertyType = capitalize(details.type);
  const location = capitalizeLocation(details.location);
  const listingTypeText = details.listingType === "rent" ? "For Rent" : "For Sale";

  const sections: string[] = [];

  // 1. Opening headline
  const bedroomText = details.bedrooms === 1 ? "1 Bedroom" : `${details.bedrooms} Bedroom`;
  let headline = `${adjective} ${bedroomText} ${propertyType} ${listingTypeText} in ${location}`;
  if (details.titleDeedStatus && details.listingType === "sale") {
    const titleDeedFormatted = formatTitleDeedStatus(details.titleDeedStatus);
    if (titleDeedFormatted) {
      headline += ` with ${titleDeedFormatted}`;
    }
  }
  sections.push(headline);

  // 2. Location paragraph
  const locationDesc = getLocationParagraph(details.location);
  sections.push(locationDesc);

  // 3. KEY FEATURES section - itemized list
  const keyFeatures: string[] = [];

  // Core property details
  keyFeatures.push(`${details.bedrooms} ${details.bedrooms === 1 ? "Bedroom" : "Bedrooms"}`);
  keyFeatures.push(`${details.bathrooms} ${details.bathrooms === 1 ? "Bathroom" : "Bathrooms"}`);
  keyFeatures.push(`${details.coveredArea}m² Covered Area`);
  if (details.plotSize) {
    keyFeatures.push(`${details.plotSize}m² Plot Size`);
  }
  if (details.yearBuilt) {
    keyFeatures.push(`Built in ${details.yearBuilt}`);
  }
  if (details.floor) {
    keyFeatures.push(`${capitalize(details.floor)} Floor`);
  }
  if (details.condition) {
    keyFeatures.push(`${capitalize(details.condition)} Condition`);
  }
  if (details.titleDeedStatus && details.listingType === "sale") {
    const titleDeedFormatted = formatTitleDeedStatus(details.titleDeedStatus);
    if (titleDeedFormatted) {
      keyFeatures.push(titleDeedFormatted);
    }
  }

  // Add key features section
  sections.push("KEY FEATURES:\n" + keyFeatures.map((f) => `• ${f}`).join("\n"));

  // 4. Categorized features
  const { indoor, outdoor, views } = categorizeFeatures(details);

  // Indoor Features section
  if (indoor.length > 0) {
    sections.push("INDOOR FEATURES:\n" + indoor.map((f) => `• ${f}`).join("\n"));
  }

  // Outdoor Features section
  if (outdoor.length > 0) {
    sections.push("OUTDOOR FEATURES:\n" + outdoor.map((f) => `• ${f}`).join("\n"));
  }

  // Property Views section
  if (views.length > 0) {
    sections.push("PROPERTY VIEWS:\n" + views.map((f) => `• ${f}`).join("\n"));
  }

  // 5. Investment/closing statement
  const priceFormatted = formatPrice(details.price);
  let closing = `This ${propertyType.toLowerCase()} represents an excellent ${details.listingType === "rent" ? "rental" : "investment"} opportunity in ${location}.`;

  // 6. Call to action
  closing += `\n\nOffered at ${priceFormatted}. Contact us today to arrange a viewing.`;
  sections.push(closing);

  return sections.join("\n\n");
}

/**
 * Generate a short summary for the listing title
 */
export function generateTitle(details: PropertyDetails): string {
  const bedroomText =
    details.bedrooms === 0
      ? "Studio"
      : details.bedrooms === 1
        ? "1 Bed"
        : `${details.bedrooms} Bed`;
  const propertyType = capitalize(details.type);
  const location = capitalizeLocation(details.location);

  return `${bedroomText} ${propertyType} in ${location}`;
}

