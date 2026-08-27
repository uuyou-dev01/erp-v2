ALTER TABLE "tasks"
ADD COLUMN "fulfillmentLocationId" TEXT;

CREATE INDEX "tasks_fulfillmentLocationId_status_idx"
ON "tasks"("fulfillmentLocationId", "status");

CREATE TABLE "location_fulfillers" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "userId" TEXT,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'OPERATOR',
  "status" TEXT NOT NULL DEFAULT 'INVITED',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "tokenHash" TEXT,
  "expiresAt" TIMESTAMP(3),
  "invitedById" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "suspendedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "location_fulfillers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "location_fulfillers_tokenHash_key"
ON "location_fulfillers"("tokenHash");

CREATE UNIQUE INDEX "location_fulfillers_locationId_email_key"
ON "location_fulfillers"("locationId", "email");

CREATE INDEX "location_fulfillers_organizationId_status_idx"
ON "location_fulfillers"("organizationId", "status");

CREATE INDEX "location_fulfillers_locationId_status_isDefault_idx"
ON "location_fulfillers"("locationId", "status", "isDefault");

CREATE INDEX "location_fulfillers_userId_status_idx"
ON "location_fulfillers"("userId", "status");

CREATE INDEX "location_fulfillers_expiresAt_idx"
ON "location_fulfillers"("expiresAt");

ALTER TABLE "location_fulfillers"
ADD CONSTRAINT "location_fulfillers_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "location_fulfillers"
ADD CONSTRAINT "location_fulfillers_locationId_fkey"
FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "location_fulfillers"
ADD CONSTRAINT "location_fulfillers_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "location_fulfillers"
ADD CONSTRAINT "location_fulfillers_invitedById_fkey"
FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
