import { prisma } from "@/lib/prisma";
import { resolvePurchaseLineInventory } from "./purchase-inventory-lineage";

/** Normalize shipped consolidation contents to the same physical entities as ordinary transfers. */
export async function getConsolidationTransitLines(storeId: string) {
  const batches = await prisma.consolidationBatch.findMany({
    where: { storeId, status: "SHIPPED", receivedAt: null },
    include: { lines: true, fromLocation: true, toLocation: true },
  });
  if (!batches.length) return [];
  const purchaseLines = await prisma.purchaseLine.findMany({
    where: {
      id: {
        in: batches.flatMap((b) =>
          b.lines.filter((l) => l.sourceType === "PURCHASE_LINE").map((l) => l.sourceId)
        ),
      },
      purchaseOrder: { storeId },
    },
    select: { id: true, purchaseOrderId: true },
  });
  const ledger = await prisma.stockLedger.groupBy({
    by: ["entityId"],
    where: { storeId, entityType: "LOT" },
    _sum: { deltaQty: true },
  });
  const onHand = new Map(
    ledger.map((row) => [row.entityId, Math.max(0, Number(row._sum.deltaQty ?? 0))])
  );
  return (
    await Promise.all(
      batches.map(async (batch) => {
        const ids = new Set(
          batch.lines.filter((l) => l.sourceType === "PURCHASE_LINE").map((l) => l.sourceId)
        );
        const lineage = await resolvePurchaseLineInventory(prisma, {
          storeId,
          locationId: batch.fromLocationId ?? "",
          purchaseLines: purchaseLines.filter((l) => ids.has(l.id)),
          lotStatuses: ["CONSOLIDATING"],
          unitStatuses: ["CONSOLIDATING"],
        });
        return batch.lines.flatMap((line) => {
          const inherited = lineage.get(line.sourceId);
          const entities =
            line.sourceType === "LOT" || line.sourceType === "ITEM_UNIT"
              ? [{ entityType: line.sourceType, entityId: line.sourceId }]
              : [
                  ...(inherited?.lots ?? []).map((l) => ({ entityType: "LOT", entityId: l.id })),
                  ...(inherited?.units ?? []).map((l) => ({
                    entityType: "ITEM_UNIT",
                    entityId: l.id,
                  })),
                ];
          let remaining = Number(line.quantity);
          return entities
            .map((entity) => {
              const quantity = Math.min(
                remaining,
                entity.entityType === "LOT" ? (onHand.get(entity.entityId) ?? 0) : 1
              );
              remaining -= quantity;
              return {
                ...entity,
                quantity,
                shipmentId: `consolidation:${batch.id}`,
                shipment: {
                  fromLocation: batch.fromLocation,
                  toLocation: batch.toLocation,
                  trackingNo: batch.outboundTrackingNo,
                  etaDate: null,
                },
              };
            })
            .filter((line) => line.quantity > 0);
        });
      })
    )
  ).flat();
}
