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
  password: varchar("password", { length: 64 }),
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

// Admin user roles and permissions
export const adminUserRole = pgTable("AdminUserRole", {
  userId: uuid("userId")
    .primaryKey()
    .notNull()
    .references(() => user.id),
  role: varchar("role", { length: 20 }).notNull(), // 'superadmin', 'admin', 'support', 'analyst'
  permissions: jsonb("permissions"), // granular permissions
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  createdBy: uuid("createdBy").references(() => user.id),
});

export type AdminUserRole = InferSelectModel<typeof adminUserRole>;

// System health logs
export const systemHealthLog = pgTable(
  "SystemHealthLog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    timestamp: timestamp("timestamp").notNull().defaultNow(),
    service: varchar("service", { length: 50 }).notNull(), // 'telegram', 'whatsapp', 'zyprus', 'ai_gateway', 'database', 'redis'
    status: varchar("status", { length: 20 }).notNull(), // 'healthy', 'degraded', 'down'
    responseTimeMs: integer("responseTimeMs"),
    errorRate: numeric("errorRate"), // percentage
    metrics: jsonb("metrics"), // service-specific metrics
    details: text("details"),
  },
  (table) => ({
    timestampIdx: index("SystemHealthLog_timestamp_idx").on(table.timestamp),
    serviceIdx: index("SystemHealthLog_service_idx").on(table.service),
    statusIdx: index("SystemHealthLog_status_idx").on(table.status),
    // Composite index for service health queries (service + timestamp DESC)
    serviceTimestampIdx: index("SystemHealthLog_service_timestamp_idx").on(
      table.service,
      table.timestamp.desc()
    ),
  })
);

export type SystemHealthLog = InferSelectModel<typeof systemHealthLog>;

// Agent execution logs (tracks AI agent interactions)
export const agentExecutionLog = pgTable(
  "AgentExecutionLog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    timestamp: timestamp("timestamp").notNull().defaultNow(),
    agentType: varchar("agentType", { length: 50 }).notNull(), // 'chat', 'telegram', 'whatsapp', 'bmad'
    userId: uuid("userId").references(() => user.id),
    chatId: uuid("chatId").references(() => chat.id),
    action: varchar("action", { length: 100 }).notNull(), // 'document_generation', 'calculator_usage', 'property_listing', etc.
    durationMs: integer("durationMs"),
    tokensUsed: integer("tokensUsed"),
    modelUsed: varchar("modelUsed", { length: 50 }), // 'chat-model', 'chat-model-sonnet', etc.
    costUsd: numeric("costUsd", { precision: 10, scale: 6 }),
    success: boolean("success").notNull(),
    errorMessage: text("errorMessage"),
    metadata: jsonb("metadata"), // additional context
  },
  (table) => ({
    timestampIdx: index("AgentExecutionLog_timestamp_idx").on(table.timestamp),
    agentTypeIdx: index("AgentExecutionLog_agentType_idx").on(table.agentType),
    userIdIdx: index("AgentExecutionLog_userId_idx").on(table.userId),
    successIdx: index("AgentExecutionLog_success_idx").on(table.success),
    // Composite index for agent performance queries (agentType + timestamp DESC)
    agentTypeTimestampIdx: index(
      "AgentExecutionLog_agentType_timestamp_idx"
    ).on(table.agentType, table.timestamp.desc()),
  })
);

export type AgentExecutionLog = InferSelectModel<typeof agentExecutionLog>;

