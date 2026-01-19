/**
 * Shared Services
 *
 * Property description generation, image handling, and URL validation.
 * Used by all channels (WhatsApp, Telegram, Web).
 */

// =============================================================================
// URL VALIDATOR - SSRF Prevention
// =============================================================================

/**
 * Domains allowed for external URL fetching
 */
const ALLOWED_DOMAINS = [
  "vceeheaxcrhmpqueudqx.supabase.co",
  "supabase.co",
  "supabase.in",
];

/**
 * Regex patterns for blocked IP ranges (SSRF prevention)
 */
const BLOCKED_IP_PATTERNS = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^127\./,
  /^0\./,
  /^169\.254\./,
  /^localhost$/i,
  /^0\.0\.0\.0$/,
];

/**
 * Hostnames that should always be blocked
 */
const BLOCKED_HOSTNAMES = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "169.254.169.254",
  "metadata.google.internal",
  "metadata.azure.com",
];

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
  hostname?: string;
  protocol?: string;
}

const isBlockedIp = (hostname: string): boolean =>
  BLOCKED_IP_PATTERNS.some((pattern) => pattern.test(hostname));

const isBlockedHostname = (hostname: string): boolean => {
  const lowerHostname = hostname.toLowerCase();
  return BLOCKED_HOSTNAMES.some((blocked) => lowerHostname === blocked.toLowerCase());
};

const isAllowedDomain = (hostname: string): boolean => {
  const lowerHostname = hostname.toLowerCase();
  return ALLOWED_DOMAINS.some((domain) => {
    const lowerDomain = domain.toLowerCase();
    if (lowerHostname === lowerDomain) return true;
    if (lowerHostname.endsWith(`.${lowerDomain}`)) return true;
    return false;
  });
};

const isIpAddress = (hostname: string): boolean => {
  const ipv4Pattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  const ipv6Pattern = /^[\da-f:]+$/i;
  return ipv4Pattern.test(hostname) || ipv6Pattern.test(hostname);
};

/**
 * Validate an external URL for safe fetching (strict - documents)
 */
export const validateExternalUrl = (url: string): UrlValidationResult => {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== "https:") {
      return { valid: false, error: "Only HTTPS URLs are allowed", protocol: parsed.protocol };
    }

    const hostname = parsed.hostname;

    if (isBlockedHostname(hostname)) {
      return { valid: false, error: "Access to this host is not allowed", hostname };
    }

    if (isIpAddress(hostname)) {
      if (isBlockedIp(hostname)) {
        return { valid: false, error: "Access to private networks is not allowed", hostname };
      }
      return { valid: false, error: "IP addresses are not allowed - use a domain name", hostname };
    }

    if (!isAllowedDomain(hostname)) {
      return { valid: false, error: `Domain "${hostname}" is not in the allowed list`, hostname };
    }

    if (parsed.pathname.includes("..")) {
      return { valid: false, error: "Path traversal detected", hostname };
    }

    return { valid: true, hostname, protocol: parsed.protocol };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
};

/**
 * Validate an image URL (less restrictive - allows public URLs)
 */
export const validateImageUrl = (url: string): UrlValidationResult => {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { valid: false, error: "Only HTTP/HTTPS URLs are allowed for images", protocol: parsed.protocol };
    }

    const hostname = parsed.hostname;

    if (isBlockedHostname(hostname)) {
      return { valid: false, error: "Access to this host is not allowed", hostname };
    }

    if (isIpAddress(hostname) && isBlockedIp(hostname)) {
      return { valid: false, error: "Access to private networks is not allowed", hostname };
    }

    if (parsed.pathname.includes("..")) {
      return { valid: false, error: "Path traversal detected", hostname };
    }

    return { valid: true, hostname, protocol: parsed.protocol };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
};

/**
 * Quick check if a URL is potentially safe
 */
export const isUrlSafe = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      !isBlockedHostname(parsed.hostname) &&
      !isBlockedIp(parsed.hostname)
    );
  } catch {
    return false;
  }
};

// =============================================================================
// IMAGE HANDLER
// =============================================================================

export interface ProcessedImage {
  url: string;
  order: number;
  needsCropping: boolean;
  privacyIssues: string[];
  classification: ImageClassification;
}

export type ImageClassification =
  | "exterior_front"
  | "exterior_other"
  | "pool"
  | "garden"
  | "living_room"
  | "kitchen"
  | "bedroom"
  | "bathroom"
  | "other"
  | "unknown";

