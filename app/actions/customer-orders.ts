"use server";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { syncQuickEntryFromOrder } from "@/lib/application/workflow-queries";
import {
  allocateAmountByLineAmount,
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
import { requireAuthenticatedUser, requireUserContext } from "@/lib/auth/user-context";
import {
  completeTasksForRef,
  completeTasksForRefInTransaction,
  createTaskIfMissing,
  notifyTaskCompleted,
  TASK_TYPE,
} from "@/lib/application/tasks";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { assertOperationalSku } from "@/lib/application/sku-operability";
import { getEffectiveSellableQuantity } from "@/lib/application/inventory";
import { getOrderFulfillmentLocationIds } from "@/lib/application/location-fulfillment-roster";
import {
  cancelShipOrderTasksForOrderInTransaction,
  completeShipOrderDispatchInTransaction,
  ensureShipOrderTaskDispatch,
} from "@/lib/application/shipping-dispatch-lifecycle";
import { isFulfillmentDestinationCode } from "@/lib/inventory/location-fulfillment";
import { assertCanShipCustomerOrder } from "@/lib/application/shipping-authorization";
import {
  inferMarketFromPlatform,
  locationMatchesMarket,
  type SellableMarketCode,
} from "@/lib/application/sellable-market";
import { bindAssetReferences } from "@/lib/assets/references";

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
  shippingCountry?: string;
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

const salesOrderBusinessInclude = {
  salesChannelAccount: {
    select: { id: true, name: true, code: true, platformCode: true },
  },
  resaleListing: {
    select: {
      id: true,
      title: true,
      fulfillmentMode: true,
      supplyUnitPrice: true,
      supplyCurrency: true,
      estimatedGrossProfit: true,
      salesChannelAccount: {
        select: { id: true, name: true, code: true, platformCode: true },
      },
      supplyOffer: {
        select: {
          id: true,
          title: true,
          fulfillmentMode: true,
          organization: { select: { id: true, name: true } },
          providerOrganization: { select: { id: true, name: true } },
          ownerPartner: { select: { id: true, name: true } },
        },
      },
      supplyOfferItem: {
        select: {
          id: true,
          title: true,
          variantCode: true,
          sku: { select: { id: true, code: true, name: true, imageUrl: true } },
          itemUnit: { select: { id: true, skuId: true } },
        },
      },
    },
  },
  fulfillmentRequests: {
    select: {
      id: true,
      requestNo: true,
      status: true,
      quantity: true,
      carrier: true,
      trackingNo: true,
      shippingCountry: true,
      providerOrganizationId: true,
      updatedAt: true,
      settlements: {
        select: { id: true, settlementNo: true, status: true, totalAmount: true, currency: true },
        orderBy: { updatedAt: "desc" as const },
      },
    },
    orderBy: { updatedAt: "desc" as const },
  },
  settlements: {
    select: { id: true, settlementNo: true, status: true, totalAmount: true, currency: true },
    orderBy: { updatedAt: "desc" as const },
  },
  afterSalesCases: {
    select: { id: true, status: true },
  },
} as const;

export async function getCustomerOrders(storeId: string, platformId?: string) {
  const context = await requireUserContext({ storeId });
  return await prisma.customerOrder.findMany({
    where: {
      storeId: context.activeStoreId,
      ...(platformId ? { platformId } : {}),
    },
    include: {
      platform: true,
      lines: {
        include: {
          sku: true,
        },
      },
      ...salesOrderBusinessInclude,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCustomerOrderById(id: string) {
  const order = await prisma.customerOrder.findUnique({
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
              itemUnit: true,
            },
          },
        },
      },
      ...salesOrderBusinessInclude,
    },
  });
  if (!order) return null;
  await requireUserContext({ storeId: order.storeId });
  return order;
}

export async function updateOrderNetRevenue(orderId: string, netRevenue: string) {
  const order = await prisma.customerOrder.findUnique({
    where: { id: orderId },
    select: { storeId: true },
  });
  if (!order) throw new Error("订单不存在或无权修改");
  await requireUserContext({ storeId: order.storeId });

  await prisma.customerOrder.update({
    where: { id: orderId },
    data: { netRevenue },
  });
}

