ALTER TABLE "notifications" ADD COLUMN "dedupeKey" TEXT;

CREATE TABLE "notification_preferences" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
  "digestMode" TEXT NOT NULL DEFAULT 'IMMEDIATE',
  "quietStart" TEXT,
  "quietEnd" TEXT,
  "mutedTypes" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_outbox" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notifications_recipientId_dedupeKey_key" ON "notifications"("recipientId", "dedupeKey");
CREATE UNIQUE INDEX "notification_preferences_organizationId_userId_key" ON "notification_preferences"("organizationId", "userId");
CREATE INDEX "notification_preferences_userId_idx" ON "notification_preferences"("userId");
CREATE UNIQUE INDEX "notification_outbox_notificationId_key" ON "notification_outbox"("notificationId");
CREATE INDEX "notification_outbox_status_nextAttemptAt_idx" ON "notification_outbox"("status", "nextAttemptAt");
CREATE INDEX "notification_outbox_organizationId_userId_idx" ON "notification_outbox"("organizationId", "userId");

ALTER TABLE "notification_outbox"
  ADD CONSTRAINT "notification_outbox_notificationId_fkey"
  FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
