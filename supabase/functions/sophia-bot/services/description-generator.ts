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
  /** User-provided area/neighborhood description - takes priority over generic location text */
  areaDescription?: string;
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
      "pool", "swimming", "garden", "landscaped", "terrace", "balcony", "veranda",
      "parking", "garage", "carport", "bbq", "patio", "deck", "pergola",
      "outdoor", "solar", "panels", "roof"
    ];
    const viewKeywords = ["view", "sea", "mountain", "city", "panoramic", "unobstructed"];
    const indoorKeywords = [
      "heating", "cooling", "a/c", "ac", "air", "fireplace", "storage", "storeroom",
      "basement", "attic", "laundry", "utility", "pantry", "wine",
      "gym", "sauna", "jacuzzi", "ensuite", "en-suite", "fitted",
      "marble", "parquet", "floor", "ceiling", "double glazing",
      "security", "alarm", "intercom", "elevator", "lift",
      "furnished", "unfurnished", "appliances", "electrical", "white goods",
      "guest toilet", "guest wc", "wc", "video", "entry system", "door entry", "entry phone",
      "water heater", "boiler", "hot water", "pressurised", "pressurized",
      "open plan", "open-plan", "master bed", "master bedroom",
      "part furnished", "partially", "semi furnished",
      "electric shutters", "shutters", "blinds"
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
      return "Title Deeds";
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
 * Features that should always appear at the BOTTOM of the features list
 * These are lower-priority outdoor/lifestyle features
 */
const BOTTOM_FEATURES = [
  "bbq area",
  "bbq",
  "outdoor shower",
  "gated property",
  "gated community",
  "landscaped garden",
  "landscaped"
];

/**
 * Check if a feature should appear at the bottom of the list
 */
function isBottomFeature(feature: string): boolean {
  const lower = feature.toLowerCase();
  return BOTTOM_FEATURES.some(bf => lower.includes(bf));
}

/**
 * Sort features by importance - premium features first
 */
function sortFeaturesByImportance(features: string[]): string[] {
  // Priority order - higher index = higher priority (will appear first)
  const priorityKeywords = [
    // Highest priority - pools
    "swimming pool",
    "covered pool",
    "pool",
    // Views
    "sea view",
    "mountain view",
    "panoramic",
    "unobstructed",
    // Outdoor premium
    "garden",
    "landscaped",
    "bbq",
    "terrace",
    "veranda",
    "balcony",
    // Parking
    "garage",
    "covered parking",
    "parking",
    // Indoor premium
    "jacuzzi",
    "sauna",
    "fireplace",
    "wine cellar",
    // Standard features (lower priority)
    "a/c",
    "air conditioning",
    "central heating",
    "storage",
    "storeroom",
    "fitted",
  ];

  return features.sort((a, b) => {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();

    // Find priority index (earlier in list = higher priority = should come first)
    let aPriority = priorityKeywords.length;
    let bPriority = priorityKeywords.length;

    for (let i = 0; i < priorityKeywords.length; i++) {
      if (aLower.includes(priorityKeywords[i]) && aPriority === priorityKeywords.length) {
        aPriority = i;
      }
      if (bLower.includes(priorityKeywords[i]) && bPriority === priorityKeywords.length) {
        bPriority = i;
      }
    }

    return aPriority - bPriority;
  });
}

/**
 * Generate full property description
 * Format: Headline → 2-4 location sentences → Features (each line) → Closing sentences → CTA
 * NO title deeds, NO prices, NO section titles
 */
export function generateDescription(details: PropertyDetails): string {
  const adjective = getRandomAdjective();
  const propertyType = capitalize(details.type);
  const location = capitalizeLocation(details.location);
  const bedroomText = details.bedrooms === 1 ? "1 Bedroom" : `${details.bedrooms} Bedroom`;
  const listingTypeText = details.listingType === "rent" ? "For Rent" : "For Sale";

  const lines: string[] = [];

  // 1. HEADLINE (with title deeds if available)
  let headline = `${adjective} ${bedroomText} ${propertyType} ${listingTypeText} in ${location}`;
  if (details.titleDeedStatus && details.listingType === "sale") {
    const titleDeedFormatted = formatTitleDeedStatus(details.titleDeedStatus);
    if (titleDeedFormatted) {
      headline += ` with ${titleDeedFormatted}`;
    }
  }
  lines.push(headline);

  // 2. LOCATION SENTENCES (2-4 short sentences)
  // Use user-provided areaDescription if available, otherwise fall back to generic
  const locationSentences = getLocationSentences(details.location, details.areaDescription);
  for (const sentence of locationSentences) {
    lines.push(sentence);
  }

  // 3. Get and sort features by importance
  const { indoor, outdoor, views } = categorizeFeatures(details);
  const allFeatures = [...indoor, ...outdoor, ...views];
  const sortedFeatures = sortFeaturesByImportance(allFeatures);

  // 4. TOP PREMIUM FEATURES (before bedrooms/bathrooms)
  // HARDCODED: Only these specific features appear above bedrooms:
  // - Cul-de-sac
  // - Swimming Pool (any pool type)
  // - Roof Garden (NOT standard/landscape garden)
  // - Any View (sea view, mountain view, city view, green area view, etc.)
  const topFeatures: string[] = [];
  const remainingFeatures: string[] = [];

  for (const feature of sortedFeatures) {
    const featureLower = feature.toLowerCase();
    const isTopFeature =
      featureLower.includes("cul-de-sac") ||
      featureLower.includes("cul de sac") ||
      featureLower.includes("swimming pool") ||
      featureLower.includes("private pool") ||
      featureLower.includes("roof garden") ||
      featureLower.includes("view"); // Catches: sea view, mountain view, city view, green area view, etc.

    if (isTopFeature) {
      topFeatures.push(feature);
    } else {
      remainingFeatures.push(feature);
    }
  }

  // Add top features first
  for (const feature of topFeatures) {
    lines.push(feature);
  }

  // 5. BASIC SPECS (bedrooms, bathrooms, area)
  lines.push(`${details.bedrooms} ${details.bedrooms === 1 ? "Bedroom" : "Bedrooms"}`);
  lines.push(`${details.bathrooms} ${details.bathrooms === 1 ? "Bathroom" : "Bathrooms"}`);
  lines.push(`${details.coveredArea}m² Covered Area`);
  if (details.plotSize) {
    lines.push(`${details.plotSize}m² Plot Size`);
  }

  // 6. REMAINING FEATURES (excluding bottom-priority features)
  const regularFeatures = remainingFeatures.filter(f => !isBottomFeature(f));
  const bottomFeatures = remainingFeatures.filter(f => isBottomFeature(f));

  for (const feature of regularFeatures) {
    lines.push(feature);
  }

  // Condition (if specified)
  if (details.condition) {
    lines.push(`${capitalize(details.condition)} Condition`);
  }

  // 7. BOTTOM-PRIORITY FEATURES (BBQ, Outdoor Shower, Gated Property, Landscaped Garden)
  for (const feature of bottomFeatures) {
    lines.push(feature);
  }

  // 8. YEAR BUILT - Always the very last feature item
  if (details.yearBuilt) {
    lines.push(`Year of Build: ${details.yearBuilt}`);
  }

  // 9. CLOSING SENTENCES (2 short sentences about the opportunity)
  const closingSentences = getClosingSentences(details);
  for (const sentence of closingSentences) {
    lines.push(sentence);
  }

  // 5. CTA (with empty row before)
  lines.push("");
  lines.push("Contact us for full information and for a private viewing!");

  return lines.join("\n");
}

/**
 * Parse user-provided area description into marketing sentences
 * Converts bullet points, comma-separated items, or paragraphs into clean sentences
 */
function parseUserAreaDescription(areaDescription: string): string[] {
  const sentences: string[] = [];

  // Split by newlines, bullet points, or sentence-ending punctuation
  const parts = areaDescription
    .split(/[\n\r]+|[•\-\*]\s*|(?<=[.!])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10); // Filter out very short fragments

  for (const part of parts) {
    // Skip parts that are just feature lists (handled separately)
    const isFeatureList = /^\d+\s*(bedroom|bathroom|m²|sqm|parking)/i.test(part);
    if (isFeatureList) continue;

    // Skip price mentions
    if (/^\s*€?\d+[,.]?\d*k?\s*$/i.test(part)) continue;

    // Clean up and format as a proper sentence
    let sentence = part
      .replace(/^(located|situated|it provides|in addition|this property)/i, (match) =>
        match.charAt(0).toUpperCase() + match.slice(1).toLowerCase()
      )
      .replace(/[.!]*$/, '') // Remove trailing punctuation
      .trim();

    // Ensure it starts with a capital letter
    if (sentence.length > 0) {
      sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);

      // Add appropriate ending punctuation
      if (!sentence.endsWith('!') && !sentence.endsWith('.')) {
        // Use exclamation for emphasis on good features, period otherwise
        const emphasisKeywords = ['excellent', 'great', 'perfect', 'ideal', 'amazing', 'stunning', 'sought-after', 'prestigious'];
        const hasEmphasis = emphasisKeywords.some(kw => sentence.toLowerCase().includes(kw));
        sentence += hasEmphasis ? '!' : '.';
      }

      sentences.push(sentence);
    }
  }

  // Return 2-4 sentences max
  return sentences.slice(0, 4);
}

