WITH ranked_rates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "fromCurrency", "toCurrency", "effectiveDate"
      ORDER BY "createdAt" DESC, id DESC
    ) AS duplicate_rank
  FROM "fx_rates"
)
DELETE FROM "fx_rates"
WHERE id IN (
  SELECT id
  FROM ranked_rates
  WHERE duplicate_rank > 1
);

DROP INDEX IF EXISTS "fx_rates_fromCurrency_toCurrency_effectDate_idx";
DROP INDEX IF EXISTS "fx_rates_fromCurrency_toCurrency_effectiveDate_idx";

CREATE UNIQUE INDEX "fx_rates_fromCurrency_toCurrency_effectiveDate_key"
ON "fx_rates"("fromCurrency", "toCurrency", "effectiveDate");
