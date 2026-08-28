ALTER TABLE "resale_listings"
ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "resale_listings_sellerOrganizationId_idempotencyKey_key"
ON "resale_listings"("sellerOrganizationId", "idempotencyKey");
