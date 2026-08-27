CREATE TYPE "CollaborationScopeType" AS ENUM ('ORGANIZATION', 'LOCATION', 'ROLE', 'USER');
CREATE TYPE "CollaborationAcceptancePolicy" AS ENUM ('FIRST_ACCEPT', 'DIRECT_ACCEPT', 'AUTHORIZED_APPROVAL');
CREATE TYPE "CollaborationRequestStatus" AS ENUM ('OPEN', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'CANCELLED', 'EXPIRED', 'CLOSED');
CREATE TYPE "CollaborationResponseDecision" AS ENUM ('ACCEPT', 'REJECT', 'APPROVE', 'DENY');
CREATE TYPE "CollaborationEventType" AS ENUM (
  'REQUESTED',
  'RESPONSE_RECORDED',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
  'CANCELLED',
  'EXPIRED',
  'CLOSED',
  'TASK_DISPATCHED',
  'TASK_ACCEPTED',
  'TASK_REJECTED',
  'TASK_COMPLETED'
);
CREATE TYPE "TaskDispatchStatus" AS ENUM ('QUEUED', 'CLAIMED', 'COMPLETED', 'CANCELLED');

CREATE TABLE "collaboration_requests" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "protocol" TEXT NOT NULL,
  "protocolVersion" INTEGER NOT NULL DEFAULT 1,
  "kind" TEXT NOT NULL,
  "status" "CollaborationRequestStatus" NOT NULL DEFAULT 'OPEN',
  "acceptancePolicy" "CollaborationAcceptancePolicy" NOT NULL,
  "requesterScopeType" "CollaborationScopeType" NOT NULL,
  "requesterScopeRef" TEXT NOT NULL,
  "targetScopeType" "CollaborationScopeType" NOT NULL,
  "targetScopeRef" TEXT NOT NULL,
  "parentRequestId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "payload" JSONB,
  "expiresAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "resolutionCode" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "collaboration_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "collaboration_requests_requester_scope_check" CHECK (length(btrim("requesterScopeRef")) > 0),
  CONSTRAINT "collaboration_requests_target_scope_check" CHECK (length(btrim("targetScopeRef")) > 0),
  CONSTRAINT "collaboration_requests_parent_check" CHECK ("parentRequestId" IS NULL OR "parentRequestId" <> "id")
);

CREATE TABLE "collaboration_responses" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "responderScopeType" "CollaborationScopeType" NOT NULL,
  "responderScopeRef" TEXT NOT NULL,
  "decision" "CollaborationResponseDecision" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "payload" JSONB,
  "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collaboration_responses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "collaboration_responses_responder_scope_check" CHECK (length(btrim("responderScopeRef")) > 0)
);

CREATE TABLE "task_dispatches" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "taskId" TEXT,
  "targetScopeType" "CollaborationScopeType" NOT NULL,
  "targetScopeRef" TEXT NOT NULL,
  "requiredCapability" TEXT,
  "capabilityLocationId" TEXT,
  "status" "TaskDispatchStatus" NOT NULL DEFAULT 'QUEUED',
  "idempotencyKey" TEXT NOT NULL,
  "claimedByUserId" TEXT,
  "claimedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "task_dispatches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_dispatches_target_scope_check" CHECK (length(btrim("targetScopeRef")) > 0)
);

CREATE TABLE "collaboration_events" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "responseId" TEXT,
  "dispatchId" TEXT,
  "type" "CollaborationEventType" NOT NULL,
  "actorScopeType" "CollaborationScopeType",
  "actorScopeRef" TEXT,
  "dedupeKey" TEXT NOT NULL,
  "payload" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collaboration_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "collaboration_events_actor_scope_check" CHECK (
    ("actorScopeType" IS NULL AND "actorScopeRef" IS NULL)
    OR ("actorScopeType" IS NOT NULL AND length(btrim("actorScopeRef")) > 0)
  )
);

