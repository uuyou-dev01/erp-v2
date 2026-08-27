ALTER TABLE "work_types"
  ADD COLUMN "settlementRate" DECIMAL(19, 4),
  ADD COLUMN "settlementCurrency" TEXT;

ALTER TABLE "work_records"
  ADD COLUMN "relationshipType" TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "locationId" TEXT,
  ADD COLUMN "executorOrganizationId" TEXT;

CREATE INDEX "work_records_relationshipType_occurredAt_idx"
  ON "work_records"("relationshipType", "occurredAt");
CREATE INDEX "work_records_locationId_occurredAt_idx"
  ON "work_records"("locationId", "occurredAt");
CREATE INDEX "work_records_executorOrganizationId_occurredAt_idx"
  ON "work_records"("executorOrganizationId", "occurredAt");

-- A current membership or warehouse roster entry cannot prove what the
-- relationship was when an older event happened. Keep legacy relationships
-- UNKNOWN and only backfill the task's immutable warehouse reference.
UPDATE "work_records" AS wr
SET "locationId" = (
    SELECT t."fulfillmentLocationId"
    FROM "tasks" AS t
    WHERE t."id" = wr."taskId"
  )
WHERE wr."taskId" IS NOT NULL;
