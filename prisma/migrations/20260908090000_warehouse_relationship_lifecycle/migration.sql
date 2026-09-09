CREATE TABLE "location_fulfiller_events" (
    "id" TEXT NOT NULL,
    "fulfillerId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_fulfiller_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "location_fulfiller_events_fulfillerId_createdAt_idx"
ON "location_fulfiller_events"("fulfillerId", "createdAt");

CREATE INDEX "location_fulfiller_events_actorUserId_createdAt_idx"
ON "location_fulfiller_events"("actorUserId", "createdAt");

CREATE INDEX "location_fulfiller_events_eventType_createdAt_idx"
ON "location_fulfiller_events"("eventType", "createdAt");

ALTER TABLE "location_fulfiller_events"
ADD CONSTRAINT "location_fulfiller_events_fulfillerId_fkey"
FOREIGN KEY ("fulfillerId") REFERENCES "location_fulfillers"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "location_fulfiller_events"
ADD CONSTRAINT "location_fulfiller_events_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve the pre-migration relationship state as the first audit event.
INSERT INTO "location_fulfiller_events" (
  "id", "fulfillerId", "eventType", "actorUserId", "fromStatus", "toStatus", "metadata", "createdAt"
)
SELECT
  CONCAT('lfe_backfill_', "id"),
  "id",
  CASE
    WHEN "status" = 'ACTIVE' THEN 'ACCEPTED'
    WHEN "status" = 'SUSPENDED' THEN 'SUSPENDED'
    ELSE 'INVITED'
  END,
  "invitedById",
  NULL,
  "status",
  jsonb_build_object('source', 'migration_backfill'),
  COALESCE("acceptedAt", "createdAt")
FROM "location_fulfillers";
