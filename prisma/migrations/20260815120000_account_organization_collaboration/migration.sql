ALTER TABLE "organizations"
ADD COLUMN "collaborationCode" TEXT;

ALTER TABLE "users"
ALTER COLUMN "storeId" DROP NOT NULL;

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_storeId_fkey";
ALTER TABLE "users" ADD CONSTRAINT "users_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "organizations"
SET "collaborationCode" = 'ORG-' || replace(upper(substring(md5("id") from 1 for 8)), '0', 'X')
WHERE "collaborationCode" IS NULL;

ALTER TABLE "organizations"
ALTER COLUMN "collaborationCode" SET NOT NULL;

CREATE UNIQUE INDEX "organizations_collaborationCode_key"
ON "organizations"("collaborationCode");

CREATE TABLE "organization_invitations" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "invitedById" TEXT NOT NULL,
  "acceptedById" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization_invitation_stores" (
  "id" TEXT NOT NULL,
  "invitationId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  CONSTRAINT "organization_invitation_stores_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization_connections" (
  "id" TEXT NOT NULL,
  "requesterOrganizationId" TEXT NOT NULL,
  "targetOrganizationId" TEXT NOT NULL,
  "initiatingPartnerId" TEXT,
  "pairKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedById" TEXT NOT NULL,
  "respondedById" TEXT,
  "respondedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_invitations_tokenHash_key" ON "organization_invitations"("tokenHash");
CREATE INDEX "organization_invitations_organizationId_status_idx" ON "organization_invitations"("organizationId", "status");
CREATE INDEX "organization_invitations_email_status_idx" ON "organization_invitations"("email", "status");
CREATE INDEX "organization_invitations_expiresAt_idx" ON "organization_invitations"("expiresAt");
CREATE UNIQUE INDEX "organization_invitation_stores_invitationId_storeId_key" ON "organization_invitation_stores"("invitationId", "storeId");
CREATE INDEX "organization_invitation_stores_storeId_idx" ON "organization_invitation_stores"("storeId");
CREATE UNIQUE INDEX "organization_connections_pairKey_key" ON "organization_connections"("pairKey");
CREATE INDEX "organization_connections_requesterOrganizationId_status_idx" ON "organization_connections"("requesterOrganizationId", "status");
CREATE INDEX "organization_connections_targetOrganizationId_status_idx" ON "organization_connections"("targetOrganizationId", "status");
CREATE INDEX "organization_connections_initiatingPartnerId_idx" ON "organization_connections"("initiatingPartnerId");

ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organization_invitation_stores" ADD CONSTRAINT "organization_invitation_stores_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "organization_invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_invitation_stores" ADD CONSTRAINT "organization_invitation_stores_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_connections" ADD CONSTRAINT "organization_connections_requesterOrganizationId_fkey" FOREIGN KEY ("requesterOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_connections" ADD CONSTRAINT "organization_connections_targetOrganizationId_fkey" FOREIGN KEY ("targetOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_connections" ADD CONSTRAINT "organization_connections_initiatingPartnerId_fkey" FOREIGN KEY ("initiatingPartnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organization_connections" ADD CONSTRAINT "organization_connections_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_connections" ADD CONSTRAINT "organization_connections_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
