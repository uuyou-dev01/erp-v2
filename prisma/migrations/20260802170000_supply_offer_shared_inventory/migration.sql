-- Supply offers are owned by an operating organization. Sales accounts and
-- resellers are exposure channels; they do not duplicate or own inventory.
ALTER TABLE "supply_offers"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT,
  ADD COLUMN IF NOT EXISTS "inventoryPolicy" TEXT NOT NULL DEFAULT 'SHARED_POOL',
  ADD COLUMN IF NOT EXISTS "publishedQty" DECIMAL(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "fulfilledQty" DECIMAL(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "safetyStockQty" DECIMAL(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "settlementCurrency" TEXT,
  ADD COLUMN IF NOT EXISTS "commissionType" TEXT NOT NULL DEFAULT 'MARGIN',
  ADD COLUMN IF NOT EXISTS "commissionFixedAmount" DECIMAL(19,4),
  ADD COLUMN IF NOT EXISTS "dropshipFee" DECIMAL(19,4);

UPDATE "supply_offers" o
SET "organizationId" = s."organizationId"
FROM "stores" s
WHERE o."storeId" = s."id" AND o."organizationId" IS NULL;

UPDATE "supply_offers"
SET "publishedQty" = "availableQty" + "fulfilledQty"
WHERE "publishedQty" = 0 AND "availableQty" > 0;

UPDATE "supply_offers"
SET "settlementCurrency" = "currency"
WHERE "settlementCurrency" IS NULL;

CREATE INDEX IF NOT EXISTS "supply_offers_organizationId_idx"
  ON "supply_offers"("organizationId");

ALTER TABLE "supply_offers"
  ADD CONSTRAINT "supply_offers_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supply_offers"
  ADD CONSTRAINT "supply_offers_inventoryPoolId_fkey"
  FOREIGN KEY ("inventoryPoolId") REFERENCES "inventory_pools"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "supply_offers"
  ADD CONSTRAINT "supply_offers_providerOrganizationId_fkey"
  FOREIGN KEY ("providerOrganizationId") REFERENCES "organizations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "supply_offer_channels" (
  "id" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "sellerOrganizationId" TEXT,
  "storeId" TEXT,
  "salesChannelAccountId" TEXT,
  "partnerId" TEXT,
  "channelType" TEXT NOT NULL DEFAULT 'INTERNAL_ACCOUNT',
  "inventoryMode" TEXT NOT NULL DEFAULT 'SHARED',
  "quotaQty" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "quotaReservedQty" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supply_offer_channels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supply_offer_channels_offerId_salesChannelAccountId_key"
  ON "supply_offer_channels"("offerId", "salesChannelAccountId");
CREATE INDEX "supply_offer_channels_offerId_status_idx"
  ON "supply_offer_channels"("offerId", "status");
CREATE INDEX "supply_offer_channels_sellerOrganizationId_idx"
  ON "supply_offer_channels"("sellerOrganizationId");
CREATE INDEX "supply_offer_channels_storeId_idx"
  ON "supply_offer_channels"("storeId");
CREATE INDEX "supply_offer_channels_partnerId_idx"
  ON "supply_offer_channels"("partnerId");

ALTER TABLE "supply_offer_channels"
  ADD CONSTRAINT "supply_offer_channels_offerId_fkey"
  FOREIGN KEY ("offerId") REFERENCES "supply_offers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supply_offer_channels"
  ADD CONSTRAINT "supply_offer_channels_sellerOrganizationId_fkey"
  FOREIGN KEY ("sellerOrganizationId") REFERENCES "organizations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supply_offer_channels"
  ADD CONSTRAINT "supply_offer_channels_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supply_offer_channels"
  ADD CONSTRAINT "supply_offer_channels_salesChannelAccountId_fkey"
  FOREIGN KEY ("salesChannelAccountId") REFERENCES "sales_channel_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supply_offer_channels"
  ADD CONSTRAINT "supply_offer_channels_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "partners"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "resale_listings"
  ADD COLUMN IF NOT EXISTS "supplyOfferChannelId" TEXT,
  ADD COLUMN IF NOT EXISTS "commissionType" TEXT NOT NULL DEFAULT 'MARGIN',
  ADD COLUMN IF NOT EXISTS "commissionFixedAmount" DECIMAL(19,4),
  ADD COLUMN IF NOT EXISTS "dropshipFee" DECIMAL(19,4);
CREATE INDEX IF NOT EXISTS "resale_listings_supplyOfferChannelId_idx"
  ON "resale_listings"("supplyOfferChannelId");
ALTER TABLE "resale_listings"
  ADD CONSTRAINT "resale_listings_supplyOfferChannelId_fkey"
  FOREIGN KEY ("supplyOfferChannelId") REFERENCES "supply_offer_channels"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "supply_reservations"
  ADD COLUMN IF NOT EXISTS "supplyOfferChannelId" TEXT;
CREATE INDEX IF NOT EXISTS "supply_reservations_supplyOfferChannelId_idx"
  ON "supply_reservations"("supplyOfferChannelId");
ALTER TABLE "supply_reservations"
  ADD CONSTRAINT "supply_reservations_supplyOfferChannelId_fkey"
  FOREIGN KEY ("supplyOfferChannelId") REFERENCES "supply_offer_channels"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Keep legacy writes aligned with organization ownership as stores are phased out
-- as the primary tenancy boundary.
CREATE OR REPLACE FUNCTION fill_supply_offer_scope() RETURNS trigger AS $$
BEGIN
  IF NEW."inventoryPoolId" IS NULL THEN
    SELECT "id", "organizationId"
    INTO NEW."inventoryPoolId", NEW."providerOrganizationId"
    FROM "inventory_pools" WHERE "legacyStoreId" = NEW."storeId";
  ELSIF NEW."providerOrganizationId" IS NULL THEN
    SELECT "organizationId" INTO NEW."providerOrganizationId"
    FROM "inventory_pools" WHERE "id" = NEW."inventoryPoolId";
  END IF;
  IF NEW."organizationId" IS NULL THEN
    SELECT "organizationId" INTO NEW."organizationId"
    FROM "stores" WHERE "id" = NEW."storeId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
