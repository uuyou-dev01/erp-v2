CREATE TABLE "work_types" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "pointsPerUnit" DECIMAL(19,4),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "work_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_records" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workTypeId" TEXT NOT NULL,
  "taskId" TEXT,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "workCode" TEXT NOT NULL,
  "workName" TEXT NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL,
  "unit" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
  "dedupeKey" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "work_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "work_types_organizationId_code_key"
ON "work_types"("organizationId", "code");
CREATE INDEX "work_types_organizationId_status_idx"
ON "work_types"("organizationId", "status");

CREATE UNIQUE INDEX "work_records_organizationId_dedupeKey_key"
ON "work_records"("organizationId", "dedupeKey");
CREATE INDEX "work_records_organizationId_occurredAt_idx"
ON "work_records"("organizationId", "occurredAt");
CREATE INDEX "work_records_storeId_occurredAt_idx"
ON "work_records"("storeId", "occurredAt");
CREATE INDEX "work_records_userId_occurredAt_idx"
ON "work_records"("userId", "occurredAt");
CREATE INDEX "work_records_workTypeId_occurredAt_idx"
ON "work_records"("workTypeId", "occurredAt");
CREATE INDEX "work_records_sourceType_sourceId_idx"
ON "work_records"("sourceType", "sourceId");
CREATE INDEX "work_records_taskId_idx" ON "work_records"("taskId");

ALTER TABLE "work_types"
ADD CONSTRAINT "work_types_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_records"
ADD CONSTRAINT "work_records_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_records"
ADD CONSTRAINT "work_records_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "stores"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_records"
ADD CONSTRAINT "work_records_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_records"
ADD CONSTRAINT "work_records_workTypeId_fkey"
FOREIGN KEY ("workTypeId") REFERENCES "work_types"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_records"
ADD CONSTRAINT "work_records_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "tasks"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