export async function createCustomerOrder(data: CreateCustomerOrderInput) {
  const context = await requireUserContext({ storeId: data.storeId });
  let platformCountry: string | null = null;
  let salesChannelAccountId: string | null = null;
  if (data.platformId) {
    const platform = await prisma.platform.findFirst({
      where: { id: data.platformId, storeId: context.activeStoreId },
      select: {
        id: true,
        country: true,
        salesChannelAccount: { select: { id: true } },
      },
    });
    if (!platform) throw new Error("平台不存在或无权操作");
    platformCountry = platform.country;
    salesChannelAccountId = platform.salesChannelAccount?.id ?? null;
  }
  const shippingCountry = data.shippingCountry?.trim().toUpperCase() || platformCountry;
  if (shippingCountry && !isFulfillmentDestinationCode(shippingCountry)) {
    throw new Error("订单收货国家/地区无效");
  }

  const order = await prisma.customerOrder.create({
    data: {
      storeId: context.activeStoreId,
      salesChannelAccountId,
      orderNumber: data.orderNumber,
      platformId: data.platformId,
      externalOrderNo: data.externalOrderNo,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      customerPhone: data.customerPhone,
      shippingAddress: data.shippingAddress,
      shippingCountry,
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

export async function createCustomerOrderAction(data: CreateCustomerOrderInput) {
  try {
    const order = await createCustomerOrder(data);
    return actionSuccess({ id: order.id });
  } catch (error) {
    return toActionFailure(error, "创建订单失败，请重试");
  }
}

export async function addOrderLine(data: CreateOrderLineInput) {
  const order = await prisma.customerOrder.findUnique({
    where: { id: data.orderId },
    select: { storeId: true },
  });
  if (!order) throw new Error("订单不存在或无权修改");
  const context = await requireUserContext({ storeId: order.storeId });
  const quantity = new Decimal(data.quantity);
  const unitPrice = data.unitPrice ? new Decimal(data.unitPrice) : new Decimal(0);
  if (!quantity.isFinite() || quantity.lte(0)) throw new Error("商品数量必须大于 0");
  if (!unitPrice.isFinite() || unitPrice.lt(0)) throw new Error("商品单价不能为负数");
  const lineAmount = quantity.times(unitPrice);

  const line = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "customer_orders" WHERE "id" = ${data.orderId} FOR UPDATE`;
    const freshOrder = await tx.customerOrder.findUnique({
      where: { id: data.orderId },
      select: { storeId: true, orderStatus: true },
    });
    if (!freshOrder || freshOrder.storeId !== context.activeStoreId) {
      throw new Error("订单不存在或无权修改");
    }
    if (freshOrder.orderStatus !== "DRAFT") {
      throw new Error("只有草稿订单可以添加商品");
    }
    await assertOperationalSku(tx, {
      storeId: context.activeStoreId,
      skuId: data.skuId,
      actionLabel: "销售",
    });
    const created = await tx.orderLine.create({
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
    await recalculateOrderTotals(data.orderId, tx);
    return created;
  });

  revalidatePath("/sales");
  revalidatePath(`/sales/${data.orderId}`);
  return line;
}

export async function addOrderLineAction(data: CreateOrderLineInput) {
  try {
    const line = await addOrderLine(data);
    return actionSuccess({ id: line.id });
  } catch (error) {
    return toActionFailure(error, "添加商品行失败，请重试");
  }
}

export async function allocateInventory(data: AllocateInventoryInput) {
  const quantity = new Decimal(data.quantity);
  if (!quantity.isFinite() || quantity.lte(0)) {
    throw new Error("分配数量必须大于 0");
  }
  const orderLine = await prisma.orderLine.findUnique({
    where: { id: data.orderLineId },
    include: {
      order: {
        select: {
          storeId: true,
          shippingCountry: true,
          platform: { select: { code: true, country: true } },
        },
      },
    },
  });
  if (!orderLine) {
    throw new Error("订单行不存在或无权分配");
  }
  const context = await requireUserContext({ storeId: orderLine.order.storeId });

  const allocation = await prisma.$transaction(async (tx) => {
    // All concrete inventory reservation paths lock the SKU first. Keeping one
    // lock order serializes normal orders, bundle orders and fulfillment holds.
    await tx.$queryRaw`SELECT "id" FROM "skus" WHERE "id" = ${orderLine.skuId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "order_lines" WHERE "id" = ${data.orderLineId} FOR UPDATE`;
    const freshOrderLine = await tx.orderLine.findUnique({
      where: { id: data.orderLineId },
      include: {
        allocations: {
          where: { status: { in: [...RESERVING_ALLOCATION_STATUSES] } },
          select: { quantity: true },
        },
        order: {
          select: {
            storeId: true,
            orderStatus: true,
            shippingCountry: true,
            platform: { select: { code: true, country: true } },
          },
        },
      },
    });
    if (!freshOrderLine || freshOrderLine.order.storeId !== context.activeStoreId) {
      throw new Error("订单行不存在或无权分配");
    }
    if (freshOrderLine.order.orderStatus !== "DRAFT") {
      throw new Error("只有草稿订单可以继续分配库存");
    }
    const alreadyAllocatedToLine = freshOrderLine.allocations.reduce(
      (sum, item) => sum.plus(new Decimal(item.quantity.toString())),
      new Decimal(0)
    );
    const remainingRequired = new Decimal(freshOrderLine.quantity.toString()).minus(
      alreadyAllocatedToLine
    );
    if (quantity.gt(remainingRequired)) {
      throw new Error(`分配数量超过订单行剩余需求（最多 ${remainingRequired.toFixed(4)}）`);
    }

    await tx.$queryRaw`SELECT "id" FROM "inventory_lots" WHERE "id" = ${data.lotId} FOR UPDATE`;
    const lot = await tx.inventoryLot.findUnique({
      where: { id: data.lotId },
      include: {
        location: {
          include: {
            capabilities: { where: { enabled: true } },
            shippingLanesFrom: {
              where: { active: true, laneType: "CUSTOMER_DELIVERY" },
            },
          },
        },
      },
    });

    if (!lot) {
      throw new Error("库存批次不存在");
    }
    if (lot.status !== "ACTIVE") {
      throw new Error("库存批次当前不可分配");
    }
    if (lot.costStatus !== "CONFIRMED") {
      throw new Error("该批库存成本仍待分摊，不能确认销售利润或分配订单");
    }
    if (lot.storeId !== freshOrderLine.order.storeId) {
      throw new Error("库存批次不属于该订单店铺");
    }
    if (!lot.inventoryPoolId || !context.inventoryPoolIds.includes(lot.inventoryPoolId)) {
      throw new Error("当前用户没有该库存池的分配权限");
    }
    if (lot.skuId !== freshOrderLine.skuId) {
      throw new Error("库存批次与订单行商品不一致");
    }
    const destination =
      (freshOrderLine.order.shippingCountry as SellableMarketCode | null) ??
      (freshOrderLine.order.platform
        ? inferMarketFromPlatform(freshOrderLine.order.platform)
        : null);
    if (destination && !locationMatchesMarket(lot.location, destination)) {
      throw new Error("所选库存节点没有到订单收货地的有效客户配送线路");
    }

    const ledgers = await tx.stockLedger.findMany({
      where: { entityType: "LOT", entityId: data.lotId },
      select: { deltaQty: true },
    });
    const onHand = ledgers.reduce(
      (sum, ledger) => sum.plus(new Decimal(ledger.deltaQty.toString())),
      new Decimal(0)
    );

    const [activeAllocations, fulfillmentAllocations] = await Promise.all([
      tx.orderAllocation.findMany({
        where: {
          lotId: data.lotId,
          status: {
            in: [...RESERVING_ALLOCATION_STATUSES],
          },
        },
        select: { quantity: true },
      }),
      tx.fulfillmentInventoryAllocation.findMany({
        where: { lotId: data.lotId, status: "ALLOCATED" },
        select: { quantity: true },
      }),
    ]);
    const reserved = [...activeAllocations, ...fulfillmentAllocations].reduce(
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
        costCurrency: lot.costCurrency,
        costSourceType: lot.sourceType,
        costSourceId: lot.sourceId,
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

export async function allocateInventoryAction(data: AllocateInventoryInput) {
  try {
    const allocation = await allocateInventory(data);
    return actionSuccess({ allocationId: allocation.id });
  } catch (error) {
    return toActionFailure(error, "分配库存失败，请重试");
  }
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
    throw new Error("订单不存在");
  }
  const context = await requireUserContext({ storeId: order.storeId });

  // Transaction: confirm order without deducting inventory (deduct on ship)
  const confirmedOrder = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "customer_orders" WHERE "id" = ${data.orderId} FOR UPDATE`;
    const orderForLock = await tx.customerOrder.findUnique({
      where: { id: data.orderId },
      select: { lines: { select: { skuId: true } } },
    });
    if (!orderForLock) throw new Error("订单不存在");
    for (const skuId of [...new Set(orderForLock.lines.map((line) => line.skuId))].sort()) {
      await tx.$queryRaw`SELECT "id" FROM "skus" WHERE "id" = ${skuId} FOR UPDATE`;
    }
    const freshOrder = await tx.customerOrder.findUnique({
      where: { id: data.orderId },
      include: {
        lines: {
          include: {
            allocations: {
              where: { status: { in: [...RESERVING_ALLOCATION_STATUSES] } },
            },
          },
        },
      },
    });
    if (!freshOrder || freshOrder.storeId !== context.activeStoreId) {
      throw new Error("订单不存在或无权确认");
    }
    if (freshOrder.orderStatus !== "DRAFT") {
      throw new Error("只有草稿订单可以确认");
    }
    if (freshOrder.lines.length === 0) {
      throw new Error("订单没有商品，不能确认");
    }
    for (const line of freshOrder.lines) {
      const allocatedQuantity = line.allocations.reduce(
        (sum, allocation) => sum.plus(new Decimal(allocation.quantity.toString())),
        new Decimal(0)
      );
      if (!allocatedQuantity.eq(new Decimal(line.quantity.toString()))) {
        throw new Error(`订单商品 ${line.id} 的库存尚未完整分配`);
      }
    }

    const subtotal = freshOrder.lines.reduce(
      (sum, line) => sum.plus(new Decimal(line.lineAmount.toString())),
      new Decimal(0)
    );
    const inventoryCost = freshOrder.lines.reduce((sum, line) => {
      return line.allocations.reduce(
        (lineSum, alloc) => lineSum.plus(new Decimal(alloc.costAmount.toString())),
        sum
      );
    }, new Decimal(0));

    const platform = freshOrder.platformId
      ? await tx.platform.findUnique({ where: { id: freshOrder.platformId } })
      : null;
    const feeRate = platform?.defaultFeeRate
      ? new Decimal(platform.defaultFeeRate.toString())
      : null;

    const fees = computeOrderFees({
      subtotal,
      platformFeeRate: feeRate,
      shippingFee: new Decimal(freshOrder.shippingFee.toString()),
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

    for (const line of freshOrder.lines) {
      await tx.orderLine.update({
        where: { id: line.id },
        data: { supplyStatus: "READY_TO_SHIP" },
      });
    }
    return freshOrder;
  });

  const fulfillmentLocationIds = await getOrderFulfillmentLocationIds(confirmedOrder.id);
  const fulfillmentLocationId =
    fulfillmentLocationIds.length === 1 ? fulfillmentLocationIds[0] : null;
  if (fulfillmentLocationId) {
    await ensureShipOrderTaskDispatch({
      organizationId: context.organizationId,
      storeId: confirmedOrder.storeId,
      orderId: confirmedOrder.id,
      orderNumber: confirmedOrder.orderNumber,
      createdById: context.userId,
      locationId: fulfillmentLocationId,
      description: confirmedOrder.platformId
        ? "订单已确认，等待仓库领取并发货。"
        : "手工订单已确认，等待仓库领取并发货。",
    });
  } else {
    await createTaskIfMissing({
      organizationId: context.organizationId,
      storeId: confirmedOrder.storeId,
      type: TASK_TYPE.SHIP_ORDER,
      title: `发货订单 ${confirmedOrder.orderNumber}`,
      description: "订单包含多个来源仓库，需要先拆分或重新分配库存。",
      refType: "CUSTOMER_ORDER",
      refId: confirmedOrder.id,
      createdById: context.userId,
      fulfillmentLocationId: null,
      metadata: { fulfillmentLocationIds, assignmentMode: "MULTI_LOCATION_MANUAL" },
    });
  }

  revalidatePath("/sales");
  revalidatePath(`/sales/${data.orderId}`);
  revalidatePath("/inventory/lots");
}

export async function confirmOrderAction(data: ConfirmOrderInput) {
  try {
    await confirmOrder(data);
    return actionSuccess({ orderId: data.orderId });
  } catch (error) {
    return toActionFailure(error, "确认订单失败，请重试");
  }
}

export async function saveOrderShippingProof(
  orderId: string,
  proof: ShippingProof,
  options?: { trackingNo?: string }
) {
  const order = await prisma.customerOrder.findUnique({
    where: { id: orderId },
    include: { store: { select: { organizationId: true } } },
  });
  if (!order) throw new Error("订单不存在");
  if (order.orderStatus !== "CONFIRMED") {
    throw new Error("只有待发货订单可以暂存发货凭证");
  }
  const user = await requireAuthenticatedUser();
  const internalAccess = await prisma.storeAccess.findFirst({
    where: { storeId: order.storeId, userId: user.id },
    select: { id: true },
  });
  if (!internalAccess) {
    const assignedTask = await prisma.task.findFirst({
      where: {
        refType: "CUSTOMER_ORDER",
        refId: orderId,
        type: TASK_TYPE.SHIP_ORDER,
        assignedToId: user.id,
        status: { in: ["ASSIGNED", "IN_PROGRESS", "OVERDUE"] },
        fulfillmentLocationId: { not: null },
      },
      select: { id: true, fulfillmentLocationId: true, organizationId: true },
    });
    const rosterAccess = assignedTask?.fulfillmentLocationId
      ? await prisma.locationFulfiller.findFirst({
          where: {
            userId: user.id,
            locationId: assignedTask.fulfillmentLocationId,
            organizationId: assignedTask.organizationId,
            status: "ACTIVE",
          },
          select: { id: true },
        })
      : null;
    if (!rosterAccess) throw new Error("无权修改该订单的发货凭证");
  }

  const assetOrganizationId = order.store.organizationId;
  if (!assetOrganizationId) {
    throw new Error("订单店铺尚未绑定经营主体，不能保存私有凭证");
  }
  await bindAssetReferences(
    proof.imageUrls,
    {
      organizationId: assetOrganizationId,
      storeId: order.storeId,
      userId: user.id,
    },
    "CUSTOMER_ORDER",
    order.id
  );

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
  const context = await requireUserContext({ storeId: order.storeId });

  const delivered = await prisma.customerOrder.updateMany({
    where: { id: orderId, orderStatus: "SHIPPED" },
    data: { orderStatus: "DELIVERED" },
  });
  if (delivered.count !== 1) {
    throw new Error("该订单已由其他人处理，请刷新后查看");
  }

  await createTaskIfMissing({
    organizationId: context.organizationId,
    storeId: order.storeId,
    type: TASK_TYPE.SETTLE_ORDER,
    title: `结算订单 ${order.orderNumber}`,
    description: "订单已妥投，等待核对平台费用、运费和利润。",
    refType: "CUSTOMER_ORDER",
    refId: order.id,
    createdById: context.userId,
  });

  revalidatePath("/sales");
  revalidatePath(`/sales/${orderId}`);
  revalidatePath("/reports/workload");
  revalidatePath("/reports/team-performance");
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
    include: {
      lines: { include: { allocations: true } },
      fulfillmentRequests: {
        include: {
          reservation: true,
          inventoryAllocations: true,
        },
      },
    },
  });
  if (!order) throw new Error("订单不存在");
  const context = await requireUserContext({ storeId: order.storeId });

  const cancellable = ["DRAFT", "PLACED", "PAID", "CONFIRMED"];
  if (!cancellable.includes(order.orderStatus)) {
    throw new Error("当前状态不可取消，已发货订单请走退货流程");
  }
  if (
    order.fulfillmentRequests.some((request) => ["SHIPPED", "DELIVERED"].includes(request.status))
  ) {
    throw new Error("关联代发已发货，不能直接取消订单");
  }

  const cancelReason = reason?.trim();
  if (!cancelReason) {
    throw new Error("请填写取消原因");
  }

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "customer_orders" WHERE "id" = ${orderId} FOR UPDATE`;
    const orderForLock = await tx.customerOrder.findUnique({
      where: { id: orderId },
      select: { lines: { select: { skuId: true } } },
    });
    if (!orderForLock) throw new Error("订单不存在");
    for (const skuId of [...new Set(orderForLock.lines.map((line) => line.skuId))].sort()) {
      await tx.$queryRaw`SELECT "id" FROM "skus" WHERE "id" = ${skuId} FOR UPDATE`;
    }
    const order = await tx.customerOrder.findUnique({
      where: { id: orderId },
      include: {
        lines: {
          include: {
            allocations: {
              where: { status: { in: [...RESERVING_ALLOCATION_STATUSES] } },
            },
          },
        },
        fulfillmentRequests: {
          include: {
            reservation: true,
            inventoryAllocations: { where: { status: "ALLOCATED" } },
          },
        },
      },
    });
    if (!order || !cancellable.includes(order.orderStatus)) {
      throw new Error("当前状态不可取消，已发货订单请走退货流程");
    }
    if (
      order.fulfillmentRequests.some((request) => ["SHIPPED", "DELIVERED"].includes(request.status))
    ) {
      throw new Error("关联代发已发货，不能直接取消订单");
    }
    const lotIds = [
      ...new Set([
        ...order.lines.flatMap((line) =>
          line.allocations.flatMap((allocation) => (allocation.lotId ? [allocation.lotId] : []))
        ),
        ...order.fulfillmentRequests.flatMap((request) =>
          request.inventoryAllocations.flatMap((allocation) =>
            allocation.lotId ? [allocation.lotId] : []
          )
        ),
      ]),
    ].sort();
    const itemUnitIds = [
      ...new Set([
        ...order.lines.flatMap((line) =>
          line.allocations.flatMap((allocation) =>
            allocation.itemUnitId ? [allocation.itemUnitId] : []
          )
        ),
        ...order.fulfillmentRequests.flatMap((request) =>
          request.inventoryAllocations.flatMap((allocation) =>
            allocation.itemUnitId ? [allocation.itemUnitId] : []
          )
        ),
      ]),
    ].sort();
    for (const lotId of lotIds) {
      await tx.$queryRaw`SELECT "id" FROM "inventory_lots" WHERE "id" = ${lotId} FOR UPDATE`;
    }
    for (const itemUnitId of itemUnitIds) {
      await tx.$queryRaw`SELECT "id" FROM "item_units" WHERE "id" = ${itemUnitId} FOR UPDATE`;
    }
    const releasedItemUnitIds = new Set<string>();

    for (const line of order.lines) {
      for (const allocation of line.allocations) {
        if (CLOSED_ALLOCATION_STATUSES.has(allocation.status)) {
          continue;
        }

        if (allocation.itemUnitId) {
          releasedItemUnitIds.add(allocation.itemUnitId);
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

    if (releasedItemUnitIds.size > 0) {
      await tx.listing.updateMany({
        where: {
          storeId: order.storeId,
          platformId: order.platformId ?? undefined,
          itemUnitId: { in: [...releasedItemUnitIds] },
          listingType: "ITEM_UNIT",
          status: "SOLD_OUT",
        },
        data: { status: "ACTIVE", delistedAt: null },
      });
    }

    for (const skuId of new Set(order.lines.map((line) => line.skuId))) {
      const sellableQuantity = await getEffectiveSellableQuantity(tx, order.storeId, skuId);
      if (sellableQuantity.gt(0)) {
        await tx.listing.updateMany({
          where: {
            storeId: order.storeId,
            platformId: order.platformId ?? undefined,
            skuId,
            listingType: "SKU",
            status: "SOLD_OUT",
          },
          data: { status: "ACTIVE", delistedAt: null },
        });
      }
    }

    for (const request of order.fulfillmentRequests) {
      if (["CANCELLED", "REJECTED", "DELIVERED"].includes(request.status)) continue;

      if (request.reservation?.status === "ACTIVE") {
        await tx.supplyReservation.update({
          where: { id: request.reservation.id },
          data: { status: "RELEASED", releasedAt: new Date() },
        });
        await tx.supplyOffer.update({
          where: { id: request.supplyOfferId },
          data: { reservedQty: { decrement: request.quantity } },
        });
        if (request.reservation.supplyOfferItemId) {
          await tx.supplyOfferItem.update({
            where: { id: request.reservation.supplyOfferItemId },
            data: { quantityReserved: { decrement: request.quantity } },
          });
        }
        if (request.reservation.supplyOfferChannelId) {
          const channel = await tx.supplyOfferChannel.findUnique({
            where: { id: request.reservation.supplyOfferChannelId },
          });
          if (channel?.inventoryMode === "GUARANTEED") {
            await tx.supplyOfferChannel.update({
              where: { id: channel.id },
              data: { quotaReservedQty: { decrement: request.quantity } },
            });
          }
        }
        if (request.resaleListingId) {
          await tx.resaleListing.update({
            where: { id: request.resaleListingId },
            data: {
              quantitySold: { decrement: request.quantity },
              ...(request.status !== "SHIPPED" ? { status: "ACTIVE", pausedAt: null } : {}),
            },
          });
        }
        const fulfillmentItemUnitIds = request.inventoryAllocations
          .filter((allocation) => allocation.status === "ALLOCATED" && allocation.itemUnitId)
          .map((allocation) => allocation.itemUnitId as string);
        await tx.fulfillmentInventoryAllocation.updateMany({
          where: { fulfillmentRequestId: request.id, status: "ALLOCATED" },
          data: { status: "RELEASED" },
        });
        if (fulfillmentItemUnitIds.length > 0) {
          await tx.itemUnit.updateMany({
            where: { id: { in: fulfillmentItemUnitIds }, status: "ALLOCATED" },
            data: { status: "AVAILABLE" },
          });
        }
      }

      await tx.fulfillmentRequest.update({
        where: { id: request.id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          note: [request.note, `订单取消：${cancelReason}`].filter(Boolean).join("\n"),
        },
      });
    }

    const mergedProof = shippingProofToJson(
      mergeShippingProof(order.shippingProof, {
        cancelReason,
        cancelledAt: new Date().toISOString(),
        proofNote: [parseShippingProof(order.shippingProof).proofNote, `订单取消：${cancelReason}`]
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
    await cancelShipOrderTasksForOrderInTransaction(tx, {
      orderId,
      actorUserId: context.userId,
      reason: cancelReason,
    });
  });

  revalidatePath("/sales");
  revalidatePath(`/sales/${orderId}`);
  revalidatePath("/workbench");
  revalidatePath("/inventory/lots");
  revalidatePath("/inventory/items");
  revalidatePath("/inventory/sellable");
  revalidatePath("/listing");
  revalidatePath("/fulfillment/requests");
  revalidatePath("/resale");
  revalidatePath("/marketplace");
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
  const initialOrder = await prisma.customerOrder.findUnique({
    where: { id: orderId },
    select: { orderStatus: true },
  });
  if (!initialOrder) throw new Error("订单不存在");
  if (initialOrder.orderStatus !== "SHIPPED" && initialOrder.orderStatus !== "DELIVERED") {
    throw new Error("只有已发货或待结算订单可以登记退货");
  }

  const returnNote = data?.note?.trim();
  if (!returnNote) {
    throw new Error("请填写退货说明");
  }

  const restockMode = data?.restockMode ?? "RETURN_CHECK";
  const returnTrackingNo = data?.returnTrackingNo?.trim();
  const returnedAt = new Date().toISOString();

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "customer_orders" WHERE "id" = ${orderId} FOR UPDATE`;
    const lockPlan = await tx.customerOrder.findUnique({
      where: { id: orderId },
      select: {
        orderStatus: true,
        lines: {
          select: {
            skuId: true,
            allocations: {
              select: { status: true, lotId: true, itemUnitId: true },
            },
          },
        },
      },
    });
    if (!lockPlan) throw new Error("订单不存在");
    if (lockPlan.orderStatus !== "SHIPPED" && lockPlan.orderStatus !== "DELIVERED") {
      throw new Error("该订单已由其他人处理，请刷新后查看");
    }

    for (const skuId of [...new Set(lockPlan.lines.map((line) => line.skuId))].sort()) {
      await tx.$queryRaw`SELECT "id" FROM "skus" WHERE "id" = ${skuId} FOR UPDATE`;
    }
    const returnableStatuses = new Set<string>([
      ORDER_ALLOCATION_STATUS.SHIPPED,
      ORDER_ALLOCATION_STATUS.DELIVERED,
    ]);
    const lotIds = [
      ...new Set(
        lockPlan.lines.flatMap((line) =>
          line.allocations.flatMap((allocation) =>
            returnableStatuses.has(allocation.status) && allocation.lotId ? [allocation.lotId] : []
          )
        )
      ),
    ].sort();
    const itemUnitIds = [
      ...new Set(
        lockPlan.lines.flatMap((line) =>
          line.allocations.flatMap((allocation) =>
            returnableStatuses.has(allocation.status) && allocation.itemUnitId
              ? [allocation.itemUnitId]
              : []
          )
        )
      ),
    ].sort();
    for (const lotId of lotIds) {
      await tx.$queryRaw`SELECT "id" FROM "inventory_lots" WHERE "id" = ${lotId} FOR UPDATE`;
    }
    for (const itemUnitId of itemUnitIds) {
      await tx.$queryRaw`SELECT "id" FROM "item_units" WHERE "id" = ${itemUnitId} FOR UPDATE`;
    }

    const order = await tx.customerOrder.findUnique({
      where: { id: orderId },
      include: { lines: { include: { allocations: true } } },
    });
    if (!order || (order.orderStatus !== "SHIPPED" && order.orderStatus !== "DELIVERED")) {
      throw new Error("该订单已由其他人处理，请刷新后查看");
    }
    const returnFinancials = computeReturnFinancialAdjustments(order, data);

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
          if (!item) throw new Error("退货对应的单品库存不存在");

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
          if (!lot) throw new Error("退货对应的批次库存不存在");

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

async function performOrderShipment(
  orderId: string,
  options: { trackingNo?: string; shippingProof?: ShippingProof } | undefined,
  actor: { userId: string; organizationId: string }
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
  if (order.lines.length === 0) {
    throw new Error("订单没有商品，无法发货");
  }
  for (const line of order.lines) {
    const reservedQuantity = line.allocations
      .filter((allocation) =>
        RESERVING_ALLOCATION_STATUSES.includes(
          allocation.status as (typeof RESERVING_ALLOCATION_STATUSES)[number]
        )
      )
      .reduce(
        (sum, allocation) => sum.plus(new Decimal(allocation.quantity.toString())),
        new Decimal(0)
      );
    const orderedQuantity = new Decimal(line.quantity.toString());
    if (!reservedQuantity.eq(orderedQuantity)) {
      throw new Error(`订单商品 ${line.id} 库存预留不完整，请先完成库存分配`);
    }
  }
  await bindAssetReferences(
    options?.shippingProof?.imageUrls,
    { organizationId: actor.organizationId, storeId: order.storeId, userId: actor.userId },
    "CUSTOMER_ORDER",
    order.id
  );
  const completedTasks = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "customer_orders" WHERE "id" = ${orderId} FOR UPDATE`;
    const orderForLock = await tx.customerOrder.findUnique({
      where: { id: orderId },
      select: { lines: { select: { skuId: true } } },
    });
    if (!orderForLock) throw new Error("订单不存在");
    for (const skuId of [...new Set(orderForLock.lines.map((line) => line.skuId))].sort()) {
      await tx.$queryRaw`SELECT "id" FROM "skus" WHERE "id" = ${skuId} FOR UPDATE`;
    }
    const lockedOrder = await tx.customerOrder.findUnique({
      where: { id: orderId },
      include: { lines: { include: { allocations: true } } },
    });
    if (!lockedOrder || lockedOrder.orderStatus !== "CONFIRMED") {
      throw new Error("该订单已经由其他人处理，请刷新后查看");
    }
    const lotIds = [
      ...new Set(
        lockedOrder.lines.flatMap((line) =>
          line.allocations.flatMap((allocation) => (allocation.lotId ? [allocation.lotId] : []))
        )
      ),
    ].sort();
    const itemUnitIds = [
      ...new Set(
        lockedOrder.lines.flatMap((line) =>
          line.allocations.flatMap((allocation) =>
            allocation.itemUnitId ? [allocation.itemUnitId] : []
          )
        )
      ),
    ].sort();
    for (const lotId of lotIds) {
      await tx.$queryRaw`SELECT "id" FROM "inventory_lots" WHERE "id" = ${lotId} FOR UPDATE`;
    }
    for (const itemUnitId of itemUnitIds) {
      await tx.$queryRaw`SELECT "id" FROM "item_units" WHERE "id" = ${itemUnitId} FOR UPDATE`;
    }
    for (const line of lockedOrder.lines) {
      const reservedQuantity = line.allocations
        .filter((allocation) =>
          RESERVING_ALLOCATION_STATUSES.includes(
            allocation.status as (typeof RESERVING_ALLOCATION_STATUSES)[number]
          )
        )
        .reduce(
          (sum, allocation) => sum.plus(new Decimal(allocation.quantity.toString())),
          new Decimal(0)
        );
      if (!reservedQuantity.eq(new Decimal(line.quantity.toString()))) {
        throw new Error(`订单商品 ${line.id} 库存预留不完整，请先完成库存分配`);
      }
    }
    const shipmentClaim = await tx.customerOrder.updateMany({
      where: { id: orderId, orderStatus: "CONFIRMED" },
      data: { updatedAt: new Date() },
    });
    if (!shipmentClaim.count) {
      throw new Error("该订单已经由其他人处理，请刷新后查看");
    }

    for (const line of lockedOrder.lines) {
      for (const allocation of line.allocations) {
        if (
          allocation.status === ORDER_ALLOCATION_STATUS.SHIPPED ||
          allocation.status === ORDER_ALLOCATION_STATUS.DELIVERED
        )
          continue;

        if (allocation.itemUnitId) {
          const item = await tx.itemUnit.findUnique({
            where: { id: allocation.itemUnitId },
          });
          if (!item) continue;

          await tx.stockLedger.create({
            data: {
              storeId: lockedOrder.storeId,
              occurredAt: new Date(),
              entityType: "ITEM_UNIT",
              entityId: item.id,
              locationId: item.locationId,
              deltaQty: new Decimal(allocation.quantity.toString()).negated().toFixed(4),
              reason: "OUTBOUND_SALE",
              refType: "ORDER_LINE",
              refId: line.id,
              meta: { orderId: lockedOrder.id, allocationId: allocation.id },
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
              storeId: lockedOrder.storeId,
              occurredAt: new Date(),
              entityType: "LOT",
              entityId: lot.id,
              locationId: lot.locationId,
              deltaQty: new Decimal(allocation.quantity.toString()).negated().toFixed(4),
              reason: "OUTBOUND_SALE",
              refType: "ORDER_LINE",
              refId: line.id,
              meta: { orderId: lockedOrder.id, allocationId: allocation.id },
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
      ? shippingProofToJson(mergeShippingProof(lockedOrder.shippingProof, options.shippingProof))
      : shippingProofToJson(parseShippingProof(lockedOrder.shippingProof));

    await tx.customerOrder.update({
      where: { id: orderId },
      data: {
        orderStatus: "SHIPPED",
        shippedAt: new Date(),
        trackingNo: options?.trackingNo?.trim() || undefined,
        shippingProof:
          Object.keys(mergedProof).length > 0 ? (mergedProof as Prisma.InputJsonValue) : undefined,
      },
    });

    const completed = await completeTasksForRefInTransaction(tx, {
      organizationId: actor.organizationId,
      storeId: lockedOrder.storeId,
      type: TASK_TYPE.SHIP_ORDER,
      refType: "CUSTOMER_ORDER",
      refId: lockedOrder.id,
      completedById: actor.userId,
      work: {
        code: "SHIP_ORDER",
        name: "订单发货",
        quantity: lockedOrder.lines.reduce(
          (sum, line) => sum.plus(line.quantity.toString()),
          new Decimal(0)
        ),
        unit: "件",
        metadata: {
          orderId: lockedOrder.id,
          platformId: lockedOrder.platformId,
        },
      },
    });
    for (const task of completed) {
      await completeShipOrderDispatchInTransaction(tx, {
        taskId: task.id,
        userId: actor.userId,
      });
    }
    return completed;
  });

  await syncQuickEntryFromOrder(orderId, "SHIPPED");
  await Promise.all(completedTasks.map((task) => notifyTaskCompleted(task, actor.userId)));

  revalidatePath("/sales");
  revalidatePath(`/sales/${orderId}`);
  revalidatePath("/inventory/lots");
  revalidatePath("/inventory/items");
  revalidatePath("/workbench");
}

export async function markOrderShipped(
  orderId: string,
  options?: { trackingNo?: string; shippingProof?: ShippingProof }
) {
  const order = await prisma.customerOrder.findUnique({
    where: { id: orderId },
    select: { storeId: true },
  });
  if (!order) throw new Error("订单不存在");
  const context = await requireUserContext({ storeId: order.storeId });
  await assertCanShipCustomerOrder({
    orderId,
    organizationId: context.organizationId,
    storeId: order.storeId,
    userId: context.userId,
    role: context.role,
  });
  return performOrderShipment(orderId, options, {
    userId: context.userId,
    organizationId: context.organizationId,
  });
}

export async function markOrderShippedAsLocationFulfiller(
  taskId: string,
  options?: { trackingNo?: string; shippingProof?: ShippingProof }
) {
  const user = await requireAuthenticatedUser();
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      type: TASK_TYPE.SHIP_ORDER,
      refType: "CUSTOMER_ORDER",
      assignedToId: user.id,
      status: "IN_PROGRESS",
      fulfillmentLocationId: { not: null },
    },
    select: {
      refId: true,
      organizationId: true,
      fulfillmentLocationId: true,
    },
  });
  if (!task?.fulfillmentLocationId) throw new Error("任务不存在或未指派给你");

  const rosterAccess = await prisma.locationFulfiller.findFirst({
    where: {
      organizationId: task.organizationId,
      locationId: task.fulfillmentLocationId,
      userId: user.id,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (!rosterAccess) throw new Error("该仓库的发货权限已失效");

  const locationIds = await getOrderFulfillmentLocationIds(task.refId);
  if (locationIds.length !== 1 || locationIds[0] !== task.fulfillmentLocationId) {
    throw new Error("订单库存不完全属于你负责的仓库，请联系订单负责人处理");
  }

  return performOrderShipment(task.refId, options, {
    userId: user.id,
    organizationId: task.organizationId,
  });
}

export async function markOrderShippedAction(
  orderId: string,
  options?: { trackingNo?: string; shippingProof?: ShippingProof }
) {
  try {
    await markOrderShipped(orderId, options);
    return actionSuccess({ orderId });
  } catch (error) {
    return toActionFailure(error, "标记发货失败，请重试");
  }
}

function parseNonNegativeSettlementDecimal(value: string, label: string) {
  const amount = parseSettlementDecimal(value, label);
  if (amount.lt(0)) {
    throw new Error(`${label}不能为负数`);
  }
  return amount;
}

function parsePositiveSettlementDecimal(value: string, label: string) {
  const amount = parseSettlementDecimal(value, label);
  if (amount.lte(0)) {
    throw new Error(`${label}必须大于 0`);
  }
  return amount;
}

function parseSettlementDecimal(value: string, label: string) {
  try {
    const amount = new Decimal(value);
    if (!amount.isFinite()) {
      throw new Error("invalid");
    }
    return amount;
  } catch {
    throw new Error(`${label}必须是有效数字`);
  }
}

export async function settleCustomerOrder(
  orderId: string,
  data: {
    actualSalePrice?: string;
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
  const context = await requireUserContext({ storeId: order.storeId });

  const subtotal = new Decimal(order.subtotal.toString());
  const settlementSubtotal = data.actualSalePrice
    ? parsePositiveSettlementDecimal(data.actualSalePrice, "实际售价")
    : subtotal;
  const inventoryCost = order.lines.reduce((sum, line) => {
    return line.allocations.reduce(
      (lineSum, alloc) => lineSum.plus(new Decimal(alloc.costAmount.toString())),
      sum
    );
  }, new Decimal(0));

  const platformFeeRate = data.platformFeeRate
    ? parseNonNegativeSettlementDecimal(data.platformFeeRate, "平台费率")
    : order.platform?.defaultFeeRate
      ? new Decimal(order.platform.defaultFeeRate.toString())
      : null;

  if (order.shippingFeeStatus === "PENDING" && !data.shippingFee?.trim()) {
    throw new Error("该订单邮费仍待核算，结算前请明确填写实际邮费（实际为 0 也请填写 0）");
  }

  const fees = computeOrderFees({
    subtotal: settlementSubtotal,
    platformFeeAmount: data.platformFee
      ? parseNonNegativeSettlementDecimal(data.platformFee, "平台手续费")
      : null,
    platformFeeRate,
    shippingFee: data.shippingFee
      ? parseNonNegativeSettlementDecimal(data.shippingFee, "实际邮费")
      : new Decimal(order.shippingFee.toString()),
    inventoryCost,
  });
  const feeStrings = feeResultToStrings(fees);

  await prisma.$transaction(async (tx) => {
    await tx.customerOrder.update({
      where: { id: orderId },
      data: {
        subtotal: settlementSubtotal.toFixed(4),
        totalPaid: settlementSubtotal.toFixed(4),
        platformFee: feeStrings.platformFee,
        shippingFee: feeStrings.shippingFee,
        shippingFeeStatus: "ACTUAL",
        netRevenue: feeStrings.netRevenue,
        settledAt: new Date(),
      },
    });

    if (data.actualSalePrice) {
      const lineAllocations = allocateAmountByLineAmount({
        amount: settlementSubtotal,
        lines: order.lines.map((line) => ({
          id: line.id,
          lineAmount: new Decimal(line.lineAmount.toString()),
        })),
      });
      const amountByLineId = new Map(lineAllocations.map((row) => [row.id, row.amount]));

      for (const line of order.lines) {
        const lineAmount = amountByLineId.get(line.id);
        if (!lineAmount) continue;
        const quantity = new Decimal(line.quantity.toString());
        await tx.orderLine.update({
          where: { id: line.id },
          data: {
            lineAmount: lineAmount.toFixed(4),
            unitPrice: quantity.gt(0)
              ? lineAmount.div(quantity).toDecimalPlaces(4).toFixed(4)
              : line.unitPrice,
          },
        });
      }
    }
  });

  await syncQuickEntryFromOrder(orderId, "SETTLED");

  await createTaskIfMissing({
    organizationId: context.organizationId,
    storeId: order.storeId,
    type: TASK_TYPE.SETTLE_ORDER,
    title: `结算订单 ${order.orderNumber}`,
    description: "订单结算时自动补齐的结算任务事实。",
    refType: "CUSTOMER_ORDER",
    refId: order.id,
    createdById: context.userId,
  });
  await completeTasksForRef({
    organizationId: context.organizationId,
    storeId: order.storeId,
    type: TASK_TYPE.SETTLE_ORDER,
    refType: "CUSTOMER_ORDER",
    refId: order.id,
    completedById: context.userId,
  });

  revalidatePath("/sales");
  revalidatePath(`/sales/${orderId}`);
  revalidatePath("/reports");
  revalidatePath("/reports/workload");
  revalidatePath("/reports/team-performance");
  revalidatePath("/workbench");
}

export async function settleCustomerOrderAction(
  orderId: string,
  data: {
    actualSalePrice?: string;
    platformFee?: string;
    shippingFee?: string;
    platformFeeRate?: string;
  }
) {
  try {
    await settleCustomerOrder(orderId, data);
    return actionSuccess({ orderId });
  } catch (error) {
    return toActionFailure(error, "结算失败，请重试");
  }
}

async function recalculateOrderTotals(
  orderId: string,
  client: Pick<Prisma.TransactionClient, "orderLine" | "customerOrder"> = prisma
) {
  const lines = await client.orderLine.findMany({
    where: { orderId },
  });

  const subtotal = lines.reduce((sum, line) => {
    return sum.plus(new Decimal(line.lineAmount.toString()));
  }, new Decimal(0));

  await client.customerOrder.update({
    where: { id: orderId },
    data: {
      subtotal: subtotal.toFixed(4),
      totalPaid: subtotal.toFixed(4), // Will add discounts/fees later
    },
  });
}
