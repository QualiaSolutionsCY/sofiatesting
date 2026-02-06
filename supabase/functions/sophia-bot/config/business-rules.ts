/**
 * Business Rules Configuration
 * Centralized configuration for all business-critical values
 *
 * IMPORTANT: This is the SINGLE SOURCE OF TRUTH for business rules.
 * Do NOT duplicate these values elsewhere.
 */

// =============================================================================
// USER & AGENT IDENTIFIERS
// =============================================================================

/** SOPHIA AI system user UUID - used as fallback when user lookup fails */
export const SOPHIA_AI_UUID = "7026c7a3-1ef0-419f-9957-15a8c161b614";

/** Lauren's UUID - primary listing reviewer */
export const LAUREN_UUID = "0caa9a75-362a-4156-b11b-b52839243b74";

/** Michelle's UUID */
export const MICHELLE_UUID = "dc2688d2-0ea1-4c13-b03d-3309ee8de6a4";

/** Demetra's UUID */
export const DEMETRA_UUID = "b72a0f7c-62d8-4f69-89f3-aaebee31676a";

/** Azinas's UUID */
export const AZINAS_UUID = "c8e05e2a-56e6-4d1f-9a20-31235feaec54";

/** Charalambos's UUID */
export const CHARALAMBOS_UUID = "71ac4784-238f-45b2-ac15-5f74200601ce";

/**
 * Hardcoded fallback UUIDs for known Zyprus staff
 * Used when API user lookup fails
 */
export const USER_FALLBACKS: Record<string, string> = {
  "listings@zyprus.com": LAUREN_UUID,
  "michelle@zyprus.com": MICHELLE_UUID,
  "limassol@zyprus.com": MICHELLE_UUID,
  "demetra@zyprus.com": DEMETRA_UUID,
  "azinas@zyprus.com": AZINAS_UUID,
  "paphos@zyprus.com": AZINAS_UUID,
  "charalambos@zyprus.com": CHARALAMBOS_UUID,
  "csc@zyprus.com": CHARALAMBOS_UUID,
  // Regional request accounts - use SOPHIA_AI_UUID as fallback
  "requestpaphos@zyprus.com": SOPHIA_AI_UUID,
  "requestlimassol@zyprus.com": SOPHIA_AI_UUID,
  "requestlarnaca@zyprus.com": SOPHIA_AI_UUID,
  "requestnicosia@zyprus.com": SOPHIA_AI_UUID,
  "requestfamagusta@zyprus.com": SOPHIA_AI_UUID,
};

/**
 * Agent email to name mapping for lookup by name when email lookup fails
 * Names based on Zyprus username conventions
 */
export const AGENT_NAME_MAP: Record<string, string[]> = {
  // Paphos agents
  "evelina@zyprus.com": ["evelina", "evelina neophytou"],
  "marios@zyprus.com": ["marios", "marios polyviou"],
  "dimitris@zyprus.com": ["dimitris", "dimitris panayiotou"],
  "paphos@zyprus.com": ["azinas", "marios azinas"],
  "azinas@zyprus.com": ["azinas", "marios azinas"],
  // Limassol agents
  "limassol@zyprus.com": ["michelle", "michelle longridge"],
  "michelle@zyprus.com": ["michelle", "michelle longridge"],
  "diana@zyprus.com": ["diana", "diana kultaseva"],
  "maria@zyprus.com": ["maria", "maria georgiou"],
  "demetra@zyprus.com": ["demetra", "demetra papademetriou"],
  "christos@zyprus.com": ["christos", "christos minterides"],
  "daga@zyprus.com": ["daga", "daga lawicka"],
  "danae@zyprus.com": ["danae", "danae pirou"],
  "eleni@zyprus.com": ["eleni", "eleni iordanidou"],
  "oz@zyprus.com": ["oz", "olesya", "olesya zheyko"],
  "victoria@zyprus.com": ["victoria", "victoria roberts"],
  "brendan@zyprus.com": ["brendan", "brendan haddad"],
  "susan@zyprus.com": ["susan", "susan taylor"],
  // Larnaca agents
  "larnaca@zyprus.com": ["lysandros", "lysandros ioanni"],
  "natalia.larnaca@zyprus.com": ["natalia", "natalia komarova"],
  "olha@zyprus.com": ["olha", "olha shevchuk"],
  // Nicosia agents
  "nicosia@zyprus.com": ["ivan", "ivan kazakov"],
  "niki@zyprus.com": ["niki", "mir", "mir fathi"],
  "marisa@zyprus.com": ["marisa", "marisa konstantinou"],
  "philippos@zyprus.com": ["philippos", "philippos chrysostomou"],
  // Famagusta agents
  "famagusta@zyprus.com": ["narine", "narine akopyan"],
  "nick@zyprus.com": ["nick", "nick kokotsis"],
  "olga@zyprus.com": ["olga", "olga matushkina"],
  // Management
  "csc@zyprus.com": ["charalambos", "csc"],
  "listings@zyprus.com": ["lauren", "listings"],
};

