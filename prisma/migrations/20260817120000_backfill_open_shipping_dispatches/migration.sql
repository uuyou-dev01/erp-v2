-- Backfill only unfinished, single-location shipment tasks that predate the
-- collaboration protocol. Completed work already has immutable WorkRecord rows
-- and must not be replayed.
ALTER TABLE "task_dispatches"
ADD COLUMN IF NOT EXISTS "capabilityLocationId" TEXT;

CREATE INDEX IF NOT EXISTS "task_dispatches_capabilityLocationId_idx"
ON "task_dispatches"("capabilityLocationId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'task_dispatches_capabilityLocationId_fkey'
  ) THEN
    ALTER TABLE "task_dispatches"
    ADD CONSTRAINT "task_dispatches_capabilityLocationId_fkey"
    FOREIGN KEY ("capabilityLocationId") REFERENCES "locations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "collaboration_requests" (
  "id", "organizationId", "protocol", "protocolVersion", "kind", "status",
  "acceptancePolicy", "requesterScopeType", "requesterScopeRef",
  "targetScopeType", "targetScopeRef", "idempotencyKey", "payload",
  "resolvedAt", "resolutionCode", "createdById", "createdAt", "updatedAt"
)
SELECT
  'cr_' || md5(t."id"),
  t."organizationId",
  'warehouse.shipping',
  1,
  'SHIP_ORDER',
  CASE WHEN t."assignedToId" IS NULL THEN 'OPEN' ELSE 'ACCEPTED' END::"CollaborationRequestStatus",
  'FIRST_ACCEPT'::"CollaborationAcceptancePolicy",
  'USER'::"CollaborationScopeType",
  t."createdById",
  'LOCATION'::"CollaborationScopeType",
  t."fulfillmentLocationId",
  'backfill:ship-order:' || t."id",
  jsonb_build_object(
    'orderId', t."refId",
    'locationId', t."fulfillmentLocationId",
    'backfilled', true
  ),
  CASE WHEN t."assignedToId" IS NULL THEN NULL ELSE COALESCE(t."assignedAt", t."updatedAt") END,
  CASE WHEN t."assignedToId" IS NULL THEN NULL ELSE 'LEGACY_ASSIGNMENT' END,
  t."createdById",
  t."createdAt",
  t."updatedAt"
FROM "tasks" t
WHERE t."type" = 'SHIP_ORDER'
  AND t."refType" = 'CUSTOMER_ORDER'
  AND t."fulfillmentLocationId" IS NOT NULL
  AND t."status" IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'OVERDUE')
  AND NOT EXISTS (SELECT 1 FROM "task_dispatches" d WHERE d."taskId" = t."id")
ON CONFLICT ("organizationId", "idempotencyKey") DO NOTHING;

INSERT INTO "task_dispatches" (
  "id", "requestId", "taskId", "targetScopeType", "targetScopeRef",
  "requiredCapability", "capabilityLocationId", "status", "idempotencyKey",
  "claimedByUserId", "claimedAt", "metadata", "createdAt", "updatedAt"
)
SELECT
  'td_' || md5(t."id"),
  r."id",
  t."id",
  'LOCATION'::"CollaborationScopeType",
  t."fulfillmentLocationId",
  'warehouse.ship',
  t."fulfillmentLocationId",
  CASE WHEN t."assignedToId" IS NULL THEN 'QUEUED' ELSE 'CLAIMED' END::"TaskDispatchStatus",
  'backfill:dispatch:' || t."id",
  t."assignedToId",
  CASE WHEN t."assignedToId" IS NULL THEN NULL ELSE COALESCE(t."assignedAt", t."updatedAt") END,
  jsonb_build_object('backfilled', true),
  t."createdAt",
  t."updatedAt"
FROM "tasks" t
JOIN "collaboration_requests" r
  ON r."organizationId" = t."organizationId"
 AND r."idempotencyKey" = 'backfill:ship-order:' || t."id"
WHERE t."type" = 'SHIP_ORDER'
  AND t."refType" = 'CUSTOMER_ORDER'
  AND t."fulfillmentLocationId" IS NOT NULL
  AND t."status" IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'OVERDUE')
ON CONFLICT ("taskId") DO NOTHING;

