-- Migration: Create 4 missing tables (PropertyListing, LandListing, ListingUploadAttempt, DocumentSend)
-- Created: 2026-03-01
-- Source: lib/db/schema.ts (lines 165-381, 268-290, 638-672)
-- Purpose: Align production database to Drizzle schema definitions

-- ===================================================================
-- PropertyListing Table
-- ===================================================================

CREATE TABLE "PropertyListing" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "User"(id),
  "chatId" UUID REFERENCES "Chat"(id),
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "address" JSONB NOT NULL,
  "price" NUMERIC NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
  "numberOfRooms" INTEGER NOT NULL,
  "numberOfBathroomsTotal" NUMERIC NOT NULL,
  "floorSize" NUMERIC NOT NULL,
  "propertyType" VARCHAR(50),
  "propertyTypeId" UUID,
  "locationId" UUID,
  "indoorFeatureIds" UUID[],
  "outdoorFeatureIds" UUID[],
  "priceModifierId" UUID,
  "titleDeedId" UUID,
  "titleDeedNumber" TEXT,
  "listingTypeId" UUID,
  "propertyStatusId" UUID,
  "viewIds" UUID[],
  "yearBuilt" INTEGER,
  "referenceId" TEXT,
  "energyClass" VARCHAR(5),
  "videoUrl" TEXT,
  "phoneNumber" VARCHAR(20),
  "propertyNotes" TEXT,
  "duplicateDetected" BOOLEAN DEFAULT false,
  "ownerName" VARCHAR(256),
  "ownerPhone" VARCHAR(64),
  "swimmingPool" VARCHAR(32),
  "hasParking" BOOLEAN,
  "hasAirConditioning" BOOLEAN,
  "backofficeNotes" TEXT,
  "googleMapsUrl" TEXT,
  "verandaArea" REAL,
  "coveredVeranda" REAL,
  "uncoveredVeranda" REAL,
  "plotArea" REAL,
  "storageRoom" BOOLEAN,
  "floor" VARCHAR(50),
  "condition" VARCHAR(32),
  "hasElevator" BOOLEAN,
  "hasTitleDeeds" BOOLEAN DEFAULT false,
  "titleDeedDocumentUrl" TEXT,
  "reviewStatus" VARCHAR(32) DEFAULT 'pending',
  "firstReviewerId" UUID,
  "secondReviewerId" UUID,
  "submittedByAgentId" UUID,
  "reviewNotes" TEXT,
  "reviewedAt" TIMESTAMP WITH TIME ZONE,
  "coordinates" JSONB,
  "amenityFeature" JSONB,
  "image" JSONB,
  "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
  "zyprusListingId" TEXT,
  "zyprusListingUrl" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "publishedAt" TIMESTAMP WITH TIME ZONE,
  "deletedAt" TIMESTAMP WITH TIME ZONE,
  "draftExpiresAt" TIMESTAMP WITH TIME ZONE
);

-- PropertyListing indexes
CREATE INDEX "PropertyListing_userId_idx" ON "PropertyListing"("userId");
CREATE INDEX "PropertyListing_status_idx" ON "PropertyListing"("status");
CREATE INDEX "PropertyListing_createdAt_idx" ON "PropertyListing"("createdAt");
CREATE INDEX "PropertyListing_deletedAt_idx" ON "PropertyListing"("deletedAt");
CREATE INDEX "PropertyListing_chatId_idx" ON "PropertyListing"("chatId");
CREATE INDEX "PropertyListing_locationId_idx" ON "PropertyListing"("locationId");
CREATE INDEX "PropertyListing_propertyTypeId_idx" ON "PropertyListing"("propertyTypeId");
CREATE INDEX "PropertyListing_userId_status_idx" ON "PropertyListing"("userId", "status");
CREATE INDEX "PropertyListing_userId_createdAt_idx" ON "PropertyListing"("userId", "createdAt" DESC);
CREATE INDEX "PropertyListing_draftExpiresAt_idx" ON "PropertyListing"("draftExpiresAt");

-- PropertyListing RLS
ALTER TABLE "PropertyListing" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own listings" ON "PropertyListing"
  FOR SELECT USING (auth.uid() = "userId");

CREATE POLICY "Users can insert own listings" ON "PropertyListing"
  FOR INSERT WITH CHECK (auth.uid() = "userId");

CREATE POLICY "Users can update own listings" ON "PropertyListing"
  FOR UPDATE USING (auth.uid() = "userId");

CREATE POLICY "Users can delete own listings" ON "PropertyListing"
  FOR DELETE USING (auth.uid() = "userId");

-- ===================================================================
-- LandListing Table
-- ===================================================================

