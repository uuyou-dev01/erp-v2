CREATE TABLE "mobile_action_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "taskId" TEXT,
    "workItemId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "responsePayload" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobile_action_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mobile_action_requests_organizationId_userId_idempotencyKey_key"
ON "mobile_action_requests"("organizationId", "userId", "idempotencyKey");

CREATE INDEX "mobile_action_requests_organizationId_idx"
ON "mobile_action_requests"("organizationId");

CREATE INDEX "mobile_action_requests_userId_idx"
ON "mobile_action_requests"("userId");

CREATE INDEX "mobile_action_requests_taskId_idx"
ON "mobile_action_requests"("taskId");

CREATE INDEX "mobile_action_requests_workItemId_idx"
ON "mobile_action_requests"("workItemId");

CREATE INDEX "mobile_action_requests_status_idx"
ON "mobile_action_requests"("status");
