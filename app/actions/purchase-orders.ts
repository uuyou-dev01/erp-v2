"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { createInboundInventoryLot, createInboundItemUnit } from "@/lib/application/inventory";
import { isUsedCondition } from "@/lib/quick-entry-utils";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { assertOperationalSku } from "@/lib/application/sku-operability";

type DecimalLike = { toString: () => string };

function serializePurchaseLine<
  T extends {
    quantity: DecimalLike;
    unitPrice: DecimalLike;
    lineAmount: DecimalLike;
    allocatedFee: DecimalLike;
    allocatedDiscount: DecimalLike;
  },
>(line: T) {
  return {
    ...line,
    quantity: line.quantity.toString(),
    unitPrice: line.unitPrice.toString(),
    lineAmount: line.lineAmount.toString(),
    allocatedFee: line.allocatedFee.toString(),
    allocatedDiscount: line.allocatedDiscount.toString(),
  };
}

function serializePurchaseOrder<
  T extends {
    fxRate: DecimalLike | null;
    subtotal: DecimalLike;
    totalAmount: DecimalLike;
    lines?: Array<Parameters<typeof serializePurchaseLine>[0]>;
  },
>(order: T) {
  return {
    ...order,
    fxRate: order.fxRate?.toString() ?? null,
    subtotal: order.subtotal.toString(),
    totalAmount: order.totalAmount.toString(),
    lines: order.lines?.map(serializePurchaseLine) ?? [],
  };
}

export type PurchaseOrderStatus =
  | "DRAFT"
  | "ORDERED"
  | "SHIPPED"
  | "RECEIVED"
  | "RETURNED"
  | "CANCELLED";

export interface CreatePurchaseOrderInput {
  storeId: string;
  orderNo: string;
  supplierId?: string;
  supplierName?: string;
  currency: string;
  fxRate?: string;
  destinationLocationId?: string;
  orderedAt?: Date;
  etaDate?: Date;
  trackingNo?: string;
  carrier?: string;
  shipmentNote?: string;
}

export interface MarkPurchaseShippedInput {
  purchaseOrderId: string;
  shippedAt: Date;
  trackingNo?: string;
  carrier?: string;
  etaDate?: Date;
  destinationLocationId?: string;
  shipmentNote?: string;
  shipmentMode?: "purchase_only" | "in_transit";
}

export interface CreatePurchaseLineInput {
  purchaseOrderId: string;
  skuId: string;
  quantity: string;
  unitPrice: string;
  forOrderLineId?: string;
}

export interface ReceivePurchaseOrderInput {
  purchaseOrderId: string;
  locationId: string;
  receivedAt: Date;
}

export interface MarkPurchaseArrivedInput {
  purchaseOrderId: string;
  locationId: string;
  receivedAt: Date;
}