CREATE TABLE "LandListing" (
  "id" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "User"(id),
  "chatId" UUID REFERENCES "Chat"(id),
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "price" NUMERIC NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
  "landSize" NUMERIC NOT NULL,
  "landTypeId" UUID NOT NULL,
  "locationId" UUID,
  "listingTypeId" UUID NOT NULL,
  "priceModifierId" UUID,
  "titleDeedId" UUID,
  "titleDeedNumber" TEXT,
  "ownerName" VARCHAR(256),
  "ownerPhone" VARCHAR(64),
  "ownerEmail" VARCHAR(256),
  "buildingDensity" NUMERIC,
  "siteCoverage" NUMERIC,
  "maxFloors" INTEGER,
  "maxHeight" NUMERIC,
  "infrastructureIds" UUID[],
  "viewIds" UUID[],
  "coordinates" JSONB,
  "image" JSONB,
  "referenceId" TEXT,
  "phoneNumber" VARCHAR(20),
  "notes" TEXT,
  "duplicateDetected" BOOLEAN DEFAULT false,
  "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
  "zyprusListingId" TEXT,
  "zyprusListingUrl" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "publishedAt" TIMESTAMP WITH TIME ZONE,
  "deletedAt" TIMESTAMP WITH TIME ZONE,
  "draftExpiresAt" TIMESTAMP WITH TIME ZONE
);

-- LandListing indexes
CREATE INDEX "LandListing_userId_idx" ON "LandListing"("userId");
CREATE INDEX "LandListing_status_idx" ON "LandListing"("status");
CREATE INDEX "LandListing_createdAt_idx" ON "LandListing"("createdAt");
CREATE INDEX "LandListing_deletedAt_idx" ON "LandListing"("deletedAt");
CREATE INDEX "LandListing_chatId_idx" ON "LandListing"("chatId");
CREATE INDEX "LandListing_locationId_idx" ON "LandListing"("locationId");
CREATE INDEX "LandListing_landTypeId_idx" ON "LandListing"("landTypeId");
CREATE INDEX "LandListing_userId_status_idx" ON "LandListing"("userId", "status");
CREATE INDEX "LandListing_userId_createdAt_idx" ON "LandListing"("userId", "createdAt" DESC);
CREATE INDEX "LandListing_draftExpiresAt_idx" ON "LandListing"("draftExpiresAt");

-- LandListing RLS
ALTER TABLE "LandListing" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own land listings" ON "LandListing"
  FOR SELECT USING (auth.uid() = "userId");

CREATE POLICY "Users can insert own land listings" ON "LandListing"
  FOR INSERT WITH CHECK (auth.uid() = "userId");

CREATE POLICY "Users can update own land listings" ON "LandListing"
  FOR UPDATE USING (auth.uid() = "userId");

CREATE POLICY "Users can delete own land listings" ON "LandListing"
  FOR DELETE USING (auth.uid() = "userId");

-- ===================================================================
-- ListingUploadAttempt Table
-- ===================================================================

CREATE TABLE "ListingUploadAttempt" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "listingId" UUID NOT NULL REFERENCES "PropertyListing"(id),
  "attemptNumber" INTEGER NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "errorMessage" TEXT,
  "errorCode" TEXT,
  "apiResponse" JSONB,
  "attemptedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "completedAt" TIMESTAMP WITH TIME ZONE,
  "durationMs" INTEGER
);

-- ListingUploadAttempt indexes
CREATE INDEX "ListingUploadAttempt_listingId_idx" ON "ListingUploadAttempt"("listingId");
CREATE INDEX "ListingUploadAttempt_attemptedAt_idx" ON "ListingUploadAttempt"("attemptedAt");

-- ListingUploadAttempt RLS
ALTER TABLE "ListingUploadAttempt" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view upload attempts for own listings" ON "ListingUploadAttempt"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "PropertyListing"
      WHERE "PropertyListing".id = "ListingUploadAttempt"."listingId"
      AND "PropertyListing"."userId" = auth.uid()
    )
  );

-- ===================================================================
-- DocumentSend Table
-- ===================================================================

CREATE TABLE "DocumentSend" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "User"(id),
  "chatId" UUID REFERENCES "Chat"(id),
  "documentTitle" VARCHAR(256) NOT NULL,
  "documentUrl" TEXT NOT NULL,
  "documentContent" TEXT,
  "recipientName" VARCHAR(256),
  "recipientEmail" VARCHAR(256),
  "recipientPhone" VARCHAR(64),
  "method" VARCHAR(20) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "message" TEXT,
  "errorMessage" TEXT,
  "sentAt" TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- DocumentSend indexes
CREATE INDEX "DocumentSend_userId_idx" ON "DocumentSend"("userId");
CREATE INDEX "DocumentSend_chatId_idx" ON "DocumentSend"("chatId");
CREATE INDEX "DocumentSend_status_idx" ON "DocumentSend"("status");
CREATE INDEX "DocumentSend_createdAt_idx" ON "DocumentSend"("createdAt" DESC);

-- DocumentSend RLS
ALTER TABLE "DocumentSend" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own documents" ON "DocumentSend"
  FOR SELECT USING (auth.uid() = "userId");

CREATE POLICY "Users can insert own documents" ON "DocumentSend"
  FOR INSERT WITH CHECK (auth.uid() = "userId");

CREATE POLICY "Users can update own documents" ON "DocumentSend"
  FOR UPDATE USING (auth.uid() = "userId");

CREATE POLICY "Users can delete own documents" ON "DocumentSend"
  FOR DELETE USING (auth.uid() = "userId");
