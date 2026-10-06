import type { Prisma } from "@prisma/client";

export type PurchaseLineInventory = { lots: Array<{ id: string }>; units: Array<{ id: string }> };

export async function resolvePurchaseLineInventory(
  tx: Prisma.TransactionClient,
  input: {
    storeId: string;
    locationId: string;
    purchaseLines: Array<{ id: string; purchaseOrderId: string }>;
    lotStatuses: string[];
    unitStatuses: string[];
  }
) {
  const result = new Map<string, PurchaseLineInventory>(
    input.purchaseLines.map((line) => [line.id, { lots: [], units: [] }])
  );
  if (input.purchaseLines.length === 0) return result;

  const purchaseLineIds = input.purchaseLines.map((line) => line.id);
  const purchaseOrderIds = Array.from(
    new Set(input.purchaseLines.map((line) => line.purchaseOrderId))
  );
  const [originalLots, originalUnits, receivedTransferLines] = await Promise.all([
    tx.inventoryLot.findMany({
      where: {
        storeId: input.storeId,
        sourceType: "PURCHASE",
        sourceId: { in: purchaseLineIds },
      },
      select: { id: true, sourceId: true },
    }),
    tx.itemUnit.findMany({
      where: {
        storeId: input.storeId,
        sourceType: "PURCHASE",
        sourceId: { in: purchaseLineIds },
      },
      select: { id: true, sourceId: true },
    }),
    tx.inboundShipmentInventoryLine.findMany({
      where: {
        status: "RECEIVED",
        destinationEntityId: { not: null },
        shipment: { purchaseOrderId: { in: purchaseOrderIds } },
      },
      select: { entityType: true, entityId: true, destinationEntityId: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const purchaseLineByEntity = new Map<string, string>();
  for (const lot of originalLots) purchaseLineByEntity.set(`LOT:${lot.id}`, lot.sourceId);
  for (const unit of originalUnits) purchaseLineByEntity.set(`ITEM_UNIT:${unit.id}`, unit.sourceId);

  // Preserve the purchase-line identity across every completed logistics leg.
  for (let pass = 0; pass <= receivedTransferLines.length; pass += 1) {
    let changed = false;
    for (const line of receivedTransferLines) {
      const purchaseLineId = purchaseLineByEntity.get(`${line.entityType}:${line.entityId}`);
      if (!purchaseLineId || !line.destinationEntityId) continue;
      const destinationKey = `${line.entityType}:${line.destinationEntityId}`;
      if (purchaseLineByEntity.has(destinationKey)) continue;
      purchaseLineByEntity.set(destinationKey, purchaseLineId);
      changed = true;
    }
    if (!changed) break;
  }

  const lotIds = Array.from(purchaseLineByEntity.keys())
    .filter((key) => key.startsWith("LOT:"))
    .map((key) => key.slice(4));
  const unitIds = Array.from(purchaseLineByEntity.keys())
    .filter((key) => key.startsWith("ITEM_UNIT:"))
    .map((key) => key.slice(10));
  const [currentLots, currentUnits] = await Promise.all([
    lotIds.length
      ? tx.inventoryLot.findMany({
          where: {
            id: { in: lotIds },
            storeId: input.storeId,
            locationId: input.locationId,
            status: { in: input.lotStatuses },
          },
          select: { id: true },
          orderBy: { createdAt: "asc" },
        })
      : [],
    unitIds.length
      ? tx.itemUnit.findMany({
          where: {
            id: { in: unitIds },
            storeId: input.storeId,
            locationId: input.locationId,
            status: { in: input.unitStatuses },
          },
          select: { id: true },
          orderBy: { createdAt: "asc" },
        })
      : [],
  ]);

  for (const lot of currentLots) {
    const purchaseLineId = purchaseLineByEntity.get(`LOT:${lot.id}`);
    if (purchaseLineId) result.get(purchaseLineId)?.lots.push(lot);
  }
  for (const unit of currentUnits) {
    const purchaseLineId = purchaseLineByEntity.get(`ITEM_UNIT:${unit.id}`);
    if (purchaseLineId) result.get(purchaseLineId)?.units.push(unit);
  }
  return result;
}
