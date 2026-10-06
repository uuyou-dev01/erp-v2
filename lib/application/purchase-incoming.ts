import { prisma } from "@/lib/prisma";

/** Purchase quantities not yet received. Each line is counted once, regardless of route legs. */
export async function getPurchaseIncoming(storeId: string) {
  const [lines, receipts] = await Promise.all([
    prisma.purchaseLine.findMany({
      where: { purchaseOrder: { storeId, status: { in: ["ORDERED", "SHIPPED"] } } },
      include: {
        purchaseOrder: {
          include: {
            destinationLocation: true,
            inboundShipments: {
              // Inventory-backed transfers are counted separately after the first receipt.
              where: { legIndex: 1, inventoryLines: { none: {} } },
              include: { toLocation: true },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    }),
    prisma.stockLedger.groupBy({
      by: ["refId"],
      where: { storeId, reason: "INBOUND_PURCHASE", refType: "PURCHASE_LINE", deltaQty: { gt: 0 } },
      _sum: { deltaQty: true },
    }),
  ]);
  const received = new Map(receipts.map((r) => [r.refId, Number(r._sum.deltaQty ?? 0)]));
  return lines
    .map((line) => {
      const shipment = line.purchaseOrder.inboundShipments[0];
      const inTransit = Boolean(
        shipment && !shipment.receivedAt && ["IN_TRANSIT", "EXCEPTION"].includes(shipment.status)
      );
      return {
        id: line.id,
        skuId: line.skuId,
        trackingMode: line.trackingMode,
        forOrderLineId: line.forOrderLineId,
        quantity: Math.max(0, Number(line.quantity) - (received.get(line.id) ?? 0)),
        inTransit,
        shipmentId: shipment?.id ?? null,
        trackingNo: shipment?.trackingNo ?? null,
        destination: shipment?.toLocation ?? line.purchaseOrder.destinationLocation,
        etaDate: shipment?.etaDate ?? line.purchaseOrder.etaDate,
      };
    })
    .filter((line) => line.quantity > 0);
}