// =============================================================================
// REGIONAL SETTINGS
// =============================================================================

/** Regional office emails for reviewer assignment */
export const REGIONAL_EMAILS: Record<string, string> = {
  paphos: "requestpaphos@zyprus.com",
  limassol: "requestlimassol@zyprus.com",
  larnaca: "requestlarnaca@zyprus.com",
  nicosia: "requestnicosia@zyprus.com",
  famagusta: "requestfamagusta@zyprus.com",
};

/** Known locations within each region - used for region detection */
export const REGION_LOCATIONS: Record<string, string[]> = {
  paphos: [
    "paphos", "pafos", "tala", "peyia", "chloraka", "kato paphos", "coral bay", "polis",
    "geroskipou", "pegeia", "kissonerga", "emba", "tremithousa", "mesa chorio",
    "kamares", "mandria", "kouklia", "letymvou", "tsada", "mesogi", "koloni",
    "universal", "anavargos", "konia", "tomb of kings", "sea caves"
  ],
  limassol: [
    "limassol", "lemesos", "germasogeia", "agios tychonas", "potamos", "mesa geitonia",
    "zakaki", "columbia", "tourist area", "pareklisia", "pissouri", "erimi",
    "episkopi", "pyrgos", "parekklisia", "mouttagiaka", "agios athanasios",
    "trachoni", "panthea", "ypsonas", "kato polemidia", "polemidia", "agios nikolaos",
    "agia fyla", "omonia", "neapolis", "linopetra", "agios ioannis", "ayios tychonas"
  ],
  larnaca: [
    "larnaca", "larnaka", "oroklini", "pervolia", "livadia", "dekelia", "dhekelia",
    "kamares", "aradippou", "meneou", "dromolaxia", "kiti", "tersefanou", "perivolia",
    "chrysopolitissa"
  ],
  nicosia: [
    "nicosia", "lefkosia", "strovolos", "lakatamia", "engomi", "aglantzia",
    "dasoupoli", "makedonitissa", "kaimakli", "pallouriotissa", "latsia",
    "geri", "dali", "tseri", "kokkinotrimithia", "deftera", "acropolis"
  ],
  famagusta: [
    "famagusta", "ammochostos", "paralimni", "protaras", "ayia napa", "agia napa",
    "deryneia", "sotira", "frenaros", "liopetri", "xylofagou", "vrysoulles",
    "cape greco", "kapparis"
  ],
};

// =============================================================================
// LOCATION SETTINGS
// =============================================================================

/** Default location UUID - Acropolis, Strovolos (known working) */
export const DEFAULT_LOCATION_UUID = "7dbc931e-90eb-4b89-9ac8-b5e593831cf8";

/**
 * Default city coordinates for Cyprus locations
 * Note: These are approximate area centers, not exact addresses
 * Format: { lat: latitude, lon: longitude }
 */
