import type { InferSelectModel } from "drizzle-orm";
import {
  bigint,
  boolean,
  foreignKey,
  index,
  integer,
  json,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { AppUsage } from "../usage";

export const user = pgTable("User", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: varchar("email", { length: 64 }).notNull(),
  password: varchar("password", { length: 255 }),
});

export type User = InferSelectModel<typeof user>;

export const chat = pgTable(
  "Chat",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    createdAt: timestamp("createdAt").notNull(),
    title: text("title").notNull(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    visibility: varchar("visibility", { enum: ["public", "private"] })
      .notNull()
      .default("private"),
    lastContext: jsonb("lastContext").$type<AppUsage | null>(),
  },
  (table) => ({
    // Composite index for user chat list queries (userId + createdAt DESC)
    userIdCreatedAtIdx: index("Chat_userId_createdAt_idx").on(
      table.userId,
      table.createdAt.desc()
    ),
  })
);

export type Chat = InferSelectModel<typeof chat>;

export const message = pgTable(
  "Message_v2",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    role: varchar("role").notNull(),
    parts: json("parts").notNull(),
    attachments: json("attachments").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    // Composite index for message history queries (chatId + createdAt ASC)
    chatIdCreatedAtIdx: index("Message_v2_chatId_createdAt_idx").on(
      table.chatId,
      table.createdAt.asc()
    ),
  })
);

export type DBMessage = InferSelectModel<typeof message>;

export const vote = pgTable(
  "Vote_v2",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  }
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  "Document",
  {
    id: uuid("id").notNull().defaultRandom(),
    createdAt: timestamp("createdAt").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    kind: varchar("text", { enum: ["text", "code", "image", "sheet"] })
      .notNull()
      .default("text"),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.id, table.createdAt] }),
    };
  }
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  "Suggestion",
  {
    id: uuid("id").notNull().defaultRandom(),
    documentId: uuid("documentId").notNull(),
    documentCreatedAt: timestamp("documentCreatedAt").notNull(),
    originalText: text("originalText").notNull(),
    suggestedText: text("suggestedText").notNull(),
    description: text("description"),
    isResolved: boolean("isResolved").notNull().default(false),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  })
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = pgTable(
  "Stream",
  {
    id: uuid("id").notNull().defaultRandom(),
    chatId: uuid("chatId").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }).onDelete("cascade"),
  })
);

export type Stream = InferSelectModel<typeof stream>;

