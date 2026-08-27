-- Warehouse-roster grants created by the previous migration used an operating
-- role, which implicitly granted receiving and inspection. Keep the row for
-- compatibility, but make its explicit `ship` permission authoritative.
UPDATE "location_accesses"
SET "role" = 'VIEWER',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "role" = 'FULFILLMENT'
  AND "permissions"->>'source' = 'WAREHOUSE_ROSTER';
