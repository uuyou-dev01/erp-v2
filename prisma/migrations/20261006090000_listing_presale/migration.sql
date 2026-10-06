ALTER TABLE "listings"
  ADD COLUMN "isPresale" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "expectedShipDate" DATE,
  ADD COLUMN "presaleConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "presaleConfirmedById" TEXT;
ALTER TABLE "customer_orders"
  ADD COLUMN "isPresale" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "expectedShipDate" DATE,
  ADD COLUMN "sourceListingId" TEXT;
CREATE INDEX "customer_orders_storeId_isPresale_orderStatus_createdAt_idx"
  ON "customer_orders"("storeId", "isPresale", "orderStatus", "createdAt");
