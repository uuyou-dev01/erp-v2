-- Close the remaining historical schema gaps so a freshly migrated database
-- supports the same runtime models as an existing `db push` database.
CREATE TABLE "activity_logs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "storeId" TEXT,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "refType" TEXT NOT NULL,
  "refId" TEXT NOT NULL,
  "taskId" TEXT,
  "before" JSONB,
  "after" JSONB,
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "activity_logs_organizationId_idx" ON "activity_logs"("organizationId");
CREATE INDEX "activity_logs_storeId_idx" ON "activity_logs"("storeId");
CREATE INDEX "activity_logs_actorId_idx" ON "activity_logs"("actorId");
CREATE INDEX "activity_logs_action_idx" ON "activity_logs"("action");
CREATE INDEX "activity_logs_refType_refId_idx" ON "activity_logs"("refType", "refId");
CREATE INDEX "activity_logs_taskId_idx" ON "activity_logs"("taskId");

ALTER TABLE "inventory_lots" ADD COLUMN "batchLabel" TEXT;
ALTER TABLE "skus"
  ADD COLUMN "isAutoCreated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mergeStatus" TEXT;
ALTER TABLE "purchase_orders"
  ADD COLUMN "shippedAt" TIMESTAMP(3),
  ADD COLUMN "etaDate" TIMESTAMP(3),
  ADD COLUMN "trackingNo" TEXT,
  ADD COLUMN "carrier" TEXT,
  ADD COLUMN "shipmentNote" TEXT;
ALTER TABLE "fulfillment_requests" ADD COLUMN "listingId" TEXT;
ALTER TABLE "supply_reservations" ADD COLUMN "listingId" TEXT;

ALTER TABLE "stores" ALTER COLUMN "currency" SET DEFAULT 'CNY';
ALTER TABLE "location_capabilities" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "shipping_lanes" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "supply_offer_channels" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE INDEX "customer_orders_platformId_idx" ON "customer_orders"("platformId");
ALTER TABLE "customer_orders" ADD CONSTRAINT "customer_orders_platformId_fkey"
  FOREIGN KEY ("platformId") REFERENCES "platforms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_destinationLocationId_fkey"
  FOREIGN KEY ("destinationLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fulfillment_requests" ADD CONSTRAINT "fulfillment_requests_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supply_reservations" ADD CONSTRAINT "supply_reservations_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "payout_records_withdrawalRequestId_idx";
DROP INDEX IF EXISTS "wallet_ledger_entries_earningEventId_idx";

ALTER INDEX IF EXISTS "earning_events_storeId_userId_sourceType_sourceId_earningType_k"
  RENAME TO "earning_events_storeId_userId_sourceType_sourceId_earningTy_key";
ALTER INDEX IF EXISTS "inbound_shipment_inventory_lines_shipmentId_entityType_entityId"
  RENAME TO "inbound_shipment_inventory_lines_shipmentId_entityType_enti_key";
ALTER INDEX IF EXISTS "mobile_rate_limit_buckets_organizationId_subjectId_key_windowSt"
  RENAME TO "mobile_rate_limit_buckets_organizationId_subjectId_key_wind_key";
ALTER INDEX IF EXISTS "product_intelligence_captures_organizationId_userId_idempotency"
  RENAME TO "product_intelligence_captures_organizationId_userId_idempot_key";
ALTER INDEX IF EXISTS "product_intelligence_captures_platformName_externalListingId_id"
  RENAME TO "product_intelligence_captures_platformName_externalListingI_idx";
ALTER INDEX IF EXISTS "shipping_lanes_fromLocationId_laneType_destinationCountry_toLoc"
  RENAME TO "shipping_lanes_fromLocationId_laneType_destinationCountry_t_key";
