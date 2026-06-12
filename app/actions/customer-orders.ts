"use server";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { syncQuickEntryFromOrder } from "@/lib/application/workflow-queries";
import {
  computeOrderFees,
  feeResultToStrings,
} from "@/lib/application/order-fees";
import {
  mergeShippingProof,
  parseShippingProof,
  shippingProofToJson,
  type ReturnFinancials,
  type ShippingProof,
} from "@/lib/application/shipping-proof";
import {
  canReserveQuantity,
  CLOSED_ALLOCATION_STATUSES,
  isLotConsumedAfterShipment,
  ORDER_ALLOCATION_STATUS,
  RESERVING_ALLOCATION_STATUSES,
} from "@/lib/application/order-allocation";
import { requireUserContext } from "@/lib/auth/user-context";
import {
  completeTasksForRef,
  createTaskIfMissing,
  TASK_TYPE,
} from "@/lib/application/tasks";

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

  const allocation = await prisma.$transaction(async (tx) => {
    const lot = await tx.inventoryLot.findUnique({
      where: { id: data.lotId },
    });

    if (!lot) {
      throw new Error("库存批次不存在");
    }

    const ledgers = await tx.stockLedger.findMany({
      where: { entityType: "LOT", entityId: data.lotId },
      select: { deltaQty: true },
    });
    const onHand = ledgers.reduce(
      (sum, ledger) => sum.plus(new Decimal(ledger.deltaQty.toString())),
      new Decimal(0)
    );

    const activeAllocations = await tx.orderAllocation.findMany({
      where: {
        lotId: data.lotId,
        status: {
          in: [...RESERVING_ALLOCATION_STATUSES],
        },
      },
      select: { quantity: true },
    });
    const reserved = activeAllocations.reduce(
      (sum, item) => sum.plus(new Decimal(item.quantity.toString())),
      new Decimal(0)
    );

    if (!canReserveQuantity({ onHand, reserved, requested: quantity })) {
      throw new Error("可用库存不足，无法分配");
    }

    const unitCost = new Decimal(lot.unitCost.toString());
    const costAmount = quantity.times(unitCost);

    const created = await tx.orderAllocation.create({
      data: {
        orderLineId: data.orderLineId,
        allocationType: "LOT",
        lotId: data.lotId,
        quantity: quantity.toFixed(4),
        unitCost: unitCost.toFixed(4),
        costAmount: costAmount.toFixed(4),
        status: ORDER_ALLOCATION_STATUS.ALLOCATED,
      },
    });

    await tx.orderLine.update({
      where: { id: data.orderLineId },
      data: {
        supplyStatus: "ALLOCATED_FROM_STOCK",
      },
    });

    return created;
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
  const context = await requireUserContext({ storeId: order.storeId });

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

  await createTaskIfMissing({
    organizationId: context.organizationId,
    storeId: order.storeId,
    type: TASK_TYPE.SHIP_ORDER,
    title: `发货订单 ${order.orderNumber}`,
    description: order.platformId
      ? "订单已确认，等待打包/发货。"
      : "手工订单已确认，等待打包/发货。",
    refType: "CUSTOMER_ORDER",
    refId: order.id,
    createdById: context.userId,
  });

  revalidatePath("/sales");
  revalidatePath(`/sales/${data.orderId}`);
  revalidatePath("/inventory/lots");
}

export async function saveOrderShippingProof(
  orderId: string,
  proof: ShippingProof,
  options?: { trackingNo?: string }
) {
  const order = await prisma.customerOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("订单不存在");
  if (order.orderStatus !== "CONFIRMED") {
    throw new Error("只有待发货订单可以暂存发货凭证");
  }

  const merged = shippingProofToJson(mergeShippingProof(order.shippingProof, proof));

  await prisma.customerOrder.update({
    where: { id: orderId },
    data: {
      shippingProof: merged as Prisma.InputJsonValue,
      ...(options?.trackingNo !== undefined
        ? { trackingNo: options.trackingNo.trim() || null }
        : {}),
    },
  });

  revalidatePath("/sales");
  revalidatePath(`/sales/${orderId}`);
  revalidatePath("/workbench");
}

export async function markOrderDelivered(orderId: string) {
  const order = await prisma.customerOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("订单不存在");
  if (order.orderStatus !== "SHIPPED") {
    throw new Error("只有已发货订单可以确认妥投");
  }

  await prisma.customerOrder.update({
    where: { id: orderId },
    data: { orderStatus: "DELIVERED" },
  });

  revalidatePath("/sales");
  revalidatePath(`/sales/${orderId}`);
  revalidatePath("/workbench");
}

function computeReturnFinancialAdjustments(
  order: {
    subtotal: { toString(): string };
    platformFee: { toString(): string };
    shippingFee: { toString(): string };
  },
  input?: {
    refundAmount?: string;
    platformFeeReversal?: string;
    shippingFeeReversal?: string;
  }
): ReturnFinancials | null {
  if (!input?.refundAmount && !input?.platformFeeReversal && !input?.shippingFeeReversal) {
    return null;
  }

  const subtotal = new Decimal(order.subtotal.toString());
  const refundAmount = input.refundAmount ? new Decimal(input.refundAmount) : new Decimal(0);
  const platformFeeReversal = input.platformFeeReversal
    ? new Decimal(input.platformFeeReversal)
    : new Decimal(0);
  const shippingFeeReversal = input.shippingFeeReversal
    ? new Decimal(input.shippingFeeReversal)
    : new Decimal(0);
  const adjustedPlatformFee = Decimal.max(
    0,
    new Decimal(order.platformFee.toString()).minus(platformFeeReversal)
  );
  const adjustedShippingFee = Decimal.max(
    0,
    new Decimal(order.shippingFee.toString()).minus(shippingFeeReversal)
  );
  const adjustedNetRevenue = subtotal
    .minus(adjustedPlatformFee)
    .minus(adjustedShippingFee)
    .minus(refundAmount);

  return {
    refundAmount: refundAmount.gt(0) ? refundAmount.toFixed(4) : undefined,
    platformFeeReversal: platformFeeReversal.gt(0) ? platformFeeReversal.toFixed(4) : undefined,
    shippingFeeReversal: shippingFeeReversal.gt(0) ? shippingFeeReversal.toFixed(4) : undefined,
    adjustedPlatformFee: adjustedPlatformFee.toFixed(4),
    adjustedShippingFee: adjustedShippingFee.toFixed(4),
    adjustedNetRevenue: adjustedNetRevenue.toFixed(4),
    recordedAt: new Date().toISOString(),
  };
}

export async function cancelCustomerOrder(orderId: string, reason?: string) {
  const order = await prisma.customerOrder.findUnique({
    where: { id: orderId },
    include: { lines: { include: { allocations: true } } },
  });
  if (!order) throw new Error("订单不存在");

  const cancellable = ["DRAFT", "PLACED", "PAID", "CONFIRMED"];
  if (!cancellable.includes(order.orderStatus)) {
    throw new Error("当前状态不可取消，已发货订单请走退货流程");
  }

  const cancelReason = reason?.trim();
  if (!cancelReason) {
    throw new Error("请填写取消原因");
  }

  await prisma.$transaction(async (tx) => {
    for (const line of order.lines) {
      for (const allocation of line.allocations) {
        if (CLOSED_ALLOCATION_STATUSES.has(allocation.status)) {
          continue;
        }

        if (allocation.itemUnitId) {
          const item = await tx.itemUnit.findUnique({
            where: { id: allocation.itemUnitId },
          });
          if (item && item.status !== "CONSUMED") {
            await tx.itemUnit.update({
              where: { id: item.id },
              data: { status: "AVAILABLE" },
            });
          }
        } else if (allocation.lotId) {
          const lot = await tx.inventoryLot.findUnique({
            where: { id: allocation.lotId },
          });
          if (lot) {
            await tx.stockLedger.create({
              data: {
                storeId: order.storeId,
                occurredAt: new Date(),
                entityType: "LOT",
                entityId: lot.id,
                locationId: lot.locationId,
                deltaQty: "0.0000",
                reason: "DEALLOCATE",
                refType: "ORDER_LINE",
                refId: line.id,
                meta: {
                  orderId: order.id,
                  allocationId: allocation.id,
                  quantity: allocation.quantity.toString(),
                  cancelReason,
                },
              },
            });
          }
        }

        await tx.orderAllocation.update({
          where: { id: allocation.id },
          data: { status: ORDER_ALLOCATION_STATUS.CANCELLED },
        });
      }

      await tx.orderLine.update({
        where: { id: line.id },
        data: { supplyStatus: "UNFULFILLED" },
      });
    }

    const mergedProof = shippingProofToJson(
      mergeShippingProof(order.shippingProof, {
        cancelReason,
        cancelledAt: new Date().toISOString(),
        proofNote: [
          parseShippingProof(order.shippingProof).proofNote,
          `订单取消：${cancelReason}`,
        ]
          .filter(Boolean)
          .join("\n"),
      })
    );

    await tx.customerOrder.update({
      where: { id: orderId },
      data: {
        orderStatus: "CANCELLED",
        shippingProof: mergedProof as Prisma.InputJsonValue,
      },
    });
  });

  revalidatePath("/sales");
  revalidatePath(`/sales/${orderId}`);
  revalidatePath("/workbench");
  revalidatePath("/inventory/lots");
  revalidatePath("/inventory/items");
  revalidatePath("/inventory/sellable");
}

export interface RegisterReturnInput {
  note?: string;
  returnTrackingNo?: string;
  /** 单品退货回库方式；批次库存始终按数量回滚到原批次 */
  restockMode?: "RETURN_CHECK" | "AVAILABLE";
  refundAmount?: string;
  platformFeeReversal?: string;
  shippingFeeReversal?: string;
}

export async function markOrderReturned(orderId: string, data?: RegisterReturnInput) {
  const order = await prisma.customerOrder.findUnique({
    where: { id: orderId },
    include: {
      lines: { include: { allocations: true } },
    },
  });
  if (!order) throw new Error("订单不存在");
  if (order.orderStatus !== "SHIPPED" && order.orderStatus !== "DELIVERED") {
    throw new Error("只有已发货或待结算订单可以登记退货");
  }

  const returnNote = data?.note?.trim();
  if (!returnNote) {
    throw new Error("请填写退货说明");
  }

  const restockMode = data?.restockMode ?? "RETURN_CHECK";
  const returnTrackingNo = data?.returnTrackingNo?.trim();
  const returnedAt = new Date().toISOString();
  const returnFinancials = computeReturnFinancialAdjustments(order, data);

  await prisma.$transaction(async (tx) => {
    for (const line of order.lines) {
      for (const allocation of line.allocations) {
        if (
          allocation.status !== ORDER_ALLOCATION_STATUS.SHIPPED &&
          allocation.status !== ORDER_ALLOCATION_STATUS.DELIVERED
        ) {
          continue;
        }

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
              deltaQty: new Decimal(allocation.quantity.toString()).toFixed(4),
              reason: "RETURN_IN",
              refType: "ORDER_LINE",
              refId: line.id,
              meta: {
                orderId: order.id,
                allocationId: allocation.id,
                returnNote,
                returnTrackingNo,
              },
            },
          });

          await tx.itemUnit.update({
            where: { id: item.id },
            data: {
              status: restockMode === "AVAILABLE" ? "AVAILABLE" : "RETURN_CHECK",
            },
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
              deltaQty: new Decimal(allocation.quantity.toString()).toFixed(4),
              reason: "RETURN_IN",
              refType: "ORDER_LINE",
              refId: line.id,
              meta: {
                orderId: order.id,
                allocationId: allocation.id,
                returnNote,
                returnTrackingNo,
              },
            },
          });

          await tx.inventoryLot.update({
            where: { id: lot.id },
            data: { status: "ACTIVE" },
          });
        }

        await tx.orderAllocation.update({
          where: { id: allocation.id },
          data: { status: ORDER_ALLOCATION_STATUS.RETURNED },
        });
      }

      await tx.orderLine.update({
        where: { id: line.id },
        data: { supplyStatus: "RETURNED" },
      });
    }

    const mergedProof = shippingProofToJson(
      mergeShippingProof(order.shippingProof, {
        proofNote: [
          parseShippingProof(order.shippingProof).proofNote,
          `退货登记：${returnNote}`,
          returnTrackingNo ? `退货物流：${returnTrackingNo}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        returnTrackingNo,
        returnedAt,
        restockMode,
        returnFinancials: returnFinancials ?? undefined,
      })
    );

    await tx.customerOrder.update({
      where: { id: orderId },
      data: {
        orderStatus: "RETURNED",
        shippingProof: mergedProof as Prisma.InputJsonValue,
        ...(returnFinancials
          ? {
              platformFee: returnFinancials.adjustedPlatformFee,
              shippingFee: returnFinancials.adjustedShippingFee,
              netRevenue: returnFinancials.adjustedNetRevenue,
            }
          : {}),
      },
    });
  });

  revalidatePath("/sales");
  revalidatePath(`/sales/${orderId}`);
  revalidatePath("/workbench");
  revalidatePath("/inventory/lots");
  revalidatePath("/inventory/items");
  revalidatePath("/inventory/sellable");
}

export async function markOrderShipped(
  orderId: string,
  options?: { trackingNo?: string; shippingProof?: ShippingProof }
) {
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
  const context = await requireUserContext({ storeId: order.storeId });

  await prisma.$transaction(async (tx) => {
    for (const line of order.lines) {
      for (const allocation of line.allocations) {
        if (
          allocation.status === ORDER_ALLOCATION_STATUS.SHIPPED ||
          allocation.status === ORDER_ALLOCATION_STATUS.DELIVERED
        ) continue;

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
          if (isLotConsumedAfterShipment(remaining)) {
            await tx.inventoryLot.update({
              where: { id: lot.id },
              data: { status: "CONSUMED" },
            });
          }
        }

        await tx.orderAllocation.update({
          where: { id: allocation.id },
          data: { status: ORDER_ALLOCATION_STATUS.SHIPPED },
        });
      }

      await tx.orderLine.update({
        where: { id: line.id },
        data: { supplyStatus: "CONSUMED" },
      });
    }

    const mergedProof = options?.shippingProof
      ? shippingProofToJson(mergeShippingProof(order.shippingProof, options.shippingProof))
      : shippingProofToJson(parseShippingProof(order.shippingProof));

    await tx.customerOrder.update({
      where: { id: orderId },
      data: {
        orderStatus: "SHIPPED",
        shippedAt: new Date(),
        trackingNo: options?.trackingNo?.trim() || undefined,
        shippingProof:
          Object.keys(mergedProof).length > 0
            ? (mergedProof as Prisma.InputJsonValue)
            : undefined,
      },
    });
  });

  await syncQuickEntryFromOrder(orderId, "SHIPPED");

  await completeTasksForRef({
    organizationId: context.organizationId,
    storeId: order.storeId,
    type: TASK_TYPE.SHIP_ORDER,
    refType: "CUSTOMER_ORDER",
    refId: order.id,
    completedById: context.userId,
  });

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
