ALTER TABLE "product_intelligence_items"
  ADD COLUMN "skuId" TEXT;

ALTER TABLE "capture_purchase_lines"
  ADD COLUMN "skuId" TEXT;

ALTER TABLE "match_candidates"
  ALTER COLUMN "itemId" DROP NOT NULL,
  ADD COLUMN "skuId" TEXT;

CREATE TABLE "sku_aliases" (
  "id" TEXT NOT NULL,
  "skuId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "alias" TEXT NOT NULL,
  "normalizedAlias" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sku_aliases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_intelligence_items_skuId_idx" ON "product_intelligence_items"("skuId");
CREATE INDEX "capture_purchase_lines_skuId_idx" ON "capture_purchase_lines"("skuId");
CREATE UNIQUE INDEX "match_candidates_captureId_skuId_matcher_matcherVersion_key"
  ON "match_candidates"("captureId", "skuId", "matcher", "matcherVersion");
CREATE INDEX "match_candidates_skuId_idx" ON "match_candidates"("skuId");
CREATE UNIQUE INDEX "sku_aliases_storeId_normalizedAlias_skuId_key"
  ON "sku_aliases"("storeId", "normalizedAlias", "skuId");
CREATE INDEX "sku_aliases_storeId_normalizedAlias_idx" ON "sku_aliases"("storeId", "normalizedAlias");
CREATE INDEX "sku_aliases_skuId_idx" ON "sku_aliases"("skuId");

ALTER TABLE "product_intelligence_items"
  ADD CONSTRAINT "product_intelligence_items_skuId_fkey"
  FOREIGN KEY ("skuId") REFERENCES "skus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "capture_purchase_lines"
  ADD CONSTRAINT "capture_purchase_lines_skuId_fkey"
  FOREIGN KEY ("skuId") REFERENCES "skus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "match_candidates"
  ADD CONSTRAINT "match_candidates_skuId_fkey"
  FOREIGN KEY ("skuId") REFERENCES "skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sku_aliases"
  ADD CONSTRAINT "sku_aliases_skuId_fkey"
  FOREIGN KEY ("skuId") REFERENCES "skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Safe deterministic backfill only: never guess across stores or duplicate names.
UPDATE "product_intelligence_items" AS intelligence
SET "skuId" = candidate."id"
FROM (
  SELECT pi."id" AS "intelligenceId", MIN(s."id") AS "id"
  FROM "product_intelligence_items" pi
  JOIN "skus" s
    ON s."storeId" = pi."storeId"
   AND s."catalogRole" IN ('SIMPLE', 'VARIANT')
   AND LOWER(s."name") = LOWER(pi."title")
  GROUP BY pi."id"
  HAVING COUNT(*) = 1
) AS candidate
WHERE intelligence."id" = candidate."intelligenceId";
