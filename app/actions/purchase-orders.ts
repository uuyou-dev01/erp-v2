"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { createInboundInventoryLot } from "@/lib/application/inventory";

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
  | "RECEIVED"
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
      destinationLocationId: data.destinationLocationId,
    },
  });

  revalidatePath("/procurement");
  return { id: order.id };
}

export async function addPurchaseLine(data: CreatePurchaseLineInput) {
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

export async function deletePurchaseLine(lineId: string, orderId: string) {
  await prisma.purchaseLine.delete({
    where: { id: lineId },
  });

  await recalculateOrderTotals(orderId);

  revalidatePath("/procurement");
  revalidatePath(`/procurement/${orderId}`);
}

export async function updatePurchaseOrderStatus(
  id: string,
  status: PurchaseOrderStatus,
  orderedAt?: Date
) {
  const order = await prisma.purchaseOrder.update({
    where: { id },
    data: {
      status,
      orderedAt: orderedAt || undefined,
    },
  });

  revalidatePath("/procurement");
  revalidatePath(`/procurement/${id}`);
  return { id: order.id, status: order.status };
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
    throw new Error("Purchase order not found");
  }

  if (order.status === "RECEIVED") {
    throw new Error("Purchase order already received");
  }

  // Transaction: Update order + Create inventory lots + Write stock ledgers
  await prisma.$transaction(async (tx) => {
    // 1. Update purchase order status
    await tx.purchaseOrder.update({
      where: { id: data.purchaseOrderId },
      data: {
        status: "RECEIVED",
        receivedAt: data.receivedAt,
      },
    });

    // 2. Create inventory lot for each line through the inventory use case
    for (const line of order.lines) {
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
  });

  revalidatePath("/procurement");
  revalidatePath(`/procurement/${data.purchaseOrderId}`);
  revalidatePath("/inventory/lots");
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