// Property Listing Tables (Schema.org RealEstateListing compliant)
export const propertyListing = pgTable(
  "PropertyListing",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    chatId: uuid("chatId").references(() => chat.id),
    name: text("name").notNull(),
    description: text("description").notNull(),
    address: jsonb("address").notNull(), // Schema.org PostalAddress
    price: numeric("price").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
    numberOfRooms: integer("numberOfRooms").notNull(), // bedrooms
    numberOfBathroomsTotal: numeric("numberOfBathroomsTotal").notNull(),
    floorSize: numeric("floorSize").notNull(), // in m²
    propertyType: varchar("propertyType", { length: 50 }), // villa, apartment, etc. [DEPRECATED - use taxonomy fields below]
    propertyTypeId: uuid("propertyTypeId"), // UUID from zyprus.com taxonomy_term--property_type
    locationId: uuid("locationId"), // UUID from zyprus.com node--location
    indoorFeatureIds: uuid("indoorFeatureIds").array(), // UUIDs from zyprus.com taxonomy_term--indoor_property_features
    outdoorFeatureIds: uuid("outdoorFeatureIds").array(), // UUIDs from zyprus.com taxonomy_term--outdoor_property_features
    priceModifierId: uuid("priceModifierId"), // UUID from zyprus.com taxonomy_term--price_modifier
    titleDeedId: uuid("titleDeedId"), // UUID from zyprus.com taxonomy_term--title_deed
    titleDeedNumber: text("titleDeedNumber"), // Actual title deed registration number (for reference ID generation)
    listingTypeId: uuid("listingTypeId"), // UUID from zyprus.com taxonomy_term--listing_type (For Sale, For Rent)
    propertyStatusId: uuid("propertyStatusId"), // UUID from zyprus.com taxonomy_term--property_status (Resale, New Build)
    viewIds: uuid("viewIds").array(), // UUIDs from zyprus.com taxonomy_term--property_views (Sea View, Mountain View)
    yearBuilt: integer("yearBuilt"), // Year the property was built
    referenceId: text("referenceId"), // Internal reference number
    energyClass: varchar("energyClass", { length: 5 }), // Energy efficiency rating (A+, A, B, C, etc.)
    videoUrl: text("videoUrl"), // Property video URL (YouTube, Vimeo)
    phoneNumber: varchar("phoneNumber", { length: 20 }), // Contact phone number
    propertyNotes: text("propertyNotes"), // Internal notes
    duplicateDetected: boolean("duplicateDetected").default(false), // Flag for potential duplicate
    // New fields for Zyprus workflow (Nov 2025)
    ownerName: varchar("ownerName", { length: 256 }), // Property owner or agent name
    ownerPhone: varchar("ownerPhone", { length: 64 }), // Owner/agent phone number
    swimmingPool: varchar("swimmingPool", { length: 32 }), // private, communal, none - REQUIRED
    hasParking: boolean("hasParking"), // Does property have parking?
    hasAirConditioning: boolean("hasAirConditioning"), // Has AC or provisions?
    backofficeNotes: text("backofficeNotes"), // Notes for review team
    googleMapsUrl: text("googleMapsUrl"), // Google Maps link with pin
    verandaArea: real("verandaArea"), // Veranda/outdoor covered area in sqm (deprecated - use coveredVeranda)
    coveredVeranda: real("coveredVeranda"), // Covered veranda area in sqm
    uncoveredVeranda: real("uncoveredVeranda"), // Uncovered veranda area in sqm
    plotArea: real("plotArea"), // Total plot size in sqm (for houses)
    storageRoom: boolean("storageRoom"), // Has storage/utility room
    floor: varchar("floor", { length: 50 }), // Floor level (e.g., '1st Floor', 'Ground Floor')
    condition: varchar("condition", { length: 32 }), // Property condition (excellent, good, needs_renovation)
    hasElevator: boolean("hasElevator"), // Building has elevator
    hasTitleDeeds: boolean("hasTitleDeeds").default(false), // Property has title deeds
    titleDeedDocumentUrl: text("titleDeedDocumentUrl"), // URL to uploaded title deed document
    // Review workflow fields
    reviewStatus: varchar("reviewStatus", { length: 32 }).default("pending"), // pending, approved, rejected
    firstReviewerId: uuid("firstReviewerId"), // First reviewer (usually Lauren)
    secondReviewerId: uuid("secondReviewerId"), // Second reviewer (regional manager)
    submittedByAgentId: uuid("submittedByAgentId"), // Agent who submitted via Telegram/WhatsApp
    reviewNotes: text("reviewNotes"), // Reviewer comments
    reviewedAt: timestamp("reviewedAt"), // When reviewed
    coordinates: jsonb("coordinates").$type<{
      latitude: number;
      longitude: number;
    }>(), // GPS coordinates
    amenityFeature: jsonb("amenityFeature"), // array of features [DEPRECATED - use featureIds above]
    image: jsonb("image"), // array of image URLs
    status: varchar("status", { length: 20 }).notNull().default("draft"), // draft, queued, uploading, uploaded, failed, published
    zyprusListingId: text("zyprusListingId"), // ID from zyprus.com
    zyprusListingUrl: text("zyprusListingUrl"), // public URL
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    publishedAt: timestamp("publishedAt"),
    deletedAt: timestamp("deletedAt"), // soft delete
    draftExpiresAt: timestamp("draftExpiresAt"), // auto-cleanup drafts after 7 days
  },
  (table) => ({
    userIdx: index("PropertyListing_userId_idx").on(table.userId),
    statusIdx: index("PropertyListing_status_idx").on(table.status),
    createdAtIdx: index("PropertyListing_createdAt_idx").on(table.createdAt),
    deletedAtIdx: index("PropertyListing_deletedAt_idx").on(table.deletedAt),
    chatIdIdx: index("PropertyListing_chatId_idx").on(table.chatId),
    locationIdx: index("PropertyListing_locationId_idx").on(table.locationId),
    propertyTypeIdx: index("PropertyListing_propertyTypeId_idx").on(
      table.propertyTypeId
    ),
    // Composite index for user listings queries (userId + status)
    userIdStatusIdx: index("PropertyListing_userId_status_idx").on(
      table.userId,
      table.status
    ),
    // Composite index for user listings sorted by creation date (userId + createdAt DESC)
    userIdCreatedAtIdx: index("PropertyListing_userId_createdAt_idx").on(
      table.userId,
      table.createdAt.desc()
    ),
    // Index for draft cleanup cron job
    draftExpiresAtIdx: index("PropertyListing_draftExpiresAt_idx").on(
      table.draftExpiresAt
    ),
  })
);