const IMAGE_ORDER: Record<ImageClassification, number> = {
  exterior_front: 1,
  exterior_other: 2,
  pool: 3,
  garden: 4,
  living_room: 5,
  kitchen: 6,
  bedroom: 7,
  bathroom: 8,
  other: 9,
  unknown: 10,
};

const WATERMARK_DOMAINS = [
  "bazaraki.com",
  "bazaraki.cy",
  "facebook.com",
  "fb.com",
  "rightmove.co.uk",
  "zoopla.co.uk",
];

const hasKnownWatermark = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    return WATERMARK_DOMAINS.some(
      (domain) =>
        urlObj.hostname.includes(domain) ||
        url.toLowerCase().includes(domain.replace(".", ""))
    );
  } catch {
    return false;
  }
};

const detectPrivacyIssues = (url: string): string[] => {
  const issues: string[] = [];
  if (url.toLowerCase().includes("streetview")) {
    issues.push("May contain Google Street View content");
  }
  if (url.toLowerCase().includes("personal") || url.toLowerCase().includes("private")) {
    issues.push("URL suggests private/personal content");
  }
  return issues;
};

const classifyImage = (url: string): ImageClassification => {
  const filename = url.toLowerCase();

  if (filename.includes("front") || filename.includes("facade") || filename.includes("entrance")) {
    return "exterior_front";
  }
  if (filename.includes("exterior") || filename.includes("outside") || filename.includes("building")) {
    return "exterior_other";
  }
  if (filename.includes("pool") || filename.includes("swimming")) {
    return "pool";
  }
  if (filename.includes("garden") || filename.includes("yard") || filename.includes("terrace") || filename.includes("patio")) {
    return "garden";
  }
  if (filename.includes("living") || filename.includes("lounge") || filename.includes("salon")) {
    return "living_room";
  }
  if (filename.includes("kitchen") || filename.includes("cooking")) {
    return "kitchen";
  }
  if (filename.includes("bedroom") || filename.includes("master") || filename.includes("sleep")) {
    return "bedroom";
  }
  if (filename.includes("bathroom") || filename.includes("bath") || filename.includes("shower") || filename.includes("wc")) {
    return "bathroom";
  }
  if (filename.includes("interior") || filename.includes("inside")) {
    return "other";
  }

  return "unknown";
};

const checkImageAccessible = async (url: string): Promise<boolean> => {
  try {
    const securityCheck = validateImageUrl(url);
    if (!securityCheck.valid) {
      console.warn(`[Image Handler] SSRF blocked: ${securityCheck.error}`);
      return false;
    }

    let response = await fetch(url, { method: "HEAD" });
    if (!response.ok && response.status === 405) {
      response = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-1024" },
      });
    }

    if (!response.ok) return false;

    const contentType = response.headers.get("content-type");
    return contentType?.startsWith("image/") || false;
  } catch {
    return false;
  }
};

/**
 * Process a list of image URLs for upload
 */
export const processImages = async (imageUrls: string[]): Promise<ProcessedImage[]> => {
  const processed: ProcessedImage[] = [];

  for (const url of imageUrls) {
    if (!url || url.trim() === "") continue;

    const classification = classifyImage(url);
    const needsCropping = hasKnownWatermark(url);
    const privacyIssues = detectPrivacyIssues(url);

    processed.push({
      url: url.trim(),
      order: IMAGE_ORDER[classification],
      needsCropping,
      privacyIssues,
      classification,
    });
  }

  return processed.sort((a, b) => a.order - b.order);
};

/**
 * Validate that all images are accessible
 */
export const validateImages = async (
  images: ProcessedImage[]
): Promise<{ valid: ProcessedImage[]; invalid: string[] }> => {
  const valid: ProcessedImage[] = [];
  const invalid: string[] = [];

  await Promise.all(
    images.map(async (img) => {
      const isValid = await checkImageAccessible(img.url);
      if (isValid) {
        valid.push(img);
      } else {
        invalid.push(img.url);
      }
    })
  );

  return { valid, invalid };
};

/**
 * Generate warning message for images with issues
 */
