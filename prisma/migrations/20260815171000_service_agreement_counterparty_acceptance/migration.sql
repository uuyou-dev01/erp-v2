ALTER TABLE "service_agreements"
ADD COLUMN "proposedByOrganizationId" TEXT,
ADD COLUMN "acceptedById" TEXT,
ADD COLUMN "acceptedAt" TIMESTAMP(3),
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "service_agreements_proposedByOrganizationId_status_idx"
ON "service_agreements"("proposedByOrganizationId", "status");

ALTER TABLE "service_agreements"
ADD CONSTRAINT "service_agreements_proposedByOrganizationId_fkey"
FOREIGN KEY ("proposedByOrganizationId") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "service_agreements"
ADD CONSTRAINT "service_agreements_acceptedById_fkey"
FOREIGN KEY ("acceptedById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
