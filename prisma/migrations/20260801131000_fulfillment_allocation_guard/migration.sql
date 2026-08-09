-- A serialized unit cannot be active in two fulfillment requests at once.
CREATE UNIQUE INDEX IF NOT EXISTS "fulfillment_inventory_allocations_active_item_unit_key"
ON "fulfillment_inventory_allocations"("itemUnitId")
WHERE "itemUnitId" IS NOT NULL AND "status" IN ('ALLOCATED', 'SHIPPED');