export async function getPurchaseOrders(storeId: string) {
  const orders = await prisma.purchaseOrder.findMany({
    where: { storeId },
    include: {
      lines: {
        include: {
          sku: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return orders.map(serializePurchaseOrder);
}

export async function getPurchaseOrderById(id: string) {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      lines: {
        include: {
          sku: true,
        },
      },
    },
  });

  return order ? serializePurchaseOrder(order) : null;
}

export async function createPurchaseOrder(data: CreatePurchaseOrderInput) {
  const order = await prisma.purchaseOrder.create({
    data: {
      storeId: data.storeId,
      orderNo: data.orderNo,
      supplierId: data.supplierId,
      supplierName: data.supplierName,
      currency: data.currency,
      fxRate: data.fxRate ? new Decimal(data.fxRate).toFixed(8) : null,
      subtotal: "0",
      totalAmount: "0",
      status: "DRAFT",
      orderedAt: data.orderedAt,
      etaDate: data.etaDate,
      trackingNo: data.trackingNo?.trim() || null,
      carrier: data.carrier?.trim() || null,
      shipmentNote: data.shipmentNote?.trim() || null,
      destinationLocationId: data.destinationLocationId,
    },
  });

  revalidatePath("/procurement");
  return { id: order.id };
}

export async function createPurchaseOrderAction(data: CreatePurchaseOrderInput) {
  try {
    const existing = await prisma.purchaseOrder.findUnique({
      where: {
        storeId_orderNo: {
          storeId: data.storeId,
          orderNo: data.orderNo,
        },
      },
      select: { id: true },
    });
    if (existing) {
      throw new Error("采购单号已存在，请换一个单号");
    }

    const order = await createPurchaseOrder(data);
    return actionSuccess(order);
  } catch (error) {
    return toActionFailure(error, "创建采购订单失败，请重试");
  }
}

export async function markPurchaseAsShipped(data: MarkPurchaseShippedInput) {
  const existing = await prisma.purchaseOrder.findUnique({
    where: { id: data.purchaseOrderId },
    select: { status: true, storeId: true },
  });

  if (!existing) {
    throw new Error("采购单不存在");
  }
  if (existing.status !== "ORDERED" && existing.status !== "SHIPPED") {
    throw new Error("当前状态不允许标记为已发货");
  }

  if (data.destinationLocationId) {
    const location = await prisma.location.findFirst({
      where: { id: data.destinationLocationId, storeId: existing.storeId },
      select: { id: true },
    });
    if (!location) throw new Error("预计到货位置不存在，请重新选择");
  }

  await prisma.purchaseOrder.update({
    where: { id: data.purchaseOrderId },
    data: {
      status: "SHIPPED",
      shippedAt: data.shippedAt,
      trackingNo: data.trackingNo?.trim() || null,
      carrier: data.carrier?.trim() || null,
      etaDate: data.etaDate ?? undefined,
      destinationLocationId: data.destinationLocationId ?? undefined,
      shipmentNote: data.shipmentNote?.trim() || undefined,
    },
  });

  if (data.shipmentMode === "purchase_only") {
    revalidatePath("/procurement");
    revalidatePath(`/procurement/${data.purchaseOrderId}`);
    revalidatePath("/workbench");
    return;
  }

  const existingShipment = await prisma.inboundShipment.findFirst({
    where: { purchaseOrderId: data.purchaseOrderId, legIndex: 1 },
  });
  const shipmentData = {
    trackingNo: data.trackingNo?.trim() || null,
    carrier: data.carrier?.trim() || null,
    shippedAt: data.shippedAt,
    etaDate: data.etaDate ?? undefined,
    shipmentNote: data.shipmentNote?.trim() || undefined,
    status: "IN_TRANSIT",
  };
  if (existingShipment) {
    await prisma.inboundShipment.update({
      where: { id: existingShipment.id },
      data: shipmentData,
    });
  } else {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: data.purchaseOrderId },
      select: { storeId: true, destinationLocationId: true },
    });
    if (order) {
      await prisma.inboundShipment.create({
        data: {
          storeId: order.storeId,
          purchaseOrderId: data.purchaseOrderId,
          legIndex: 1,
          toLocationId: order.destinationLocationId,
          ...shipmentData,
        },
      });
    }
  }

  revalidatePath("/procurement");
  revalidatePath(`/procurement/${data.purchaseOrderId}`);
  revalidatePath("/workbench");
}

export async function markPurchaseAsShippedAction(data: MarkPurchaseShippedInput) {
  try {
    await markPurchaseAsShipped(data);
    return actionSuccess({ purchaseOrderId: data.purchaseOrderId });
  } catch (error) {
    return toActionFailure(error, "标记发货失败，请重试");
  }
}

export async function addPurchaseLine(data: CreatePurchaseLineInput) {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: data.purchaseOrderId },
    select: { storeId: true },
  });
  if (!order) {
    throw new Error("采购单不存在");
  }
  await assertOperationalSku(prisma, {
    storeId: order.storeId,
    skuId: data.skuId,
    actionLabel: "采购",
  });

  const quantity = new Decimal(data.quantity);
  const unitPrice = new Decimal(data.unitPrice);
  const lineAmount = quantity.times(unitPrice);

  const line = await prisma.purchaseLine.create({
    data: {
      purchaseOrderId: data.purchaseOrderId,
      skuId: data.skuId,
      quantity: quantity.toFixed(4),
      unitPrice: unitPrice.toFixed(4),
      lineAmount: lineAmount.toFixed(4),
      forOrderLineId: data.forOrderLineId,
    },
  });

  // Recalculate order totals
  await recalculateOrderTotals(data.purchaseOrderId);

  revalidatePath("/procurement");
  revalidatePath(`/procurement/${data.purchaseOrderId}`);
  return { id: line.id };
}

