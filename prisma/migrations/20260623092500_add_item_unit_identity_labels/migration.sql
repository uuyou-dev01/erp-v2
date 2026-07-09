-- Add stable item-unit identity and label fields.
ALTER TABLE "item_units"
  ADD COLUMN "unitCode" TEXT,
  ADD COLUMN "labelCode" TEXT,
  ADD COLUMN "labelStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "labelPrintedAt" TIMESTAMP(3);

WITH numbered_item_units AS (
  SELECT
    "id",
    'IU-' || to_char("createdAt", 'YYYYMMDD') || '-' ||
      lpad(
        row_number() OVER (
          PARTITION BY "storeId", to_char("createdAt", 'YYYYMMDD')
          ORDER BY "createdAt", "id"
        )::text,
        6,
        '0'
      ) AS "generatedCode"
  FROM "item_units"
)
UPDATE "item_units"
SET
  "unitCode" = numbered_item_units."generatedCode",
  "labelCode" = numbered_item_units."generatedCode",
  "labelStatus" = 'PENDING'
FROM numbered_item_units
WHERE "item_units"."id" = numbered_item_units."id";

CREATE UNIQUE INDEX "item_units_storeId_unitCode_key"
  ON "item_units"("storeId", "unitCode");

CREATE UNIQUE INDEX "item_units_storeId_labelCode_key"
  ON "item_units"("storeId", "labelCode");