/**
 * Get 2-4 short location sentences
 * Uses user-provided areaDescription if available, otherwise falls back to generic
 */
function getLocationSentences(location: string, areaDescription?: string): string[] {
  // PRIORITY: Use user-provided area description if available
  if (areaDescription && areaDescription.trim().length > 20) {
    const userSentences = parseUserAreaDescription(areaDescription);
    if (userSentences.length >= 2) {
      return userSentences;
    }
    // If user provided some but not enough, supplement with generic
    if (userSentences.length === 1) {
      const genericSentences = getGenericLocationSentences(location);
      return [...userSentences, ...genericSentences.slice(0, 2)];
    }
  }

  return getGenericLocationSentences(location);
}

/**
 * Get generic location sentences based on area name
 */
function getGenericLocationSentences(location: string): string[] {
  const normalizedLocation = location.toLowerCase().trim();

  // Location-specific sentences
  const locationData: Record<string, string[]> = {
    tala: [
      "Located in a peaceful and highly sought-after area",
      "It enjoys easy access to local amenities, including a supermarket and village square",
      "Tala is only a 15-20 minute drive from the city center and the seafront!"
    ],
    peyia: [
      "Situated in the popular hillside town of Peyia",
      "Close to local shops, restaurants and the famous Coral Bay beaches",
      "Only a short drive to Paphos town center!"
    ],
    "coral bay": [
      "Located in the sought-after Coral Bay area",
      "Walking distance to the beautiful sandy beach",
      "Close to restaurants, bars and all amenities!"
    ],
    chloraka: [
      "Situated in the coastal suburb of Chloraka",
      "Easy access to beaches and Paphos town center",
      "Close to supermarkets, schools and local amenities!"
    ],
    "kato paphos": [
      "Located in the heart of Kato Paphos",
      "Walking distance to the harbor, restaurants and archaeological sites",
      "Close to all amenities and the beautiful seafront!"
    ],
    universal: [
      "Situated in the prestigious Universal area of Paphos",
      "Close to the Kings Avenue Mall and all amenities",
      "Easy access to the town center and beaches!"
    ],
    yeroskipou: [
      "Located in the family-friendly area of Yeroskipou",
      "Close to excellent schools and local amenities",
      "Short drive to Paphos town and beaches!"
    ],
    limassol: [
      "Located in the vibrant city of Limassol",
      "Close to beaches, restaurants and entertainment",
      "Easy access to the highway and all amenities!"
    ],
    "potamos germasogeia": [
      "Situated in the popular tourist area of Potamos Germasogeia",
      "Walking distance to the beach and promenade",
      "Close to hotels, restaurants and nightlife!"
    ],
    "agios tychonas": [
      "Located in the upscale area of Agios Tychonas",
      "Enjoying stunning sea views and peaceful surroundings",
      "Close to Limassol Marina and all amenities!"
    ],
    "mesa geitonia": [
      "Situated in the established residential area of Mesa Geitonia",
      "Close to excellent schools, shops and parks",
      "Easy access to Limassol town center!"
    ],
    larnaca: [
      "Located in the historic city of Larnaca",
      "Close to the beautiful seafront promenade",
      "Easy access to the airport and all amenities!"
    ],
    oroklini: [
      "Situated in the peaceful area of Oroklini",
      "Close to the beach and nature reserve",
      "Short drive to Larnaca town center!"
    ],
    pervolia: [
      "Located in the charming coastal village of Pervolia",
      "Close to beautiful beaches and the airport",
      "Peaceful surroundings with easy access to Larnaca!"
    ],
    paralimni: [
      "Situated in the thriving town of Paralimni",
      "Close to shops, restaurants and local amenities",
      "Short drive to the beaches of Protaras and Ayia Napa!"
    ],
    "ayia napa": [
      "Located in the famous resort town of Ayia Napa",
      "Close to stunning beaches and vibrant nightlife",
      "Walking distance to restaurants and entertainment!"
    ],
    protaras: [
      "Situated in the family-friendly resort of Protaras",
      "Close to golden sandy beaches and crystal-clear waters",
      "Walking distance to restaurants and shops!"
    ],
    nicosia: [
      "Located in the capital city of Nicosia",
      "Close to business centers, shops and cultural attractions",
      "Easy access to all amenities and services!"
    ],
    strovolos: [
      "Situated in the popular suburb of Strovolos",
      "Close to shopping centers, schools and parks",
      "Easy access to Nicosia city center!"
    ],
  };

  // Check for exact or partial match
  for (const [key, sentences] of Object.entries(locationData)) {
    if (normalizedLocation.includes(key) || key.includes(normalizedLocation)) {
      return sentences;
    }
  }

  // Default generic sentences
  return [
    "Located in a desirable area with excellent amenities nearby",
    "Easy access to shops, restaurants and local services",
    "Convenient location with good transport links!"
  ];
}

/**
 * Get 2 closing sentences about the property opportunity
 */
function getClosingSentences(details: PropertyDetails): string[] {
  const propertyType = details.type.toLowerCase();

  if (details.listingType === "rent") {
    return [
      `This ${propertyType} is an excellent rental opportunity!`,
      "Ideal for families, couples or professionals"
    ];
  }

  // For sale properties
  const sentences: string[] = [];

  if (details.plotSize && details.plotSize >= 500) {
    sentences.push(`This spacious ${propertyType} is a compelling investment opportunity!`);
  } else {
    sentences.push(`This ${propertyType} represents an excellent investment opportunity!`);
  }

  if (propertyType.includes("villa") || propertyType.includes("house") || propertyType.includes("bungalow")) {
    sentences.push("Suitable for a family for permanent living or as a holiday home");
  } else if (propertyType.includes("apartment") || propertyType.includes("flat")) {
    sentences.push("Perfect for permanent residence, holiday use or rental investment");
  } else {
    sentences.push("Ideal for permanent living or as an investment property");
  }

  return sentences;
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

