"use server";

import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";

export interface DateRange {
  dateFrom?: Date;
  dateTo?: Date;
}

const VALID_SALES_STATUSES = ["CONFIRMED", "SHIPPED", "DELIVERED"];

export async function getBusinessOverview(storeId: string, range?: DateRange) {
  const dateFilter =
    range?.dateFrom && range?.dateTo
      ? { gte: range.dateFrom, lte: range.dateTo }
      : undefined;

  const inventoryLots = await prisma.inventoryLot.findMany({
    where: { storeId, status: "ACTIVE" },
    select: { unitCost: true },
  });

  const itemUnits = await prisma.itemUnit.findMany({
    where: { storeId, status: "AVAILABLE" },
    select: { unitCost: true },
  });

  const totalInventoryValue = [
    ...inventoryLots.map((lot) => new Decimal(lot.unitCost.toString())),
    ...itemUnits.map((item) => new Decimal(item.unitCost.toString())),
  ].reduce((sum, cost) => sum.plus(cost), new Decimal(0));

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: {
      storeId,
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
    select: { totalAmount: true, status: true },
  });

  const totalPurchaseAmount = purchaseOrders.reduce(
    (sum, order) => sum.plus(new Decimal(order.totalAmount.toString())),
    new Decimal(0),
  );

  const receivedOrders = purchaseOrders.filter(
    (o) => o.status === "RECEIVED",
  ).length;

  const customerOrders = await prisma.customerOrder.findMany({
    where: {
      storeId,
      ...(dateFilter ? { orderDate: dateFilter } : {}),
    },
    select: { totalPaid: true, orderStatus: true },
  });

  const totalSalesAmount = customerOrders.reduce(
    (sum, order) => sum.plus(new Decimal(order.totalPaid.toString())),
    new Decimal(0),
  );

  const confirmedOrders = customerOrders.filter(
    (o) =>
      o.orderStatus === "CONFIRMED" ||
      o.orderStatus === "SHIPPED" ||
      o.orderStatus === "DELIVERED",
  ).length;

  const listings = await prisma.listing.findMany({
    where: { storeId },
    select: { status: true },
  });

  const activeListings = listings.filter((l) => l.status === "ACTIVE").length;

  return {
    inventory: {
      totalValue: totalInventoryValue.toFixed(2),
      lotCount: inventoryLots.length,
      itemCount: itemUnits.length,
    },
    procurement: {
      totalAmount: totalPurchaseAmount.toFixed(2),
      orderCount: purchaseOrders.length,
      receivedCount: receivedOrders,
    },
    sales: {
      totalAmount: totalSalesAmount.toFixed(2),
      orderCount: customerOrders.length,
      confirmedCount: confirmedOrders,
    },
    listing: {
      activeCount: activeListings,
      totalCount: listings.length,
    },
  };
}

