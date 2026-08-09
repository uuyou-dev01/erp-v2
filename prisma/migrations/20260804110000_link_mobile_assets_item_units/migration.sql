ALTER TABLE "mobile_assets"
  ADD COLUMN "itemUnitId" TEXT;

CREATE INDEX "mobile_assets_itemUnitId_idx"
  ON "mobile_assets"("itemUnitId");

ALTER TABLE "mobile_assets"
  ADD CONSTRAINT "mobile_assets_itemUnitId_fkey"
  FOREIGN KEY ("itemUnitId") REFERENCES "item_units"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