export type PropertyListing = InferSelectModel<typeof propertyListing>;

export const listingUploadAttempt = pgTable(
  "ListingUploadAttempt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listingId")
      .notNull()
      .references(() => propertyListing.id),
    attemptNumber: integer("attemptNumber").notNull(),
    status: varchar("status", { length: 20 }).notNull(), // success, failed, timeout, rate_limited
    errorMessage: text("errorMessage"),
    errorCode: text("errorCode"),
    apiResponse: jsonb("apiResponse"),
    attemptedAt: timestamp("attemptedAt").notNull().defaultNow(),
    completedAt: timestamp("completedAt"),
    durationMs: integer("durationMs"),
  },
  (table) => ({
    listingIdx: index("ListingUploadAttempt_listingId_idx").on(table.listingId),
    attemptedAtIdx: index("ListingUploadAttempt_attemptedAt_idx").on(
      table.attemptedAt
    ),
  })
);

export type ListingUploadAttempt = InferSelectModel<
  typeof listingUploadAttempt
>;

// Land Listing Table (for plot/land listings on zyprus.com)
export const landListing = pgTable(
  "LandListing",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    chatId: uuid("chatId").references(() => chat.id),
    name: text("name").notNull(),
    description: text("description").notNull(),
    price: numeric("price").notNull(),
    currency: varchar("currency", { length: 3 }).default("EUR").notNull(),

    // Land-specific fields
    landSize: numeric("landSize").notNull(), // sqm
    landTypeId: uuid("landTypeId").notNull(), // UUID from zyprus.com taxonomy_term--land_type
    locationId: uuid("locationId"), // UUID from zyprus.com node--location
    listingTypeId: uuid("listingTypeId").notNull(), // UUID from zyprus.com taxonomy_term--listing_type
    priceModifierId: uuid("priceModifierId"), // UUID from zyprus.com taxonomy_term--price_modifier
    titleDeedId: uuid("titleDeedId"), // UUID from zyprus.com taxonomy_term--title_deed
    titleDeedNumber: text("titleDeedNumber"), // Actual title deed registration number (for reference ID generation)

    // Owner info (for reference ID generation)
    ownerName: varchar("ownerName", { length: 256 }),
    ownerPhone: varchar("ownerPhone", { length: 64 }),
    ownerEmail: varchar("ownerEmail", { length: 256 }),

    // Building permissions
    buildingDensity: numeric("buildingDensity"), // % density allowed
    siteCoverage: numeric("siteCoverage"), // % site coverage allowed
    maxFloors: integer("maxFloors"), // Max floors allowed
    maxHeight: numeric("maxHeight"), // Max building height in meters

    // Features
    infrastructureIds: uuid("infrastructureIds").array(), // UUIDs from zyprus.com taxonomy_term--infrastructure_
    viewIds: uuid("viewIds").array(), // UUIDs from zyprus.com taxonomy_term--property_views

    // Location
    coordinates: jsonb("coordinates").$type<{
      latitude: number;
      longitude: number;
    }>(),

    // Media
    image: jsonb("image").$type<string[]>(),

    // Optional
    referenceId: text("referenceId"),
    phoneNumber: varchar("phoneNumber", { length: 20 }),
    notes: text("notes"),
    duplicateDetected: boolean("duplicateDetected").default(false),

    // Status
    status: varchar("status", { length: 20 }).default("draft").notNull(),
    zyprusListingId: text("zyprusListingId"),
    zyprusListingUrl: text("zyprusListingUrl"),

    // Timestamps
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
    publishedAt: timestamp("publishedAt"),
    deletedAt: timestamp("deletedAt"),
    draftExpiresAt: timestamp("draftExpiresAt"),
  },
  (table) => ({
    userIdx: index("LandListing_userId_idx").on(table.userId),
    statusIdx: index("LandListing_status_idx").on(table.status),
    createdAtIdx: index("LandListing_createdAt_idx").on(table.createdAt),
    deletedAtIdx: index("LandListing_deletedAt_idx").on(table.deletedAt),
    chatIdIdx: index("LandListing_chatId_idx").on(table.chatId),
    locationIdx: index("LandListing_locationId_idx").on(table.locationId),
    landTypeIdx: index("LandListing_landTypeId_idx").on(table.landTypeId),
    userIdStatusIdx: index("LandListing_userId_status_idx").on(
      table.userId,
      table.status
    ),
    userIdCreatedAtIdx: index("LandListing_userId_createdAt_idx").on(
      table.userId,
      table.createdAt.desc()
    ),
    draftExpiresAtIdx: index("LandListing_draftExpiresAt_idx").on(
      table.draftExpiresAt
    ),
  })
);