INSERT INTO "collaboration_events" (
  "id", "requestId", "dispatchId", "type", "actorScopeType", "actorScopeRef",
  "dedupeKey", "payload", "occurredAt", "createdAt"
)
SELECT
  'ce_' || md5(d."id" || ':requested'), d."requestId", d."id",
  'REQUESTED'::"CollaborationEventType", 'USER'::"CollaborationScopeType", r."createdById",
  'request:created', jsonb_build_object('backfilled', true), r."createdAt", r."createdAt"
FROM "task_dispatches" d
JOIN "collaboration_requests" r ON r."id" = d."requestId"
WHERE r."idempotencyKey" LIKE 'backfill:ship-order:%'
ON CONFLICT ("requestId", "dedupeKey") DO NOTHING;

INSERT INTO "collaboration_events" (
  "id", "requestId", "dispatchId", "type", "actorScopeType", "actorScopeRef",
  "dedupeKey", "payload", "occurredAt", "createdAt"
)
SELECT
  'ce_' || md5(d."id" || ':dispatched'), d."requestId", d."id",
  'TASK_DISPATCHED'::"CollaborationEventType", 'USER'::"CollaborationScopeType", r."createdById",
  'dispatch:' || d."id" || ':created', jsonb_build_object('backfilled', true), d."createdAt", d."createdAt"
FROM "task_dispatches" d
JOIN "collaboration_requests" r ON r."id" = d."requestId"
WHERE r."idempotencyKey" LIKE 'backfill:ship-order:%'
ON CONFLICT ("requestId", "dedupeKey") DO NOTHING;

INSERT INTO "collaboration_responses" (
  "id", "requestId", "responderScopeType", "responderScopeRef", "decision",
  "idempotencyKey", "payload", "respondedAt", "createdAt"
)
SELECT
  'cp_' || md5(d."id" || ':' || d."claimedByUserId"), d."requestId",
  'USER'::"CollaborationScopeType", d."claimedByUserId", 'ACCEPT'::"CollaborationResponseDecision",
  'backfill:claim:' || d."claimedByUserId", jsonb_build_object('backfilled', true),
  d."claimedAt", d."claimedAt"
FROM "task_dispatches" d
JOIN "collaboration_requests" r ON r."id" = d."requestId"
WHERE r."idempotencyKey" LIKE 'backfill:ship-order:%'
  AND d."status" = 'CLAIMED'
  AND d."claimedByUserId" IS NOT NULL
ON CONFLICT ("requestId", "responderScopeType", "responderScopeRef") DO NOTHING;

-- Queue notifications are snapshots. Eligibility is still rechecked when the
-- user claims the task, so a stale notification never grants permission.
INSERT INTO "notifications" (
  "id", "organizationId", "storeId", "recipientId", "actorId", "taskId",
  "refType", "refId", "type", "title", "body", "actionUrl", "priority",
  "dedupeKey", "createdAt", "updatedAt"
)
SELECT
  'nt_' || md5(t."id" || ':' || f."userId"), t."organizationId", t."storeId",
  f."userId", t."createdById", t."id", 'CUSTOMER_ORDER', t."refId",
  'WAREHOUSE_TASK_AVAILABLE', '仓库有待领取的发货任务', t."title",
  '/collaboration/tasks?task=' || t."id", 'NORMAL',
  'warehouse-task:' || t."id" || ':available', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "tasks" t
JOIN "task_dispatches" d ON d."taskId" = t."id" AND d."status" = 'QUEUED'
JOIN "location_fulfillers" f
  ON f."organizationId" = t."organizationId"
 AND f."locationId" = t."fulfillmentLocationId"
 AND f."status" = 'ACTIVE'
 AND f."userId" IS NOT NULL
 AND f."role" IN ('MANAGER', 'OPERATOR', 'BACKUP')
ON CONFLICT ("recipientId", "dedupeKey") DO NOTHING;

INSERT INTO "notification_outbox" (
  "id", "notificationId", "organizationId", "userId", "status",
  "attempts", "nextAttemptAt", "createdAt", "updatedAt"
)
SELECT
  'no_' || md5(n."id"), n."id", n."organizationId", n."recipientId",
  'PENDING', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "notifications" n
WHERE n."type" = 'WAREHOUSE_TASK_AVAILABLE'
  AND n."dedupeKey" LIKE 'warehouse-task:%:available'
  AND NOT EXISTS (SELECT 1 FROM "notification_outbox" o WHERE o."notificationId" = n."id");
