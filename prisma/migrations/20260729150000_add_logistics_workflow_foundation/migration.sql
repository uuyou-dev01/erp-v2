-- These operational tables existed in the application schema before their first
-- ALTER/INDEX migrations, but were missing from migration history. Creating them
-- here restores a valid fresh `prisma migrate deploy` sequence.
CREATE TABLE "organizations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

ALTER TABLE "stores" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "locations" ADD COLUMN "region" TEXT;
ALTER TABLE "platforms"
  ADD COLUMN "country" TEXT,
  ADD COLUMN "defaultFeeRate" DECIMAL(8,4),
  ADD COLUMN "defaultCurrency" TEXT,
  ADD COLUMN "defaultShippingFee" DECIMAL(19,4),
  ADD COLUMN "shippingRules" JSONB,
  ADD COLUMN "notes" TEXT;
ALTER TABLE "listings"
  ADD COLUMN "feeRateOverride" DECIMAL(8,4),
  ADD COLUMN "shippingFeeOverride" DECIMAL(19,4),
  ADD COLUMN "estimatedNet" DECIMAL(19,4);
ALTER TABLE "customer_orders"
  ADD COLUMN "platformFee" DECIMAL(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN "shippingFee" DECIMAL(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN "shippingProvider" TEXT,
  ADD COLUMN "shippingProviderFeeRate" DECIMAL(8,4),
  ADD COLUMN "netRevenue" DECIMAL(19,4),
  ADD COLUMN "countryFlow" TEXT,
  ADD COLUMN "shippedAt" TIMESTAMP(3),
  ADD COLUMN "trackingNo" TEXT,
  ADD COLUMN "shippingProof" JSONB,
  ADD COLUMN "settledAt" TIMESTAMP(3);

CREATE TABLE "memberships" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'VIEWER',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "store_accesses" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'VIEWER',
  "permissions" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "tasks" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "title" TEXT NOT NULL,
  "description" TEXT,
  "refType" TEXT NOT NULL,
  "refId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "assignedToId" TEXT,
  "delegatedToId" TEXT,
  "completedById" TEXT,
  "assignedAt" TIMESTAMP(3),
  "dueAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "notifications" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "storeId" TEXT,
  "recipientId" TEXT NOT NULL,
  "actorId" TEXT,
  "taskId" TEXT,
  "refType" TEXT,
  "refId" TEXT,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "inbound_shipments" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "purchaseOrderId" TEXT,
  "legIndex" INTEGER NOT NULL DEFAULT 1,
  "fromLocationId" TEXT,
  "toLocationId" TEXT,
  "trackingNo" TEXT,
  "carrier" TEXT,
  "shippedAt" TIMESTAMP(3),
  "etaDate" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "shipmentNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "consolidation_batches" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "fromLocationId" TEXT,
  "toLocationId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "outboundTrackingNo" TEXT,
  "carrier" TEXT,
  "shippedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "consolidation_batch_lines" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batchId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL
);

CREATE TABLE "inspection_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "refType" TEXT NOT NULL,
  "refId" TEXT NOT NULL,
  "locationId" TEXT,
  "result" TEXT NOT NULL,
  "failureReason" TEXT,
  "photos" JSONB,
  "inspectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "quick_entries" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
  "rawBrand" TEXT,
  "rawProductName" TEXT NOT NULL,
  "rawVariant" TEXT,
  "rawCategory" TEXT,
  "conditionType" TEXT,
  "quantity" DECIMAL(19,4) NOT NULL DEFAULT 1,
  "purchasePrice" DECIMAL(19,4),
  "purchaseCurrency" TEXT,
  "purchasePlatformText" TEXT,
  "purchaseDate" TIMESTAMP(3),
  "purchaseTrackingNo" TEXT,
  "purchaseShippingFee" DECIMAL(19,4),
  "currentLocationText" TEXT,
  "transitTrackingNo" TEXT,
  "transitShippingFee" DECIMAL(19,4),
  "listingPlatformsText" TEXT,
  "salePlatformText" TEXT,
  "saleCurrency" TEXT,
  "salePrice" DECIMAL(19,4),
  "saleShippingFee" DECIMAL(19,4),
  "saleMiscFee" DECIMAL(19,4),
  "salePlatformFeeText" TEXT,
  "saleDate" TIMESTAMP(3),
  "note" TEXT,
  "batchNote" TEXT,
  "workflowStage" TEXT NOT NULL DEFAULT 'PURCHASE',
  "inspectionResult" TEXT,
  "inspectionNote" TEXT,
  "inspectedAt" TIMESTAMP(3),
  "processedStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "processedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "generatedSkuId" TEXT,
  "generatedLotId" TEXT,
  "generatedItemUnitIds" JSONB,
  "generatedPurchaseOrderId" TEXT,
  "generatedPurchaseLineId" TEXT,
  "generatedListingIds" JSONB,
  "generatedCustomerOrderId" TEXT,
  "generatedOrderLineId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "fx_rates" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "fromCurrency" TEXT NOT NULL,
  "toCurrency" TEXT NOT NULL,
  "rate" DECIMAL(19,8) NOT NULL,
  "effectiveDate" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "import_jobs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "successRows" INTEGER NOT NULL DEFAULT 0,
  "failedRows" INTEGER NOT NULL DEFAULT 0,
  "errorReport" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX "inbound_shipments_storeId_idx" ON "inbound_shipments"("storeId");
CREATE INDEX "inbound_shipments_purchaseOrderId_idx" ON "inbound_shipments"("purchaseOrderId");
CREATE INDEX "inbound_shipments_status_idx" ON "inbound_shipments"("status");
CREATE INDEX "consolidation_batches_storeId_idx" ON "consolidation_batches"("storeId");
CREATE INDEX "consolidation_batches_status_idx" ON "consolidation_batches"("status");
CREATE INDEX "consolidation_batch_lines_batchId_idx" ON "consolidation_batch_lines"("batchId");
CREATE INDEX "inspection_events_storeId_idx" ON "inspection_events"("storeId");
CREATE INDEX "inspection_events_refType_refId_idx" ON "inspection_events"("refType", "refId");
CREATE INDEX "quick_entries_storeId_idx" ON "quick_entries"("storeId");
CREATE INDEX "quick_entries_processedStatus_idx" ON "quick_entries"("processedStatus");
CREATE INDEX "quick_entries_workflowStage_idx" ON "quick_entries"("workflowStage");
CREATE INDEX "quick_entries_createdAt_idx" ON "quick_entries"("createdAt");
CREATE INDEX "import_jobs_storeId_idx" ON "import_jobs"("storeId");
CREATE INDEX "import_jobs_entityType_idx" ON "import_jobs"("entityType");
CREATE UNIQUE INDEX "organizations_code_key" ON "organizations"("code");
CREATE INDEX "stores_organizationId_idx" ON "stores"("organizationId");
CREATE UNIQUE INDEX "memberships_organizationId_userId_key" ON "memberships"("organizationId", "userId");
CREATE INDEX "memberships_userId_idx" ON "memberships"("userId");
CREATE UNIQUE INDEX "store_accesses_storeId_userId_key" ON "store_accesses"("storeId", "userId");
CREATE INDEX "store_accesses_userId_idx" ON "store_accesses"("userId");
CREATE INDEX "tasks_organizationId_idx" ON "tasks"("organizationId");
CREATE INDEX "tasks_storeId_idx" ON "tasks"("storeId");
CREATE INDEX "tasks_type_idx" ON "tasks"("type");
CREATE INDEX "tasks_status_idx" ON "tasks"("status");
CREATE INDEX "tasks_assignedToId_idx" ON "tasks"("assignedToId");
CREATE INDEX "tasks_completedById_idx" ON "tasks"("completedById");
CREATE INDEX "tasks_refType_refId_idx" ON "tasks"("refType", "refId");
CREATE INDEX "notifications_organizationId_idx" ON "notifications"("organizationId");
CREATE INDEX "notifications_storeId_idx" ON "notifications"("storeId");
CREATE INDEX "notifications_recipientId_idx" ON "notifications"("recipientId");
CREATE INDEX "notifications_actorId_idx" ON "notifications"("actorId");
CREATE INDEX "notifications_taskId_idx" ON "notifications"("taskId");
CREATE INDEX "notifications_readAt_idx" ON "notifications"("readAt");

ALTER TABLE "inbound_shipments" ADD CONSTRAINT "inbound_shipments_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inbound_shipments" ADD CONSTRAINT "inbound_shipments_purchaseOrderId_fkey"
  FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inbound_shipments" ADD CONSTRAINT "inbound_shipments_fromLocationId_fkey"
  FOREIGN KEY ("fromLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inbound_shipments" ADD CONSTRAINT "inbound_shipments_toLocationId_fkey"
  FOREIGN KEY ("toLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "consolidation_batches" ADD CONSTRAINT "consolidation_batches_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consolidation_batches" ADD CONSTRAINT "consolidation_batches_fromLocationId_fkey"
  FOREIGN KEY ("fromLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "consolidation_batches" ADD CONSTRAINT "consolidation_batches_toLocationId_fkey"
  FOREIGN KEY ("toLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "consolidation_batch_lines" ADD CONSTRAINT "consolidation_batch_lines_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "consolidation_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inspection_events" ADD CONSTRAINT "inspection_events_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inspection_events" ADD CONSTRAINT "inspection_events_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quick_entries" ADD CONSTRAINT "quick_entries_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stores" ADD CONSTRAINT "stores_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "store_accesses" ADD CONSTRAINT "store_accesses_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "store_accesses" ADD CONSTRAINT "store_accesses_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
