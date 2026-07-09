-- CreateTable
CREATE TABLE "product_intelligence_items" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT,
    "model" TEXT,
    "productKind" TEXT NOT NULL DEFAULT 'NEW',
    "description" TEXT,
    "imageUrl" TEXT,
    "tags" JSONB,
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_intelligence_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_intelligence_observations" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "priceType" TEXT NOT NULL DEFAULT 'SALE',
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "quantity" DECIMAL(19,4),
    "sourceName" TEXT,
    "platformName" TEXT,
    "conditionGrade" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'MEDIUM',
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_intelligence_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_intelligence_items_storeId_idx" ON "product_intelligence_items"("storeId");

-- CreateIndex
CREATE INDEX "product_intelligence_items_visibility_idx" ON "product_intelligence_items"("visibility");

-- CreateIndex
CREATE INDEX "product_intelligence_items_status_idx" ON "product_intelligence_items"("status");

-- CreateIndex
CREATE INDEX "product_intelligence_items_category_idx" ON "product_intelligence_items"("category");

-- CreateIndex
CREATE INDEX "product_intelligence_items_updatedAt_idx" ON "product_intelligence_items"("updatedAt");

-- CreateIndex
CREATE INDEX "product_intelligence_observations_itemId_idx" ON "product_intelligence_observations"("itemId");

-- CreateIndex
CREATE INDEX "product_intelligence_observations_storeId_idx" ON "product_intelligence_observations"("storeId");

-- CreateIndex
CREATE INDEX "product_intelligence_observations_sourceType_idx" ON "product_intelligence_observations"("sourceType");

-- CreateIndex
CREATE INDEX "product_intelligence_observations_priceType_idx" ON "product_intelligence_observations"("priceType");

-- CreateIndex
CREATE INDEX "product_intelligence_observations_visibility_idx" ON "product_intelligence_observations"("visibility");

-- CreateIndex
CREATE INDEX "product_intelligence_observations_observedAt_idx" ON "product_intelligence_observations"("observedAt");

-- AddForeignKey
ALTER TABLE "product_intelligence_items" ADD CONSTRAINT "product_intelligence_items_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_intelligence_observations" ADD CONSTRAINT "product_intelligence_observations_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "product_intelligence_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_intelligence_observations" ADD CONSTRAINT "product_intelligence_observations_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
