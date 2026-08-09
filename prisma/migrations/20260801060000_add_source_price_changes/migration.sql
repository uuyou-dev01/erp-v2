CREATE TABLE "source_price_changes" (
  "id" TEXT NOT NULL,
  "sourceListingId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "captureId" TEXT,
  "previousAmount" DECIMAL(19,4) NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "currency" TEXT NOT NULL,
  "deltaAmount" DECIMAL(19,4) NOT NULL,
  "deltaRate" DECIMAL(12,6),
  "observedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "source_price_changes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "source_price_changes_snapshotId_key" ON "source_price_changes"("snapshotId");
CREATE INDEX "source_price_changes_sourceListingId_observedAt_idx" ON "source_price_changes"("sourceListingId", "observedAt");
CREATE INDEX "source_price_changes_captureId_idx" ON "source_price_changes"("captureId");

ALTER TABLE "source_price_changes"
  ADD CONSTRAINT "source_price_changes_sourceListingId_fkey"
  FOREIGN KEY ("sourceListingId") REFERENCES "source_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_price_changes"
  ADD CONSTRAINT "source_price_changes_snapshotId_fkey"
  FOREIGN KEY ("snapshotId") REFERENCES "source_listing_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_price_changes"
  ADD CONSTRAINT "source_price_changes_captureId_fkey"
  FOREIGN KEY ("captureId") REFERENCES "product_intelligence_captures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
