-- Marketplace, resale, fulfillment, and settlement collaboration tables.

ALTER TABLE "customer_orders" ADD COLUMN "resaleListingId" TEXT;

CREATE TABLE "partners" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'SUPPLIER',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "contactName" TEXT,
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "defaultCurrency" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trading_relationships" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "relationshipType" TEXT NOT NULL DEFAULT 'SUPPLY',
  "visibilityScope" TEXT NOT NULL DEFAULT 'PRIVATE',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "commissionRate" DECIMAL(8,4),
  "serviceFeeRate" DECIMAL(8,4),
  "settlementCurrency" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "trading_relationships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supply_offers" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "ownerPartnerId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
  "sourceSkuId" TEXT,
  "sourceItemUnitId" TEXT,
  "availableQty" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "reservedQty" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "unitPrice" DECIMAL(19,4),
  "currency" TEXT,
  "commissionRate" DECIMAL(8,4),
  "fulfillmentMode" TEXT NOT NULL DEFAULT 'SUPPLIER_SHIPS',
  "shipFromLocation" TEXT,
  "etaDays" INTEGER,
  "minOrderQty" DECIMAL(19,4),
  "maxOrderQty" DECIMAL(19,4),
  "publishedAt" TIMESTAMP(3),
  "pausedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supply_offers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "resale_listings" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "supplyOfferId" TEXT NOT NULL,
  "platformId" TEXT NOT NULL,
  "listingId" TEXT,
  "title" TEXT NOT NULL,
  "externalListingNo" TEXT,
  "targetPrice" DECIMAL(19,4) NOT NULL,
  "currency" TEXT NOT NULL,
  "quantityPlanned" DECIMAL(19,4) NOT NULL DEFAULT 1,
  "quantitySold" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "supplyUnitPrice" DECIMAL(19,4),
  "supplyCurrency" TEXT,
  "commissionRate" DECIMAL(8,4),
  "platformFeeRate" DECIMAL(8,4),
  "estimatedPlatformFee" DECIMAL(19,4),
  "estimatedCommission" DECIMAL(19,4),
  "estimatedGrossProfit" DECIMAL(19,4),
  "fulfillmentMode" TEXT NOT NULL DEFAULT 'SUPPLIER_SHIPS',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "listedAt" TIMESTAMP(3),
  "pausedAt" TIMESTAMP(3),
  "delistedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "resale_listings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supply_reservations" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "supplyOfferId" TEXT NOT NULL,
  "resaleListingId" TEXT,
  "quantity" DECIMAL(19,4) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "reason" TEXT NOT NULL DEFAULT 'FULFILLMENT_REQUEST',
  "note" TEXT,
  "createdById" TEXT,
  "releasedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supply_reservations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fulfillment_requests" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "supplyOfferId" TEXT NOT NULL,
  "resaleListingId" TEXT,
  "reservationId" TEXT,
  "customerOrderId" TEXT,
  "requestNo" TEXT NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "recipientName" TEXT NOT NULL,
  "recipientPhone" TEXT,
  "shippingAddress" TEXT NOT NULL,
  "shippingCountry" TEXT,
  "carrier" TEXT,
  "trackingNo" TEXT,
  "shippingFee" DECIMAL(19,4),
  "shippingCurrency" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  "shippedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "note" TEXT,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fulfillment_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "settlements" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "partnerId" TEXT,
  "fulfillmentRequestId" TEXT,
  "customerOrderId" TEXT,
  "settlementNo" TEXT NOT NULL,
  "direction" TEXT NOT NULL DEFAULT 'PAYABLE',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "currency" TEXT NOT NULL,
  "totalAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "baseCurrency" TEXT,
  "fxRate" DECIMAL(19,8),
  "baseAmount" DECIMAL(19,4),
  "periodStart" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "voidedAt" TIMESTAMP(3),
  "note" TEXT,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supply_offer_items" (
  "id" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "skuId" TEXT,
  "itemUnitId" TEXT,
  "title" TEXT NOT NULL,
  "variantCode" TEXT,
  "quantityAvailable" DECIMAL(19,4) NOT NULL,
  "quantityReserved" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "unitPrice" DECIMAL(19,4),
  "currency" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supply_offer_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "settlement_lines" (
  "id" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "lineType" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "currency" TEXT NOT NULL,
  "direction" TEXT NOT NULL DEFAULT 'PAYABLE',
  "sourceType" TEXT,
  "sourceId" TEXT,
  "baseCurrency" TEXT,
  "fxRate" DECIMAL(19,8),
  "baseAmount" DECIMAL(19,4),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "settlement_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "offer_visibility" (
  "id" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "partnerId" TEXT,
  "viewerStoreId" TEXT,
  "scope" TEXT NOT NULL DEFAULT 'PARTNER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "offer_visibility_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "partners_storeId_code_key" ON "partners"("storeId", "code");
CREATE INDEX "partners_storeId_idx" ON "partners"("storeId");
CREATE INDEX "partners_status_idx" ON "partners"("status");

CREATE UNIQUE INDEX "trading_relationships_storeId_partnerId_relationshipType_key" ON "trading_relationships"("storeId", "partnerId", "relationshipType");
CREATE INDEX "trading_relationships_storeId_idx" ON "trading_relationships"("storeId");
CREATE INDEX "trading_relationships_partnerId_idx" ON "trading_relationships"("partnerId");
CREATE INDEX "trading_relationships_status_idx" ON "trading_relationships"("status");

CREATE INDEX "supply_offers_storeId_idx" ON "supply_offers"("storeId");
CREATE INDEX "supply_offers_ownerPartnerId_idx" ON "supply_offers"("ownerPartnerId");
CREATE INDEX "supply_offers_sourceSkuId_idx" ON "supply_offers"("sourceSkuId");
CREATE INDEX "supply_offers_sourceItemUnitId_idx" ON "supply_offers"("sourceItemUnitId");
CREATE INDEX "supply_offers_status_idx" ON "supply_offers"("status");
CREATE INDEX "supply_offers_visibility_idx" ON "supply_offers"("visibility");

CREATE INDEX "resale_listings_storeId_idx" ON "resale_listings"("storeId");
CREATE INDEX "resale_listings_supplyOfferId_idx" ON "resale_listings"("supplyOfferId");
CREATE INDEX "resale_listings_platformId_idx" ON "resale_listings"("platformId");
CREATE INDEX "resale_listings_listingId_idx" ON "resale_listings"("listingId");
CREATE INDEX "resale_listings_status_idx" ON "resale_listings"("status");

CREATE INDEX "supply_reservations_storeId_idx" ON "supply_reservations"("storeId");
CREATE INDEX "supply_reservations_supplyOfferId_idx" ON "supply_reservations"("supplyOfferId");
CREATE INDEX "supply_reservations_resaleListingId_idx" ON "supply_reservations"("resaleListingId");
CREATE INDEX "supply_reservations_status_idx" ON "supply_reservations"("status");

CREATE UNIQUE INDEX "fulfillment_requests_storeId_requestNo_key" ON "fulfillment_requests"("storeId", "requestNo");
CREATE INDEX "fulfillment_requests_storeId_idx" ON "fulfillment_requests"("storeId");
CREATE INDEX "fulfillment_requests_supplyOfferId_idx" ON "fulfillment_requests"("supplyOfferId");
CREATE INDEX "fulfillment_requests_resaleListingId_idx" ON "fulfillment_requests"("resaleListingId");
CREATE INDEX "fulfillment_requests_reservationId_idx" ON "fulfillment_requests"("reservationId");
CREATE INDEX "fulfillment_requests_customerOrderId_idx" ON "fulfillment_requests"("customerOrderId");
CREATE INDEX "fulfillment_requests_status_idx" ON "fulfillment_requests"("status");

CREATE UNIQUE INDEX "settlements_storeId_settlementNo_key" ON "settlements"("storeId", "settlementNo");
CREATE INDEX "settlements_storeId_idx" ON "settlements"("storeId");
CREATE INDEX "settlements_partnerId_idx" ON "settlements"("partnerId");
CREATE INDEX "settlements_fulfillmentRequestId_idx" ON "settlements"("fulfillmentRequestId");
CREATE INDEX "settlements_customerOrderId_idx" ON "settlements"("customerOrderId");
CREATE INDEX "settlements_status_idx" ON "settlements"("status");

CREATE INDEX "supply_offer_items_offerId_idx" ON "supply_offer_items"("offerId");
CREATE INDEX "supply_offer_items_skuId_idx" ON "supply_offer_items"("skuId");
CREATE INDEX "supply_offer_items_itemUnitId_idx" ON "supply_offer_items"("itemUnitId");

CREATE INDEX "settlement_lines_settlementId_idx" ON "settlement_lines"("settlementId");
CREATE INDEX "settlement_lines_lineType_idx" ON "settlement_lines"("lineType");
CREATE INDEX "settlement_lines_sourceType_sourceId_idx" ON "settlement_lines"("sourceType", "sourceId");

CREATE INDEX "offer_visibility_offerId_idx" ON "offer_visibility"("offerId");
CREATE INDEX "offer_visibility_partnerId_idx" ON "offer_visibility"("partnerId");
CREATE INDEX "offer_visibility_viewerStoreId_idx" ON "offer_visibility"("viewerStoreId");

CREATE INDEX "customer_orders_resaleListingId_idx" ON "customer_orders"("resaleListingId");

ALTER TABLE "partners" ADD CONSTRAINT "partners_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trading_relationships" ADD CONSTRAINT "trading_relationships_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trading_relationships" ADD CONSTRAINT "trading_relationships_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supply_offers" ADD CONSTRAINT "supply_offers_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supply_offers" ADD CONSTRAINT "supply_offers_ownerPartnerId_fkey" FOREIGN KEY ("ownerPartnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supply_offers" ADD CONSTRAINT "supply_offers_sourceSkuId_fkey" FOREIGN KEY ("sourceSkuId") REFERENCES "skus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supply_offers" ADD CONSTRAINT "supply_offers_sourceItemUnitId_fkey" FOREIGN KEY ("sourceItemUnitId") REFERENCES "item_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "resale_listings" ADD CONSTRAINT "resale_listings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resale_listings" ADD CONSTRAINT "resale_listings_supplyOfferId_fkey" FOREIGN KEY ("supplyOfferId") REFERENCES "supply_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resale_listings" ADD CONSTRAINT "resale_listings_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resale_listings" ADD CONSTRAINT "resale_listings_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "supply_reservations" ADD CONSTRAINT "supply_reservations_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supply_reservations" ADD CONSTRAINT "supply_reservations_supplyOfferId_fkey" FOREIGN KEY ("supplyOfferId") REFERENCES "supply_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supply_reservations" ADD CONSTRAINT "supply_reservations_resaleListingId_fkey" FOREIGN KEY ("resaleListingId") REFERENCES "resale_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fulfillment_requests" ADD CONSTRAINT "fulfillment_requests_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fulfillment_requests" ADD CONSTRAINT "fulfillment_requests_supplyOfferId_fkey" FOREIGN KEY ("supplyOfferId") REFERENCES "supply_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fulfillment_requests" ADD CONSTRAINT "fulfillment_requests_resaleListingId_fkey" FOREIGN KEY ("resaleListingId") REFERENCES "resale_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fulfillment_requests" ADD CONSTRAINT "fulfillment_requests_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "supply_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fulfillment_requests" ADD CONSTRAINT "fulfillment_requests_customerOrderId_fkey" FOREIGN KEY ("customerOrderId") REFERENCES "customer_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "settlements" ADD CONSTRAINT "settlements_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_fulfillmentRequestId_fkey" FOREIGN KEY ("fulfillmentRequestId") REFERENCES "fulfillment_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_customerOrderId_fkey" FOREIGN KEY ("customerOrderId") REFERENCES "customer_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "supply_offer_items" ADD CONSTRAINT "supply_offer_items_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "supply_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supply_offer_items" ADD CONSTRAINT "supply_offer_items_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "skus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supply_offer_items" ADD CONSTRAINT "supply_offer_items_itemUnitId_fkey" FOREIGN KEY ("itemUnitId") REFERENCES "item_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "offer_visibility" ADD CONSTRAINT "offer_visibility_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "supply_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offer_visibility" ADD CONSTRAINT "offer_visibility_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offer_visibility" ADD CONSTRAINT "offer_visibility_viewerStoreId_fkey" FOREIGN KEY ("viewerStoreId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_orders" ADD CONSTRAINT "customer_orders_resaleListingId_fkey" FOREIGN KEY ("resaleListingId") REFERENCES "resale_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
