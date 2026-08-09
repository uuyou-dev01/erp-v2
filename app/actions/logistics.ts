"use server";

import { revalidatePath } from "next/cache";
import { receivePurchaseOrder } from "@/app/actions/purchase-orders";
import {
  lockInventoryForShipment,
  receiveInventoryFromShipment,
  type InventoryTransferLineInput,
} from "@/lib/application/inventory-transfer";
import { prisma } from "@/lib/prisma";

export interface DispatchInventoryTransferInput {
  storeId: string;
  fromLocationId: string;
  toLocationId: string;
  lines: InventoryTransferLineInput[];
  purchaseOrderId?: string;
  legIndex?: number;
  trackingNo?: string;
  carrier?: string;
  transportMode?: "HAND_CARRY" | "CONSOLIDATOR" | "POSTAL" | "COURIER" | "FREIGHT" | "OTHER";
  carriedBy?: string;
  grossWeightKg?: string;
  customsAmount?: string;
  customsCurrency?: string;
  taxAmount?: string;
  taxCurrency?: string;
  etaDate?: Date;
  note?: string;
}

export async function dispatchInventoryTransfer(input: DispatchInventoryTransferInput) {
  if (input.fromLocationId === input.toLocationId) {
    throw new Error("目标位置不能与当前所在位置相同");
  }
  const locations = await prisma.location.count({
    where: {
      storeId: input.storeId,
      id: { in: [input.fromLocationId, input.toLocationId] },
    },
  });
  if (locations !== 2) throw new Error("起运位置或目标位置不存在，请重新选择");

  const shipment = await prisma.$transaction(async (tx) => {
    const created = await tx.inboundShipment.create({
      data: {
        storeId: input.storeId,
        purchaseOrderId: input.purchaseOrderId,
        legIndex: input.legIndex ?? 1,
        fromLocationId: input.fromLocationId,
        toLocationId: input.toLocationId,
        trackingNo: input.trackingNo?.trim() || null,
        carrier: input.carrier?.trim() || null,
        transportMode: input.transportMode ?? null,
        carriedBy: input.carriedBy?.trim() || null,
        grossWeightKg: input.grossWeightKg?.trim() || null,
        customsAmount: input.customsAmount?.trim() || null,
        customsCurrency: input.customsCurrency?.trim().toUpperCase() || null,
        taxAmount: input.taxAmount?.trim() || null,
        taxCurrency: input.taxCurrency?.trim().toUpperCase() || null,
        etaDate: input.etaDate,
        shippedAt: new Date(),
        status: "IN_TRANSIT",
        shipmentNote: input.note?.trim() || null,
      },
    });
    await lockInventoryForShipment(tx, {
      shipmentId: created.id,
      storeId: input.storeId,
      fromLocationId: input.fromLocationId,
      lines: input.lines,
    });
    return created;
  });

  revalidatePath("/workbench");
  revalidatePath("/inventory/lots");
  revalidatePath("/inventory/items");
  revalidatePath("/inventory/sellable");
  return shipment;
}

async function resolvePurchaseTransferLines(
  purchaseOrderId: string,
  storeId: string,
  locationId: string,
  purchaseLineIds: string[],
): Promise<InventoryTransferLineInput[]> {
  const previousDestinationIds = await prisma.inboundShipmentInventoryLine.findMany({
    where: {
      status: "RECEIVED",
      destinationEntityId: { not: null },
      shipment: { purchaseOrderId },
    },
    select: { entityType: true, destinationEntityId: true },
  });
  const inheritedLotIds = previousDestinationIds
    .filter((line) => line.entityType === "LOT")
    .map((line) => line.destinationEntityId!);
  const inheritedUnitIds = previousDestinationIds
    .filter((line) => line.entityType === "ITEM_UNIT")
    .map((line) => line.destinationEntityId!);
  const [lots, units] = await Promise.all([
    prisma.inventoryLot.findMany({
      where: {
        storeId,
        locationId,
        status: "ACTIVE",
        OR: [
          { sourceType: "PURCHASE", sourceId: { in: purchaseLineIds } },
          ...(inheritedLotIds.length ? [{ id: { in: inheritedLotIds } }] : []),
        ],
      },
      select: { id: true },
    }),
    prisma.itemUnit.findMany({
      where: {
        storeId,
        locationId,
        status: "AVAILABLE",
        OR: [
          { sourceType: "PURCHASE", sourceId: { in: purchaseLineIds } },
          ...(inheritedUnitIds.length ? [{ id: { in: inheritedUnitIds } }] : []),
        ],
      },
      select: { id: true },
    }),
  ]);
  const quantities = lots.length
    ? await prisma.stockLedger.groupBy({
        by: ["entityId"],
        where: { entityType: "LOT", entityId: { in: lots.map((lot) => lot.id) } },
        _sum: { deltaQty: true },
      })
    : [];
  const quantityByLotId = new Map(
    quantities.map((row) => [row.entityId, row._sum.deltaQty?.toString() ?? "0"]),
  );
  return [
    ...lots.map((lot) => ({
      entityType: "LOT" as const,
      entityId: lot.id,
      quantity: quantityByLotId.get(lot.id) ?? "0",
    })),
    ...units.map((unit) => ({ entityType: "ITEM_UNIT" as const, entityId: unit.id })),
  ];
}

