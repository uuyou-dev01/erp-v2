-- A resale record and its reservation must identify the concrete offer line,
-- otherwise mixed-SKU offers could allocate from the wrong product.
ALTER TABLE "resale_listings"
  ADD COLUMN "supplyOfferItemId" TEXT;

ALTER TABLE "supply_reservations"
  ADD COLUMN "supplyOfferItemId" TEXT;

UPDATE "resale_listings" r
SET "supplyOfferItemId" = (
  SELECT MIN(i."id")
  FROM "supply_offer_items" i
  WHERE i."offerId" = r."supplyOfferId"
)
WHERE (
  SELECT COUNT(*) FROM "supply_offer_items" i WHERE i."offerId" = r."supplyOfferId"
) = 1;

UPDATE "supply_reservations" reservation
SET "supplyOfferItemId" = COALESCE(
  (SELECT r."supplyOfferItemId" FROM "resale_listings" r WHERE r."id" = reservation."resaleListingId"),
  (SELECT MIN(i."id") FROM "supply_offer_items" i WHERE i."offerId" = reservation."supplyOfferId"
    HAVING COUNT(*) = 1)
);

CREATE INDEX "resale_listings_supplyOfferItemId_idx"
  ON "resale_listings"("supplyOfferItemId");
CREATE INDEX "supply_reservations_supplyOfferItemId_idx"
  ON "supply_reservations"("supplyOfferItemId");

ALTER TABLE "resale_listings"
  ADD CONSTRAINT "resale_listings_supplyOfferItemId_fkey"
  FOREIGN KEY ("supplyOfferItemId") REFERENCES "supply_offer_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "supply_reservations"
  ADD CONSTRAINT "supply_reservations_supplyOfferItemId_fkey"
  FOREIGN KEY ("supplyOfferItemId") REFERENCES "supply_offer_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
