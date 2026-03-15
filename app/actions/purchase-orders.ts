"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";

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
  return await prisma.purchaseOrder.findMany({
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
}

export async function getPurchaseOrderById(id: string) {
  return await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      lines: {
        include: {
          sku: true,
        },
      },
    },
  });
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
  return order;
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
  return line;
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
  return order;
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

    // 2. Create inventory lot for each line
    for (const line of order.lines) {
      const lot = await tx.inventoryLot.create({
        data: {
          storeId: order.storeId,
          skuId: line.skuId,
          locationId: data.locationId,
          unitCost: line.unitPrice,
          costCurrency: order.currency,
          fxRateId: order.fxRate ? "FX_RATE_ID" : null,
          sourceType: "PURCHASE",
          sourceId: line.id,
          receivedAt: data.receivedAt,
          status: "ACTIVE",
        },
      });

      // 3. Write to stock ledger
      await tx.stockLedger.create({
        data: {
          storeId: order.storeId,
          occurredAt: data.receivedAt,
          entityType: "LOT",
          entityId: lot.id,
          locationId: data.locationId,
          deltaQty: line.quantity,
          reason: "INBOUND_PURCHASE",
          refType: "PURCHASE_LINE",
          refId: line.id,
          meta: {
            purchaseOrderId: order.id,
            orderNo: order.orderNo,
            unitCost: line.unitPrice.toString(),
            currency: order.currency,
          },
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