// Calculator usage tracking
export const calculatorUsageLog = pgTable(
  "CalculatorUsageLog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    timestamp: timestamp("timestamp").notNull().defaultNow(),
    calculatorType: varchar("calculatorType", { length: 50 }).notNull(), // 'vat', 'transfer_fees', 'capital_gains'
    userId: uuid("userId").references(() => user.id),
    inputs: jsonb("inputs").notNull(), // calculator inputs
    outputs: jsonb("outputs").notNull(), // calculator results
    source: varchar("source", { length: 20 }).notNull(), // 'web', 'telegram', 'whatsapp'
  },
  (table) => ({
    timestampIdx: index("CalculatorUsageLog_timestamp_idx").on(table.timestamp),
    calculatorTypeIdx: index("CalculatorUsageLog_calculatorType_idx").on(
      table.calculatorType
    ),
    userIdIdx: index("CalculatorUsageLog_userId_idx").on(table.userId),
    sourceIdx: index("CalculatorUsageLog_source_idx").on(table.source),
  })
);

export type CalculatorUsageLog = InferSelectModel<typeof calculatorUsageLog>;

// Admin audit logs (track admin actions)
export const adminAuditLog = pgTable(
  "AdminAuditLog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminUserId: uuid("adminUserId")
      .notNull()
      .references(() => user.id),
    action: varchar("action", { length: 100 }).notNull(), // 'user_banned', 'config_changed', 'deployment_triggered', etc.
    targetType: varchar("targetType", { length: 50 }), // 'user', 'integration', 'system', etc.
    targetId: uuid("targetId"), // ID of affected resource
    changes: jsonb("changes"), // before/after values
    ipAddress: varchar("ipAddress", { length: 45 }), // IPv4 or IPv6
    userAgent: text("userAgent"),
    timestamp: timestamp("timestamp").notNull().defaultNow(),
  },
  (table) => ({
    timestampIdx: index("AdminAuditLog_timestamp_idx").on(table.timestamp),
    adminUserIdIdx: index("AdminAuditLog_adminUserId_idx").on(
      table.adminUserId
    ),
    actionIdx: index("AdminAuditLog_action_idx").on(table.action),
    targetTypeIdx: index("AdminAuditLog_targetType_idx").on(table.targetType),
  })
);

export type AdminAuditLog = InferSelectModel<typeof adminAuditLog>;

// Document generation tracking (for analytics)
export const documentGenerationLog = pgTable(
  "DocumentGenerationLog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    timestamp: timestamp("timestamp").notNull().defaultNow(),
    userId: uuid("userId").references(() => user.id),
    chatId: uuid("chatId").references(() => chat.id),
    templateType: varchar("templateType", { length: 50 }).notNull(), // 'registration', 'viewing', 'marketing', etc.
    templateName: varchar("templateName", { length: 100 }), // specific template
    source: varchar("source", { length: 20 }).notNull(), // 'web', 'telegram', 'whatsapp'
    success: boolean("success").notNull(),
    errorMessage: text("errorMessage"),
    durationMs: integer("durationMs"),
  },
  (table) => ({
    timestampIdx: index("DocumentGenerationLog_timestamp_idx").on(
      table.timestamp
    ),
    templateTypeIdx: index("DocumentGenerationLog_templateType_idx").on(
      table.templateType
    ),
    userIdIdx: index("DocumentGenerationLog_userId_idx").on(table.userId),
    sourceIdx: index("DocumentGenerationLog_source_idx").on(table.source),
  })
);

export type DocumentGenerationLog = InferSelectModel<
  typeof documentGenerationLog
>;

// User activity summary (daily aggregated stats)
export const userActivitySummary = pgTable(
  "UserActivitySummary",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    date: timestamp("date").notNull(), // date without time component
    messageCount: integer("messageCount").notNull().default(0),
    documentCount: integer("documentCount").notNull().default(0),
    calculatorCount: integer("calculatorCount").notNull().default(0),
    listingCount: integer("listingCount").notNull().default(0),
    totalTokensUsed: integer("totalTokensUsed").notNull().default(0),
    totalCostUsd: numeric("totalCostUsd", { precision: 10, scale: 6 })
      .notNull()
      .default("0"),
    channels: jsonb("channels"), // breakdown by channel (web, telegram, whatsapp)
  },
  (table) => ({
    userIdDateIdx: index("UserActivitySummary_userId_date_idx").on(
      table.userId,
      table.date.desc()
    ),
    dateIdx: index("UserActivitySummary_date_idx").on(table.date),
  })
);

