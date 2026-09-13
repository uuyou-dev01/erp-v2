import { prisma } from "@/lib/prisma";

type SourceRef = { sourceType: string; sourceId: string };
export type Acquisition = { orderNo: string; purchasedAt: string | null };

/** Follow split/transfer ancestry; a later warehouse receipt is not a purchase date. */
export async function resolveInventoryAcquisitions(storeId: string, refs: SourceRef[]) {
  const cache = new Map<string, Acquisition | null>();
  async function resolve(ref: SourceRef, ancestors: Set<string>): Promise<Acquisition | null> {
    const key = `${ref.sourceType}:${ref.sourceId}`;
    if (cache.has(key)) return cache.get(key)!;
    if (ancestors.has(key) || ancestors.size >= 32) return null;
    const path = new Set(ancestors).add(key);
    let result: Acquisition | null = null;
    if (ref.sourceType === "PURCHASE" || ref.sourceType === "PURCHASE_LINE") {
      const line = await prisma.purchaseLine.findFirst({
        where: { id: ref.sourceId, purchaseOrder: { storeId } },
        select: { purchaseOrder: { select: { orderNo: true, orderedAt: true } } },
      });
      const order =
        line?.purchaseOrder ??
        (await prisma.purchaseOrder.findFirst({
          where: { id: ref.sourceId, storeId },
          select: { orderNo: true, orderedAt: true },
        }));
      if (order)
        result = { orderNo: order.orderNo, purchasedAt: order.orderedAt?.toISOString() ?? null };
    } else if (ref.sourceType === "LOT" || ref.sourceType === "ITEM_UNIT") {
      const entity =
        ref.sourceType === "LOT"
          ? await prisma.inventoryLot.findFirst({
              where: { id: ref.sourceId, storeId },
              select: { sourceType: true, sourceId: true },
            })
          : await prisma.itemUnit.findFirst({
              where: { id: ref.sourceId, storeId },
              select: { sourceType: true, sourceId: true },
            });
      if (entity?.sourceType === "PURCHASE") result = await resolve(entity, path);
      else if (entity) {
        const entry = await prisma.stockLedger.findFirst({
          where: {
            storeId,
            entityType: ref.sourceType,
            entityId: ref.sourceId,
            deltaQty: { gt: 0 },
            reason: { in: ["TRANSFER_IN", "SPLIT_IN"] },
          },
          select: { meta: true },
          orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
        });
        const meta = entry?.meta as { sourceLotId?: unknown } | null;
        if (typeof meta?.sourceLotId === "string") {
          result = await resolve({ sourceType: "LOT", sourceId: meta.sourceLotId }, path);
        } else if (entity.sourceType === "SPLIT") {
          const split = await prisma.inventorySplit.findFirst({
            where: { id: entity.sourceId, storeId },
            select: { sourceType: true, sourceId: true },
          });
          if (split) result = await resolve(split, path);
        }
      }
    }
    cache.set(key, result);
    return result;
  }
  for (const ref of refs) await resolve(ref, new Set());
  return cache;
}
