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
export const LAUREN_UUID = "34a61949-bd34-4a39-b511-bb4fcb1c5cbb";

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
  "zyprus@zyprus.com": LAUREN_UUID,
  "listings@zyprus.com": LAUREN_UUID,
  "michelle@zyprus.com": MICHELLE_UUID,
  "limassol@zyprus.com": MICHELLE_UUID,
  "demetra@zyprus.com": DEMETRA_UUID,
  "azinas@zyprus.com": AZINAS_UUID,
  "paphos@zyprus.com": AZINAS_UUID,
  "charalambos@zyprus.com": CHARALAMBOS_UUID,
  "csc@zyprus.com": CHARALAMBOS_UUID,
  // Regional request accounts - actual Zyprus user UUIDs (verified from Zyprus API)
  "requestpaphos@zyprus.com": "ce23963b-ea29-4d42-933e-d0cd60bac5c7",
  "requestlimassol@zyprus.com": "c82d28cd-8167-4a2a-9ae8-8168015869c3",
  "requestlarnaca@zyprus.com": "f889a6dc-0973-44b2-b10c-0d681f84f560",
  "requestnicosia@zyprus.com": "630cc4fd-d2c7-410a-821d-b0a9adfae4ea",
  "requestfamagusta@zyprus.com": "7e33cdcd-709d-4fc0-8682-0075dde55964",
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
  "zyprus@zyprus.com": ["lauren", "zyprus"],
  "listings@zyprus.com": ["lauren", "listings"],
};

/**
 * Human-readable display names for emails shown in My Notes
 * Used by my-notes-generator.ts to show names instead of raw emails
 */