export const DEFAULT_COORDINATES: Record<string, { lat: number; lon: number }> = {
  // Main cities
  "limassol": { lat: 34.6841, lon: 33.0413 },
  "paphos": { lat: 34.7720, lon: 32.4297 },
  "pafos": { lat: 34.7720, lon: 32.4297 },
  "nicosia": { lat: 35.1856, lon: 33.3823 },
  "larnaca": { lat: 34.9229, lon: 33.6233 },
  "famagusta": { lat: 35.1174, lon: 33.9417 },
  "ammochostos": { lat: 35.1174, lon: 33.9417 },
  // Paphos district
  "peyia": { lat: 34.8846, lon: 32.3859 },
  "pegeia": { lat: 34.8846, lon: 32.3859 },
  "tala": { lat: 34.8475, lon: 32.4297 },
  "chloraka": { lat: 34.7933, lon: 32.4083 },
  "kato paphos": { lat: 34.7542, lon: 32.4139 },
  "paphos city center": { lat: 34.7750, lon: 32.4220 },
  "paphos city centre": { lat: 34.7750, lon: 32.4220 },
  "paphos city": { lat: 34.7750, lon: 32.4220 },
  "paphos town": { lat: 34.7750, lon: 32.4220 },
  "coral bay": { lat: 34.8409, lon: 32.3547 },
  "polis": { lat: 35.0347, lon: 32.4275 },
  "kissonerga": { lat: 34.8178, lon: 32.3897 },
  "geroskipou": { lat: 34.7589, lon: 32.4542 },
  "emba": { lat: 34.8039, lon: 32.4339 },
  "kamares": { lat: 34.8550, lon: 32.4400 },
  "sea caves": { lat: 34.8975, lon: 32.3267 },
  "tomb of kings": { lat: 34.7697, lon: 32.4039 },
  "universal": { lat: 34.7750, lon: 32.4167 },
  // Limassol district
  "germasogeia": { lat: 34.6970, lon: 33.0870 },
  "potamos germasogeias": { lat: 34.6970, lon: 33.0870 },
  "mesa geitonia": { lat: 34.6850, lon: 33.0600 },
  "agios tychonas": { lat: 34.7150, lon: 33.1283 },
  "agios athanasios": { lat: 34.6917, lon: 33.0417 },
  "panthea": { lat: 34.6933, lon: 33.0383 },
  "tourist area": { lat: 34.6900, lon: 33.0700 },
  "columbia": { lat: 34.6880, lon: 33.0550 },
  "zakaki": { lat: 34.6650, lon: 33.0100 },
  "mouttagiaka": { lat: 34.7083, lon: 33.1017 },
  "pareklisia": { lat: 34.7253, lon: 33.1556 },
  "pissouri": { lat: 34.6667, lon: 32.6983 },
  "episkopi": { lat: 34.6667, lon: 32.8867 },
  "erimi": { lat: 34.6683, lon: 32.9150 },
  "pyrgos": { lat: 34.7083, lon: 33.1817 },
  "limassol marina": { lat: 34.6700, lon: 33.0433 },
  "old town limassol": { lat: 34.6750, lon: 33.0417 },
  // Larnaca district
  "oroklini": { lat: 34.9603, lon: 33.6353 },
  "pervolia": { lat: 34.8317, lon: 33.5767 },
  "livadia": { lat: 34.9500, lon: 33.6267 },
  "dekelia": { lat: 35.0000, lon: 33.7200 },
  "dhekelia": { lat: 35.0000, lon: 33.7200 },
  "aradippou": { lat: 34.9500, lon: 33.5833 },
  "meneou": { lat: 34.8517, lon: 33.5833 },
  "kiti": { lat: 34.8500, lon: 33.5667 },
  // Nicosia district
  "strovolos": { lat: 35.1367, lon: 33.3353 },
  "engomi": { lat: 35.1600, lon: 33.3517 },
  "lakatamia": { lat: 35.1167, lon: 33.3000 },
  "aglantzia": { lat: 35.1533, lon: 33.3767 },
  "latsia": { lat: 35.1017, lon: 33.3633 },
  "geri": { lat: 35.0833, lon: 33.4000 },
  "dali": { lat: 35.0217, lon: 33.4217 },
  "tseri": { lat: 35.0667, lon: 33.3233 },
  "acropolis": { lat: 35.1450, lon: 33.3400 },
  // Famagusta district
  "paralimni": { lat: 35.0385, lon: 33.9823 },
  "ayia napa": { lat: 34.9869, lon: 34.0028 },
  "agia napa": { lat: 34.9869, lon: 34.0028 },
  "protaras": { lat: 35.0112, lon: 34.0583 },
  "deryneia": { lat: 35.0633, lon: 33.9567 },
  "sotira": { lat: 35.0350, lon: 33.9283 },
  "frenaros": { lat: 35.0517, lon: 33.9017 },
  "kapparis": { lat: 35.0500, lon: 34.0167 },
  "cape greco": { lat: 34.9667, lon: 34.0833 },
};

// =============================================================================
// TAXONOMY DEFAULTS
// =============================================================================

/** Default property type UUID - Apartment */
export const DEFAULT_PROPERTY_TYPE_UUID = "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44";

/** Default listing type UUID - For Sale */
export const DEFAULT_LISTING_TYPE_UUID = "8f187816-a888-4cda-a937-1cee84b9c0ee";

/** Default price modifier UUID */
export const DEFAULT_PRICE_MODIFIER_UUID = "ab39af2d-c8f5-4971-9fa5-2df6822ab9a9";

/** Default title deed UUID */
export const DEFAULT_TITLE_DEED_UUID = "5c553db1-e53d-46a2-b609-093d17e75a7a";

/**
 * Hardcoded fallback UUIDs for common property types
 * Verified to work on dev9.zyprus.com
 */
export const PROPERTY_TYPE_FALLBACKS: Record<string, string> = {
  apartment: "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44",
  villa: "76b4fa8e-de7e-4232-85ac-869dca3620f4",
  house: "76b4fa8e-de7e-4232-85ac-869dca3620f4",
  "detached house": "76b4fa8e-de7e-4232-85ac-869dca3620f4",
  "detached villa": "76b4fa8e-de7e-4232-85ac-869dca3620f4",
  "semi-detached": "76b4fa8e-de7e-4232-85ac-869dca3620f4",
  studio: "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44",
  penthouse: "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44",
  bungalow: "76b4fa8e-de7e-4232-85ac-869dca3620f4",
  maisonette: "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44",
  townhouse: "76b4fa8e-de7e-4232-85ac-869dca3620f4",
};

