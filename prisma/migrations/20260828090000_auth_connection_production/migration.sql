ALTER TABLE "users"
ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "accountStatus" TEXT NOT NULL DEFAULT 'ACTIVE';

CREATE TABLE "auth_tokens" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_tokens_tokenHash_key" ON "auth_tokens"("tokenHash");
CREATE INDEX "auth_tokens_userId_type_consumedAt_expiresAt_idx" ON "auth_tokens"("userId", "type", "consumedAt", "expiresAt");
CREATE INDEX "auth_tokens_expiresAt_idx" ON "auth_tokens"("expiresAt");
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "auth_rate_limit_buckets" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "subjectHash" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "auth_rate_limit_buckets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_rate_limit_buckets_action_subjectHash_windowStart_key" ON "auth_rate_limit_buckets"("action", "subjectHash", "windowStart");
CREATE INDEX "auth_rate_limit_buckets_expiresAt_idx" ON "auth_rate_limit_buckets"("expiresAt");

CREATE TABLE "auth_audit_events" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "eventType" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "subjectHash" TEXT,
  "ipHash" TEXT,
  "userAgentHash" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auth_audit_events_userId_createdAt_idx" ON "auth_audit_events"("userId", "createdAt");
CREATE INDEX "auth_audit_events_eventType_outcome_createdAt_idx" ON "auth_audit_events"("eventType", "outcome", "createdAt");
CREATE INDEX "auth_audit_events_subjectHash_createdAt_idx" ON "auth_audit_events"("subjectHash", "createdAt");
ALTER TABLE "auth_audit_events" ADD CONSTRAINT "auth_audit_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "organization_connection_events" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_connection_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "organization_connection_events_connectionId_createdAt_idx" ON "organization_connection_events"("connectionId", "createdAt");
CREATE INDEX "organization_connection_events_actorUserId_createdAt_idx" ON "organization_connection_events"("actorUserId", "createdAt");
CREATE INDEX "organization_connection_events_eventType_createdAt_idx" ON "organization_connection_events"("eventType", "createdAt");
ALTER TABLE "organization_connection_events" ADD CONSTRAINT "organization_connection_events_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "organization_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_connection_events" ADD CONSTRAINT "organization_connection_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "organization_connection_events" (
  "id", "connectionId", "eventType", "actorUserId", "fromStatus", "toStatus", "metadata", "createdAt"
)
SELECT
  'conn_evt_' || md5("id" || ':initial'),
  "id",
  'IMPORTED',
  COALESCE("respondedById", "requestedById"),
  NULL,
  "status",
  jsonb_build_object('source', 'migration-backfill'),
  "updatedAt"
FROM "organization_connections";

CREATE OR REPLACE FUNCTION prevent_organization_connection_event_mutation()
RETURNS trigger AS $$
BEGIN
  IF current_setting('erp.allow_audit_event_mutation', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'organization_connection_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER organization_connection_events_append_only
BEFORE UPDATE OR DELETE ON "organization_connection_events"
FOR EACH ROW EXECUTE FUNCTION prevent_organization_connection_event_mutation();
