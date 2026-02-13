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
  /** Covered veranda area in sqm */
  coveredVeranda?: number;
  /** Uncovered veranda area in sqm */
  uncoveredVeranda?: number;
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
  /** Number of bedrooms/rooms in the basement (shown separately, e.g., "5 Bedrooms + 1 Basement Bedroom") */
  basementRooms?: number;
}

// Location descriptions for common Cyprus areas
// Focus on: access to city center, practical living, what the area offers
const LOCATION_DESCRIPTIONS: Record<string, string> = {
  // Paphos - focused on access to Paphos center/amenities
  tala: "Tala offers a peaceful village lifestyle with stunning hillside views, just a 10-15 minute drive to Paphos town center and the coast.",
  peyia: "Peyia provides a relaxed hillside setting with beautiful sunsets, just 5 minutes from the famous Coral Bay beaches and 15 minutes to Paphos.",
  "coral bay": "Coral Bay offers direct beach access with crystal-clear waters, restaurants and amenities right by the sea, 20 minutes from Paphos center.",
  chloraka: "Chloraka provides affordable coastal living with easy access to beaches, supermarkets, and just 10 minutes to Paphos harbor.",
  "kato paphos": "Kato Paphos puts you in the heart of the action - walking distance to the harbor, archaeological park, restaurants, and the seafront promenade.",
  universal: "Universal is a prestigious residential area just 5 minutes from Paphos town center, Kings Avenue Mall, and all major amenities.",
  yeroskipou: "Yeroskipou offers traditional village living with excellent schools, just 10 minutes from Paphos center and 5 minutes to the airport.",
  kissonerga: "Kissonerga provides sea views and village charm, just 10 minutes to Coral Bay beaches and 15 minutes to Paphos center.",
  emba: "Emba is an affordable village just 10 minutes from Paphos town center and the beach, with local shops and traditional tavernas nearby.",
  geroskipou: "Geroskipou is a traditional town between Paphos airport and the city center, offering easy highway access and local amenities.",
  kouklia: "Kouklia offers rural village living near the Sanctuary of Aphrodite, 20 minutes from Paphos center and close to secret valley golf course.",
  timi: "Timi provides quiet village living near the beach, just 10 minutes from Paphos airport and 15 minutes to the town center.",
  mandria: "Mandria offers peaceful village life with a nearby beach, just 10 minutes from the airport and 20 minutes to Paphos.",

  // Limassol - focused on access to Limassol center/amenities
  limassol: "Limassol city center puts you in the heart of the action - walking distance to the marina, old town, restaurants, and the famous Molos promenade.",
  "potamos germasogeia": "Potamos Germasogeia offers beachfront living with direct access to the promenade, just 10 minutes drive to Limassol marina and old town.",
  "agios tychonas": "Agios Tychonas provides upscale coastal living with beach access, just 10 minutes to Limassol marina and the city center.",
  "mesa geitonia": "Mesa Geitonia is a well-established residential area just 5 minutes from Limassol city center, with excellent schools and shops nearby.",
  germasogeia: "Germasogeia offers beach access and a relaxed lifestyle, just 10-15 minutes to Limassol city center and the marina.",
  moutagiaka: "Moutagiaka is an attractive coastal suburb just 10 minutes from Limassol center, with beaches, shops, and easy highway access.",
  mouttagiaka: "Mouttagiaka is an attractive coastal suburb just 10 minutes from Limassol center, with beaches, shops, and easy highway access.",
  "agios athanasios": "Agios Athanasios provides affordable family living with direct highway access, just 10-15 minutes to Limassol city center.",
  zakaki: "Zakaki is a rapidly developing area close to the new casino and marina, just 10 minutes to Limassol city center.",
  parekklisia: "Parekklisia offers village life with mountain views, just 15 minutes to the beach and 20 minutes to Limassol center.",
  pareklisia: "Pareklisia offers village life with mountain views, just 15 minutes to the beach and 20 minutes to Limassol center.",
  erimi: "Erimi is a convenient residential area halfway between Limassol and the airport, just 15 minutes to the city center.",
  episkopi: "Episkopi offers traditional village living in the countryside, 20 minutes to Limassol center and close to Kolossi castle.",
  pyrgos: "Pyrgos is a hillside village with stunning views, 15-20 minutes to Limassol center and 10 minutes to the beach.",
  polemidia: "Polemidia offers affordable living with direct highway access, just 10 minutes to Limassol city center.",
  ypsonas: "Ypsonas provides affordable village living with good amenities, just 15 minutes to Limassol center and easy highway access.",
  "agia zoni": "Agia Zoni is a quiet residential neighborhood just 5 minutes from Limassol city center and close to all amenities.",
  neapoli: "Located within walking distance of Makariou Avenue and many amenities including a leading supermarket. In addition, it is only minutes from the seafront and the city center.",
  neapolis: "Located within walking distance of Makariou Avenue and many amenities including a leading supermarket. In addition, it is only minutes from the seafront and the city center.",
  linopetra: "Linopetra is a peaceful residential area close to the sea, just 5-10 minutes to Limassol city center.",
  "agios ioannis": "Agios Ioannis offers coastal living with sea views, just 10 minutes to Limassol marina and the old town.",
  "agios nikolaos": "Agios Nikolaos is a well-established area just 5 minutes from Limassol center, with easy access to schools and shops.",
  trachoni: "Trachoni offers affordable living with good road access, just 10-15 minutes to Limassol city center.",
  panthea: "Panthea is an upscale hillside area with stunning views, just 5-10 minutes to Limassol city center.",
  "agia fyla": "Agia Fyla provides peaceful residential living with mountain views, just 10-15 minutes to Limassol center.",
  kapsalos: "Kapsalos is a quiet neighborhood just 5 minutes from Limassol city center, with easy access to shops and amenities.",

  // Larnaca - focused on access to Larnaca center/amenities
  larnaca: "Larnaca center puts you walking distance to the famous seafront promenade, Finikoudes beach, restaurants, and the old town.",
  oroklini: "Oroklini is a peaceful village just 10 minutes from Larnaca center, with nearby beaches and easy highway access.",
  voroklini: "Voroklini is a peaceful village just 10 minutes from Larnaca center, with nearby beaches and easy highway access.",
  pervolia: "Pervolia is a coastal village offering relaxed living, 10 minutes to Larnaca airport and 15 minutes to the city center.",
  dhekelia: "Dhekelia is a prime coastal area with direct beach access, just 10 minutes to Larnaca center and 5 minutes to the airport.",
  dekelia: "Dhekelia is a prime coastal area with direct beach access, just 10 minutes to Larnaca center and 5 minutes to the airport.",
  pyla: "Pyla offers village life with a nearby sandy beach, 15 minutes to Larnaca and easy access to the Ayia Napa area.",
  kiti: "Kiti is a coastal village just 10 minutes from Larnaca airport and 15 minutes to the city center, with nearby beaches.",
  tersefanou: "Tersefanou offers peaceful village living with nice views, 15 minutes to Larnaca center and close to the airport.",
  dromolaxia: "Dromolaxia is a developing village just 10 minutes from Larnaca center with easy highway access.",
  meneou: "Meneou is a quiet village close to the coast, 15 minutes to Larnaca center and 10 minutes to the airport.",
  livadia: "Livadia offers coastal living with beach access, just 10 minutes to Larnaca city center.",
  aradippou: "Aradippou is an affordable residential area just 10 minutes to Larnaca center with good local amenities.",
  kamares: "Kamares is an upscale area with sea views, just 5-10 minutes to Larnaca center and the beach.",

  // Nicosia - focused on access to Nicosia center/amenities
  nicosia: "Nicosia city center puts you in the heart of the capital - walking distance to museums, shopping, restaurants, and business districts.",
  lefkosia: "Nicosia city center puts you in the heart of the capital - walking distance to museums, shopping, restaurants, and business districts.",
  strovolos: "Strovolos is a major suburb just 10 minutes from Nicosia center, with excellent schools, parks, malls, and local amenities.",
  lakatamia: "Lakatamia is a family-friendly suburb just 15 minutes from Nicosia center, with good schools and local shopping.",
  engomi: "Engomi is an upscale area just 5-10 minutes from Nicosia center, close to the university and embassies.",
  aglandjia: "Aglandjia offers peaceful residential living with parks, just 10 minutes to Nicosia city center.",
  latsia: "Latsia is an affordable developing suburb just 15 minutes from Nicosia center with good infrastructure.",
  geri: "Geri is a growing suburb just 15-20 minutes from Nicosia center offering modern housing at reasonable prices.",
  dali: "Dali is a village just 15 minutes from Nicosia center offering traditional living with easy highway access.",
  tseri: "Tseri is a residential area just 10-15 minutes from Nicosia center with good local amenities.",
  kokkinotrimithia: "Kokkinotrimithia is a village just 20 minutes from Nicosia center offering rural charm.",
  mammari: "Mammari is a quiet village just 15-20 minutes from Nicosia center with traditional Cypriot living.",
  deftera: "Deftera offers semi-rural living with countryside views, just 20 minutes to Nicosia center.",
  anthoupoli: "Anthoupoli is a developing area just 10-15 minutes from Nicosia center offering affordable housing.",
  makedonitissa: "Makedonitissa is a convenient area just 5-10 minutes from Nicosia center, close to the university and hospitals.",

  // Famagusta - focused on access to local amenities
  paralimni: "Paralimni is the main town in the area, offering all amenities, shops, and restaurants, with Protaras beaches just 10 minutes away.",
  "ayia napa": "Ayia Napa puts you in the heart of the action - walking distance to famous beaches, nightlife, restaurants, and the harbor.",
  protaras: "Protaras offers beautiful beaches and family-friendly living, with restaurants and amenities within walking distance.",
  deryneia: "Deryneia is a traditional village just 10-15 minutes from the beaches of Protaras and Ayia Napa.",
  sotira: "Sotira offers village living with traditional character, just 10 minutes to the coastal resorts.",
  frenaros: "Frenaros is a traditional village just 15 minutes to Ayia Napa and Protaras beaches.",
  vrysoulles: "Vrysoulles is a quiet village just 10 minutes from the famous beaches of Protaras.",
  liopetri: "Liopetri is a traditional fishing village just 15 minutes from the main coastal resorts, with local tavernas by the harbor.",
  "cape greco": "Cape Greco offers stunning coastal scenery and nature trails, just 5 minutes to Ayia Napa and Protaras.",
  kapparis: "Kapparis is a coastal area with beautiful beaches, just 10 minutes to Protaras and 20 minutes to Ayia Napa.",
  pernera: "Pernera offers family-friendly beach living with restaurants and amenities within walking distance.",
  "fig tree bay": "Fig Tree Bay puts you right on one of Cyprus's most famous beaches, with restaurants and amenities steps away.",
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
 * Capitalize first letter of a single word
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Title Case - Capitalize first letter of EVERY word
 * Examples: "detached house" -> "Detached House", "semi detached" -> "Semi Detached"
 */
function toTitleCase(str: string): string {
  return str
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
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
 * RULE: If underfloor heating is present, do NOT add central heating (per Lauren feedback)
 */
function categorizeFeatures(details: PropertyDetails): {
  indoor: string[];
  outdoor: string[];
  views: string[];
} {
  const indoor: string[] = [];
  const outdoor: string[] = [];
  const views: string[] = [];

  // Check if underfloor heating is in features list
  const hasUnderfloorHeating = details.features?.some(
    f => f.toLowerCase().includes("underfloor") || f.toLowerCase().includes("floor heating")
  );

  // Boolean features - categorized
  if (details.airConditioning) indoor.push("Air Conditioning");
  // ONLY add central heating if underfloor heating is NOT present
  if (details.centralHeating && !hasUnderfloorHeating) indoor.push("Central Heating");
  if (details.storage) indoor.push("Storage Room");

  if (details.pool) outdoor.push("Private Swimming Pool");
  if (details.garden) outdoor.push("Landscaped Garden");
  if (details.parking) {
    // Map parking types to proper Zyprus terminology
    const parkingType = details.parking.toLowerCase();
    const parkingLabel = parkingType === "open" ? "Uncovered Parking"
      : parkingType === "none" ? null
      : formatFeature(details.parking + " Parking");
    if (parkingLabel) outdoor.push(parkingLabel);
  }

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
      let formatted = formatFeature(feature);

      // CRITICAL: Rename "open parking" to "Uncovered Parking" (Zyprus terminology)
      if (lower.includes("open parking") || lower === "open parking") {
        formatted = "Uncovered Parking";
      }

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
    case "share_of_land":
    case "share of land":
      return "Share of Land";
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
 * Sort features by importance - Lauren's preferred ordering (Jan 2026 feedback):
 * 1. Parking (covered parking, garage)
 * 2. Extra rooms FIRST: Office, Gym, Maid's Room, Basement, Storeroom
 * 3. Fireplace (feature, not tech)
 * 4. Tech features: A/C, Underfloor Heating, Photovoltaic, Fitted Kitchen, Solar, Water Heating
 * 5. Walk-in wardrobe and similar
 * 6. External features (landscaped garden, BBQ area) - handled separately via isBottomFeature
 */
function sortFeaturesByImportance(features: string[]): string[] {
  // Priority order - earlier in list = higher priority = appears first
  const priorityKeywords = [
    // 1. Parking - highest priority
    "covered parking",
    "garage",
    "parking",
    // 2. Extra rooms FIRST (per Lauren feedback Jan 2026)
    "office",
    "playroom",
    "office/playroom",
    "gym",
    "maids room",
    "maid's room",
    "guest room",
    "basement",
    "storeroom",
    "storage room",
    "storage",
    // 3. Fireplace (feature, not tech)
    "fireplace",
    // 4. Tech features - AFTER rooms
    "a/c",
    "air conditioning",
    "underfloor heating",
    "central heating",
    "photovoltaic",
    "solar system",
    "solar panel",
    "solar",
    "water heating",
    "pressurized water",
    "pressurised water",
    "fitted kitchen",
    "electric shutters",
    "video entry",
    "alarm",
    "security",
    // 5. Walk-in wardrobe and similar
    "walk-in wardrobe",
    "walk in wardrobe",
    "fitted wardrobes",
    // 6. Views (if not handled as top features)
    "sea view",
    "mountain view",
    "panoramic",
    // 7. Pools (if not handled as top features)
    "swimming pool",
    "pool",
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
 * Format: Headline (Title Case) → Location sentences → Features → Closing → CTA
 */
export function generateDescription(details: PropertyDetails): string {
  const adjective = getRandomAdjective(); // Already capitalized from ADJECTIVES array
  const propertyType = toTitleCase(details.type); // Title Case: Detached House, Villa, etc.
  const location = capitalizeLocation(details.location);
  // Bedroom text for headline — show as "5+1 Bedroom" when basement rooms exist
  let bedroomText: string;
  if (details.basementRooms && details.basementRooms > 0) {
    bedroomText = `${details.bedrooms}+${details.basementRooms} Bedroom`;
  } else {
    bedroomText = details.bedrooms === 1 ? "1 Bedroom" : `${details.bedrooms} Bedroom`;
  }
  const listingTypeText = details.listingType === "rent" ? "For Rent" : "For Sale";

  const lines: string[] = [];

  // 1. HEADLINE - Title Case (per Lauren's feedback Jan 2026)
  // Format: "Spacious 5+1 Bedroom Detached House For Sale In Moutagiaka, Limassol With Title Deeds"
  let headline = `${adjective} ${bedroomText} ${propertyType} ${listingTypeText} In ${location}`;
  if (details.titleDeedStatus && details.listingType === "sale" && details.titleDeedStatus !== "do_not_display") {
    const titleDeedFormatted = formatTitleDeedStatus(details.titleDeedStatus);
    if (titleDeedFormatted) {
      headline += ` With ${titleDeedFormatted}`;
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

  // 5. BASIC SPECS (bedrooms, bathrooms, areas)
  // If there's a veranda, rename "Covered Area" to "Net Indoor Area"
  const hasVeranda = (details.coveredVeranda && details.coveredVeranda > 0) ||
                      (details.uncoveredVeranda && details.uncoveredVeranda > 0);
  const areaLabel = hasVeranda ? "Net Indoor Area" : "Covered Area";

  // Floor level (above bedrooms/bathrooms when specified)
  // SKIP for detached houses, villas, bungalows — "Ground Floor" is misleading
  // since these property types inherently have multiple floors
  if (details.floor) {
    const floorLower = details.floor.toLowerCase();
    const typeLower = details.type.toLowerCase();
    const isMultiStoryType = typeLower.includes("detached") || typeLower.includes("villa")
      || typeLower.includes("house") || typeLower.includes("bungalow")
      || typeLower.includes("townhouse") || typeLower.includes("maisonette");
    const isGroundFloor = floorLower === "ground" || floorLower === "ground floor";

    // Only suppress ground floor for multi-story types; show specific floors like "1st" or "2nd" for apartments
    if (!(isMultiStoryType && isGroundFloor)) {
      const floorDisplay = details.floor.charAt(0).toUpperCase() + details.floor.slice(1);
      lines.push(`${floorDisplay} Floor`);
    }
  }

  // Bedrooms — show basement rooms separately if provided (e.g., "5 Bedrooms + 1 Basement Bedroom")
  if (details.basementRooms && details.basementRooms > 0) {
    const mainBeds = details.bedrooms;
    const basementText = details.basementRooms === 1 ? "1 Basement Bedroom" : `${details.basementRooms} Basement Bedrooms`;
    lines.push(`${mainBeds} ${mainBeds === 1 ? "Bedroom" : "Bedrooms"} + ${basementText}`);
  } else {
    lines.push(`${details.bedrooms} ${details.bedrooms === 1 ? "Bedroom" : "Bedrooms"}`);
  }
  lines.push(`${details.bathrooms} ${details.bathrooms === 1 ? "Bathroom" : "Bathrooms"}`);
  lines.push(`${details.coveredArea}m² ${areaLabel}`);
  if (details.coveredVeranda) {
    lines.push(`${details.coveredVeranda}m² Covered Veranda`);
  }
  if (details.uncoveredVeranda) {
    lines.push(`${details.uncoveredVeranda}m² Uncovered Veranda`);
  }
  if (details.plotSize) {
    lines.push(`${details.plotSize}m² Plot Size`);
  }

  // Orientation (compass facing direction)
  if (details.orientation) {
    const orientationCapitalized = details.orientation.charAt(0).toUpperCase() + details.orientation.slice(1);
    lines.push(`${orientationCapitalized} Facing`);
  }

  // 6. REMAINING FEATURES with room suggestions injected after parking
  const regularFeatures = remainingFeatures.filter(f => !isBottomFeature(f));
  const bottomFeatures = remainingFeatures.filter(f => isBottomFeature(f));

  // Build room suggestions for large properties (4+ total bedrooms)
  const totalBeds = details.bedrooms + (details.basementRooms || 0);
  const roomSuggestionItems: string[] = [];
  if (totalBeds >= 4) {
    const typeLower = details.type.toLowerCase();
    const isHouseType = typeLower.includes("house") || typeLower.includes("villa")
      || typeLower.includes("bungalow") || typeLower.includes("detached")
      || typeLower.includes("townhouse");

    if (isHouseType) {
      const allFeaturesLower = sortedFeatures.map(f => f.toLowerCase()).join(" ");
      if (!allFeaturesLower.includes("office")) roomSuggestionItems.push("Office/Playroom");
      if (!allFeaturesLower.includes("maid")) roomSuggestionItems.push("Maid's Room");
    }
  }

  // Output features, inserting room suggestions right after parking items
  let roomSuggestionsInserted = false;
  for (const feature of regularFeatures) {
    lines.push(feature);

    // Insert room suggestions immediately after the last parking feature
    if (!roomSuggestionsInserted && roomSuggestionItems.length > 0) {
      const featureLower = feature.toLowerCase();
      const isParkingFeature = featureLower.includes("parking") || featureLower.includes("garage") || featureLower.includes("carport");
      // Check if next feature is NOT parking (i.e., we're past the parking block)
      const featureIdx = regularFeatures.indexOf(feature);
      const nextFeature = regularFeatures[featureIdx + 1];
      const nextIsParkingToo = nextFeature && (nextFeature.toLowerCase().includes("parking") || nextFeature.toLowerCase().includes("garage"));

      if (isParkingFeature && !nextIsParkingToo) {
        for (const room of roomSuggestionItems) {
          lines.push(room);
        }
        roomSuggestionsInserted = true;
      }
    }
  }

  // If no parking feature was found, add room suggestions at the end of regular features
  if (!roomSuggestionsInserted && roomSuggestionItems.length > 0) {
    for (const room of roomSuggestionItems) {
      lines.push(room);
    }
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
 * Rules (per Lauren feedback Feb 2026):
 * - Max 2 sentences (keep it short)
 * - No full stops (periods) — use exclamation marks
 * - Skip generic intro lines like "Located in the central area of X"
 * - Start with the useful content (proximity, amenities, access)
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

    // Skip generic intro lines that just state the location name
    // e.g., "Located in the central residential area of Kapsalos, Limassol"
    const isGenericIntro = /^(located|situated)\s+(in|at|on)\s+(the|a)\s+\w+\s+(residential|central|coastal|popular|quiet|peaceful)\s+(area|neighborhood|neighbourhood|district|community)\s+of\b/i.test(part);
    if (isGenericIntro) continue;

    // Clean up and format as a proper sentence
    let sentence = part
      .replace(/[.!]*$/, '') // Remove trailing punctuation
      .trim();

    // Ensure it starts with a capital letter
    if (sentence.length > 0) {
      sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);

      // ALWAYS use exclamation mark — no periods (per Lauren feedback)
      if (!sentence.endsWith('!')) {
        sentence += '!';
      }

      sentences.push(sentence);
    }
  }

  // Return max 2 sentences (keep location description short)
  return sentences.slice(0, 2);
}

/**
 * Get location sentences from user-provided areaDescription ONLY.
 * No static/generic location text is added — all location copy comes from AI-generated areaDescription.
 */
function getLocationSentences(_location: string, areaDescription?: string): string[] {
  // ONLY use user/AI-provided area description
  if (areaDescription && areaDescription.trim().length > 10) {
    const userSentences = parseUserAreaDescription(areaDescription);
    if (userSentences.length > 0) {
      return userSentences;
    }
  }

  // No static fallback — return empty array
  return [];
}

/**
 * Get generic location sentences based on area name
 */
function getGenericLocationSentences(location: string): string[] {
  const normalizedLocation = location.toLowerCase().trim();

  // Location-specific sentences — professional real estate marketing copy
  const locationData: Record<string, string[]> = {
    tala: [
      "Located in a peaceful and picturesque hillside community with panoramic views",
      "Many amenities are within a short drive, including local shops and charming village squares!"
    ],
    peyia: [
      "Located in a peaceful and attractive hillside community",
      "Many amenities are within walking distance, and the famous sandy beaches are only minutes away!"
    ],
    "coral bay": [
      "Located in a sought-after coastal community with beautiful sandy beaches within walking distance",
      "Many amenities are nearby, including restaurants, shops and leisure facilities!"
    ],
    chloraka: [
      "Located in a peaceful coastal community with easy access to the seafront",
      "Many amenities are within walking distance, including shops, schools and local services!"
    ],
    "kato paphos": [
      "Located in the heart of Kato Paphos within walking distance of the harbor and the seafront",
      "Many amenities are nearby, including restaurants, shops and historical landmarks!"
    ],
    universal: [
      "Located in a prestigious and well-connected area with a leading shopping mall nearby",
      "Many amenities are within walking distance, and the town center and beaches are only minutes away!"
    ],
    yeroskipou: [
      "Located in a peaceful and family-friendly community",
      "Many amenities are within walking distance, including schools and local shops. The beaches are only a short drive away!"
    ],
    neapoli: [
      "Located within walking distance of Makariou Avenue and many amenities including a leading supermarket",
      "In addition, it is only minutes from the seafront and the city center!"
    ],
    neapolis: [
      "Located within walking distance of Makariou Avenue and many amenities including a leading supermarket",
      "In addition, it is only minutes from the seafront and the city center!"
    ],
    limassol: [
      "Located in a vibrant and well-connected area of Limassol",
      "Many amenities are within walking distance, including shops and restaurants. The seafront and city center are only minutes away!"
    ],
    moutagiaka: [
      "Located in a peaceful and attractive coastal neighborhood",
      "The beach and many amenities are within walking distance, with easy access to the highway!"
    ],
    mouttagiaka: [
      "Located in a peaceful and attractive coastal neighborhood",
      "The beach and many amenities are within walking distance, with easy access to the highway!"
    ],
    "potamos germasogeia": [
      "Located in a popular and vibrant area within walking distance of the beach and the promenade",
      "Many amenities are nearby, including restaurants, shops and leisure facilities!"
    ],
    germasogeia: [
      "Located in a sought-after residential area with the beach only minutes away",
      "Many amenities are within walking distance, with easy access to the highway!"
    ],
    "agios tychonas": [
      "Located in a peaceful and prestigious coastal area with stunning sea views",
      "The beach and many amenities are within a short drive, offering a tranquil lifestyle!"
    ],
    "mesa geitonia": [
      "Located in a well-established residential area with excellent schools and parks nearby",
      "Many amenities are within walking distance, with easy access to all main roads!"
    ],
    larnaca: [
      "Located in a well-connected area of Larnaca with the beautiful seafront promenade nearby",
      "Many amenities are within walking distance, and the airport is only minutes away!"
    ],
    oroklini: [
      "Located in a peaceful and attractive community near the beach",
      "Many amenities are within walking distance, with easy access to the highway!"
    ],
    pervolia: [
      "Located in a charming coastal community with beautiful beaches nearby",
      "A peaceful environment with easy access to the airport and all main roads!"
    ],
    paralimni: [
      "Located in a thriving and well-connected community with many amenities within walking distance",
      "The stunning beaches of the region are only a short drive away!"
    ],
    "ayia napa": [
      "Located in a vibrant coastal resort area with stunning beaches within walking distance",
      "Many amenities are nearby, including restaurants, shops and entertainment!"
    ],
    protaras: [
      "Located in a peaceful and family-friendly coastal area with golden sandy beaches nearby",
      "Many amenities are within walking distance, including restaurants and shops!"
    ],
    nicosia: [
      "Located in a well-connected area of the capital with many amenities within walking distance",
      "Close to business centers, shops and cultural attractions!"
    ],
    strovolos: [
      "Located in a popular and well-connected suburban area",
      "Many amenities are within walking distance, including shopping centers, schools and parks!"
    ],
    pyla: [
      "Located in a peaceful and attractive community with a university campus nearby",
      "Many amenities are within walking distance, and the beach is only a short drive away!"
    ],
    dekelia: [
      "Located in a peaceful coastal area with easy access to the beach",
      "Many amenities are nearby, with Larnaca city center only a short drive away!"
    ],
    livadia: [
      "Located in a rapidly growing residential area close to the city center",
      "Many amenities are within walking distance, including schools, shops and parks!"
    ],
    kiti: [
      "Located in a charming and peaceful community near the coast",
      "Many amenities are nearby, with the airport and Larnaca city center only minutes away!"
    ],
    kamares: [
      "Located in a sought-after hillside community with stunning panoramic views",
      "Many amenities are within a short drive, including shops and the town center!"
    ],
    emba: [
      "Located in a peaceful and attractive residential area with mountain views",
      "Many amenities are within walking distance, and the town center is only minutes away!"
    ],
    kissonerga: [
      "Located in a peaceful coastal community with a beautiful beach nearby",
      "Many amenities are within a short drive, including shops and local services!"
    ],
    episkopi: [
      "Located in a charming hillside community with panoramic views",
      "Many amenities are within walking distance, and Limassol is only a short drive away!"
    ],
    zakaki: [
      "Located in a well-connected area near the new marina and the seafront",
      "Many amenities are within walking distance, with easy access to all main roads!"
    ],
    "agios athanasios": [
      "Located in a prestigious residential area with beautiful sea views",
      "Many amenities are within walking distance, and the highway and city center are only minutes away!"
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
    "Located in a desirable area with many amenities within walking distance",
    "A convenient location with easy access to shops, restaurants and local services!"
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
 * If covered veranda exists, includes both covered area and covered veranda separately
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

  // If there's a COVERED veranda, show both covered area and covered veranda separately
  const hasCoveredVeranda = details.coveredVeranda && details.coveredVeranda > 0;

  if (hasCoveredVeranda) {
    return `${bedroomText} ${propertyType} (${details.coveredArea}m² + ${details.coveredVeranda}m² covered veranda) in ${location}`;
  }

  return `${bedroomText} ${propertyType} (${details.coveredArea}m²) in ${location}`;
}