export async function getDashboardMonthlyMetrics(storeId: string, range: Required<DateRange>) {
  const salesOrders = await prisma.customerOrder.findMany({
    where: {
      storeId,
      orderDate: { gte: range.dateFrom, lte: range.dateTo },
      orderStatus: { in: VALID_SALES_STATUSES },
    },
    select: {
      id: true,
      totalPaid: true,
      platformFee: true,
      shippingFee: true,
      lines: {
        select: {
          skuId: true,
          allocations: {
            select: {
              costAmount: true,
            },
          },
        },
      },
    },
  });

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: {
      storeId,
      status: { not: "CANCELLED" },
      OR: [
        { orderedAt: { gte: range.dateFrom, lte: range.dateTo } },
        {
          orderedAt: null,
          createdAt: { gte: range.dateFrom, lte: range.dateTo },
        },
      ],
    },
    select: {
      id: true,
      totalAmount: true,
      status: true,
    },
  });

  const allSkus = await prisma.sKU.findMany({
    where: { storeId },
    select: {
      id: true,
      inventoryLots: {
        select: {
          id: true,
          status: true,
        },
      },
      itemUnits: {
        select: {
          status: true,
        },
      },
    },
  });

  const lotIds = allSkus.flatMap((sku) => sku.inventoryLots.map((lot) => lot.id));
  const ledgers =
    lotIds.length > 0
      ? await prisma.stockLedger.findMany({
          where: {
            entityType: "LOT",
            entityId: { in: lotIds },
          },
          select: {
            entityId: true,
            deltaQty: true,
          },
        })
      : [];

  const lotQuantityById = ledgers.reduce<Record<string, Decimal>>((acc, ledger) => {
    acc[ledger.entityId] = (acc[ledger.entityId] ?? new Decimal(0)).plus(
      new Decimal(ledger.deltaQty.toString())
    );
    return acc;
  }, {});

  const stockedSkuIds = new Set(
    allSkus
      .filter((sku) => {
        const lotQty = sku.inventoryLots.reduce(
          (sum, lot) => sum.plus(lotQuantityById[lot.id] ?? new Decimal(0)),
          new Decimal(0)
        );
        const availableItems = sku.itemUnits.some((item) => item.status === "AVAILABLE");
        return lotQty.gt(0) || availableItems;
      })
      .map((sku) => sku.id)
  );

  const soldSkuIds = new Set(
    salesOrders.flatMap((order) => order.lines.map((line) => line.skuId))
  );

  const salesAmount = salesOrders.reduce(
    (sum, order) => sum.plus(new Decimal(order.totalPaid.toString())),
    new Decimal(0)
  );
  const platformFee = salesOrders.reduce(
    (sum, order) => sum.plus(new Decimal(order.platformFee.toString())),
    new Decimal(0)
  );
  const shippingFee = salesOrders.reduce(
    (sum, order) => sum.plus(new Decimal(order.shippingFee.toString())),
    new Decimal(0)
  );
  const inventoryCost = salesOrders.reduce((sum, order) => {
    return order.lines.reduce((lineSum, line) => {
      return line.allocations.reduce((allocSum, allocation) => {
        return allocSum.plus(new Decimal(allocation.costAmount.toString()));
      }, lineSum);
    }, sum);
  }, new Decimal(0));
  const purchaseAmount = purchaseOrders.reduce(
    (sum, order) => sum.plus(new Decimal(order.totalAmount.toString())),
    new Decimal(0)
  );
  const grossProfit = salesAmount.minus(platformFee).minus(shippingFee).minus(inventoryCost);
  const profitRate = salesAmount.gt(0) ? grossProfit.div(salesAmount).mul(100) : new Decimal(0);
  const movingSkuRatio =
    stockedSkuIds.size > 0
      ? new Decimal(soldSkuIds.size).div(stockedSkuIds.size).mul(100)
      : new Decimal(0);

  return {
    salesAmount: salesAmount.toFixed(2),
    salesOrderCount: salesOrders.length,
    purchaseAmount: purchaseAmount.toFixed(2),
    purchaseOrderCount: purchaseOrders.length,
    grossProfit: grossProfit.toFixed(2),
    profitRate: profitRate.toFixed(1),
    platformFee: platformFee.toFixed(2),
    shippingFee: shippingFee.toFixed(2),
    inventoryCost: inventoryCost.toFixed(2),
    movingSkuRatio: movingSkuRatio.toFixed(1),
    soldSkuCount: soldSkuIds.size,
    stockedSkuCount: stockedSkuIds.size,
  };
}