export type LandListing = InferSelectModel<typeof landListing>;

// ===================================================================
// ADMIN PANEL TABLES
// ===================================================================

// Admin user roles and permissions (maps to live admin_users table)
export const adminUserRole = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  name: text("name"),
  role: text("role").notNull(), // 'superadmin', 'admin', 'support', 'analyst'
  isActive: boolean("is_active").notNull().default(true),
  permissions: jsonb("permissions"), // granular permissions
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AdminUserRole = InferSelectModel<typeof adminUserRole>;

// Listing uploads tracked by the WhatsApp bot (sophia-bot edge function)
export const listingUpload = pgTable("listing_uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  zyprusListingId: text("zyprus_listing_id").notNull(),
  agentPhone: text("agent_phone").notNull(),
  agentName: text("agent_name").notNull(),
  propertyTitle: text("property_title").notNull(),
  listingUrl: text("listing_url").notNull(),
  status: text("status").notNull().default("draft"), // draft, published, expired
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  price: integer("price"),
  bedrooms: integer("bedrooms"),
});

export type ListingUpload = InferSelectModel<typeof listingUpload>;

// NOTE: Analytics tables (SystemHealthLog, AgentExecutionLog, CalculatorUsageLog,
// AdminAuditLog, DocumentGenerationLog, UserActivitySummary) were removed in quick-12.
// They were never migrated to production. Re-add when analytics feature is implemented.

// ===================================================================
// ZYPRUS AGENT REGISTRY TABLES
// ===================================================================

// ===================================================================
// DOCUMENT SEND TRACKING TABLE
// ===================================================================

// Track documents sent via email/WhatsApp from the web chat
export const documentSend = pgTable(
  "DocumentSend",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    chatId: uuid("chatId").references(() => chat.id),
    // Document details
    documentTitle: varchar("documentTitle", { length: 256 }).notNull(),
    documentUrl: text("documentUrl").notNull(), // Vercel Blob URL
    documentContent: text("documentContent"), // Original content for regeneration
    // Recipient details
    recipientName: varchar("recipientName", { length: 256 }),
    recipientEmail: varchar("recipientEmail", { length: 256 }),
    recipientPhone: varchar("recipientPhone", { length: 64 }),
    // Sending method and status
    method: varchar("method", { length: 20 }).notNull(), // email, whatsapp, download
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, sent, failed, downloaded
    // Optional message to include
    message: text("message"),
    // Tracking
    errorMessage: text("errorMessage"),
    sentAt: timestamp("sentAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("DocumentSend_userId_idx").on(table.userId),
    chatIdIdx: index("DocumentSend_chatId_idx").on(table.chatId),
    statusIdx: index("DocumentSend_status_idx").on(table.status),
    createdAtIdx: index("DocumentSend_createdAt_idx").on(
      table.createdAt.desc()
    ),
  })
);