export async function addPurchaseLineAction(data: CreatePurchaseLineInput) {
  try {
    const line = await addPurchaseLine(data);
    return actionSuccess(line);
  } catch (error) {
    return toActionFailure(error, "添加商品失败，请重试");
  }
}

export async function deletePurchaseLine(lineId: string, orderId: string) {
  await prisma.purchaseLine.delete({
    where: { id: lineId },
  });

  await recalculateOrderTotals(orderId);

  revalidatePath("/procurement");
  revalidatePath(`/procurement/${orderId}`);
}

export async function deletePurchaseLineAction(lineId: string, orderId: string) {
  try {
    const line = await prisma.purchaseLine.findUnique({
      where: { id: lineId },
      select: { purchaseOrderId: true },
    });
    if (!line || line.purchaseOrderId !== orderId) {
      throw new Error("采购明细不存在");
    }

    await deletePurchaseLine(lineId, orderId);
    return actionSuccess({ purchaseOrderId: orderId });
  } catch (error) {
    return toActionFailure(error, "删除商品失败，请重试");
  }
}

export async function updatePurchaseOrderStatus(
  id: string,
  status: PurchaseOrderStatus,
  orderedAt?: Date
) {
  try {
    const existing = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new Error("采购单不存在");
    }

    const order = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status,
        orderedAt: orderedAt || undefined,
      },
    });

    revalidatePath("/procurement");
    revalidatePath(`/procurement/${id}`);
    return actionSuccess({ id: order.id, status: order.status });
  } catch (error) {
    return toActionFailure(error, "更新采购状态失败，请重试");
  }
}

export async function cancelPurchaseOrder(id: string) {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      inboundShipments: { select: { id: true } },
    },
  });

  if (!order) {
    throw new Error("采购单不存在");
  }
  if (order.status !== "ORDERED" || order.trackingNo || order.inboundShipments.length > 0) {
    throw new Error("只有卖家未发货、未填写物流的采购单可以取消");
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  revalidatePath("/procurement");
  revalidatePath(`/procurement/${id}`);
  revalidatePath("/workbench");
  return { id: updated.id, status: updated.status };
}

export async function cancelPurchaseOrderAction(id: string) {
  try {
    const order = await cancelPurchaseOrder(id);
    return actionSuccess(order);
  } catch (error) {
    return toActionFailure(error, "取消采购失败，请重试");
  }
}

export async function markPurchaseOrderArrived(data: MarkPurchaseArrivedInput) {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: data.purchaseOrderId },
    select: { id: true, status: true },
  });
  if (!order) throw new Error("采购单不存在");
  if (order.status === "RECEIVED") return { id: order.id, status: order.status };
  if (order.status !== "ORDERED" && order.status !== "SHIPPED") {
    throw new Error("只有已下单或在途的采购单可以确认到货");
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id: data.purchaseOrderId },
    data: {
      status: "RECEIVED",
      receivedAt: data.receivedAt,
      destinationLocationId: data.locationId,
    },
  });

  revalidatePath("/procurement");
  revalidatePath(`/procurement/${data.purchaseOrderId}`);
  revalidatePath("/workbench");
  return { id: updated.id, status: updated.status };
}

