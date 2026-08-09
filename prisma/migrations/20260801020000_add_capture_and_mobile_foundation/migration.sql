ALTER TABLE "product_intelligence_observations"
  ADD COLUMN "captureId" TEXT,
  ADD COLUMN "sourceListingId" TEXT,
  ADD COLUMN "sourceSnapshotId" TEXT;

CREATE TABLE "companion_devices" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "clientKind" TEXT NOT NULL DEFAULT 'MOBILE_PWA',
  "tokenHash" TEXT,
  "scopes" JSONB,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "companion_devices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_intelligence_captures" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT,
  "idempotencyKey" TEXT,
  "captureType" TEXT NOT NULL DEFAULT 'MANUAL',
  "businessIntent" TEXT NOT NULL DEFAULT 'UNDECIDED',
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "sourceUrl" TEXT,
  "normalizedUrl" TEXT,
  "sourceText" TEXT,
  "platformName" TEXT,
  "externalListingId" TEXT,
  "title" TEXT,
  "amount" DECIMAL(19,4),
  "currency" TEXT,
  "conditionText" TEXT,
  "visibility" TEXT NOT NULL DEFAULT 'ORGANIZATION',
  "rawPayload" JSONB,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "importedAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "duplicateOfId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_intelligence_captures_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mobile_assets" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "captureId" TEXT,
  "storageKey" TEXT NOT NULL,
  "publicUrl" TEXT,
  "mimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "sha256" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "completedAt" TIMESTAMP(3),
  "abortedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mobile_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "source_listings" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "captureId" TEXT,
  "platformName" TEXT NOT NULL,
  "externalListingId" TEXT,
  "sourceUrl" TEXT,
  "normalizedUrl" TEXT,
  "sellerName" TEXT,
  "title" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "source_listings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "source_listing_snapshots" (
  "id" TEXT NOT NULL,
  "sourceListingId" TEXT NOT NULL,
  "captureId" TEXT,
  "contentHash" TEXT NOT NULL,
  "title" TEXT,
  "description" TEXT,
  "amount" DECIMAL(19,4),
  "currency" TEXT,
  "conditionText" TEXT,
  "pageStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
  "rawPayload" JSONB,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "source_listing_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "capture_purchase_drafts" (
  "id" TEXT NOT NULL,
  "captureId" TEXT NOT NULL,
  "supplierName" TEXT,
  "platformName" TEXT,
  "externalOrderNo" TEXT,
  "currency" TEXT NOT NULL,
  "shippingFee" DECIMAL(19,4),
  "purchasedAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "capture_purchase_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "capture_purchase_lines" (
  "id" TEXT NOT NULL,
  "draftId" TEXT NOT NULL,
  "itemId" TEXT,
  "productName" TEXT NOT NULL,
  "variant" TEXT,
  "conditionType" TEXT,
  "quantity" DECIMAL(19,4) NOT NULL,
  "unitPrice" DECIMAL(19,4) NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "capture_purchase_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "capture_business_links" (
  "id" TEXT NOT NULL,
  "captureId" TEXT NOT NULL,
  "refType" TEXT NOT NULL,
  "refId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "capture_business_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "extracted_claims" (
  "id" TEXT NOT NULL,
  "captureId" TEXT NOT NULL,
  "fieldName" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "evidenceText" TEXT,
  "confidence" DECIMAL(5,4),
  "extractor" TEXT NOT NULL,
  "extractorVersion" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "extracted_claims_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "match_candidates" (
  "id" TEXT NOT NULL,
  "captureId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "score" DECIMAL(5,4) NOT NULL,
  "reasons" JSONB,
  "matcher" TEXT NOT NULL,
  "matcherVersion" TEXT,
  "decision" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "match_candidates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "companion_devices_tokenHash_key" ON "companion_devices"("tokenHash");
CREATE INDEX "companion_devices_organizationId_userId_idx" ON "companion_devices"("organizationId", "userId");
CREATE INDEX "companion_devices_revokedAt_idx" ON "companion_devices"("revokedAt");
CREATE UNIQUE INDEX "product_intelligence_captures_organizationId_userId_idempotencyKey_key" ON "product_intelligence_captures"("organizationId", "userId", "idempotencyKey");
CREATE INDEX "product_intelligence_captures_organizationId_storeId_status_idx" ON "product_intelligence_captures"("organizationId", "storeId", "status");
CREATE INDEX "product_intelligence_captures_businessIntent_capturedAt_idx" ON "product_intelligence_captures"("businessIntent", "capturedAt");
CREATE INDEX "product_intelligence_captures_platformName_externalListingId_idx" ON "product_intelligence_captures"("platformName", "externalListingId");
CREATE INDEX "product_intelligence_captures_duplicateOfId_idx" ON "product_intelligence_captures"("duplicateOfId");
CREATE INDEX "mobile_assets_organizationId_userId_idx" ON "mobile_assets"("organizationId", "userId");
CREATE INDEX "mobile_assets_captureId_idx" ON "mobile_assets"("captureId");
CREATE INDEX "mobile_assets_status_idx" ON "mobile_assets"("status");
CREATE INDEX "source_listings_organizationId_storeId_idx" ON "source_listings"("organizationId", "storeId");
CREATE INDEX "source_listings_platformName_externalListingId_idx" ON "source_listings"("platformName", "externalListingId");
CREATE INDEX "source_listings_normalizedUrl_idx" ON "source_listings"("normalizedUrl");
CREATE INDEX "source_listings_captureId_idx" ON "source_listings"("captureId");
CREATE UNIQUE INDEX "source_listing_snapshots_sourceListingId_contentHash_key" ON "source_listing_snapshots"("sourceListingId", "contentHash");
CREATE INDEX "source_listing_snapshots_captureId_idx" ON "source_listing_snapshots"("captureId");
CREATE INDEX "source_listing_snapshots_observedAt_idx" ON "source_listing_snapshots"("observedAt");
CREATE UNIQUE INDEX "capture_purchase_drafts_captureId_key" ON "capture_purchase_drafts"("captureId");
CREATE INDEX "capture_purchase_drafts_platformName_externalOrderNo_idx" ON "capture_purchase_drafts"("platformName", "externalOrderNo");
CREATE INDEX "capture_purchase_lines_draftId_idx" ON "capture_purchase_lines"("draftId");
CREATE INDEX "capture_purchase_lines_itemId_idx" ON "capture_purchase_lines"("itemId");
CREATE UNIQUE INDEX "capture_business_links_captureId_refType_refId_key" ON "capture_business_links"("captureId", "refType", "refId");
CREATE INDEX "capture_business_links_refType_refId_idx" ON "capture_business_links"("refType", "refId");
CREATE INDEX "extracted_claims_captureId_fieldName_idx" ON "extracted_claims"("captureId", "fieldName");
CREATE UNIQUE INDEX "match_candidates_captureId_itemId_matcher_matcherVersion_key" ON "match_candidates"("captureId", "itemId", "matcher", "matcherVersion");
CREATE INDEX "match_candidates_captureId_score_idx" ON "match_candidates"("captureId", "score");
CREATE INDEX "match_candidates_itemId_idx" ON "match_candidates"("itemId");
CREATE INDEX "product_intelligence_observations_captureId_idx" ON "product_intelligence_observations"("captureId");
CREATE INDEX "product_intelligence_observations_sourceListingId_idx" ON "product_intelligence_observations"("sourceListingId");
CREATE INDEX "product_intelligence_observations_sourceSnapshotId_idx" ON "product_intelligence_observations"("sourceSnapshotId");

ALTER TABLE "product_intelligence_captures" ADD CONSTRAINT "product_intelligence_captures_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "product_intelligence_captures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mobile_assets" ADD CONSTRAINT "mobile_assets_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "product_intelligence_captures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "source_listings" ADD CONSTRAINT "source_listings_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "product_intelligence_captures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "source_listing_snapshots" ADD CONSTRAINT "source_listing_snapshots_sourceListingId_fkey" FOREIGN KEY ("sourceListingId") REFERENCES "source_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_listing_snapshots" ADD CONSTRAINT "source_listing_snapshots_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "product_intelligence_captures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "capture_purchase_drafts" ADD CONSTRAINT "capture_purchase_drafts_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "product_intelligence_captures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "capture_purchase_lines" ADD CONSTRAINT "capture_purchase_lines_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "capture_purchase_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "capture_business_links" ADD CONSTRAINT "capture_business_links_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "product_intelligence_captures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "extracted_claims" ADD CONSTRAINT "extracted_claims_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "product_intelligence_captures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "match_candidates" ADD CONSTRAINT "match_candidates_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "product_intelligence_captures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_intelligence_observations" ADD CONSTRAINT "product_intelligence_observations_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "product_intelligence_captures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_intelligence_observations" ADD CONSTRAINT "product_intelligence_observations_sourceListingId_fkey" FOREIGN KEY ("sourceListingId") REFERENCES "source_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_intelligence_observations" ADD CONSTRAINT "product_intelligence_observations_sourceSnapshotId_fkey" FOREIGN KEY ("sourceSnapshotId") REFERENCES "source_listing_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
