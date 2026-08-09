CREATE TABLE "mobile_rate_limit_buckets" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mobile_rate_limit_buckets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mobile_rate_limit_buckets_organizationId_subjectId_key_windowStart_key"
  ON "mobile_rate_limit_buckets"("organizationId", "subjectId", "key", "windowStart");
CREATE INDEX "mobile_rate_limit_buckets_expiresAt_idx" ON "mobile_rate_limit_buckets"("expiresAt");
