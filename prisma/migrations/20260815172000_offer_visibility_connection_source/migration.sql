ALTER TABLE "offer_visibility"
ADD COLUMN "organizationConnectionId" TEXT;

UPDATE "offer_visibility" AS visibility
SET "organizationConnectionId" = connection."id"
FROM "supply_offers" AS offer,
     "organization_connections" AS connection
WHERE visibility."offerId" = offer."id"
  AND visibility."viewerOrganizationId" IS NOT NULL
  AND connection."status" = 'ACTIVE'
  AND (
    (
      connection."requesterOrganizationId" = offer."organizationId"
      AND connection."targetOrganizationId" = visibility."viewerOrganizationId"
    )
    OR
    (
      connection."targetOrganizationId" = offer."organizationId"
      AND connection."requesterOrganizationId" = visibility."viewerOrganizationId"
    )
  );

CREATE INDEX "offer_visibility_organizationConnectionId_idx"
ON "offer_visibility"("organizationConnectionId");

ALTER TABLE "offer_visibility"
ADD CONSTRAINT "offer_visibility_organizationConnectionId_fkey"
FOREIGN KEY ("organizationConnectionId") REFERENCES "organization_connections"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
