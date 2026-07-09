-- AlterTable
ALTER TABLE "product_intelligence_items" ADD COLUMN "parentItemId" TEXT;

-- CreateIndex
CREATE INDEX "product_intelligence_items_parentItemId_idx" ON "product_intelligence_items"("parentItemId");

-- AddForeignKey
ALTER TABLE "product_intelligence_items" ADD CONSTRAINT "product_intelligence_items_parentItemId_fkey" FOREIGN KEY ("parentItemId") REFERENCES "product_intelligence_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
