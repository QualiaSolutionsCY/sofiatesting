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
 * Generate title deed statement
 */
function getTitleDeedStatement(status?: string): string {
  switch (status?.toLowerCase()) {
    case "separate":
    case "full":
      return "The property comes with full separate title deeds, providing complete legal security for the buyer.";
    case "final_approval":
    case "final approval":
      return "Title deeds are at the final approval stage, expected to be issued shortly.";
    case "pending":
    case "application":
      return "Title deed application has been submitted and is currently being processed.";
    default:
      return "Please contact us for details regarding the title deed status.";
  }
}

/**
 * Generate features section
 */
function generateFeaturesSection(details: PropertyDetails): string {
  const features: string[] = [];

  if (details.airConditioning) {
    features.push("air conditioning throughout");
  }
  if (details.centralHeating) {
    features.push("central heating");
  }
  if (details.pool) {
    features.push("private swimming pool");
  }
  if (details.garden) {
    features.push("landscaped garden");
  }
  if (details.seaView) {
    features.push("breathtaking sea views");
  }
  if (details.mountainView) {
    features.push("stunning mountain views");
  }
  if (details.parking) {
    features.push(`${details.parking} parking`);
  }
  if (details.storage) {
    features.push("storage room");
  }

  // Add any custom features
  if (details.features && details.features.length > 0) {
    features.push(...details.features.map((f) => f.toLowerCase()));
  }

  if (features.length === 0) {
    return "";
  }

  // Format features list
  if (features.length === 1) {
    return `Key features include ${features[0]}.`;
  }

  const lastFeature = features.pop();
  return `Key features include ${features.join(", ")}, and ${lastFeature}.`;
}

/**
 * Generate interior details paragraph
 */
function generateInteriorDetails(details: PropertyDetails): string {
  const bedroomText =
    details.bedrooms === 1 ? "1 bedroom" : `${details.bedrooms} bedrooms`;
  const bathroomText =
    details.bathrooms === 1 ? "1 bathroom" : `${details.bathrooms} bathrooms`;

  let interior = `The property comprises ${bedroomText} and ${bathroomText}, `;
  interior += `with ${details.coveredArea} square meters of covered living space`;

  if (details.plotSize) {
    interior += ` on a plot of ${details.plotSize} square meters`;
  }

  interior += ".";

  if (details.condition) {
    interior += ` The property is in ${details.condition.toLowerCase()} condition`;
    if (details.yearBuilt) {
      interior += `, built in ${details.yearBuilt}`;
    }
    interior += ".";
  }

  return interior;
}

/**
 * Generate full property description
 */
export function generateDescription(details: PropertyDetails): string {
  const adjective = getRandomAdjective();
  const propertyType = capitalize(details.type);
  const location = capitalize(details.location);

  // 1. Headline
  const bedroomText =
    details.bedrooms === 1 ? "1 Bedroom" : `${details.bedrooms} Bedroom`;
  let headline = `${adjective} ${bedroomText} ${propertyType} in ${location}`;
  if (details.titleDeedStatus) {
    headline += ` with ${capitalize(details.titleDeedStatus)} Title Deeds`;
  }

  // 2. Location paragraph
  const locationPara = getLocationParagraph(details.location);

  // 3. Property overview
  const listingTypeText =
    details.listingType === "rent" ? "rental" : "for sale";
  const overviewPara = `This ${adjective.toLowerCase()} ${details.type.toLowerCase()} is available ${listingTypeText} at ${formatPrice(details.price)}. `;

  // 4. Interior details
  const interiorPara = generateInteriorDetails(details);

  // 5. Features section
  const featuresPara = generateFeaturesSection(details);

  // 6. Title deed statement (only for sales)
  const titlePara =
    details.listingType === "sale"
      ? getTitleDeedStatement(details.titleDeedStatus)
      : "";

  // 7. Closing
  const closing =
    details.listingType === "rent"
      ? "Contact us today to arrange a viewing of this excellent rental property."
      : "Contact us today to arrange a viewing and make this property your new home.";

  // Combine all paragraphs
  const paragraphs = [
    headline,
    "",
    locationPara,
    "",
    overviewPara + interiorPara,
  ];

  if (featuresPara) {
    paragraphs.push("", featuresPara);
  }

  if (titlePara) {
    paragraphs.push("", titlePara);
  }

  paragraphs.push("", closing);

  return paragraphs.join("\n");
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
  const location = capitalize(details.location);

  return `${bedroomText} ${propertyType} in ${location}`;
}

