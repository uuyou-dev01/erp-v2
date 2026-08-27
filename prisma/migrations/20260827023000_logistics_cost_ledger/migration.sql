CREATE TABLE "logistics_costs" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "feeType" TEXT NOT NULL DEFAULT 'SHIPPING',
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logistics_costs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "logistics_costs_storeId_sourceType_sourceId_feeType_key"
ON "logistics_costs"("storeId", "sourceType", "sourceId", "feeType");

CREATE INDEX "logistics_costs_storeId_occurredAt_idx"
ON "logistics_costs"("storeId", "occurredAt");

CREATE INDEX "logistics_costs_sourceType_sourceId_idx"
ON "logistics_costs"("sourceType", "sourceId");

ALTER TABLE "logistics_costs"
ADD CONSTRAINT "logistics_costs_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