export type UserActivitySummary = InferSelectModel<typeof userActivitySummary>;

// ===================================================================
// ZYPRUS AGENT REGISTRY TABLES
// ===================================================================

// Zyprus employee registry (real estate agents working with SOFIA)
export const zyprusAgent = pgTable(
  "ZyprusAgent",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("userId").references(() => user.id), // Optional - set after agent registers
    fullName: text("fullName").notNull(), // Agent full name
    email: varchar("email", { length: 255 }).notNull().unique(),
    listingOwnerEmail: varchar("listingOwnerEmail", { length: 255 }), // Different email for Zyprus listing ownership (null = same as email)
    phoneNumber: varchar("phoneNumber", { length: 20 }), // Cyprus mobile: +357 XX XXX XXX
    region: varchar("region", { length: 50 }).notNull(), // Limassol, Paphos, Larnaca, Famagusta, Nicosia, All
    role: varchar("role", { length: 50 }).notNull(), // CEO, Manager Limassol, Manager Paphos, Normal Agent, Listing Admin
    isActive: boolean("isActive").notNull().default(true),
    canReceiveLeads: boolean("canReceiveLeads").notNull().default(true), // Whether agent can receive forwarded leads
    telegramUserId: varchar("telegramUserId", { length: 64 }), // Telegram user ID (string for compatibility)
    whatsappPhoneNumber: varchar("whatsappPhoneNumber", { length: 20 }), // For WhatsApp identification
    lastActiveAt: timestamp("lastActiveAt"),
    registeredAt: timestamp("registeredAt"), // When they completed registration
    inviteSentAt: timestamp("inviteSentAt"), // When invite email was sent
    inviteToken: varchar("inviteToken", { length: 64 }), // Invite verification token
    notes: text("notes"), // Admin notes
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: index("ZyprusAgent_email_idx").on(table.email),
    phoneNumberIdx: index("ZyprusAgent_phoneNumber_idx").on(table.phoneNumber),
    regionIdx: index("ZyprusAgent_region_idx").on(table.region),
    roleIdx: index("ZyprusAgent_role_idx").on(table.role),
    isActiveIdx: index("ZyprusAgent_isActive_idx").on(table.isActive),
    telegramIdx: index("ZyprusAgent_telegramUserId_idx").on(
      table.telegramUserId
    ),
    whatsappIdx: index("ZyprusAgent_whatsappPhoneNumber_idx").on(
      table.whatsappPhoneNumber
    ),
    userIdIdx: index("ZyprusAgent_userId_idx").on(table.userId),
    inviteTokenIdx: index("ZyprusAgent_inviteToken_idx").on(table.inviteToken),
    // Composite index for regional queries (region + isActive)
    regionActiveIdx: index("ZyprusAgent_region_isActive_idx").on(
      table.region,
      table.isActive
    ),
  })
);

export type ZyprusAgent = InferSelectModel<typeof zyprusAgent>;

