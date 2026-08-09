-- Product category master data: shared system taxonomy plus organization-owned taxonomy.
CREATE TABLE "product_categories" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'ORGANIZATION',
    "organizationId" TEXT,
    "parentId" TEXT,
    "canonicalCategoryId" TEXT,
    "mergedIntoId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" JSONB,
    "path" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "skus" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "product_intelligence_items" ADD COLUMN "categoryId" TEXT;

CREATE UNIQUE INDEX "product_categories_organizationId_code_key"
    ON "product_categories"("organizationId", "code");
CREATE UNIQUE INDEX "product_categories_system_code_key"
    ON "product_categories"("code") WHERE "organizationId" IS NULL;
CREATE INDEX "product_categories_scope_status_idx"
    ON "product_categories"("scope", "status");
CREATE INDEX "product_categories_organizationId_status_idx"
    ON "product_categories"("organizationId", "status");
CREATE INDEX "product_categories_parentId_idx"
    ON "product_categories"("parentId");
CREATE INDEX "product_categories_canonicalCategoryId_idx"
    ON "product_categories"("canonicalCategoryId");
CREATE INDEX "product_categories_mergedIntoId_idx"
    ON "product_categories"("mergedIntoId");
CREATE INDEX "skus_categoryId_idx" ON "skus"("categoryId");
CREATE INDEX "product_intelligence_items_categoryId_idx"
    ON "product_intelligence_items"("categoryId");

ALTER TABLE "product_categories"
    ADD CONSTRAINT "product_categories_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_categories"
    ADD CONSTRAINT "product_categories_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "product_categories"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_categories"
    ADD CONSTRAINT "product_categories_canonicalCategoryId_fkey"
    FOREIGN KEY ("canonicalCategoryId") REFERENCES "product_categories"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_categories"
    ADD CONSTRAINT "product_categories_mergedIntoId_fkey"
    FOREIGN KEY ("mergedIntoId") REFERENCES "product_categories"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "skus"
    ADD CONSTRAINT "skus_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "product_categories"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_intelligence_items"
    ADD CONSTRAINT "product_intelligence_items_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "product_categories"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the stable top-level taxonomy in the migration itself. The application
-- bootstrap expands these roots into the maintained child taxonomy.
INSERT INTO "product_categories"
    ("id", "scope", "organizationId", "code", "name", "aliases", "path", "level", "sortOrder", "status", "updatedAt")
VALUES
    ('syscat_shoes_apparel', 'SYSTEM', NULL, 'SHOES_APPAREL', '鞋服', '["服饰"]'::jsonb, '鞋服', 0, 10, 'ACTIVE', CURRENT_TIMESTAMP),
    ('syscat_jewelry', 'SYSTEM', NULL, 'JEWELRY_ACCESSORIES', '首饰配件', '["饰品","珠宝"]'::jsonb, '首饰配件', 0, 20, 'ACTIVE', CURRENT_TIMESTAMP),
    ('syscat_toys_collectibles', 'SYSTEM', NULL, 'TOYS_COLLECTIBLES', '玩具与收藏', '["玩具","收藏品"]'::jsonb, '玩具与收藏', 0, 30, 'ACTIVE', CURRENT_TIMESTAMP),
    ('syscat_bags', 'SYSTEM', NULL, 'BAGS_LUGGAGE', '箱包', '["包袋","中古包"]'::jsonb, '箱包', 0, 40, 'ACTIVE', CURRENT_TIMESTAMP),
    ('syscat_daily_life', 'SYSTEM', NULL, 'DAILY_LIFE', '生活用品', '["日用","杂货"]'::jsonb, '生活用品', 0, 50, 'ACTIVE', CURRENT_TIMESTAMP),
    ('syscat_digital', 'SYSTEM', NULL, 'DIGITAL_ELECTRONICS', '数码家电', '["数码","电子产品"]'::jsonb, '数码家电', 0, 60, 'ACTIVE', CURRENT_TIMESTAMP),
    ('syscat_beauty', 'SYSTEM', NULL, 'BEAUTY_PERSONAL_CARE', '美妆个护', '["美妆","个护"]'::jsonb, '美妆个护', 0, 70, 'ACTIVE', CURRENT_TIMESTAMP),
    ('syscat_sports', 'SYSTEM', NULL, 'SPORTS_OUTDOORS', '运动户外', '["户外"]'::jsonb, '运动户外', 0, 80, 'ACTIVE', CURRENT_TIMESTAMP),
    ('syscat_mother_baby', 'SYSTEM', NULL, 'MOTHER_BABY', '母婴用品', '["母婴"]'::jsonb, '母婴用品', 0, 90, 'ACTIVE', CURRENT_TIMESTAMP),
    ('syscat_other', 'SYSTEM', NULL, 'OTHER', '其他', '[]'::jsonb, '其他', 0, 999, 'ACTIVE', CURRENT_TIMESTAMP);