// =============================================================================
// FEATURE FALLBACKS
// =============================================================================

/** Indoor Features - taxonomy_term--indoor_property_views */
export const INDOOR_FEATURE_FALLBACKS: Record<string, string> = {
  "air conditioning": "f577829f-8cbe-4ba8-9ce8-e67a30b6fe76",
  "central heating": "4f2523f7-9fde-4390-b532-c0da52644632",
  "covered parking": "432ac572-ed64-4107-a818-19a8a22c5371",
  "guest toilet": "5e2a90da-6836-444b-8d72-a5f810d3a9e5",
};

/** Outdoor Features - taxonomy_term--outdoor_property_features */
export const OUTDOOR_FEATURE_FALLBACKS: Record<string, string> = {
  "on street parking": "695d4e05-83df-4345-8f03-911302e96784",
  "photovoltaic system": "cf0e9658-bd22-4d8d-988e-b579f7139c1a",
  "private pool": "c3f02ad5-4275-4cb5-acaa-359673e2b0ac",
  "uncovered parking": "695d4e05-83df-4345-8f03-911302e96784",
};

/** Property Views - taxonomy_term--property_views */
export const VIEW_FALLBACKS: Record<string, string> = {
  // TODO: Get actual UUIDs from API when available
};

// =============================================================================
// FEATURE ALIASES
// =============================================================================

/** Maps common user terms to Zyprus taxonomy terms for outdoor features */
export const OUTDOOR_FEATURE_ALIASES: Record<string, string[]> = {
  "private pool": ["swimming pool", "pool", "private swimming pool"],
  "communal pool": ["shared pool", "common pool"],
  "landscape garden": ["landscaped garden", "landscaping"],
  "standard garden": ["basic garden", "simple garden", "garden"],
  "roof garden": ["rooftop garden", "terrace garden"],
  "photovoltaic system": ["pv system", "photovoltaic", "pv panels", "solar panels"],
  "solar system": ["solar water heater", "solar panels", "solar"],
  "double garage": ["2 car garage", "two car garage"],
  "single garage": ["1 car garage", "one car garage", "garage"],
  "irrigation system": ["irrigation", "sprinkler system", "sprinklers"],
  "barbecue area": ["bbq", "bbq area", "barbecue", "barbeque"],
  "electric shutters": ["electric blinds", "motorized shutters"],
  "cul-de-sac": ["cul de sac", "culdesac", "dead end", "dead-end street"],
};

/** Maps common user terms to Zyprus taxonomy terms for indoor features */
export const INDOOR_FEATURE_ALIASES: Record<string, string[]> = {
  "air conditioning": ["ac", "a/c", "aircon", "air con"],
  "central heating": ["central heat"],
  "underfloor heating": ["under floor heating", "floor heating", "radiant floor", "heated floors", "ufh"],
  "fitted kitchen": ["built-in kitchen", "modern kitchen"],
  "covered parking": ["indoor parking", "garage parking"],
  "guest toilet": ["guest wc", "powder room", "guest bathroom", "second bathroom", "2nd bathroom"],
  "electrical appliances": ["appliances", "white goods"],
  "fly screens": ["flyscreen", "fly screen", "insect screens", "mosquito screens"],
  "water heater": ["boiler", "hot water"],
  "open-plan": ["open plan", "openplan", "open layout"],
  "utility room": ["laundry room", "laundry", "storage room", "storeroom", "store room"],
  "master bed": ["master bedroom", "master suite", "en-suite", "ensuite"],
};

// =============================================================================
// TIMING & CACHE SETTINGS
// =============================================================================

/** Taxonomy cache TTL in milliseconds (1 hour) */
export const TAXONOMY_CACHE_TTL_MS = 60 * 60 * 1000;

/** Upload lock duration to prevent parallel uploads (30 seconds) */
export const UPLOAD_LOCK_DURATION_MS = 30000;

/** Prompt cache TTL in milliseconds (5 minutes) */
export const PROMPT_CACHE_TTL_MS = 5 * 60 * 1000;

/** Version check interval in milliseconds (30 seconds) */
export const VERSION_CHECK_INTERVAL_MS = 30 * 1000;

// =============================================================================
// OPPOSITE MODIFIERS (for feature matching)
// =============================================================================

/**
 * Word pairs that negate each other
 * If input contains one modifier and taxonomy contains the opposite, REJECT the match
 */
export const OPPOSITE_MODIFIERS: Array<[string, string]> = [
  ["covered", "uncovered"],
  ["private", "communal"],
  ["private", "shared"],
  ["indoor", "outdoor"],
  ["heated", "unheated"],
  ["furnished", "unfurnished"],
  ["separate", "shared"],
  ["single", "double"],
  ["front", "rear"],
  ["open", "closed"],
];