export async function receivePurchaseOrder(data: ReceivePurchaseOrderInput) {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: data.purchaseOrderId },
    include: {
      lines: {
        include: {
          sku: true,
        },
      },
    },
  });

  if (!order) {
    throw new Error("采购单不存在");
  }

  if (!["ORDERED", "SHIPPED", "RECEIVED"].includes(order.status)) {
    throw new Error("只有已下单、在途或已到货待分流的采购单可以入库");
  }

  const quickEntries = await prisma.quickEntry.findMany({
    where: {
      generatedPurchaseLineId: { in: order.lines.map((line) => line.id) },
    },
    select: {
      generatedPurchaseLineId: true,
      conditionType: true,
      batchNote: true,
      note: true,
    },
  });
  const quickEntryByLineId = new Map(
    quickEntries
      .filter((entry) => entry.generatedPurchaseLineId)
      .map((entry) => [entry.generatedPurchaseLineId!, entry])
  );

  // Transaction: Update order + Create inventory lots + Write stock ledgers
  await prisma.$transaction(async (tx) => {
    // 1. Mark arrived if this was called from legacy/procurement receive flows.
    await tx.purchaseOrder.update({
      where: { id: data.purchaseOrderId },
      data: {
        status: "RECEIVED",
        receivedAt: data.receivedAt,
        destinationLocationId: data.locationId,
      },
    });

    // 2. New goods stay as lots; used/special goods become individually tracked units.
    for (const line of order.lines) {
      const existingLot = await tx.inventoryLot.findFirst({
        where: { sourceType: "PURCHASE", sourceId: line.id },
        select: { id: true },
      });
      const existingUnit = await tx.itemUnit.findFirst({
        where: { sourceType: "PURCHASE", sourceId: line.id },
        select: { id: true },
      });
      if (existingLot || existingUnit) continue;

      const quickEntry = quickEntryByLineId.get(line.id);
      const conditionType = quickEntry?.conditionType ?? undefined;
      if (isUsedCondition(conditionType)) {
        const count = Math.max(
          1,
          new Decimal(line.quantity.toString()).toDecimalPlaces(0, Decimal.ROUND_DOWN).toNumber()
        );
        for (let i = 0; i < count; i++) {
          await createInboundItemUnit(tx, {
            storeId: order.storeId,
            skuId: line.skuId,
            locationId: data.locationId,
            unitCost: line.unitPrice.toString(),
            costCurrency: order.currency,
            conditionGrade: conditionType,
            notes:
              [quickEntry?.batchNote, quickEntry?.note].filter(Boolean).join(" / ") || undefined,
            batchLabel: quickEntry?.batchNote ?? undefined,
            sourceType: "PURCHASE",
            sourceId: line.id,
            receivedAt: data.receivedAt,
            refType: "PURCHASE_LINE",
            refId: line.id,
          });
        }
      } else {
        await createInboundInventoryLot(tx, {
          storeId: order.storeId,
          skuId: line.skuId,
          locationId: data.locationId,
          quantity: line.quantity.toString(),
          unitCost: line.unitPrice.toString(),
          costCurrency: order.currency,
          sourceType: "PURCHASE",
          sourceId: line.id,
          receivedAt: data.receivedAt,
          refType: "PURCHASE_LINE",
          refId: line.id,
          meta: {
            purchaseOrderId: order.id,
            orderNo: order.orderNo,
            unitCost: line.unitPrice.toString(),
            currency: order.currency,
          },
        });
      }
    }
  });

  revalidatePath("/procurement");
  revalidatePath(`/procurement/${data.purchaseOrderId}`);
  revalidatePath("/inventory/lots");
  revalidatePath("/inventory/items");
}

export async function receivePurchaseOrderAction(data: ReceivePurchaseOrderInput) {
  try {
    await receivePurchaseOrder(data);
    return actionSuccess({ purchaseOrderId: data.purchaseOrderId });
  } catch (error) {
    return toActionFailure(error, "收货失败，请重试");
  }
}

async function recalculateOrderTotals(orderId: string) {
  const lines = await prisma.purchaseLine.findMany({
    where: { purchaseOrderId: orderId },
  });

  const subtotal = lines.reduce((sum, line) => {
    return sum.plus(new Decimal(line.lineAmount.toString()));
  }, new Decimal(0));

  await prisma.purchaseOrder.update({
    where: { id: orderId },
    data: {
      subtotal: subtotal.toFixed(4),
      totalAmount: subtotal.toFixed(4), // Will add fees later
    },
  });
}
