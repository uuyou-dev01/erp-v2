"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function confirmInboundShipmentDelivered(
  shipmentId: string,
  receivedAt = new Date(),
  note?: string
) {
  const shipment = await prisma.inboundShipment.findUnique({
    where: { id: shipmentId },
    include: { purchaseOrder: true },
  });

  if (!shipment) throw new Error("物流段不存在");
  if (shipment.status !== "IN_TRANSIT" && shipment.status !== "PENDING") {
    throw new Error("只有待发出或运输中的物流段可以确认到货");
  }

  await prisma.$transaction(async (tx) => {
    await tx.inboundShipment.update({
      where: { id: shipmentId },
      data: {
        status: "DELIVERED",
        receivedAt,
        shipmentNote: note?.trim() || shipment.shipmentNote,
      },
    });

    if (shipment.purchaseOrderId) {
      await tx.purchaseOrder.update({
        where: { id: shipment.purchaseOrderId },
        data: {
          receivedAt,
          status: shipment.purchaseOrder?.status === "SHIPPED" ? "RECEIVED" : undefined,
          destinationLocationId: shipment.toLocationId ?? undefined,
        },
      });
    }
  });

  revalidatePath("/workbench");
  revalidatePath("/procurement");
  if (shipment.purchaseOrderId) revalidatePath(`/procurement/${shipment.purchaseOrderId}`);
}

export async function bulkConfirmInboundShipmentsDelivered(
  shipmentIds: string[],
  receivedAt = new Date()
) {
  const uniqueIds = Array.from(new Set(shipmentIds)).filter(Boolean);
  if (uniqueIds.length === 0) return { success: 0, failed: 0 };

  let success = 0;
  let failed = 0;
  for (const id of uniqueIds) {
    try {
      await confirmInboundShipmentDelivered(id, receivedAt);
      success += 1;
    } catch {
      failed += 1;
    }
  }

  revalidatePath("/workbench");
  return { success, failed };
}
