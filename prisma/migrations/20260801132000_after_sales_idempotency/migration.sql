ALTER TABLE "after_sales_cases" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "after_sales_cases_organizationId_idempotencyKey_key"
ON "after_sales_cases"("organizationId", "idempotencyKey");
