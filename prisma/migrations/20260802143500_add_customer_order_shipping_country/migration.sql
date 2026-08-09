ALTER TABLE "customer_orders" ADD COLUMN "shippingCountry" TEXT;

-- Reuse the existing route direction when it is available.
UPDATE "customer_orders"
SET "shippingCountry" = CASE
  WHEN upper(coalesce("countryFlow", '')) LIKE '%_TO_CN' THEN 'CN'
  WHEN upper(coalesce("countryFlow", '')) LIKE '%_TO_JP' THEN 'JP'
  WHEN upper(coalesce("countryFlow", '')) LIKE '%_TO_US' THEN 'US'
  WHEN upper(coalesce("countryFlow", '')) LIKE '%_TO_EU' THEN 'EU'
  ELSE NULL
END
WHERE "shippingCountry" IS NULL;