// Agent chat session tracking (multi-platform)
export const agentChatSession = pgTable(
  "AgentChatSession",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agentId")
      .notNull()
      .references(() => zyprusAgent.id, { onDelete: "cascade" }),
    chatId: uuid("chatId").references(() => chat.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 20 }).notNull(), // 'web', 'telegram', 'whatsapp'
    platformUserId: text("platformUserId"), // Telegram user ID, WhatsApp phone, or web session ID
    startedAt: timestamp("startedAt").notNull().defaultNow(),
    endedAt: timestamp("endedAt"),
    messageCount: integer("messageCount").default(0),
    documentCount: integer("documentCount").default(0),
    calculatorCount: integer("calculatorCount").default(0),
    listingCount: integer("listingCount").default(0),
    totalTokensUsed: integer("totalTokensUsed").default(0),
    totalCostUsd: numeric("totalCostUsd", { precision: 10, scale: 6 }).default(
      "0"
    ),
    metadata: jsonb("metadata"), // session-specific data
  },
  (table) => ({
    agentIdIdx: index("AgentChatSession_agentId_idx").on(table.agentId),
    chatIdIdx: index("AgentChatSession_chatId_idx").on(table.chatId),
    platformIdx: index("AgentChatSession_platform_idx").on(table.platform),
    startedAtIdx: index("AgentChatSession_startedAt_idx").on(
      table.startedAt.desc()
    ),
    // Composite index for agent activity queries (agentId + startedAt DESC)
    agentIdStartedAtIdx: index("AgentChatSession_agentId_startedAt_idx").on(
      table.agentId,
      table.startedAt.desc()
    ),
    // Composite index for platform analytics (platform + startedAt DESC)
    platformStartedAtIdx: index("AgentChatSession_platform_startedAt_idx").on(
      table.platform,
      table.startedAt.desc()
    ),
  })
);

export type AgentChatSession = InferSelectModel<typeof agentChatSession>;

// ===================================================================
// TELEGRAM LEAD MANAGEMENT TABLES
// ===================================================================

// Telegram group configuration (for lead monitoring)
export const telegramGroup = pgTable(
  "TelegramGroup",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: bigint("groupId", { mode: "number" }).notNull().unique(), // Telegram group chat ID
    groupName: varchar("groupName", { length: 256 }).notNull(), // ZyprusAlla, ZyprusLimassol, etc.
    groupType: varchar("groupType", { length: 32 }).notNull(), // all, limassol, paphos, others
    region: varchar("region", { length: 50 }), // Associated region for routing
    isActive: boolean("isActive").notNull().default(true),
    leadRoutingEnabled: boolean("leadRoutingEnabled").notNull().default(true),
    defaultForwardTo: uuid("defaultForwardTo").references(() => zyprusAgent.id), // Default agent to forward leads
    alternateForwardTo: uuid("alternateForwardTo").references(
      () => zyprusAgent.id
    ), // Alternate agent (for rotation)
    lastMessageAt: timestamp("lastMessageAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    groupIdIdx: index("TelegramGroup_groupId_idx").on(table.groupId),
    groupTypeIdx: index("TelegramGroup_groupType_idx").on(table.groupType),
    regionIdx: index("TelegramGroup_region_idx").on(table.region),
    isActiveIdx: index("TelegramGroup_isActive_idx").on(table.isActive),
  })
);

export type TelegramGroup = InferSelectModel<typeof telegramGroup>;