CREATE UNIQUE INDEX "collaboration_requests_organizationId_idempotencyKey_key"
ON "collaboration_requests"("organizationId", "idempotencyKey");
CREATE INDEX "collaboration_requests_organizationId_status_createdAt_idx"
ON "collaboration_requests"("organizationId", "status", "createdAt");
CREATE INDEX "collaboration_requests_protocol_kind_status_idx"
ON "collaboration_requests"("protocol", "kind", "status");
CREATE INDEX "collaboration_requests_targetScopeType_targetScopeRef_status_idx"
ON "collaboration_requests"("targetScopeType", "targetScopeRef", "status");
CREATE INDEX "collaboration_requests_parentRequestId_idx"
ON "collaboration_requests"("parentRequestId");
CREATE INDEX "collaboration_requests_expiresAt_status_idx"
ON "collaboration_requests"("expiresAt", "status");

CREATE UNIQUE INDEX "collaboration_responses_requestId_idempotencyKey_key"
ON "collaboration_responses"("requestId", "idempotencyKey");
CREATE INDEX "collaboration_responses_requestId_responderScopeType_responderScopeRef_idx"
ON "collaboration_responses"("requestId", "responderScopeType", "responderScopeRef");
CREATE INDEX "collaboration_responses_requestId_decision_respondedAt_idx"
ON "collaboration_responses"("requestId", "decision", "respondedAt");

CREATE UNIQUE INDEX "task_dispatches_taskId_key" ON "task_dispatches"("taskId");
CREATE UNIQUE INDEX "task_dispatches_requestId_idempotencyKey_key"
ON "task_dispatches"("requestId", "idempotencyKey");
CREATE INDEX "task_dispatches_requestId_status_idx" ON "task_dispatches"("requestId", "status");
CREATE INDEX "task_dispatches_targetScopeType_targetScopeRef_status_idx"
ON "task_dispatches"("targetScopeType", "targetScopeRef", "status");
CREATE INDEX "task_dispatches_claimedByUserId_status_idx"
ON "task_dispatches"("claimedByUserId", "status");
CREATE INDEX "task_dispatches_capabilityLocationId_idx"
ON "task_dispatches"("capabilityLocationId");

CREATE UNIQUE INDEX "collaboration_events_requestId_dedupeKey_key"
ON "collaboration_events"("requestId", "dedupeKey");
CREATE INDEX "collaboration_events_requestId_occurredAt_idx"
ON "collaboration_events"("requestId", "occurredAt");
CREATE INDEX "collaboration_events_responseId_idx" ON "collaboration_events"("responseId");
CREATE INDEX "collaboration_events_dispatchId_idx" ON "collaboration_events"("dispatchId");

ALTER TABLE "collaboration_requests"
ADD CONSTRAINT "collaboration_requests_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collaboration_requests"
ADD CONSTRAINT "collaboration_requests_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "collaboration_requests"
ADD CONSTRAINT "collaboration_requests_parentRequestId_fkey"
FOREIGN KEY ("parentRequestId") REFERENCES "collaboration_requests"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "collaboration_responses"
ADD CONSTRAINT "collaboration_responses_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "collaboration_requests"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_dispatches"
ADD CONSTRAINT "task_dispatches_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "collaboration_requests"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_dispatches"
ADD CONSTRAINT "task_dispatches_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "tasks"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "task_dispatches"
ADD CONSTRAINT "task_dispatches_claimedByUserId_fkey"
FOREIGN KEY ("claimedByUserId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "task_dispatches"
ADD CONSTRAINT "task_dispatches_capabilityLocationId_fkey"
FOREIGN KEY ("capabilityLocationId") REFERENCES "locations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "collaboration_events"
ADD CONSTRAINT "collaboration_events_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "collaboration_requests"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collaboration_events"
ADD CONSTRAINT "collaboration_events_responseId_fkey"
FOREIGN KEY ("responseId") REFERENCES "collaboration_responses"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "collaboration_events"
ADD CONSTRAINT "collaboration_events_dispatchId_fkey"
FOREIGN KEY ("dispatchId") REFERENCES "task_dispatches"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notifications"
ADD COLUMN "resolvedAt" TIMESTAMP(3),
ADD COLUMN "resolutionCode" TEXT,
ADD COLUMN "resolvedById" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "notifications" ALTER COLUMN "updatedAt" DROP DEFAULT;
CREATE INDEX "notifications_resolvedAt_idx" ON "notifications"("resolvedAt");
