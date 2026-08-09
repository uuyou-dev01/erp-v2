ALTER TABLE "charge_categories" ADD COLUMN IF NOT EXISTS "systemKey" TEXT;
UPDATE "charge_categories" SET "systemKey" = "code" WHERE "scope" = 'SYSTEM' AND "systemKey" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "charge_categories_systemKey_key" ON "charge_categories"("systemKey");
