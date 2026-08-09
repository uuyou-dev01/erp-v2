ALTER TABLE "inventory_lots"
  ADD COLUMN "costStatus" TEXT NOT NULL DEFAULT 'CONFIRMED',
  ADD COLUMN "costTrace" JSONB;

ALTER TABLE "item_units"
  ADD COLUMN "costStatus" TEXT NOT NULL DEFAULT 'CONFIRMED',
  ADD COLUMN "costTrace" JSONB;

ALTER TABLE "purchase_orders"
  ADD COLUMN "declaredTotalAmount" DECIMAL(19,4),
  ADD COLUMN "costAllocationStatus" TEXT NOT NULL DEFAULT 'ALLOCATED',
  ADD COLUMN "costAllocationMethod" TEXT,
  ADD COLUMN "costAllocatedAt" TIMESTAMP(3);

ALTER TABLE "purchase_lines"
  ADD COLUMN "costStatus" TEXT NOT NULL DEFAULT 'ALLOCATED',
  ADD COLUMN "costTrace" JSONB;

ALTER TABLE "order_allocations"
  ADD COLUMN "costCurrency" TEXT,
  ADD COLUMN "costFxRate" DECIMAL(19,8),
  ADD COLUMN "costBaseAmount" DECIMAL(19,4),
  ADD COLUMN "costSourceType" TEXT,
  ADD COLUMN "costSourceId" TEXT;

ALTER TABLE "inbound_shipments"
  ADD COLUMN "transportMode" TEXT,
  ADD COLUMN "carriedBy" TEXT,
  ADD COLUMN "grossWeightKg" DECIMAL(19,4),
  ADD COLUMN "customsAmount" DECIMAL(19,4),
  ADD COLUMN "customsCurrency" TEXT,
  ADD COLUMN "taxAmount" DECIMAL(19,4),
  ADD COLUMN "taxCurrency" TEXT;

ALTER TABLE "inspection_events"
  ADD COLUMN "passedQty" DECIMAL(19,4),
  ADD COLUMN "failedQty" DECIMAL(19,4),
  ADD COLUMN "pendingQty" DECIMAL(19,4),
  ADD COLUMN "returnedQty" DECIMAL(19,4),
  ADD COLUMN "details" JSONB;

UPDATE "purchase_orders" po
SET "declaredTotalAmount" = po."totalAmount",
    "costAllocationMethod" = 'LEGACY_LINE_PRICE',
    "costAllocatedAt" = po."updatedAt"
WHERE po."declaredTotalAmount" IS NULL;

UPDATE "purchase_orders" po
SET "supplierId" = NULL
WHERE po."supplierId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "partners" p WHERE p."id" = po."supplierId");

ALTER TABLE "purchase_orders"
  ADD CONSTRAINT "purchase_orders_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "partners"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "purchase_orders_supplierId_idx" ON "purchase_orders"("supplierId");
CREATE INDEX "purchase_orders_costAllocationStatus_idx" ON "purchase_orders"("costAllocationStatus");
CREATE INDEX "purchase_lines_costStatus_idx" ON "purchase_lines"("costStatus");
CREATE INDEX "inventory_lots_costStatus_idx" ON "inventory_lots"("costStatus");
CREATE INDEX "item_units_costStatus_idx" ON "item_units"("costStatus");
