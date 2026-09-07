ALTER TABLE "customer_orders"
ADD COLUMN "shippingFeeStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN "requestPayloadHash" TEXT;

UPDATE "customer_orders"
SET "shippingFeeStatus" = CASE
  WHEN "settledAt" IS NOT NULL THEN 'ACTUAL'
  WHEN "shippingFee" <> 0 THEN 'ESTIMATED'
  ELSE 'PENDING'
END;