export const generateImageWarnings = (images: ProcessedImage[]): string => {
  const warnings: string[] = [];

  const watermarkImages = images.filter((img) => img.needsCropping);
  if (watermarkImages.length > 0) {
    warnings.push(
      `⚠️ ${watermarkImages.length} image(s) may contain watermarks from other websites. Please crop or replace these before publishing.`
    );
  }

  const privacyImages = images.filter((img) => img.privacyIssues.length > 0);
  if (privacyImages.length > 0) {
    warnings.push(
      `⚠️ ${privacyImages.length} image(s) may have privacy concerns. Please review before publishing.`
    );
  }

  return warnings.join("\n\n");
};

/**
 * Get image URLs in optimized order
 */
export const getOrderedImageUrls = (images: ProcessedImage[]): string[] =>
  images.map((img) => img.url);

/**
 * Minimum images required (1 for all property types)
 */
export const getMinimumImageCount = (_propertyType: string): number => 1;

/**
 * Check if we have enough images
 */
export const hasEnoughImages = (
  images: ProcessedImage[],
  propertyType: string
): { enough: boolean; required: number; provided: number } => {
  const required = getMinimumImageCount(propertyType);
  const provided = images.length;
  return { enough: provided >= required, required, provided };
};

// =============================================================================
// DESCRIPTION GENERATOR
// =============================================================================

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

const LOCATION_DESCRIPTIONS: Record<string, string> = {
  tala: "Tala is a picturesque hillside village offering stunning views and a peaceful lifestyle, just minutes from Paphos and the Mediterranean coast.",
  peyia: "Peyia is a popular hillside town known for its pleasant climate, beautiful sunsets, and proximity to the famous Coral Bay beaches.",
  "coral bay": "Coral Bay is one of Cyprus's most sought-after beach destinations, offering crystal-clear waters and a vibrant atmosphere.",
  chloraka: "Chloraka is a charming coastal suburb of Paphos, offering easy access to beaches, amenities, and the historic harbor area.",
  "kato paphos": "Kato Paphos is the cosmopolitan heart of the region, home to the famous archaeological park, harbor, and excellent restaurants.",
  universal: "Universal is a prestigious area of Paphos known for its quality developments and convenient location near the town center.",
  yeroskipou: "Yeroskipou is a family-friendly area known for its traditional character, excellent schools, and proximity to Paphos town.",
  limassol: "Limassol is Cyprus's vibrant second city, combining business energy with beachfront living and a rich cultural scene.",
  "potamos germasogeia": "Potamos Germasogeia is a prime tourist area known for its beautiful beach, hotels, and proximity to amenities.",
  "agios tychonas": "Agios Tychonas is an upscale coastal area offering luxury properties with stunning sea views and exclusive amenities.",
  "mesa geitonia": "Mesa Geitonia is a well-established residential area offering excellent schools, shops, and a strong community feel.",
  larnaca: "Larnaca combines rich history with modern convenience, featuring a beautiful seafront promenade and excellent connectivity.",
  oroklini: "Oroklini is a peaceful residential area known for its nature reserve, beach, and family-friendly environment.",
  pervolia: "Pervolia is a charming coastal village offering a relaxed lifestyle near Larnaca airport and beautiful beaches.",
  paralimni: "Paralimni is a thriving town in the Famagusta district, serving as a hub for the popular resort areas of Protaras and Ayia Napa.",
  "ayia napa": "Ayia Napa is world-famous for its stunning beaches, vibrant nightlife, and excellent tourist facilities.",
  protaras: "Protaras is a family-friendly resort area known for its golden beaches, clear waters, and peaceful atmosphere.",
};

const ADJECTIVES = [
  "Stunning", "Beautiful", "Spacious", "Modern", "Elegant",
  "Charming", "Impressive", "Exceptional", "Superb", "Attractive",
];

const getRandomAdjective = (): string =>
  ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];

const capitalize = (str: string): string =>
  str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

const capitalizeLocation = (location: string): string =>
  location.split(" ").map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");

