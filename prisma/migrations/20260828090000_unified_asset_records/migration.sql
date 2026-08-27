ALTER TABLE "mobile_assets"
  ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'MOBILE_EVIDENCE',
  ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'ORGANIZATION_PRIVATE',
  ADD COLUMN "originalName" TEXT,
  ADD COLUMN "refType" TEXT,
  ADD COLUMN "refId" TEXT;

CREATE INDEX "mobile_assets_organizationId_visibility_idx"
  ON "mobile_assets"("organizationId", "visibility");

CREATE INDEX "mobile_assets_refType_refId_idx"
  ON "mobile_assets"("refType", "refId");