// Telegram lead tracking (for forwarded leads from groups)
export const telegramLead = pgTable(
  "TelegramLead",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Source information
    sourceGroupId: bigint("sourceGroupId", { mode: "number" }).notNull(), // Which Telegram group
    sourceGroupName: varchar("sourceGroupName", { length: 256 }),
    originalMessageId: varchar("originalMessageId", { length: 64 }), // Telegram message ID
    originalMessageText: text("originalMessageText"), // Full message content
    senderTelegramId: bigint("senderTelegramId", { mode: "number" }), // Who posted in group
    senderName: varchar("senderName", { length: 256 }), // Name of sender
    // Property information (extracted from message)
    propertyReferenceId: varchar("propertyReferenceId", { length: 64 }), // ZYP-1234 extracted
    propertyUrl: text("propertyUrl"), // zyprus.com link if found
    propertyTitle: text("propertyTitle"), // From lookup
    propertyRegion: varchar("propertyRegion", { length: 50 }), // Determined from lookup
    propertyOwnerId: uuid("propertyOwnerId").references(() => zyprusAgent.id), // Listing owner
    // Client information (extracted from message)
    clientName: varchar("clientName", { length: 256 }),
    clientPhone: varchar("clientPhone", { length: 64 }),
    clientEmail: varchar("clientEmail", { length: 256 }),
    clientLanguage: varchar("clientLanguage", { length: 20 }), // russian, english, greek, etc.
    // Forwarding information
    forwardedToAgentId: uuid("forwardedToAgentId").references(
      () => zyprusAgent.id
    ),
    forwardedToTelegramId: bigint("forwardedToTelegramId", { mode: "number" }),
    forwardedToName: varchar("forwardedToName", { length: 256 }),
    forwardedMessageId: varchar("forwardedMessageId", { length: 64 }), // ID of forwarded message
    groupAckMessageId: varchar("groupAckMessageId", { length: 64 }), // ID of "Lead forwarded" message
    // Status
    status: varchar("status", { length: 32 }).notNull().default("forwarded"), // forwarded, contacted, closed, failed
    errorMessage: text("errorMessage"), // If forwarding failed
    // Follow-up
    agentResponseAt: timestamp("agentResponseAt"), // When agent responded to client
    closedAt: timestamp("closedAt"),
    closedReason: varchar("closedReason", { length: 100 }), // sold, not_interested, no_response, etc.
    notes: text("notes"),
    // Timestamps
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    sourceGroupIdIdx: index("TelegramLead_sourceGroupId_idx").on(
      table.sourceGroupId
    ),
    propertyRefIdx: index("TelegramLead_propertyReferenceId_idx").on(
      table.propertyReferenceId
    ),
    forwardedToIdx: index("TelegramLead_forwardedToAgentId_idx").on(
      table.forwardedToAgentId
    ),
    statusIdx: index("TelegramLead_status_idx").on(table.status),
    createdAtIdx: index("TelegramLead_createdAt_idx").on(
      table.createdAt.desc()
    ),
    // Composite index for agent lead queries
    agentStatusIdx: index("TelegramLead_agent_status_idx").on(
      table.forwardedToAgentId,
      table.status
    ),
    // Composite index for group analytics
    groupCreatedAtIdx: index("TelegramLead_group_createdAt_idx").on(
      table.sourceGroupId,
      table.createdAt.desc()
    ),
  })
);

export type TelegramLead = InferSelectModel<typeof telegramLead>;

// Lead forwarding rotation tracker (for fair distribution)
export const leadForwardingRotation = pgTable(
  "LeadForwardingRotation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    region: varchar("region", { length: 50 }).notNull().unique(), // limassol, paphos, etc.
    lastForwardedToAgentId: uuid("lastForwardedToAgentId").references(
      () => zyprusAgent.id
    ),
    forwardCount: integer("forwardCount").notNull().default(0),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    regionIdx: index("LeadForwardingRotation_region_idx").on(table.region),
  })
);

export type LeadForwardingRotation = InferSelectModel<
  typeof leadForwardingRotation
>;

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

export type SupabaseTelegramGroup = InferSelectModel<typeof supabaseTelegramGroup>;

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
  forwardedToAgentId: uuid("forwarded_to_agent_id").references(() => supabaseAgent.id),
  forwardedToTelegramId: bigint("forwarded_to_telegram_id", { mode: "number" }),
  forwardedMessageId: bigint("forwarded_message_id", { mode: "number" }),
  groupAckMessageId: bigint("group_ack_message_id", { mode: "number" }),
  clientLanguage: text("client_language"),
  status: text("status").default("new"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SupabaseTelegramLead = InferSelectModel<typeof supabaseTelegramLead>;

export const supabaseLeadForwardingRotation = pgTable("lead_forwarding_rotation", {
  id: uuid("id").primaryKey().defaultRandom(),
  region: text("region").notNull(),
  lastForwardedToAgentId: uuid("last_forwarded_to_agent_id").references(() => supabaseAgent.id),
  forwardCount: integer("forward_count").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type SupabaseLeadForwardingRotation = InferSelectModel<typeof supabaseLeadForwardingRotation>;

export type { InferInsertModel } from "drizzle-orm";