const formatFeature = (feature: string): string => {
  const abbreviations: Record<string, string> = {
    "a/c": "A/C", "ac": "A/C", "bbq": "BBQ", "tv": "TV", "dvd": "DVD",
    "wifi": "WiFi", "wi-fi": "WiFi", "jacuzzi": "Jacuzzi",
    "en-suite": "En-Suite", "ensuite": "En-Suite",
  };

  const lower = feature.toLowerCase().trim();
  if (abbreviations[lower]) return abbreviations[lower];

  return feature
    .split(" ")
    .map((word) => {
      const wordLower = word.toLowerCase();
      if (abbreviations[wordLower]) return abbreviations[wordLower];
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
};

const formatPrice = (price: number): string =>
  new Intl.NumberFormat("en-CY", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);

const getLocationParagraph = (location: string): string => {
  const normalized = location.toLowerCase().trim();

  if (LOCATION_DESCRIPTIONS[normalized]) {
    return LOCATION_DESCRIPTIONS[normalized];
  }

  for (const [key, desc] of Object.entries(LOCATION_DESCRIPTIONS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return desc;
    }
  }

  return `${capitalize(location)} offers an excellent location combining convenience with quality of life, close to local amenities and transport links.`;
};

const categorizeFeatures = (details: PropertyDetails): {
  indoor: string[];
  outdoor: string[];
  views: string[];
} => {
  const indoor: string[] = [];
  const outdoor: string[] = [];
  const views: string[] = [];

  if (details.airConditioning) indoor.push("Air Conditioning");
  if (details.centralHeating) indoor.push("Central Heating");
  if (details.storage) indoor.push("Storage Room");

  if (details.pool) outdoor.push("Private Swimming Pool");
  if (details.garden) outdoor.push("Landscaped Garden");
  if (details.parking) outdoor.push(formatFeature(details.parking + " Parking"));

  if (details.seaView) views.push("Sea View");
  if (details.mountainView) views.push("Mountain View");

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

      const alreadyAdded = [...indoor, ...outdoor, ...views].some(
        (f) => f.toLowerCase().includes(lower) || lower.includes(f.toLowerCase())
      );
      if (alreadyAdded) continue;

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

  return { indoor, outdoor, views };
};

const formatTitleDeedStatus = (status?: string): string => {
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
};

/**
 * Generate full property description with comprehensive itemized format
 */
export const generateDescription = (details: PropertyDetails): string => {
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
  sections.push(getLocationParagraph(details.location));

  // 3. KEY FEATURES section
  const keyFeatures: string[] = [];
  keyFeatures.push(`${details.bedrooms} ${details.bedrooms === 1 ? "Bedroom" : "Bedrooms"}`);
  keyFeatures.push(`${details.bathrooms} ${details.bathrooms === 1 ? "Bathroom" : "Bathrooms"}`);
  keyFeatures.push(`${details.coveredArea}m² Covered Area`);
  if (details.plotSize) keyFeatures.push(`${details.plotSize}m² Plot Size`);
  if (details.yearBuilt) keyFeatures.push(`Built in ${details.yearBuilt}`);
  if (details.floor) keyFeatures.push(`${capitalize(details.floor)} Floor`);
  if (details.condition) keyFeatures.push(`${capitalize(details.condition)} Condition`);
  if (details.titleDeedStatus && details.listingType === "sale") {
    const titleDeedFormatted = formatTitleDeedStatus(details.titleDeedStatus);
    if (titleDeedFormatted) keyFeatures.push(titleDeedFormatted);
  }
  sections.push("KEY FEATURES:\n" + keyFeatures.map((f) => `• ${f}`).join("\n"));

  // 4. Categorized features
  const { indoor, outdoor, views } = categorizeFeatures(details);
  if (indoor.length > 0) {
    sections.push("INDOOR FEATURES:\n" + indoor.map((f) => `• ${f}`).join("\n"));
  }
  if (outdoor.length > 0) {
    sections.push("OUTDOOR FEATURES:\n" + outdoor.map((f) => `• ${f}`).join("\n"));
  }
  if (views.length > 0) {
    sections.push("PROPERTY VIEWS:\n" + views.map((f) => `• ${f}`).join("\n"));
  }

  // 5. Closing statement
  const priceFormatted = formatPrice(details.price);
  let closing = `This ${propertyType.toLowerCase()} represents an excellent ${details.listingType === "rent" ? "rental" : "investment"} opportunity in ${location}.`;
  closing += `\n\nOffered at ${priceFormatted}. Contact us today to arrange a viewing.`;
  sections.push(closing);

  return sections.join("\n\n");
};

/**
 * Generate a short summary for the listing title
 */
export const generateTitle = (details: PropertyDetails): string => {
  const bedroomText =
    details.bedrooms === 0
      ? "Studio"
      : details.bedrooms === 1
        ? "1 Bed"
        : `${details.bedrooms} Bed`;
  const propertyType = capitalize(details.type);
  const location = capitalizeLocation(details.location);

  return `${bedroomText} ${propertyType} in ${location}`;
};