export type DocumentSend = InferSelectModel<typeof documentSend>;

// ===================================================================
// SUPABASE NATIVE TABLES (snake_case)
// These map to existing Supabase tables for Telegram lead routing
// ===================================================================

export const supabaseAgent = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  mobile: text("mobile"),
  communicationEmail: text("communication_email"),
  listingOwnerEmail: text("listing_owner_email"),
  region: text("region"),
  role: text("role"),
  canUpload: boolean("can_upload").default(true),
  telegramUserId: bigint("telegram_user_id", { mode: "number" }),
  isActive: boolean("is_active").default(true),
  canReceiveLeads: boolean("can_receive_leads").default(true),
  zyprusUserId: uuid("zyprus_user_id"),
  whatsappPhoneNumber: varchar("whatsapp_phone_number", { length: 20 }),
  userId: uuid("user_id"),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SupabaseAgent = InferSelectModel<typeof supabaseAgent>;

export const supabaseTelegramGroup = pgTable("telegram_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: bigint("group_id", { mode: "number" }).notNull().unique(),
  groupName: text("group_name"),
  groupType: text("group_type"),
  region: text("region"),
  isActive: boolean("is_active").default(true),
  leadRoutingEnabled: boolean("lead_routing_enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SupabaseTelegramGroup = InferSelectModel<
  typeof supabaseTelegramGroup
>;

export const supabaseTelegramLead = pgTable("telegram_leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceGroupId: bigint("source_group_id", { mode: "number" }).notNull(),
  sourceGroupName: text("source_group_name"),
  originalMessageId: text("original_message_id").notNull(),
  originalMessageText: text("original_message_text"),
  senderTelegramId: bigint("sender_telegram_id", { mode: "number" }),
  senderName: text("sender_name"),
  propertyReferenceId: text("property_reference_id"),
  propertyRegion: text("property_region"),
  forwardedToAgentId: uuid("forwarded_to_agent_id").references(
    () => supabaseAgent.id
  ),
  forwardedToTelegramId: bigint("forwarded_to_telegram_id", { mode: "number" }),
  forwardedMessageId: bigint("forwarded_message_id", { mode: "number" }),
  groupAckMessageId: bigint("group_ack_message_id", { mode: "number" }),
  clientLanguage: text("client_language"),
  status: text("status").default("new"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SupabaseTelegramLead = InferSelectModel<
  typeof supabaseTelegramLead
>;

// Telegram group message index (for phone number search)
export const supabaseTelegramGroupMessage = pgTable("telegram_group_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupChatId: bigint("group_chat_id", { mode: "number" }).notNull(),
  groupName: text("group_name"),
  messageId: bigint("message_id", { mode: "number" }).notNull(),
  senderTelegramId: bigint("sender_telegram_id", { mode: "number" }),
  senderName: text("sender_name"),
  messageText: text("message_text"),
  messageDate: timestamp("message_date").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SupabaseTelegramGroupMessage = InferSelectModel<
  typeof supabaseTelegramGroupMessage
>;

export const supabaseLeadForwardingRotation = pgTable(
  "lead_forwarding_rotation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    region: text("region").notNull(),
    lastForwardedToAgentId: uuid("last_forwarded_to_agent_id").references(
      () => supabaseAgent.id
    ),
    forwardCount: integer("forward_count").default(0),
    updatedAt: timestamp("updated_at").defaultNow(),
  }
);

export type SupabaseLeadForwardingRotation = InferSelectModel<
  typeof supabaseLeadForwardingRotation
>;

export type { InferInsertModel } from "drizzle-orm";
