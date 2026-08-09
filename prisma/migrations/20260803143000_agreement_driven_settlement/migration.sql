-- A货盘 records the parties' actual agreement. Structured rules are optional
-- calculation helpers; the human-readable terms and version remain the audit source.
ALTER TABLE "partners"
  ADD COLUMN "organizationId" TEXT;

ALTER TABLE "supply_offers"
  ADD COLUMN "dropshipFeeCurrency" TEXT,
  ADD COLUMN "agreementTerms" TEXT,
  ADD COLUMN "agreementRule" JSONB,
  ADD COLUMN "agreementVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "agreementStatus" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "agreementConfirmedAt" TIMESTAMP(3);

ALTER TABLE "resale_listings"
  ADD COLUMN "dropshipFeeCurrency" TEXT,
  ADD COLUMN "agreementTermsSnapshot" TEXT,
  ADD COLUMN "agreementRuleSnapshot" JSONB,
  ADD COLUMN "agreementVersion" INTEGER,
  ADD COLUMN "agreementAcceptedAt" TIMESTAMP(3);

ALTER TABLE "settlements"
  ADD COLUMN "agreementTermsSnapshot" TEXT,
  ADD COLUMN "agreementRuleSnapshot" JSONB,
  ADD COLUMN "agreementVersion" INTEGER;

ALTER TABLE "offer_visibility"
  ADD COLUMN "viewerOrganizationId" TEXT;

-- Preserve existing behavior as an explicit legacy suggestion. New records are
-- allowed to use MANUAL, PROFIT_PERCENT, or future JSON rules without a schema change.
UPDATE "supply_offers"
SET "agreementRule" = jsonb_strip_nulls(jsonb_build_object(
      'kind', CASE "commissionType"
        WHEN 'PERCENT' THEN 'SALE_PERCENT'
        WHEN 'FIXED' THEN 'FIXED_PER_UNIT'
        WHEN 'HYBRID' THEN 'SALE_PERCENT_PLUS_FIXED'
        ELSE 'MARGIN'
      END,
      'rate', "commissionRate",
      'fixedAmount', "commissionFixedAmount",
      'fixedCurrency', "currency"
    )),
    "agreementTerms" = CASE "commissionType"
      WHEN 'PERCENT' THEN '历史规则：按成交额比例返佣'
      WHEN 'FIXED' THEN '历史规则：每件固定返佣'
      WHEN 'HYBRID' THEN '历史规则：成交额比例加每件固定返佣'
      ELSE '历史规则：货主收取供货价，代卖方保留差价'
    END,
    "dropshipFeeCurrency" = COALESCE("currency", "settlementCurrency"),
    "agreementStatus" = CASE WHEN "status" IN ('PUBLISHED', 'PAUSED') THEN 'CONFIRMED' ELSE 'DRAFT' END,
    "agreementConfirmedAt" = CASE WHEN "status" IN ('PUBLISHED', 'PAUSED') THEN COALESCE("publishedAt", "updatedAt") ELSE NULL END
WHERE "agreementRule" IS NULL;

UPDATE "resale_listings" listing
SET "dropshipFeeCurrency" = COALESCE(listing."currency", offer."currency"),
    "agreementTermsSnapshot" = offer."agreementTerms",
    "agreementRuleSnapshot" = offer."agreementRule",
    "agreementVersion" = offer."agreementVersion",
    "agreementAcceptedAt" = listing."createdAt"
FROM "supply_offers" offer
WHERE offer."id" = listing."supplyOfferId"
  AND listing."agreementRuleSnapshot" IS NULL;

CREATE INDEX "partners_organizationId_idx" ON "partners"("organizationId");
CREATE INDEX "offer_visibility_viewerOrganizationId_idx" ON "offer_visibility"("viewerOrganizationId");

ALTER TABLE "partners"
  ADD CONSTRAINT "partners_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "offer_visibility"
  ADD CONSTRAINT "offer_visibility_viewerOrganizationId_fkey"
  FOREIGN KEY ("viewerOrganizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