export async function dispatchPurchaseTransfer(input: {
  purchaseOrderId: string;
  toLocationId: string;
  trackingNo?: string;
  carrier?: string;
  transportMode?: DispatchInventoryTransferInput["transportMode"];
  carriedBy?: string;
  grossWeightKg?: string;
  customsAmount?: string;
  customsCurrency?: string;
  taxAmount?: string;
  taxCurrency?: string;
  etaDate?: Date;
  note?: string;
}) {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: input.purchaseOrderId },
    include: {
      lines: { select: { id: true } },
      inboundShipments: { select: { legIndex: true, status: true, receivedAt: true } },
    },
  });
  if (!order) throw new Error("采购单不存在");
  if (order.status !== "RECEIVED") throw new Error("只有待分流采购单可以发往其他位置");
  if (!order.destinationLocationId) throw new Error("采购单没有记录当前到货位置");
  if (
    order.inboundShipments.some(
      (shipment) =>
        shipment.legIndex > 1 &&
        (shipment.status === "PENDING" ||
          shipment.status === "IN_TRANSIT" ||
          (shipment.status === "DELIVERED" && !shipment.receivedAt)),
    )
  ) {
    throw new Error("采购单已有未完成的转运物流，请先确认到货");
  }

  await receivePurchaseOrder({
    purchaseOrderId: order.id,
    locationId: order.destinationLocationId,
    receivedAt: order.receivedAt ?? new Date(),
  });
  const lines = await resolvePurchaseTransferLines(
    order.id,
    order.storeId,
    order.destinationLocationId,
    order.lines.map((line) => line.id),
  );
  const maxLegIndex = order.inboundShipments.reduce(
    (max, shipment) => Math.max(max, shipment.legIndex),
    1,
  );
  return dispatchInventoryTransfer({
    storeId: order.storeId,
    fromLocationId: order.destinationLocationId,
    toLocationId: input.toLocationId,
    lines,
    purchaseOrderId: order.id,
    legIndex: maxLegIndex + 1,
    trackingNo: input.trackingNo,
    carrier: input.carrier,
    transportMode: input.transportMode,
    carriedBy: input.carriedBy,
    grossWeightKg: input.grossWeightKg,
    customsAmount: input.customsAmount,
    customsCurrency: input.customsCurrency,
    taxAmount: input.taxAmount,
    taxCurrency: input.taxCurrency,
    etaDate: input.etaDate,
    note: input.note,
  });
}

export async function confirmInboundShipmentDelivered(
  shipmentId: string,
  receivedAt = new Date(),
  note?: string,
  destinationLocationId?: string,
) {
  const shipment = await prisma.inboundShipment.findUnique({
    where: { id: shipmentId },
    include: {
      inventoryLines: { select: { id: true } },
      purchaseOrder: { include: { lines: { select: { id: true } } } },
    },
  });

  if (!shipment) throw new Error("物流段不存在");
  if (shipment.status !== "IN_TRANSIT" && shipment.status !== "PENDING") {
    throw new Error("只有待发出或运输中的物流段可以确认到货");
  }

  const actualDestinationLocationId = destinationLocationId ?? shipment.toLocationId;
  if (!actualDestinationLocationId) throw new Error("物流段没有目标位置");
  const destination = await prisma.location.findFirst({
    where: { id: actualDestinationLocationId, storeId: shipment.storeId },
    select: { id: true },
  });
  if (!destination) throw new Error("实际到货位置不存在，请重新选择");

  // Compatibility adapter for transfer legs created before shipment inventory
  // lines existed. New transfer flows never infer stock from the business source.
  if (
    shipment.legIndex > 1 &&
    shipment.inventoryLines.length === 0 &&
    shipment.purchaseOrderId &&
    shipment.purchaseOrder &&
    shipment.fromLocationId
  ) {
    await receivePurchaseOrder({
      purchaseOrderId: shipment.purchaseOrderId,
      locationId: shipment.fromLocationId,
      receivedAt: shipment.purchaseOrder?.receivedAt ?? shipment.shippedAt ?? new Date(),
    });
    const legacyLines = await resolvePurchaseTransferLines(
      shipment.purchaseOrderId,
      shipment.storeId,
      shipment.fromLocationId,
      shipment.purchaseOrder.lines.map((line) => line.id),
    );
    await prisma.$transaction((tx) =>
      lockInventoryForShipment(tx, {
        shipmentId: shipment.id,
        storeId: shipment.storeId,
        fromLocationId: shipment.fromLocationId!,
        lines: legacyLines,
      }),
    );
  }

  await prisma.$transaction(async (tx) => {
    if (shipment.inventoryLines.length > 0 || shipment.legIndex > 1) {
      if (!shipment.fromLocationId) throw new Error("物流段没有起运位置");
      await receiveInventoryFromShipment(tx, {
        shipmentId: shipment.id,
        storeId: shipment.storeId,
        fromLocationId: shipment.fromLocationId,
        toLocationId: destination.id,
        receivedAt,
      });
    }
    await tx.inboundShipment.update({
      where: { id: shipmentId },
      data: {
        status: "DELIVERED",
        receivedAt,
        toLocationId: destination.id,
        shipmentNote: note?.trim() || shipment.shipmentNote,
      },
    });

    if (shipment.purchaseOrderId) {
      await tx.purchaseOrder.update({
        where: { id: shipment.purchaseOrderId },
        data: {
          receivedAt,
          status: shipment.purchaseOrder?.status === "SHIPPED" ? "RECEIVED" : undefined,
          destinationLocationId: destination.id,
        },
      });
    }
  });

  revalidatePath("/workbench");
  revalidatePath("/procurement");
  revalidatePath("/inventory/lots");
  revalidatePath("/inventory/items");
  revalidatePath("/inventory/sellable");
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
