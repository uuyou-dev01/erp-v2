INSERT INTO "work_types" (
  "id", "organizationId", "code", "name", "unit", "status", "createdAt", "updatedAt"
)
SELECT DISTINCT
  'backfill_work_type_' || md5(t."organizationId" || ':' || t."type"),
  t."organizationId",
  t."type",
  CASE WHEN t."type" = 'SHIP_ORDER' THEN '订单发货' ELSE t."type" END,
  CASE WHEN t."type" = 'SHIP_ORDER' THEN '件' ELSE '次' END,
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "tasks" t
JOIN "organizations" o ON o."id" = t."organizationId"
WHERE t."status" = 'DONE' AND t."completedById" IS NOT NULL
ON CONFLICT ("organizationId", "code") DO NOTHING;

INSERT INTO "work_records" (
  "id", "organizationId", "storeId", "userId", "workTypeId", "taskId",
  "sourceType", "sourceId", "workCode", "workName", "quantity", "unit",
  "status", "dedupeKey", "occurredAt", "metadata", "createdAt", "updatedAt"
)
SELECT
  'backfill_work_record_' || md5(t."organizationId" || ':TASK_DONE:' || t."id"),
  t."organizationId",
  t."storeId",
  t."completedById",
  wt."id",
  t."id",
  t."refType",
  t."refId",
  t."type",
  wt."name",
  CASE
    WHEN t."type" = 'SHIP_ORDER' AND t."refType" = 'CUSTOMER_ORDER' THEN
      COALESCE((
        SELECT SUM(ol."quantity")
        FROM "order_lines" ol
        WHERE ol."orderId" = t."refId"
      ), 1)
    ELSE 1
  END,
  wt."unit",
  'CONFIRMED',
  'TASK_DONE:' || t."id",
  COALESCE(t."completedAt", t."updatedAt"),
  CASE
    WHEN t."type" = 'SHIP_ORDER' AND t."refType" = 'CUSTOMER_ORDER' THEN
      jsonb_build_object(
        'orderId', t."refId",
        'platformId', (SELECT co."platformId" FROM "customer_orders" co WHERE co."id" = t."refId")
      )
    ELSE NULL
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "tasks" t
JOIN "work_types" wt
  ON wt."organizationId" = t."organizationId" AND wt."code" = t."type"
JOIN "organizations" o ON o."id" = t."organizationId"
JOIN "stores" s ON s."id" = t."storeId"
JOIN "users" u ON u."id" = t."completedById"
WHERE t."status" = 'DONE' AND t."completedById" IS NOT NULL
ON CONFLICT ("organizationId", "dedupeKey") DO NOTHING;

INSERT INTO "work_types" (
  "id", "organizationId", "code", "name", "unit", "status", "createdAt", "updatedAt"
)
SELECT DISTINCT
  'backfill_work_type_' || md5(al."organizationId" || ':RECEIVE_PURCHASE'),
  al."organizationId",
  'RECEIVE_PURCHASE',
  '采购收货',
  '件',
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "activity_logs" al
JOIN "organizations" o ON o."id" = al."organizationId"
WHERE al."action" = 'PURCHASE_RECEIVED'
  AND al."actorId" IS NOT NULL
  AND al."storeId" IS NOT NULL
ON CONFLICT ("organizationId", "code") DO NOTHING;

INSERT INTO "work_records" (
  "id", "organizationId", "storeId", "userId", "workTypeId", "taskId",
  "sourceType", "sourceId", "workCode", "workName", "quantity", "unit",
  "status", "dedupeKey", "occurredAt", "metadata", "createdAt", "updatedAt"
)
SELECT
  'backfill_work_record_' || md5(al."organizationId" || ':PURCHASE_RECEIVED:' || al."refId"),
  al."organizationId",
  al."storeId",
  al."actorId",
  wt."id",
  al."taskId",
  'PURCHASE_ORDER',
  al."refId",
  'RECEIVE_PURCHASE',
  wt."name",
  COALESCE((
    SELECT SUM(pl."quantity")
    FROM "purchase_lines" pl
    WHERE pl."purchaseOrderId" = al."refId"
  ), 1),
  wt."unit",
  'CONFIRMED',
  'PURCHASE_RECEIVED:' || al."refId",
  al."createdAt",
  al."after",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "activity_logs" al
JOIN "work_types" wt
  ON wt."organizationId" = al."organizationId" AND wt."code" = 'RECEIVE_PURCHASE'
JOIN "organizations" o ON o."id" = al."organizationId"
JOIN "stores" s ON s."id" = al."storeId"
JOIN "users" u ON u."id" = al."actorId"
WHERE al."action" = 'PURCHASE_RECEIVED'
  AND al."actorId" IS NOT NULL
  AND al."storeId" IS NOT NULL
ON CONFLICT ("organizationId", "dedupeKey") DO NOTHING;
