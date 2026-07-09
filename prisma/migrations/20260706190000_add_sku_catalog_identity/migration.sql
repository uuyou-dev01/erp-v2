-- Add explicit SKU catalog identity fields for 商品组 / 规格 SKU / 独立 SKU.

-- The current schema already uses parentSkuId, but older migration history did
-- not create it. Keep this migration self-contained for fresh databases.
ALTER TABLE "skus"
  ADD COLUMN IF NOT EXISTS "parentSkuId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'skus_parentSkuId_fkey'
  ) THEN
    ALTER TABLE "skus"
      ADD CONSTRAINT "skus_parentSkuId_fkey"
      FOREIGN KEY ("parentSkuId") REFERENCES "skus"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "skus"
  ADD COLUMN IF NOT EXISTS "catalogRole" TEXT NOT NULL DEFAULT 'SIMPLE',
  ADD COLUMN IF NOT EXISTS "manufacturerCode" TEXT,
  ADD COLUMN IF NOT EXISTS "variantLabel" TEXT,
  ADD COLUMN IF NOT EXISTS "variantAxes" JSONB,
  ADD COLUMN IF NOT EXISTS "variantValues" JSONB,
  ADD COLUMN IF NOT EXISTS "nameSource" TEXT NOT NULL DEFAULT 'AUTO',
  ADD COLUMN IF NOT EXISTS "codeSource" TEXT NOT NULL DEFAULT 'AUTO';

UPDATE "skus"
SET "catalogRole" = 'VARIANT'
WHERE "parentSkuId" IS NOT NULL;

UPDATE "skus" parent
SET "catalogRole" = 'GROUP'
WHERE parent."parentSkuId" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "skus" child
    WHERE child."parentSkuId" = parent."id"
  );

CREATE INDEX IF NOT EXISTS "skus_parentSkuId_idx" ON "skus"("parentSkuId");
CREATE INDEX IF NOT EXISTS "skus_storeId_catalogRole_idx" ON "skus"("storeId", "catalogRole");
CREATE INDEX IF NOT EXISTS "skus_manufacturerCode_idx" ON "skus"("manufacturerCode");
