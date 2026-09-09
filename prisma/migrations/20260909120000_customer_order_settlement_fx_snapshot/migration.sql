ALTER TABLE "customer_orders"
ADD COLUMN "settlementFxRate" DECIMAL(19, 8),
ADD COLUMN "settlementBaseCurrency" TEXT,
ADD COLUMN "settlementNetRevenueBase" DECIMAL(19, 4);
