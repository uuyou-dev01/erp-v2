import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { RESERVING_ALLOCATION_STATUSES } from "@/lib/application/order-allocation";
import { familyNameFromSkuLike } from "@/lib/application/catalog-display-groups";

export async function getManagedWarehouseInventory(userId: string) {
  const relationships = await prisma.locationFulfiller.findMany({
    where: {
      userId,
      role: "MANAGER",
      status: "ACTIVE",
      organization: { memberships: { none: { userId, status: { not: "ACTIVE" } } } },
    },
    select: {
      organizationId: true,
      organization: { select: { name: true } },
      location: {
        select: {
          id: true,
          code: true,
          name: true,
          storeId: true,
          store: { select: { organizationId: true } },
        },
      },
    },
    orderBy: { location: { name: "asc" } },
  });
  return Promise.all(
    relationships
      .filter((r) => r.organizationId === r.location.store.organizationId)
      .map(async (relationship) => {
        const { location } = relationship;
        const scope = { storeId: location.storeId, locationId: location.id };
        const [lots, units, transfers, batches] = await Promise.all([
          prisma.inventoryLot.findMany({
            where: { ...scope, status: { in: ["ACTIVE", "CONSOLIDATING"] } },
            select: {
              id: true,
              skuId: true,
              sourceType: true,
              sourceId: true,
              sku: { select: { code: true, name: true, attributes: true } },
            },
          }),
          prisma.itemUnit.findMany({
            where: {
              ...scope,
              status: { in: ["AVAILABLE", "ALLOCATED", "CONSOLIDATING", "RETURN_CHECK"] },
            },
            select: {
              id: true,
              skuId: true,
              sourceType: true,
              sourceId: true,
              sku: { select: { code: true, name: true, attributes: true } },
            },
          }),
          prisma.inboundShipmentInventoryLine.findMany({
            where: {
              status: "IN_TRANSIT",
              shipment: {
                storeId: location.storeId,
                fromLocationId: location.id,
                status: "IN_TRANSIT",
              },
            },
            select: { entityType: true, entityId: true, quantity: true },
          }),
          prisma.consolidationBatchLine.findMany({
            where: {
              batch: { storeId: location.storeId, fromLocationId: location.id, status: "SHIPPED" },
            },
            select: { sourceType: true, sourceId: true, quantity: true },
          }),
        ]);
        const lotIds = lots.map((lot) => lot.id),
          unitIds = units.map((unit) => unit.id);
        const [balances, allocations, fulfillmentAllocations, purchaseLines] = await Promise.all([
          prisma.stockLedger.groupBy({
            by: ["entityId"],
            where: { ...scope, entityType: "LOT", entityId: { in: lotIds } },
            _sum: { deltaQty: true },
          }),
          prisma.orderAllocation.findMany({
            where: {
              OR: [{ lotId: { in: lotIds } }, { itemUnitId: { in: unitIds } }],
              status: { in: [...RESERVING_ALLOCATION_STATUSES] },
            },
            select: { lotId: true, itemUnitId: true, quantity: true },
          }),
          prisma.fulfillmentInventoryAllocation.findMany({
            where: {
              OR: [{ lotId: { in: lotIds } }, { itemUnitId: { in: unitIds } }],
              status: "ALLOCATED",
            },
            select: { lotId: true, itemUnitId: true, quantity: true },
          }),
          prisma.purchaseLine.findMany({
            where: {
              id: {
                in: batches
                  .filter((line) => line.sourceType === "PURCHASE_LINE")
                  .map((line) => line.sourceId),
              },
              purchaseOrder: { storeId: location.storeId },
            },
            select: { id: true, purchaseOrderId: true, skuId: true },
          }),
        ]);
        const quantities = new Map(
          balances.map((b) => [
            `LOT:${b.entityId}`,
            new Decimal(b._sum.deltaQty?.toString() ?? "0"),
          ])
        );
        for (const unit of units) quantities.set(`ITEM_UNIT:${unit.id}`, new Decimal(1));
        const subtract = (key: string, quantity: Decimal.Value) =>
          quantities.set(
            key,
            Decimal.max((quantities.get(key) ?? new Decimal(0)).minus(quantity), 0)
          );
        for (const line of transfers)
          subtract(`${line.entityType}:${line.entityId}`, line.quantity.toString());
        for (const line of batches) {
          if (line.sourceType !== "PURCHASE_LINE") {
            subtract(`${line.sourceType}:${line.sourceId}`, line.quantity.toString());
            continue;
          }
          const purchase = purchaseLines.find((p) => p.id === line.sourceId);
          if (!purchase) continue;
          let remaining = new Decimal(line.quantity.toString());
          for (const entity of [
            ...lots.map((lot) => ({ ...lot, type: "LOT" })),
            ...units.map((unit) => ({ ...unit, type: "ITEM_UNIT" })),
          ]) {
            if (
              entity.skuId !== purchase.skuId ||
              entity.sourceType !== "PURCHASE" ||
              ![purchase.id, purchase.purchaseOrderId].includes(entity.sourceId)
            )
              continue;
            const key = `${entity.type}:${entity.id}`;
            const moved = Decimal.min(remaining, quantities.get(key) ?? 0);
            subtract(key, moved);
            remaining = remaining.minus(moved);
          }
        }
        const reserved = new Map<string, Decimal>();
        for (const allocation of [...allocations, ...fulfillmentAllocations]) {
          const key = allocation.lotId
            ? `LOT:${allocation.lotId}`
            : `ITEM_UNIT:${allocation.itemUnitId}`;
          reserved.set(
            key,
            (reserved.get(key) ?? new Decimal(0)).plus(allocation.quantity.toString())
          );
        }
        const rows = new Map<
          string,
          {
            skuId: string;
            code: string;
            name: string;
            series: string | null;
            physical: Decimal;
            reserved: Decimal;
          }
        >();
        for (const entity of [
          ...lots.map((lot) => ({ ...lot, type: "LOT" })),
          ...units.map((unit) => ({ ...unit, type: "ITEM_UNIT" })),
        ]) {
          const key = `${entity.type}:${entity.id}`,
            quantity = Decimal.max(quantities.get(key) ?? 0, 0);
          if (quantity.lte(0)) continue;
          const row = rows.get(entity.skuId) ?? {
            skuId: entity.skuId,
            code: entity.sku.code,
            name: entity.sku.name,
            series: familyNameFromSkuLike({
              name: entity.sku.name,
              attributes: entity.sku.attributes,
            }),
            physical: new Decimal(0),
            reserved: new Decimal(0),
          };
          row.physical = row.physical.plus(quantity);
          row.reserved = row.reserved.plus(Decimal.min(quantity, reserved.get(key) ?? 0));
          rows.set(entity.skuId, row);
        }
        return {
          locationId: location.id,
          code: location.code,
          name: location.name,
          organizationName: relationship.organization.name,
          rows: [...rows.values()]
            .sort(
              (a, b) =>
                (a.series || "其他商品").localeCompare(b.series || "其他商品", "zh-CN") ||
                a.code.localeCompare(b.code)
            )
            .map((r) => ({
              ...r,
              physical: r.physical.toString(),
              reserved: r.reserved.toString(),
            })),
        };
      })
  );
}
