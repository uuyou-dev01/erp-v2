CREATE TABLE "opening_stocks" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "documentNo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "openingAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "postedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opening_stocks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "opening_stock_lines" (
    "id" TEXT NOT NULL,
    "openingStockId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "trackingMode" TEXT NOT NULL DEFAULT 'LOT',
    "quantity" DECIMAL(19,4) NOT NULL,
    "unitCost" DECIMAL(19,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "conditionGrade" TEXT,
    "note" TEXT,
    "generatedLotId" TEXT,
    "generatedItemUnitIds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opening_stock_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "opening_stocks_storeId_documentNo_key"
ON "opening_stocks"("storeId", "documentNo");
CREATE INDEX "opening_stocks_storeId_idx" ON "opening_stocks"("storeId");
CREATE INDEX "opening_stocks_status_idx" ON "opening_stocks"("status");
CREATE INDEX "opening_stocks_openingAt_idx" ON "opening_stocks"("openingAt");
CREATE INDEX "opening_stock_lines_openingStockId_idx" ON "opening_stock_lines"("openingStockId");
CREATE INDEX "opening_stock_lines_skuId_idx" ON "opening_stock_lines"("skuId");
CREATE INDEX "opening_stock_lines_locationId_idx" ON "opening_stock_lines"("locationId");

ALTER TABLE "opening_stocks"
ADD CONSTRAINT "opening_stocks_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "opening_stock_lines"
ADD CONSTRAINT "opening_stock_lines_openingStockId_fkey"
FOREIGN KEY ("openingStockId") REFERENCES "opening_stocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "opening_stock_lines"
ADD CONSTRAINT "opening_stock_lines_skuId_fkey"
FOREIGN KEY ("skuId") REFERENCES "skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opening_stock_lines"
ADD CONSTRAINT "opening_stock_lines_locationId_fkey"
FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
