ALTER TABLE "service_agreements"
ADD COLUMN "pausedByOrganizationId" TEXT,
ADD COLUMN "pausedAt" TIMESTAMP(3),
ADD COLUMN "supersedesAgreementId" TEXT;

CREATE INDEX "service_agreements_pausedByOrganizationId_status_idx"
ON "service_agreements"("pausedByOrganizationId", "status");

CREATE UNIQUE INDEX "service_agreements_supersedesAgreementId_key"
ON "service_agreements"("supersedesAgreementId");

ALTER TABLE "service_agreements"
ADD CONSTRAINT "service_agreements_pausedByOrganizationId_fkey"
FOREIGN KEY ("pausedByOrganizationId") REFERENCES "organizations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_agreements"
ADD CONSTRAINT "service_agreements_supersedesAgreementId_fkey"
FOREIGN KEY ("supersedesAgreementId") REFERENCES "service_agreements"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
