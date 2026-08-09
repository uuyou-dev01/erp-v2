ALTER TABLE "notifications"
  ADD COLUMN "actionUrl" TEXT,
  ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'NORMAL';

ALTER TABLE "companion_devices" ADD COLUMN "installationId" TEXT;
UPDATE "companion_devices" SET "installationId" = "id" WHERE "installationId" IS NULL;
ALTER TABLE "companion_devices" ALTER COLUMN "installationId" SET NOT NULL;

CREATE UNIQUE INDEX "companion_devices_organizationId_userId_installationId_key"
  ON "companion_devices"("organizationId", "userId", "installationId");

CREATE TABLE "push_subscriptions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "userAgent" TEXT,
  "revokedAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  "lastFailureAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX "push_subscriptions_organizationId_userId_idx" ON "push_subscriptions"("organizationId", "userId");
CREATE INDEX "push_subscriptions_deviceId_idx" ON "push_subscriptions"("deviceId");
CREATE INDEX "push_subscriptions_revokedAt_idx" ON "push_subscriptions"("revokedAt");
