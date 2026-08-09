-- Some legacy personal/partner locations did not have a structured region.
-- Preserve their previous name-based market classification as a default lane.
INSERT INTO "shipping_lanes" (
  "id", "storeId", "fromLocationId", "laneType", "destinationCountry", "serviceLevel"
)
SELECT
  'legacy-lane-' || substr(md5(l."id" || ':' || inferred."country"), 1, 21),
  l."storeId",
  l."id",
  'CUSTOMER_DELIVERY',
  inferred."country",
  'STANDARD'
FROM "locations" l
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN coalesce(l."name", '') ~ '(日本|东京|大阪|京都|名古屋)' THEN 'JP'
    WHEN coalesce(l."name", '') ~ '(中国|上海|北京|深圳|广州|杭州|国内)' THEN 'CN'
    WHEN coalesce(l."name", '') ~ '(美国|洛杉矶|纽约)' THEN 'US'
    WHEN coalesce(l."name", '') ~ '(欧洲|德国|法国|意大利|西班牙|荷兰)' THEN 'EU'
    ELSE NULL
  END AS "country"
) inferred
WHERE l."isSellableDefault" = true
  AND inferred."country" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "shipping_lanes" sl
    WHERE sl."fromLocationId" = l."id"
      AND sl."laneType" = 'CUSTOMER_DELIVERY'
  );
