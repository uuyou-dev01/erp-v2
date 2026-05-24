"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { syncQuickEntryFromOrder } from "@/lib/application/workflow-queries";
import {
  computeOrderFees,
  feeResultToStrings,
} from "@/lib/application/order-fees";

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
  countryFlow?: string;
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

export async function getCustomerOrders(storeId: string, platformId?: string) {
  return await prisma.customerOrder.findMany({
    where: {
      storeId,
      ...(platformId ? { platformId } : {}),
    },
    include: {
      platform: true,
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
      platform: true,
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

export async function updateOrderNetRevenue(orderId: string, netRevenue: string) {
  await prisma.customerOrder.update({
    where: { id: orderId },
    data: { netRevenue },
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
      countryFlow: data.countryFlow,
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

  // Transaction: confirm order without deducting inventory (deduct on ship)
  await prisma.$transaction(async (tx) => {
    const subtotal = order.lines.reduce(
      (sum, line) => sum.plus(new Decimal(line.lineAmount.toString())),
      new Decimal(0)
    );
    const inventoryCost = order.lines.reduce((sum, line) => {
      return line.allocations.reduce(
        (lineSum, alloc) => lineSum.plus(new Decimal(alloc.costAmount.toString())),
        sum
      );
    }, new Decimal(0));

    const platform = order.platformId
      ? await tx.platform.findUnique({ where: { id: order.platformId } })
      : null;
    const feeRate = platform?.defaultFeeRate
      ? new Decimal(platform.defaultFeeRate.toString())
      : null;

    const fees = computeOrderFees({
      subtotal,
      platformFeeRate: feeRate,
      shippingFee: new Decimal(order.shippingFee.toString()),
      inventoryCost,
    });
    const feeStrings = feeResultToStrings(fees);

    await tx.customerOrder.update({
      where: { id: data.orderId },
      data: {
        orderStatus: "CONFIRMED",
        confirmedAt: new Date(),
        platformFee: feeStrings.platformFee,
        shippingFee: feeStrings.shippingFee,
        netRevenue: feeStrings.netRevenue,
      },
    });

    for (const line of order.lines) {
      await tx.orderLine.update({
        where: { id: line.id },
        data: {
          supplyStatus: line.allocations.length > 0 ? "READY_TO_SHIP" : "UNFULFILLED",
        },
      });
    }
  });

  revalidatePath("/sales");
  revalidatePath(`/sales/${data.orderId}`);
  revalidatePath("/inventory/lots");
}

export async function markOrderShipped(orderId: string, trackingNo?: string) {
  const order = await prisma.customerOrder.findUnique({
    where: { id: orderId },
    include: {
      lines: {
        include: {
          allocations: true,
        },
      },
    },
  });

  if (!order) throw new Error("订单不存在");
  if (order.orderStatus !== "CONFIRMED") {
    throw new Error("只有已确认订单可以标记发货");
  }

  await prisma.$transaction(async (tx) => {
    for (const line of order.lines) {
      for (const allocation of line.allocations) {
        if (allocation.status === "SHIPPED" || allocation.status === "DELIVERED") continue;

        if (allocation.itemUnitId) {
          const item = await tx.itemUnit.findUnique({
            where: { id: allocation.itemUnitId },
          });
          if (!item) continue;

          await tx.stockLedger.create({
            data: {
              storeId: order.storeId,
              occurredAt: new Date(),
              entityType: "ITEM_UNIT",
              entityId: item.id,
              locationId: item.locationId,
              deltaQty: new Decimal(allocation.quantity.toString()).negated().toFixed(4),
              reason: "OUTBOUND_SALE",
              refType: "ORDER_LINE",
              refId: line.id,
              meta: { orderId: order.id, allocationId: allocation.id },
            },
          });

          await tx.itemUnit.update({
            where: { id: item.id },
            data: { status: "CONSUMED" },
          });
        } else if (allocation.lotId) {
          const lot = await tx.inventoryLot.findUnique({
            where: { id: allocation.lotId },
          });
          if (!lot) continue;

          await tx.stockLedger.create({
            data: {
              storeId: order.storeId,
              occurredAt: new Date(),
              entityType: "LOT",
              entityId: lot.id,
              locationId: lot.locationId,
              deltaQty: new Decimal(allocation.quantity.toString()).negated().toFixed(4),
              reason: "OUTBOUND_SALE",
              refType: "ORDER_LINE",
              refId: line.id,
              meta: { orderId: order.id, allocationId: allocation.id },
            },
          });

          const ledgers = await tx.stockLedger.findMany({
            where: { entityType: "LOT", entityId: lot.id },
          });
          const remaining = ledgers.reduce(
            (sum, l) => sum.plus(new Decimal(l.deltaQty.toString())),
            new Decimal(0)
          );
          if (remaining.minus(allocation.quantity).lte(0)) {
            await tx.inventoryLot.update({
              where: { id: lot.id },
              data: { status: "CONSUMED" },
            });
          }
        }

        await tx.orderAllocation.update({
          where: { id: allocation.id },
          data: { status: "SHIPPED" },
        });
      }

      await tx.orderLine.update({
        where: { id: line.id },
        data: { supplyStatus: "CONSUMED" },
      });
    }

    await tx.customerOrder.update({
      where: { id: orderId },
      data: {
        orderStatus: "SHIPPED",
        shippedAt: new Date(),
        trackingNo: trackingNo?.trim() || undefined,
      },
    });
  });

  await syncQuickEntryFromOrder(orderId, "SHIPPED");

  revalidatePath("/sales");
  revalidatePath(`/sales/${orderId}`);
  revalidatePath("/inventory/lots");
  revalidatePath("/inventory/items");
  revalidatePath("/workbench");
}

export async function settleCustomerOrder(
  orderId: string,
  data: {
    platformFee?: string;
    shippingFee?: string;
    platformFeeRate?: string;
  }
) {
  const order = await prisma.customerOrder.findUnique({
    where: { id: orderId },
    include: {
      platform: true,
      lines: {
        include: { allocations: true },
      },
    },
  });

  if (!order) throw new Error("订单不存在");

  const subtotal = new Decimal(order.subtotal.toString());
  const inventoryCost = order.lines.reduce((sum, line) => {
    return line.allocations.reduce(
      (lineSum, alloc) => lineSum.plus(new Decimal(alloc.costAmount.toString())),
      sum
    );
  }, new Decimal(0));

  const platformFeeRate = data.platformFeeRate
    ? new Decimal(data.platformFeeRate)
    : order.platform?.defaultFeeRate
      ? new Decimal(order.platform.defaultFeeRate.toString())
      : null;

  const fees = computeOrderFees({
    subtotal,
    platformFeeAmount: data.platformFee ? new Decimal(data.platformFee) : null,
    platformFeeRate,
    shippingFee: data.shippingFee ? new Decimal(data.shippingFee) : new Decimal(order.shippingFee.toString()),
    inventoryCost,
  });
  const feeStrings = feeResultToStrings(fees);

  await prisma.customerOrder.update({
    where: { id: orderId },
    data: {
      platformFee: feeStrings.platformFee,
      shippingFee: feeStrings.shippingFee,
      netRevenue: feeStrings.netRevenue,
      settledAt: new Date(),
    },
  });

  await syncQuickEntryFromOrder(orderId, "SETTLED");

  revalidatePath("/sales");
  revalidatePath(`/sales/${orderId}`);
  revalidatePath("/reports");
  revalidatePath("/dashboard");
  revalidatePath("/workbench");
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
