/**
 * OpenRouter Tool Definitions
 * Function calling schema for SOPHIA's listing upload capabilities
 */

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

/**
 * All available tools for SOPHIA
 */
export const TOOLS: ToolDefinition[] = [
  // Property Listing Creation
  {
    type: "function",
    function: {
      name: "createPropertyListing",
      description:
        "Create a property listing draft on zyprus.com. Use this when an agent wants to upload a new property for sale or rent. Collects all required information and creates an unpublished draft.",
      parameters: {
        type: "object",
        properties: {
          listingType: {
            type: "string",
            enum: ["sale", "rent"],
            description: "Whether the property is for sale or rent",
          },
          propertyType: {
            type: "string",
            enum: [
              "apartment",
              "house",
              "detached house",
              "villa",
              "maisonette",
              "bungalow",
              "penthouse",
              "townhouse",
              "studio",
              "semi-detached",
              "semi-detached house",
              "residential building",
              "office",
              "shop",
              "warehouse",
              "building",
              "hotel",
              "flat",
              "entire floor apartment",
            ],
            description:
              "The type of property (use 'detached house' for standalone houses, 'semi-detached' or 'semi-detached house' for joined houses, 'office' for office spaces, 'shop' for retail)",
          },
          price: {
            type: "number",
            description: "The price in EUR",
          },
          location: {
            type: "string",
            description:
              "The specific area/neighborhood EXACTLY as the agent stated it, plus the district. MUST include district (Paphos, Limassol, Larnaca, Nicosia, Famagusta). Example: agent says 'Mesa Geitonia' → pass 'Mesa Geitonia, Limassol'. ⛔ CRITICAL: NEVER extract location names from Google Maps URLs — the /place/ path often contains STREET ADDRESSES (e.g., 'Michali Sougioul 21') which are NOT valid area names. If agent only provides a Google Maps URL without stating the area, you MUST ASK: 'What is the area/neighborhood name?' ALWAYS pass the Google Maps URL separately as locationUrl.",
          },
          bedrooms: {
            type: "integer",
            description:
              "Number of bedrooms (0 for studio or commercial properties like offices/shops). Optional — defaults to 0 if not provided.",
          },
          bathrooms: {
            type: "integer",
            description: "Number of bathrooms",
          },
          coveredArea: {
            type: "number",
            description: "Covered internal area in square meters",
          },
          plotSize: {
            type: "number",
            description: "Plot/land size in square meters (for houses/villas)",
          },
          coveredVeranda: {
            type: "number",
            description:
              "Covered veranda area in square meters. ALWAYS include when user mentions veranda/balcony size - this is used in the listing title.",
          },
          uncoveredVeranda: {
            type: "number",
            description: "Uncovered veranda area in square meters (optional)",
          },
          ownerName: {
            type: "string",
            description: "Name of the property owner",
          },
          ownerPhone: {
            type: "string",
            description: "Phone number of the property owner",
          },
          ownerEmail: {
            type: "string",
            description: "Email of the property owner (optional)",
          },
          titleDeedStatus: {
            type: "string",
            enum: [
              "separate",
              "final_approval",
              "in_process",
              "pending",
              "share_of_land",
              "permits_only",
              "unknown",
              "do_not_display",
            ],
            description:
              "Status of the title deeds: separate (full title deeds), final_approval, in_process (title deeds currently being issued / in the process of issuance — use when agent says 'being issued', 'in process', 'issuance process'), pending (applied but not yet in process), share_of_land (shared ownership of land), permits_only (NO title deeds — only building/planning permits exist. Use when agent says 'permits only', 'no title deeds only permits', 'building permit only'), unknown, do_not_display (agent explicitly asked to NOT show deed status)",
          },
          priceNegotiable: {
            type: "boolean",
            description:
              "Whether the price is negotiable. Default is TRUE (negotiable) unless agent explicitly says 'non-negotiable' or 'fixed price'",
          },
          isNewBuild: {
            type: "boolean",
            description:
              "Whether this is a new build property. Set to true if agent mentions 'new build', 'brand new', 'newly built', or year built is recent (within last 2-3 years)",
          },
          parkingType: {
            type: "string",
            enum: ["covered", "open", "garage", "carport", "none"],
            description:
              "Type of parking available. Ask agent to specify: covered parking, open parking, garage, carport, or none",
          },
          condition: {
            type: "string",
            enum: ["new", "excellent", "good", "fair", "needs_renovation"],
            description:
              "Property condition. Set based on agent description: 'brand new'→new, 'perfect/excellent condition'→excellent, 'good condition'→good, 'needs work/renovation'→needs_renovation",
          },
          orientation: {
            type: "string",
            enum: [
              "north",
              "south",
              "east",
              "west",
              "northeast",
              "northwest",
              "southeast",
              "southwest",
            ],
            description:
              "Compass orientation of the property (which direction it faces)",
          },
          priceModifier: {
            type: "string",
            enum: ["no_vat", "plus_vat", "vat_included"],
            description:
              "VAT status of the price. Default 'no_vat' for resale properties. Use 'plus_vat' if price is before VAT, 'vat_included' if VAT is already in the price. Only relevant for new builds.",
          },
          registrationNumber: {
            type: "string",
            description:
              "Property registration number from title deed (e.g., 0/1234)",
          },
          imageUrls: {
            type: "array",
            items: { type: "string" },
            description: "Array of image URLs for the property",
          },
          floorPlanUrls: {
            type: "array",
            items: { type: "string" },
            description:
              "Array of floor plan image URLs (separate from property photos). These are uploaded to a dedicated floor plan field on the listing.",
          },
          titleDeedFileUrls: {
            type: "array",
            items: { type: "string" },
            description:
              "Array of title deed document URLs (PDF or scanned image of title deeds). When agent sends a document attachment during property upload, pass the URL here. These are uploaded to the title deed documents field on the listing.",
          },
          titleDeedImageIndices: {
            type: "array",
            items: { type: "integer" },
            description:
              "1-based indices of photos that are title deed images (not property photos). Example: if photo #3 is a title deed, pass [3]. These images will be moved from gallery to title deed documents field.",
          },
          floorPlanImageIndices: {
            type: "array",
            items: { type: "integer" },
            description:
              "1-based indices of photos that are floor plans. Example: if photo #4 is a floor plan, pass [4]. These images will be placed as the LAST photos in the gallery AND also added to the dedicated floor plan section.",
          },
          imageOrder: {
            type: "array",
            items: { type: "integer" },
            description:
              "Reordered 1-based photo indices for the gallery. Correct order: exterior shots first, then living areas, kitchen, additional rooms, bedrooms, bathrooms, floor plans last. Example: if agent says photos 5,6 are exterior, 1 is living room, 3 is kitchen, 2,4 are bedrooms, 7 is bathroom → pass [5, 6, 1, 3, 2, 4, 7]. Only pass this if the agent provides photo classifications.",
          },
          mainPhotoIndex: {
            type: "integer",
            description:
              "1-based index of the photo that should be FIRST in the gallery (the main listing image). Use this when the agent says 'photo X is the best exterior shot' or 'start with photo X'. This is simpler than imageOrder — just pass the single photo number and the system moves it to position 1. Example: agent says 'photo 3 is the best exterior' → pass mainPhotoIndex: 3. If you also pass imageOrder, imageOrder takes precedence.",
          },
          unitBreakdown: {
            type: "string",
            description:
              "For residential buildings / multi-unit properties: describes the unit breakdown. Format with NEWLINES between lines and BLANK LINES between unit groups. Example:\n4 x 2 Bedroom Units\n83m2 - 84m2 of Net Indoor area each\n21m2 - 26m2 of Covered Veranda each\n\n2 x 3 Bedroom Penthouse\n98m2 - 100m2 of Net Indoor area each\n19m2 - 24m2 of Covered Veranda each\n31m2 - 32m2 of Roof Garden area each",
          },
          poolType: {
            type: "string",
            enum: ["private", "communal", "provisions", "none"],
            description:
              "Type of swimming pool. 'private' = private pool on the property. 'communal' = shared pool in the complex/building. 'provisions' = plumbing/infrastructure ready to ADD a pool but NO pool exists yet. 'none' = agent explicitly stated NO pool — do NOT add any pool feature. CRITICAL: 'provisions' means there is NO pool — do NOT list pool as a feature.",
          },
          features: {
            type: "array",
            items: { type: "string" },
            description:
              "Property features. Include: INDOOR (fitted kitchen, air conditioning, central heating, underfloor heating, fireplace, storage room, elevator, furnished, electrical appliances), OUTDOOR (garden, BBQ area, covered parking, open parking, garage, solar system, water heater), VIEWS (sea view, mountain view, city view). Do NOT include pool in features — use poolType field instead.",
          },
          energyClass: {
            type: "string",
            description:
              "Energy performance rating (e.g., 'A', 'B', 'C', 'D'). Goes to the dedicated Energy Class field ONLY — do NOT include energy class in description or features array.",
          },
          yearBuilt: {
            type: "integer",
            description: "Year the property was built",
          },
          yearRenovated: {
            type: "integer",
            description:
              "Year the property was last renovated. Capture when agent mentions renovation (e.g., 'renovated in 2025', 'recently renovated'). A recently renovated property is a major selling point.",
          },
          floor: {
            type: "string",
            description: "Floor level (for apartments): ground, 1st, 2nd, etc.",
          },
          basementRooms: {
            type: "integer",
            description:
              "Number of bedrooms/rooms in the basement (e.g., if agent says '5 bedrooms plus 1 in the basement', pass bedrooms=5 and basementRooms=1). These will be shown as '5 Bedrooms + 1 Basement Bedroom' in the description.",
          },
          roofRooms: {
            type: "integer",
            description:
              "Number of rooms on the roof garden (e.g., if agent says '3 bedrooms + 1 room on the roof garden', pass bedrooms=3 and roofRooms=1). These will be shown as '3+1 Bedroom Penthouse' in the title and '3 Bedrooms + 1 Roof Garden Room' in the description. Use for penthouses with extra rooms on the roof level.",
          },
          confirmDuplicate: {
            type: "boolean",
            description:
              "Set to true when the agent confirms they want to upload a property that was flagged as a potential duplicate. Use this when the agent says 'upload anyway' or confirms re-upload after a duplicate warning.",
          },
          assignTo: {
            type: "string",
            description:
              "For management only: email of agent to assign as listing owner. CRITICAL: If the user says 'assign to [name]' or 'assign to [email]', extract the email and pass it here. Check the agent name-to-email mapping in your instructions. If user provides the email directly (e.g., 'danae@zyprus.com'), use it as-is.",
          },
          buildingName: {
            type: "string",
            description:
              "Name of the building/complex (e.g., 'Flow Residence', 'Kings Tower'). Added to the Reference ID for quick identification. Capture when the agent mentions a building or complex name.",
          },
          specialNotes: {
            type: "string",
            description:
              "Any special notes from the owner or agent. Include ALL agent notes verbatim, especially: multi-structure info (e.g., 'main house + separate bungalow'), title deed details, provisions info, and anything else the reviewer needs to know.",
          },
          structureDescription: {
            type: "string",
            description:
              "For multi-structure properties ONLY. Describe the full property structure for the listing description. Example: 'a 3-bedroom main house and a separate 2-bedroom bungalow/maid\\'s quarters'. This text appears in the description body. ALWAYS use when the property has multiple buildings/structures (house+bungalow, villa+guest house, etc.).",
          },
          areaDescription: {
            type: "string",
            description:
              "Description of the area/neighborhood for the listing. IMPORTANT: When user provides a Google Maps link, analyze the location and describe what is specifically nearby (e.g., supermarkets, schools, parks, beach proximity, restaurants, highway access). Also capture any area details the user provides verbatim - these are valuable marketing points that should NOT be replaced with generic descriptions.",
          },
          locationUrl: {
            type: "string",
            description:
              "Google Maps URL or pin link provided by the agent for the property location. Pass the EXACT URL as-is — do NOT modify it. This goes directly into the listing notes for reviewers.",
          },
          coordinates: {
            type: "object",
            properties: {
              lat: {
                type: "number",
                description:
                  "Latitude (e.g., 35.17 for Nicosia, 34.68 for Limassol)",
              },
              lon: {
                type: "number",
                description:
                  "Longitude (e.g., 33.36 for Nicosia, 33.04 for Limassol)",
              },
            },
            description:
              "GPS coordinates for the property location. Extract from Google Maps URL if provided (the @lat,lon part). Otherwise use approximate city coordinates. Cyprus coordinates: Nicosia (35.17, 33.36), Limassol (34.68, 33.04), Paphos (34.77, 32.42), Larnaca (34.92, 33.63), Famagusta (35.12, 33.95)",
          },
        },
        required: [
          "listingType",
          "propertyType",
          "price",
          "location",
          "coveredArea",
          "ownerName",
          "ownerPhone",
          "titleDeedStatus",
          "imageUrls",
        ],
      },
    },
  },

  // Land Listing Creation
  {
    type: "function",
    function: {
      name: "createLandListing",
      description:
        "Create a land/plot listing draft on zyprus.com. Use this when an agent wants to upload land, plot, field, or agricultural land for sale or rent. Collects all required information and creates an unpublished draft.",
      parameters: {
        type: "object",
        properties: {
          listingType: {
            type: "string",
            enum: ["sale", "rent"],
            description: "Whether the land is for sale or rent",
          },
          landType: {
            type: "string",
            enum: ["plot", "field", "agricultural", "commercial", "industrial"],
            description:
              "The type of land (plot for residential building plots, field for undeveloped land, agricultural for farming land, commercial for commercial plots, industrial for industrial plots)",
          },
          price: {
            type: "number",
            description: "The price in EUR",
          },
          location: {
            type: "string",
            description:
              "The specific area/neighborhood EXACTLY as the agent stated it, plus the district. MUST include district (Paphos, Limassol, Larnaca, Nicosia, Famagusta). Example: agent says 'Mesa Geitonia' → pass 'Mesa Geitonia, Limassol'. ⛔ CRITICAL: NEVER extract location names from Google Maps URLs — the /place/ path often contains STREET ADDRESSES (e.g., 'Michali Sougioul 21') which are NOT valid area names. If agent only provides a Google Maps URL without stating the area, you MUST ASK: 'What is the area/neighborhood name?' ALWAYS pass the Google Maps URL separately as locationUrl.",
          },
          landSize: {
            type: "number",
            description: "Total land size in square meters",
          },
          ownerName: {
            type: "string",
            description: "Name of the land owner",
          },
          ownerPhone: {
            type: "string",
            description: "Phone number of the land owner",
          },
          ownerEmail: {
            type: "string",
            description: "Email of the land owner (optional)",
          },
          titleDeedStatus: {
            type: "string",
            enum: [
              "separate",
              "final_approval",
              "in_process",
              "pending",
              "share_of_land",
              "permits_only",
              "unknown",
              "do_not_display",
            ],
            description:
              "Status of the title deeds: separate (full title deeds), final_approval, in_process (title deeds currently being issued / in the process of issuance), pending (applied but not yet in process), share_of_land (shared ownership of land), permits_only (NO title deeds — only building/planning permits exist), unknown, do_not_display (agent explicitly asked to NOT show deed status)",
          },
          priceModifier: {
            type: "string",
            enum: ["no_vat", "plus_vat", "vat_included"],
            description:
              "VAT status of the price. Default 'no_vat' for resale land. Use 'plus_vat' if price is before VAT, 'vat_included' if VAT is already in the price.",
          },
          registrationNumber: {
            type: "string",
            description:
              "Land registration number from title deed (e.g., 0/1234)",
          },
          imageUrls: {
            type: "array",
            items: { type: "string" },
            description:
              "Array of image URLs for the land (photos showing the plot, surrounding area, access roads, etc.)",
          },
          titleDeedFileUrls: {
            type: "array",
            items: { type: "string" },
            description:
              "Array of title deed document URLs (PDF or scanned image of title deeds). When agent sends a document attachment during land upload, pass the URL here. These are uploaded to the title deed documents field on the listing.",
          },
          titleDeedImageIndices: {
            type: "array",
            items: { type: "integer" },
            description:
              "1-based indices of photos that are title deed images (not land photos). Example: if photo #3 is a title deed, pass [3]. These images will be moved from gallery to title deed documents field.",
          },
          buildingDensity: {
            type: "integer",
            description:
              "Building density percentage allowed (e.g., 60 means 60% of land can be built)",
          },
          siteCoverage: {
            type: "integer",
            description:
              "Site coverage percentage allowed (e.g., 40 means 40% of land can be covered by buildings)",
          },
          maxFloors: {
            type: "integer",
            description: "Maximum number of floors allowed to build (e.g., 3)",
          },
          maxHeight: {
            type: "number",
            description:
              "Maximum building height allowed in meters (e.g., 12.5)",
          },
          roadFrontage: {
            type: "number",
            description:
              "Road frontage in meters (e.g., 52 means approximately 52m of road frontage). Extract from agent's info about the plot's frontage/face on the road.",
          },
          infrastructure: {
            type: "array",
            items: { type: "string" },
            description:
              "Available infrastructure on the plot. Options: electricity, water, road_access, telecommunications. Example: ['electricity', 'water', 'road_access', 'telecommunications']. DEFAULT: Include all 4 unless agent explicitly says something is missing.",
          },
          features: {
            type: "array",
            items: { type: "string" },
            description:
              "Land features, primarily VIEWS: sea view, mountain view, city view, valley view, panoramic view, etc.",
          },
          confirmDuplicate: {
            type: "boolean",
            description:
              "Set to true when the agent confirms they want to upload land that was flagged as a potential duplicate. Use this when the agent says 'upload anyway' or confirms re-upload after a duplicate warning.",
          },
          assignTo: {
            type: "string",
            description:
              "For management only: email of agent to assign as listing owner. CRITICAL: If the user says 'assign to [name]' or 'assign to [email]', extract the email and pass it here. Check the agent name-to-email mapping in your instructions. If user provides the email directly (e.g., 'danae@zyprus.com'), use it as-is.",
          },
          specialNotes: {
            type: "string",
            description:
              "Any special notes from the owner or agent. Include ALL agent notes verbatim, especially: title deed details, zoning info, development potential, access restrictions, and anything else the reviewer needs to know.",
          },
          areaDescription: {
            type: "string",
            description:
              "Description of the area/neighborhood for the listing. IMPORTANT: When user provides a Google Maps link, analyze the location and describe what is specifically nearby (e.g., supermarkets, schools, parks, beach proximity, restaurants, highway access). Also capture any area details the user provides verbatim - these are valuable marketing points that should NOT be replaced with generic descriptions.",
          },
          locationUrl: {
            type: "string",
            description:
              "Google Maps URL or pin link provided by the agent for the land location. Pass the EXACT URL as-is — do NOT modify it. This goes directly into the listing notes for reviewers.",
          },
          coordinates: {
            type: "object",
            properties: {
              lat: {
                type: "number",
                description:
                  "Latitude (e.g., 35.17 for Nicosia, 34.68 for Limassol)",
              },
              lon: {
                type: "number",
                description:
                  "Longitude (e.g., 33.36 for Nicosia, 33.04 for Limassol)",
              },
            },
            description:
              "GPS coordinates for the land location. Extract from Google Maps URL if provided (the @lat,lon part). Otherwise use approximate city coordinates. Cyprus coordinates: Nicosia (35.17, 33.36), Limassol (34.68, 33.04), Paphos (34.77, 32.42), Larnaca (34.92, 33.63), Famagusta (35.12, 33.95)",
          },
        },
        required: [
          "listingType",
          "landType",
          "price",
          "location",
          "landSize",
          "ownerName",
          "ownerPhone",
          "imageUrls",
        ],
      },
    },
  },

  // Get Zyprus Taxonomy Data
  {
    type: "function",
    function: {
      name: "getZyprusData",
      description:
        "Retrieve reference data from Zyprus (locations, property types, features). Use this to get valid options for property listings.",
      parameters: {
        type: "object",
        properties: {
          dataType: {
            type: "string",
            enum: ["locations", "property_types", "features", "listing_types"],
            description: "Type of reference data to retrieve",
          },
          region: {
            type: "string",
            enum: ["paphos", "limassol", "larnaca", "nicosia", "famagusta"],
            description: "Filter locations by region (optional)",
          },
        },
        required: ["dataType"],
      },
    },
  },

  // VAT Calculator
  {
    type: "function",
    function: {
      name: "calculateVAT",
      description:
        "Calculate VAT for a NEW property purchase in Cyprus. ALWAYS requires price AND area (sqm). Defaults to primary residence (5% reduced rate). Standard 19% applies if area >190sqm or price >€475,000.",
      parameters: {
        type: "object",
        properties: {
          price: {
            type: "number",
            description: "Property price in EUR (required)",
          },
          area: {
            type: "number",
            description:
              "Property area in square meters (required for accurate calculation)",
          },
          isPrimaryResidence: {
            type: "boolean",
            description:
              "Whether buyer will use as primary residence (defaults to true)",
          },
        },
        required: ["price", "area"],
      },
    },
  },

  // Transfer Fees Calculator
  {
    type: "function",
    function: {
      name: "calculateTransferFees",
      description:
        "Calculate property transfer fees for a Cyprus property purchase. Always ask if buying in joint names.",
      parameters: {
        type: "object",
        properties: {
          price: {
            type: "number",
            description: "Property price in EUR",
          },
          jointNames: {
            type: "boolean",
            description:
              "Whether the property is being bought in joint names (splits price between 2 buyers for lower progressive rates)",
          },
          isFirstProperty: {
            type: "boolean",
            description: "Whether this is buyer's first property in Cyprus",
          },
          hasVAT: {
            type: "boolean",
            description: "Whether VAT applies (new property)",
          },
        },
        required: ["price"],
      },
    },
  },

  // Capital Gains Calculator
  {
    type: "function",
    function: {
      name: "calculateCapitalGains",
      description:
        "Calculate capital gains tax for selling a property in Cyprus.",
      parameters: {
        type: "object",
        properties: {
          purchasePrice: {
            type: "number",
            description: "Original purchase price in EUR",
          },
          salePrice: {
            type: "number",
            description: "Sale price in EUR",
          },
          purchaseYear: {
            type: "integer",
            description: "Year property was purchased",
          },
          improvements: {
            type: "number",
            description: "Cost of improvements/renovations",
          },
          isMainResidence: {
            type: "boolean",
            description: "Whether this was seller's main residence",
          },
        },
        required: ["purchasePrice", "salePrice", "purchaseYear"],
      },
    },
  },

  // Get Regional Agents (for management assignment)
  {
    type: "function",
    function: {
      name: "getRegionalAgents",
      description:
        "List available agents in a specific region. Use this when management (Charalambos, Lauren) asks who they can assign a listing to, or wants to see agents in a region.",
      parameters: {
        type: "object",
        properties: {
          region: {
            type: "string",
            enum: ["paphos", "limassol", "larnaca", "nicosia", "famagusta"],
            description: "The region to list agents for",
          },
        },
        required: ["region"],
      },
    },
  },

  // Extract Property from Supported Portals
  {
    type: "function",
    function: {
      name: "extractFromBazaraki",
      description:
        "Extract property details from a property listing URL. Supports: Bazaraki (bazaraki.com, bazaraki.cy), Altia Marketplace (marketplace.altia.com.cy), Altamira (altamirarealestate.com.cy), REMU (remuproperties.com), and Gordian (gogordian.com). NOTE: The 4 bank portals (Altia, Altamira, REMU, Gordian) are only available to management users (Lauren, Charalambos, and similar). Other users only get Bazaraki extraction. Extracts photos, price, location, property type, bedrooms, bathrooms, and area. The agent must still provide owner details and title deed status. Always confirm extracted data with the agent before uploading. Use whenever an agent sends a listing URL from any supported portal.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description:
              "The full property listing URL from any supported portal (Bazaraki, Altia, Altamira, REMU, or Gordian)",
          },
        },
        required: ["url"],
      },
    },
  },

  // Send Email Tool
  {
    type: "function",
    function: {
      name: "sendEmail",
      description:
        "Send an email to yourself. The email is automatically sent to your registered Zyprus email address. ONLY use this when the user EXPLICITLY asks to email something (e.g., 'send to my email', 'email it to me'). DO NOT automatically email DOCX documents (viewing forms, reservation agreements, marketing agreements) - these are sent as WhatsApp file attachments unless user requests email. The email will be sent from sofia@zyprus.com. No need to specify your email address - it's automatically detected.",
      parameters: {
        type: "object",
        properties: {
          subject: {
            type: "string",
            description: "Email subject line",
          },
          body: {
            type: "string",
            description: "Email body content (plain text or HTML)",
          },
          attachmentUrl: {
            type: "string",
            description:
              "URL of a document to attach (optional, e.g., DOCX file URL)",
          },
          attachmentName: {
            type: "string",
            description:
              "Filename for the attachment (optional, e.g., 'Marketing_Agreement.docx')",
          },
        },
        required: ["subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manageInvoice",
      description:
        "Manage invoices, credit notes, and receipts for CSC Zyprus (authorized staff only — Fawzi, Marios, Charalambos). Use when an authorized agent asks to create/draft an invoice, list open drafts, check an invoice's status, approve one, mark one paid, issue a receipt or credit note, or request a correction/resend. The system assigns all official sequence numbers — never invent a number yourself.",
      parameters: {
        type: "object",
        properties: {
          intent: {
            type: "string",
            enum: [
              "create_draft",
              "list_drafts",
              "query_status",
              "approve",
              "request_correction",
              "mark_paid",
              "issue_receipt",
              "issue_credit_note",
              "resend",
            ],
            description: "The invoicing action to perform",
          },
          client: {
            type: "string",
            description: "Client / tenant name (for create_draft, or to locate a document)",
          },
          amount: { type: "number", description: "Amount in EUR (for create_draft)" },
          vatMode: {
            type: "string",
            enum: ["plus", "included", "none"],
            description:
              "VAT handling: plus = 19% added on top, included = 19% already inside, none = exempt",
          },
          description: {
            type: "string",
            description: "What is being billed (for create_draft)",
          },
          documentId: {
            type: "string",
            description: "Document id or invoice/draft number to act on",
          },
          officialNumber: {
            type: "string",
            description: "Official sequence number, if the agent explicitly provides one",
          },
          correctionReason: {
            type: "string",
            description: "Reason for a correction or resend",
          },
        },
        required: ["intent"],
      },
    },
  },
];

/**
 * Get tool definitions for OpenRouter
 */
export function getToolDefinitions(): ToolDefinition[] {
  return TOOLS;
}

/**
 * Get tool by name
 */
export function getToolByName(name: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.function.name === name);
}
