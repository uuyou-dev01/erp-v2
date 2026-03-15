"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";

export type OrderStatus =
  | "DRAFT"
  | "PLACED"
  | "PAID"
  | "CONFIRMED"
  | "SHIPPED"
  | "DELIVERED"
  | "RETURNED"
  | "CANCELLED";

export interface CreateCustomerOrderInput {
  storeId: string;
  orderNumber: string;
  platformId?: string;
  externalOrderNo?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress?: string;
  orderDate: Date;
  currency: string;
}

export interface CreateOrderLineInput {
  orderId: string;
  skuId: string;
  quantity: string;
  unitPrice?: string;
}

export interface AllocateInventoryInput {
  orderLineId: string;
  lotId: string;
  quantity: string;
}

export interface ConfirmOrderInput {
  orderId: string;
}

export async function getCustomerOrders(storeId: string) {
  return await prisma.customerOrder.findMany({
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

export async function getCustomerOrderById(id: string) {
  return await prisma.customerOrder.findUnique({
    where: { id },
    include: {
      lines: {
        include: {
          sku: true,
          allocations: {
            include: {
              inventoryLot: {
                include: {
                  location: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

export async function createCustomerOrder(data: CreateCustomerOrderInput) {
  const order = await prisma.customerOrder.create({
    data: {
      storeId: data.storeId,
      orderNumber: data.orderNumber,
      platformId: data.platformId,
      externalOrderNo: data.externalOrderNo,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      customerPhone: data.customerPhone,
      shippingAddress: data.shippingAddress,
      orderDate: data.orderDate,
      currency: data.currency,
      subtotal: "0",
      totalPaid: "0",
      orderStatus: "DRAFT",
    },
  });

  revalidatePath("/sales");
  return order;
}

export async function addOrderLine(data: CreateOrderLineInput) {
  const quantity = new Decimal(data.quantity);
  const unitPrice = data.unitPrice ? new Decimal(data.unitPrice) : new Decimal(0);
  const lineAmount = quantity.times(unitPrice);

  const line = await prisma.orderLine.create({
    data: {
      orderId: data.orderId,
      skuId: data.skuId,
      quantity: quantity.toFixed(4),
      unitPrice: data.unitPrice ? unitPrice.toFixed(4) : null,
      lineAmount: lineAmount.toFixed(4),
      supplyType: "FROM_STOCK",
      supplyStatus: "UNFULFILLED",
    },
  });

  await recalculateOrderTotals(data.orderId);

  revalidatePath("/sales");
  revalidatePath(`/sales/${data.orderId}`);
  return line;
}

export async function allocateInventory(data: AllocateInventoryInput) {
  const quantity = new Decimal(data.quantity);

  // Get lot to get unit cost
  const lot = await prisma.inventoryLot.findUnique({
    where: { id: data.lotId },
  });

  if (!lot) {
    throw new Error("Inventory lot not found");
  }

  const unitCost = new Decimal(lot.unitCost.toString());
  const costAmount = quantity.times(unitCost);

  const allocation = await prisma.orderAllocation.create({
    data: {
      orderLineId: data.orderLineId,
      allocationType: "LOT",
      lotId: data.lotId,
      quantity: quantity.toFixed(4),
      unitCost: unitCost.toFixed(4),
      costAmount: costAmount.toFixed(4),
    },
  });

  // Update order line supply status
  await prisma.orderLine.update({
    where: { id: data.orderLineId },
    data: {
      supplyStatus: "ALLOCATED_FROM_STOCK",
    },
  });

  revalidatePath(`/sales/${data.orderLineId}`);
  return allocation;
}

export async function confirmOrder(data: ConfirmOrderInput) {
  const order = await prisma.customerOrder.findUnique({
    where: { id: data.orderId },
    include: {
      lines: {
        include: {
          allocations: true,
        },
      },
    },
  });

  if (!order) {
    throw new Error("Order not found");
  }

  // Check all lines have allocations
  for (const line of order.lines) {
    if (line.allocations.length === 0) {
      throw new Error(`Order line ${line.id} has no inventory allocation`);
    }
  }

  // Transaction: Update order + Write stock ledgers
  await prisma.$transaction(async (tx) => {
    // 1. Update order status
    await tx.customerOrder.update({
      where: { id: data.orderId },
      data: {
        orderStatus: "CONFIRMED",
        confirmedAt: new Date(),
      },
    });

    // 2. Write OUTBOUND_SALE to stock ledger for each allocation
    for (const line of order.lines) {
      for (const allocation of line.allocations) {
        if (allocation.lotId) {
          const lot = await tx.inventoryLot.findUnique({
            where: { id: allocation.lotId },
          });

          if (lot) {
            await tx.stockLedger.create({
              data: {
                storeId: order.storeId,
                occurredAt: new Date(),
                entityType: "LOT",
                entityId: allocation.lotId,
                locationId: lot.locationId,
                deltaQty: new Decimal(allocation.quantity.toString())
                  .negated()
                  .toFixed(4),
                reason: "OUTBOUND_SALE",
                refType: "ORDER_LINE",
                refId: line.id,
                meta: {
                  orderId: order.id,
                  externalOrderNo: order.externalOrderNo,
                  allocationId: allocation.id,
                },
              },
            });
          }
        }
      }
    }

    // 3. Update line supply status
    for (const line of order.lines) {
      await tx.orderLine.update({
        where: { id: line.id },
        data: {
          supplyStatus: "CONSUMED",
        },
      });
    }
  });

  revalidatePath("/sales");
  revalidatePath(`/sales/${data.orderId}`);
  revalidatePath("/inventory/lots");
}

async function recalculateOrderTotals(orderId: string) {
  const lines = await prisma.orderLine.findMany({
    where: { orderId },
  });

  const subtotal = lines.reduce((sum, line) => {
    return sum.plus(new Decimal(line.lineAmount.toString()));
  }, new Decimal(0));

  await prisma.customerOrder.update({
    where: { id: orderId },
    data: {
      subtotal: subtotal.toFixed(4),
      totalPaid: subtotal.toFixed(4), // Will add discounts/fees later
    },
  });
}