export async function getInventoryReport(storeId: string, range?: DateRange) {
  const dateFilter =
    range?.dateFrom && range?.dateTo
      ? { gte: range.dateFrom, lte: range.dateTo }
      : undefined;

  const lots = await prisma.inventoryLot.findMany({
    where: {
      storeId,
      ...(dateFilter ? { receivedAt: dateFilter } : {}),
    },
    include: { sku: true, location: true },
  });

  const items = await prisma.itemUnit.findMany({
    where: {
      storeId,
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
    include: { sku: true, location: true },
  });

  const byLocation = new Map<string, { name: string; value: number }>();

  lots.forEach((lot) => {
    const key = lot.location.code;
    const current = byLocation.get(key) || {
      name: lot.location.name,
      value: 0,
    };
    current.value += parseFloat(lot.unitCost.toString());
    byLocation.set(key, current);
  });

  items.forEach((item) => {
    const key = item.location.code;
    const current = byLocation.get(key) || {
      name: item.location.name,
      value: 0,
    };
    current.value += parseFloat(item.unitCost.toString());
    byLocation.set(key, current);
  });

  const byStatus = {
    active: lots.filter((l) => l.status === "ACTIVE").length,
    consumed: lots.filter((l) => l.status === "CONSUMED").length,
    available: items.filter((i) => i.status === "AVAILABLE").length,
    allocated: items.filter((i) => i.status === "ALLOCATED").length,
  };

  return {
    byLocation: Array.from(byLocation.values()),
    byStatus,
    totalLots: lots.length,
    totalItems: items.length,
  };
}

export async function getSalesReport(storeId: string, range?: DateRange) {
  const dateFilter =
    range?.dateFrom && range?.dateTo
      ? { gte: range.dateFrom, lte: range.dateTo }
      : undefined;

  const orders = await prisma.customerOrder.findMany({
    where: {
      storeId,
      ...(dateFilter ? { orderDate: dateFilter } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  const byMonth = new Map<string, number>();
  orders.forEach((order) => {
    const month = order.createdAt.toISOString().slice(0, 7);
    const current = byMonth.get(month) || 0;
    byMonth.set(month, current + parseFloat(order.totalPaid.toString()));
  });

  const byStatus = {
    draft: orders.filter((o) => o.orderStatus === "DRAFT").length,
    confirmed: orders.filter((o) => o.orderStatus === "CONFIRMED").length,
    shipped: orders.filter((o) => o.orderStatus === "SHIPPED").length,
    delivered: orders.filter((o) => o.orderStatus === "DELIVERED").length,
  };

  return {
    byMonth: Array.from(byMonth.entries()).map(([month, amount]) => ({
      month,
      amount,
    })),
    byStatus,
    totalOrders: orders.length,
    totalAmount: orders.reduce(
      (sum, o) => sum + parseFloat(o.totalPaid.toString()),
      0,
    ),
  };
}

export async function getMonthlyPnL(storeId: string, monthsBack = 6) {
  const now = new Date();
  const startDate = new Date(
    now.getFullYear(),
    now.getMonth() - monthsBack + 1,
    1,
  );

  const orders = await prisma.customerOrder.findMany({
    where: {
      storeId,
      orderDate: { gte: startDate },
      orderStatus: { notIn: ["CANCELLED", "RETURNED"] },
    },
    select: {
      orderDate: true,
      totalPaid: true,
      platformFee: true,
      shippingFee: true,
    },
  });

  const purchases = await prisma.purchaseOrder.findMany({
    where: {
      storeId,
      status: "RECEIVED",
      receivedAt: { gte: startDate },
    },
    select: { receivedAt: true, totalAmount: true },
  });

  const monthlyData = new Map<
    string,
    {
      revenue: Decimal;
      platformFee: Decimal;
      shippingFee: Decimal;
      purchaseCost: Decimal;
    }
  >();

  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(
      now.getFullYear(),
      now.getMonth() - monthsBack + 1 + i,
      1,
    );
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyData.set(key, {
      revenue: new Decimal(0),
      platformFee: new Decimal(0),
      shippingFee: new Decimal(0),
      purchaseCost: new Decimal(0),
    });
  }

  orders.forEach((order) => {
    const key = order.orderDate.toISOString().slice(0, 7);
    const entry = monthlyData.get(key);
    if (entry) {
      entry.revenue = entry.revenue.plus(
        new Decimal(order.totalPaid.toString()),
      );
      entry.platformFee = entry.platformFee.plus(
        new Decimal(order.platformFee.toString()),
      );
      entry.shippingFee = entry.shippingFee.plus(
        new Decimal(order.shippingFee.toString()),
      );
    }
  });

  purchases.forEach((po) => {
    if (!po.receivedAt) return;
    const key = po.receivedAt.toISOString().slice(0, 7);
    const entry = monthlyData.get(key);
    if (entry) {
      entry.purchaseCost = entry.purchaseCost.plus(
        new Decimal(po.totalAmount.toString()),
      );
    }
  });

  return Array.from(monthlyData.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      revenue: data.revenue.toNumber(),
      platformFee: data.platformFee.toNumber(),
      shippingFee: data.shippingFee.toNumber(),
      purchaseCost: data.purchaseCost.toNumber(),
      profit: data.revenue
        .minus(data.platformFee)
        .minus(data.shippingFee)
        .minus(data.purchaseCost)
        .toNumber(),
    }));
}

export async function getPlatformBreakdown(
  storeId: string,
  range?: DateRange,
) {
  const dateFilter =
    range?.dateFrom && range?.dateTo
      ? { gte: range.dateFrom, lte: range.dateTo }
      : undefined;

  const orders = await prisma.customerOrder.findMany({
    where: {
      storeId,
      ...(dateFilter ? { orderDate: dateFilter } : {}),
      orderStatus: { notIn: ["CANCELLED", "RETURNED"] },
    },
    include: { platform: { select: { name: true, code: true } } },
  });

  const platformMap = new Map<
    string,
    {
      name: string;
      totalSales: Decimal;
      orderCount: number;
      totalPlatformFee: Decimal;
    }
  >();

  orders.forEach((order) => {
    const key = order.platformId || "DIRECT";
    const name = order.platform?.name || "直销";
    const entry = platformMap.get(key) || {
      name,
      totalSales: new Decimal(0),
      orderCount: 0,
      totalPlatformFee: new Decimal(0),
    };
    entry.totalSales = entry.totalSales.plus(
      new Decimal(order.totalPaid.toString()),
    );
    entry.orderCount += 1;
    entry.totalPlatformFee = entry.totalPlatformFee.plus(
      new Decimal(order.platformFee.toString()),
    );
    platformMap.set(key, entry);
  });

  return Array.from(platformMap.values()).map((e) => ({
    name: e.name,
    totalSales: e.totalSales.toNumber(),
    orderCount: e.orderCount,
    totalPlatformFee: e.totalPlatformFee.toNumber(),
  }));
}

export async function getFeeDetails(storeId: string, range?: DateRange) {
  const dateFilter =
    range?.dateFrom && range?.dateTo
      ? { gte: range.dateFrom, lte: range.dateTo }
      : undefined;

  const orders = await prisma.customerOrder.findMany({
    where: {
      storeId,
      ...(dateFilter ? { orderDate: dateFilter } : {}),
      orderStatus: { notIn: ["CANCELLED", "RETURNED"] },
    },
    select: {
      platformFee: true,
      shippingFee: true,
      shippingProviderFeeRate: true,
      totalPaid: true,
    },
  });

  let totalPlatformFee = new Decimal(0);
  let totalShippingFee = new Decimal(0);
  let totalAgentFee = new Decimal(0);

  orders.forEach((order) => {
    totalPlatformFee = totalPlatformFee.plus(
      new Decimal(order.platformFee.toString()),
    );
    totalShippingFee = totalShippingFee.plus(
      new Decimal(order.shippingFee.toString()),
    );
    if (order.shippingProviderFeeRate) {
      totalAgentFee = totalAgentFee.plus(
        new Decimal(order.totalPaid.toString()).times(
          new Decimal(order.shippingProviderFeeRate.toString()),
        ),
      );
    }
  });

  return {
    platformFee: totalPlatformFee.toFixed(2),
    shippingFee: totalShippingFee.toFixed(2),
    agentFee: totalAgentFee.toFixed(2),
  };
}