export const EMAIL_DISPLAY_NAMES: Record<string, string> = {
  "zyprus@zyprus.com": "Lauren",
  "listings@zyprus.com": "Lauren",
  "requestpaphos@zyprus.com": "Paphos Office",
  "requestlimassol@zyprus.com": "Limassol Office",
  "requestlarnaca@zyprus.com": "Larnaca Office",
  "requestnicosia@zyprus.com": "Nicosia Office",
  "requestfamagusta@zyprus.com": "Famagusta Office",
  "demetra@zyprus.com": "Demetra",
  "michelle@zyprus.com": "Michelle",
  "limassol@zyprus.com": "Michelle",
  "azinas@zyprus.com": "Azinas",
  "paphos@zyprus.com": "Azinas",
  "charalambos@zyprus.com": "Charalambos",
  "csc@zyprus.com": "Charalambos",
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
    "paphos",
    "pafos",
    "tala",
    "peyia",
    "chloraka",
    "kato paphos",
    "coral bay",
    "polis",
    "geroskipou",
    "pegeia",
    "kissonerga",
    "emba",
    "tremithousa",
    "mesa chorio",
    "kamares",
    "mandria",
    "kouklia",
    "letymvou",
    "tsada",
    "mesogi",
    "koloni",
    "universal",
    "anavargos",
    "konia",
    "tomb of kings",
    "sea caves",
    "kallepia",
    "peristerona",
    "letymbou",
    "letymvou",
    "stroumbi",
    "kathikas",
    "polemi",
    "choulou",
    "simou",
    "drouseia",
    "ineia",
    "arodes",
    "akourdaleia",
    "prodromi",
  ],
  limassol: [
    "limassol",
    "lemesos",
    "germasogeia",
    "agios tychonas",
    "potamos",
    "mesa geitonia",
    "zakaki",
    "columbia",
    "tourist area",
    "pareklisia",
    "pissouri",
    "erimi",
    "episkopi",
    "pyrgos",
    "parekklisia",
    "mouttagiaka",
    "agios athanasios",
    "trachoni",
    "panthea",
    "ypsonas",
    "kato polemidia",
    "polemidia",
    "agios nikolaos",
    "agia fyla",
    "omonia",
    "neapolis",
    "linopetra",
    "agios ioannis",
    "ayios tychonas",
    "neapoli",
    "agia zoni",
    "kapsalos",
    "enaerios",
    "pentadromos",
    "naafi",
  ],
  larnaca: [
    "larnaca",
    "larnaka",
    "oroklini",
    "pervolia",
    "livadia",
    "dekelia",
    "dhekelia",
    "kamares",
    "aradippou",
    "meneou",
    "dromolaxia",
    "kiti",
    "tersefanou",
    "perivolia",
    "chrysopolitissa",
    "pyla",
    "mosfiloti",
    "mosfilioti",
    "softades",
    "kivisili",
    "anglisides",
    "alethriko",
    "klavdia",
    "mazotos",
    "psematismenos",
  ],
  nicosia: [
    "nicosia",
    "lefkosia",
    "strovolos",
    "lakatamia",
    "engomi",
    "aglantzia",
    "dasoupoli",
    "makedonitissa",
    "kaimakli",
    "pallouriotissa",
    "latsia",
    "geri",
    "dali",
    "tseri",
    "kokkinotrimithia",
    "deftera",
    "acropolis",
  ],
  famagusta: [
    "famagusta",
    "ammochostos",
    "paralimni",
    "protaras",
    "ayia napa",
    "agia napa",
    "deryneia",
    "sotira",
    "frenaros",
    "liopetri",
    "xylofagou",
    "vrysoulles",
    "cape greco",
    "kapparis",
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
export const DEFAULT_COORDINATES: Record<string, { lat: number; lon: number }> =
  {
    // Main cities
    limassol: { lat: 34.6841, lon: 33.0413 },
    paphos: { lat: 34.772, lon: 32.4297 },
    pafos: { lat: 34.772, lon: 32.4297 },
    nicosia: { lat: 35.1856, lon: 33.3823 },
    larnaca: { lat: 34.9229, lon: 33.6233 },
    famagusta: { lat: 35.1174, lon: 33.9417 },
    ammochostos: { lat: 35.1174, lon: 33.9417 },
    // Paphos district
    peyia: { lat: 34.8846, lon: 32.3859 },
    pegeia: { lat: 34.8846, lon: 32.3859 },
    tala: { lat: 34.8475, lon: 32.4297 },
    chloraka: { lat: 34.7933, lon: 32.4083 },
    "kato paphos": { lat: 34.7542, lon: 32.4139 },
    "paphos city center": { lat: 34.775, lon: 32.422 },
    "paphos city centre": { lat: 34.775, lon: 32.422 },
    "paphos city": { lat: 34.775, lon: 32.422 },
    "paphos town": { lat: 34.775, lon: 32.422 },
    "coral bay": { lat: 34.8409, lon: 32.3547 },
    polis: { lat: 35.0347, lon: 32.4275 },
    prodromi: { lat: 35.0264, lon: 32.4168 },
    kissonerga: { lat: 34.8178, lon: 32.3897 },
    geroskipou: { lat: 34.7589, lon: 32.4542 },
    emba: { lat: 34.8039, lon: 32.4339 },
    kamares: { lat: 34.855, lon: 32.44 },
    "sea caves": { lat: 34.8975, lon: 32.3267 },
    "tomb of kings": { lat: 34.7697, lon: 32.4039 },
    universal: { lat: 34.775, lon: 32.4167 },
    // Limassol district
    germasogeia: { lat: 34.697, lon: 33.087 },
    "potamos germasogeias": { lat: 34.697, lon: 33.087 },
    "mesa geitonia": { lat: 34.685, lon: 33.06 },
    "agios tychonas": { lat: 34.715, lon: 33.1283 },
    "agios athanasios": { lat: 34.6917, lon: 33.0417 },
    panthea: { lat: 34.6933, lon: 33.0383 },
    "tourist area": { lat: 34.69, lon: 33.07 },
    columbia: { lat: 34.688, lon: 33.055 },
    zakaki: { lat: 34.665, lon: 33.01 },
    mouttagiaka: { lat: 34.7083, lon: 33.1017 },
    pareklisia: { lat: 34.7253, lon: 33.1556 },
    pissouri: { lat: 34.6667, lon: 32.6983 },
    episkopi: { lat: 34.6667, lon: 32.8867 },
    erimi: { lat: 34.6683, lon: 32.915 },
    pyrgos: { lat: 34.7083, lon: 33.1817 },
    "limassol marina": { lat: 34.67, lon: 33.0433 },
    "old town limassol": { lat: 34.675, lon: 33.0417 },
    // Larnaca district
    oroklini: { lat: 34.9603, lon: 33.6353 },
    pervolia: { lat: 34.8317, lon: 33.5767 },
    livadia: { lat: 34.95, lon: 33.6267 },
    dekelia: { lat: 35.0, lon: 33.72 },
    dhekelia: { lat: 35.0, lon: 33.72 },
    aradippou: { lat: 34.95, lon: 33.5833 },
    meneou: { lat: 34.8517, lon: 33.5833 },
    kiti: { lat: 34.85, lon: 33.5667 },
    mosfiloti: { lat: 34.9, lon: 33.45 },
    mosfilioti: { lat: 34.9, lon: 33.45 },
    tersefanou: { lat: 34.8667, lon: 33.55 },
    softades: { lat: 34.8833, lon: 33.4333 },
    // Nicosia district
    strovolos: { lat: 35.1367, lon: 33.3353 },
    engomi: { lat: 35.16, lon: 33.3517 },
    lakatamia: { lat: 35.1167, lon: 33.3 },
    aglantzia: { lat: 35.1533, lon: 33.3767 },
    latsia: { lat: 35.1017, lon: 33.3633 },
    geri: { lat: 35.0833, lon: 33.4 },
    dali: { lat: 35.0217, lon: 33.4217 },
    tseri: { lat: 35.0667, lon: 33.3233 },
    acropolis: { lat: 35.145, lon: 33.34 },
    // Famagusta district
    paralimni: { lat: 35.0385, lon: 33.9823 },
    "ayia napa": { lat: 34.9869, lon: 34.0028 },
    "agia napa": { lat: 34.9869, lon: 34.0028 },
    protaras: { lat: 35.0112, lon: 34.0583 },
    deryneia: { lat: 35.0633, lon: 33.9567 },
    sotira: { lat: 35.035, lon: 33.9283 },
    frenaros: { lat: 35.0517, lon: 33.9017 },
    kapparis: { lat: 35.05, lon: 34.0167 },
    "cape greco": { lat: 34.9667, lon: 34.0833 },
  };

// =============================================================================
// TAXONOMY DEFAULTS
// =============================================================================

/** Default property type UUID - Flat (leaf under Apartment) */
export const DEFAULT_PROPERTY_TYPE_UUID =
  "47dba0ae-f01c-46ae-999e-5ccb48e53033";

/** Default listing type UUID - For Sale */
export const DEFAULT_LISTING_TYPE_UUID = "8f187816-a888-4cda-a937-1cee84b9c0ee";

/** Default price modifier UUID */
export const DEFAULT_PRICE_MODIFIER_UUID =
  "ab39af2d-c8f5-4971-9fa5-2df6822ab9a9";

/** Default title deed UUID */
export const DEFAULT_TITLE_DEED_UUID = "5c553db1-e53d-46a2-b609-093d17e75a7a";

/**
 * Hardcoded fallback UUIDs for common property types
 * ALL values are LEAF UUIDs verified against dev9.zyprus.com live API (May 2026)
 *
 * Parent UUIDs (NOT selectable on the Zyprus edit page):
 *   Apartment: e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44
 *   House:     ddb5ac70-4464-40f8-9f3e-2d06c1e684f4
 *   Building:  caad7ee6-ed6d-4f40-87cc-2429e75c73f2
 */
export const PROPERTY_TYPE_FALLBACKS: Record<string, string> = {
  // --- Apartment children (leaf) ---
  apartment: "47dba0ae-f01c-46ae-999e-5ccb48e53033", // -> Flat (leaf under Apartment)
  flat: "47dba0ae-f01c-46ae-999e-5ccb48e53033", // Flat
  penthouse: "cf2d6939-a757-4036-912f-6fda39a6d5fb", // Penthouse
  "entire floor apartment": "763e048f-f2da-42d2-b33a-8f7e333817cb", // Entire Floor Apartment
  studio: "bff4e856-9888-4c4a-94c5-9fc6a6dfb6f3", // Studio
  maisonette: "47dba0ae-f01c-46ae-999e-5ccb48e53033", // -> Flat (no maisonette leaf exists)

  // --- House children (leaf) ---
  house: "76b4fa8e-de7e-4232-85ac-869dca3620f4", // -> Detached House
  "detached house": "76b4fa8e-de7e-4232-85ac-869dca3620f4", // Detached House
  villa: "76b4fa8e-de7e-4232-85ac-869dca3620f4", // -> Detached House
  "detached villa": "76b4fa8e-de7e-4232-85ac-869dca3620f4", // -> Detached House
  "semi-detached": "d9ab36df-b3ab-4fd0-b618-797784457fe9", // Semi Detached House
  "semi-detached house": "d9ab36df-b3ab-4fd0-b618-797784457fe9", // Semi Detached House
  bungalow: "8a3b5196-0068-4c56-b7bd-8f419a0884cc", // Bungalow
  townhouse: "74f0a039-fff8-4f7e-ae6d-6bda4c656b68", // Townhouse

  // --- Building children (leaf) ---
  building: "5b6b4dcd-0e62-4548-b9cd-ca0d2df794c9", // -> Commercial Building
  "commercial building": "5b6b4dcd-0e62-4548-b9cd-ca0d2df794c9", // Commercial Building
  "residential building": "6c7500ba-2ffa-4d4e-88b8-b7f647bdce41", // Residential Building
  "mixed-use building": "4f7972ae-78c7-422d-944e-a628bba4948e", // Mixed-use Building
  hotel: "de3a8c24-824b-4bc7-9cc0-27b9e337f209", // Hotel

  // --- Top-level leaves (no parent) ---
  office: "2528fe73-b53d-403f-b9b4-05f6efc2370b", // Office
  shop: "71953022-20cf-4f9c-be4a-8aad699a8a47", // Shop
  industrial: "06c87769-b0d3-4388-9c50-9c7d3dbdccb3", // Industrial
  warehouse: "06c87769-b0d3-4388-9c50-9c7d3dbdccb3", // -> Industrial (nearest leaf)
};

/** Property status UUIDs - verified from live API (Feb 2026) */
export const PROPERTY_STATUS_UUIDS: Record<string, string> = {
  "off-plan": "fcb94eb2-ddc8-4654-b017-135eee25c775",
  "under construction": "c2ae2a05-8433-4b79-ab30-f5488b222033",
};

// =============================================================================
// FEATURE FALLBACKS
// =============================================================================

/**
 * Indoor Features - taxonomy_term--indoor_property_views
 * All 34 terms from live Zyprus API (verified Mar 2026)
 */
export const INDOOR_FEATURE_FALLBACKS: Record<string, string> = {
  "air conditioning": "f577829f-8cbe-4ba8-9ce8-e67a30b6fe76",
  basement: "1b16146f-6298-4690-a779-328b0fc3b88c",
  "cctv system": "1ba67b0a-94a2-4998-9553-0ddce11aa64d",
  "central heating": "4f2523f7-9fde-4390-b532-c0da52644632",
  "conference room": "7af7be29-e1df-458a-8d10-2edda6c9b685",
  "covered parking": "432ac572-ed64-4107-a818-19a8a22c5371",
  "electrical appliances": "3ad75077-e2a8-4a2f-9b04-b10f2f797ac1",
  elevator: "55b75d9e-76fb-4fe8-b2dd-55f48b7ef0ea",
  "fire alarm system": "75a1d23e-dc4f-4b7c-a80d-40984899ba1e",
  fireplace: "bd49f04a-5eae-4056-9565-ecd898f49fe9",
  "fitted kitchen": "92015a2f-f3dd-42c0-80f9-be90d8bbb0ea",
  "fly screens": "3cdae0f7-afde-43dc-896b-4c6588d83618",
  furnished: "3d5b2d80-0f61-480f-a481-156ea25cf20c",
  "guest toilet": "5e2a90da-6836-444b-8d72-a5f810d3a9e5",
  "internal pool": "f46a3ff9-b499-4ddf-9aeb-49da0cd47545",
  jacuzzi: "596b1dd8-7867-4258-b50a-8d323ab60113",
  "male and female w/c": "7cd54930-dc67-4680-a343-67d5838fe1a2",
  "master bed": "5c19f790-1ea2-4c8e-9820-2a03f9ce6ac2",
  mezzanine: "24b4054c-d535-48f4-866a-a9a67037ea24",
  "open-plan": "5e13a12b-fde0-459e-ac4b-3ada19b63ca6",
  "pet friendly": "83cf669a-069d-4c79-baac-b51dc8930af8",
  playroom: "41ba2e44-9a56-4b71-b1c5-804377cb0840",
  "pressurised water system": "caa7b9a2-9e44-4585-a1cc-f86ae22c0ed1",
  "provision for air conditioning": "273a7354-b3e3-435e-a71e-263edbebc190",
  "provision for central heating": "12f34f20-02dd-46c4-af4c-baf2c771fabe",
  reception: "c3e320d2-0291-410b-aa4a-f09c710f8a97",
  "security system": "f1e7f4c3-7595-4de7-bfe7-2203035b9c46",
  "under floor heating": "061507f4-4f13-4877-b70e-78f6612abfe7",
  "underground parking": "698e0dd1-5b9a-47cd-a36a-3f0d5bb7f258",
  unfurnished: "85c67873-4c1b-4dcf-976c-69b1347bb90e",
  "utility room": "c8993099-d8f0-45a7-acbb-3f15c3ee2f6d",
  "ventilation system": "31c6f6d3-2b45-42bf-b1f1-8564cc9262db",
  "video entrance system": "b61345b7-77c6-4822-a394-64bcddfd3ca9",
  "water heater": "a2cf21f4-6d09-44a4-8083-71b901d28594",
};

/**
 * Outdoor Features - taxonomy_term--outdoor_property_features
 * All 18 terms from live Zyprus API (verified Mar 2026)
 */
export const OUTDOOR_FEATURE_FALLBACKS: Record<string, string> = {
  "barbecue area": "c3f02ad5-4275-4cb5-acaa-359673e2b0ac",
  "bore hole": "40663548-4e62-4a51-80ca-f30f4209e765",
  "communal pool": "ccc59522-df2f-4755-954a-f56776623901",
  "double garage": "113ca053-3606-45e0-b8b5-cd06a3ab814c",
  "electric shutters": "28011f8b-b2ac-46bd-b8b0-85a5609b3c44",
  "heated swimming pool": "ee30636b-e17a-4cd0-8af9-9d673bd7bdc0",
  "irrigation system": "b8da3137-9259-4f81-8d43-746a912a707c",
  "landscape garden": "7a695b83-390d-4436-8cf9-a45377251387",
  "on street parking": "5de70a0c-f6b5-4ba6-9c08-afc5837427b1",
  "outdoor shower": "0b1aa221-917d-4626-bcac-cf3a28d133b4",
  "photovoltaic system": "cf0e9658-bd22-4d8d-988e-b579f7139c1a",
  "private pool": "2967d26d-60d7-48d2-85a1-d3e84dbda1a4",
  "rear garden": "92ce9c79-30bd-4393-9517-8617855836cb",
  "roof garden": "bb232e56-7347-4763-818a-888ad6f72bf8",
  "single garage": "aa533eae-adec-4905-8372-270241d848c5",
  "solar system": "83683acd-8112-4a0d-80b2-a662bca371ad",
  "standard garden": "b7ca0d6d-a69e-4410-903b-6c1f578913de",
  "uncovered parking": "695d4e05-83df-4345-8f03-911302e96784",
};

/**
 * Property Views - taxonomy_term--property_views
 * All 8 terms from live Zyprus API (verified Mar 2026)
 */
export const VIEW_FALLBACKS: Record<string, string> = {
  "city view": "f65cd149-fcfa-4333-871b-3c1279cb8094",
  "golf course view": "7c093b10-ccfe-4686-aefb-f08f5243d50b",
  "green area view": "0f45eaaf-cf4a-46b5-a120-2ec4d88e64c0",
  "mountain view": "5a8665d5-9d2b-4e2f-9d70-e219fa4d9c3a",
  "pool view": "77d22bf3-651f-45f2-938d-270b5520201f",
  "river view": "84dfaf3d-6672-4707-b730-367439751b95",
  "road view": "d4404e30-b754-4414-a1c3-c851dc43fcb4",
  "sea view": "6cd2b7af-eff7-42e7-b030-2e6bd1c4c7ef",
};

// =============================================================================
// FEATURE ALIASES
// =============================================================================

/** Maps common user terms to Zyprus taxonomy terms for outdoor features */
export const OUTDOOR_FEATURE_ALIASES: Record<string, string[]> = {
  "private pool": [
    "private swimming pool",
    "private pool",
    "swimming pool",
    "pool",
  ],
  "communal pool": ["shared pool", "common pool", "communal swimming pool"],
  "heated swimming pool": ["heated pool"],
  "landscape garden": ["landscaped garden", "landscaping", "garden"],
  "standard garden": ["basic garden", "simple garden"],
  "rear garden": ["back garden", "backyard garden"],
  "roof garden": ["rooftop garden", "terrace garden"],
  "photovoltaic system": ["pv system", "photovoltaic", "pv panels"],
  "solar system": ["solar water heater", "solar panels", "solar"],
  "double garage": ["2 car garage", "two car garage"],
  "single garage": [
    "1 car garage",
    "one car garage",
    "garage",
    "garage parking",
  ],
  "irrigation system": ["irrigation", "sprinkler system", "sprinklers"],
  "barbecue area": ["bbq", "bbq area", "barbecue", "barbeque"],
  "electric shutters": ["electric blinds", "motorized shutters", "shutters"],
  "bore hole": ["borehole", "bore well", "well water"],
  "outdoor shower": ["outside shower"],
  "on street parking": ["street parking"],
  "uncovered parking": ["open parking", "outdoor parking"],
};

/** Maps common user terms to Zyprus taxonomy terms for indoor features */
export const INDOOR_FEATURE_ALIASES: Record<string, string[]> = {
  "air conditioning": ["ac", "a/c", "aircon", "air con"],
  "central heating": ["central heat"],
  "provision for central heating": [
    "provisions for central heating",
    "provision for heating",
    "provision for electric central heating",
    "provisions for heating",
  ],
  "under floor heating": [
    "underfloor heating",
    "floor heating",
    "radiant floor",
    "heated floors",
    "ufh",
  ],
  "fitted kitchen": ["built-in kitchen", "modern kitchen"],
  "covered parking": ["indoor parking"],
  "guest toilet": [
    "guest wc",
    "powder room",
    "guest bathroom",
    "second bathroom",
    "2nd bathroom",
  ],
  "electrical appliances": ["appliances", "white goods"],
  "fly screens": [
    "flyscreen",
    "fly screen",
    "insect screens",
    "mosquito screens",
  ],
  "water heater": ["boiler", "hot water"],
  "open-plan": ["open plan", "openplan", "open layout"],
  "utility room": [
    "laundry room",
    "laundry",
    "storage room",
    "storeroom",
    "store room",
  ],
  "master bed": ["master bedroom", "master suite", "en-suite", "ensuite"],
  jacuzzi: [
    "jacuzzi tub",
    "whirlpool bath",
    "spa bath",
    "hot tub",
    "indoor jacuzzi",
  ],
  fireplace: ["wood burning fireplace", "wood fireplace", "fire place"],
  playroom: [
    "play room",
    "games room",
    "game room",
    "entertainment room",
    "rec room",
  ],
  basement: ["underground storage", "cellar"],
  "cctv system": ["cctv", "security cameras", "surveillance"],
  "security system": [
    "alarm",
    "alarm system",
    "security alarm",
    "burglar alarm",
  ],
  "fire alarm system": ["fire alarm", "smoke detector", "smoke alarm"],
  elevator: ["lift"],
  mezzanine: ["mezzanine floor", "loft", "attic"],
  "internal pool": ["indoor pool", "indoor swimming pool"],
  "pressurised water system": [
    "pressurised water",
    "water pressure system",
    "pressure pump",
  ],
  "video entrance system": ["video intercom", "intercom", "video door"],
  reception: ["reception area", "lobby", "entrance hall"],
  "conference room": ["meeting room"],
  "underground parking": ["underground garage"],
};

// =============================================================================
// TIMING & CACHE SETTINGS
// =============================================================================

/** Taxonomy cache TTL - fresh data (1 hour) */
export const TAXONOMY_CACHE_TTL_MS = 60 * 60 * 1000;

/** Taxonomy stale TTL - serve stale while refreshing in background (2 hours) */
export const TAXONOMY_STALE_TTL_MS = 2 * 60 * 60 * 1000;

/** Upload lock duration to prevent parallel uploads (30 seconds) */
export const UPLOAD_LOCK_DURATION_MS = 30_000;

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
