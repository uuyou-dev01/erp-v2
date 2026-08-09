ALTER TABLE "purchase_lines"
  ADD COLUMN "trackingMode" TEXT NOT NULL DEFAULT 'LOT';

CREATE INDEX "purchase_lines_trackingMode_idx"
  ON "purchase_lines"("trackingMode");
