"use server";

import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";
import { createStoreMoneyConverter } from "@/lib/fx";
import { computeDashboardProfitMetrics } from "@/lib/application/report-metrics";
import {
  isValidSalesStatus,
  VALID_SALES_STATUSES,
} from "@/lib/application/sales-metrics";

export interface DateRange {
  dateFrom?: Date;
  dateTo?: Date;
}

export async function getOperationalChargeSummary(
  organizationId: string,
  range?: DateRange,
) {
  const occurredAt =
    range?.dateFrom && range?.dateTo
      ? { gte: range.dateFrom, lte: range.dateTo }
      : undefined;
  const events = await prisma.chargeEvent.findMany({
    where: {
      occurredAt,
      OR: [
        { organizationId },
        { parties: { some: { organizationId } } },
      ],
      status: { not: "VOID" },
    },
    include: { category: true, parties: true },
  });

  const rows = new Map<string, {
    currency: string;
    estimatedPayable: Decimal;
    estimatedReceivable: Decimal;
    confirmedPayable: Decimal;
    confirmedReceivable: Decimal;
    settledPayable: Decimal;
    settledReceivable: Decimal;
  }>();
  const byGroup = new Map<string, Decimal>();
  for (const event of events) {
    const row = rows.get(event.currency) ?? {
      currency: event.currency,
      estimatedPayable: new Decimal(0),
      estimatedReceivable: new Decimal(0),
      confirmedPayable: new Decimal(0),
      confirmedReceivable: new Decimal(0),
      settledPayable: new Decimal(0),
      settledReceivable: new Decimal(0),
    };
    const isPayer = event.parties.some((party) => party.role === "PAYER" && party.organizationId === organizationId);
    const isPayee = event.parties.some((party) => party.role === "PAYEE" && party.organizationId === organizationId);
    if (event.amountKind === "ESTIMATE") {
      if (isPayer) row.estimatedPayable = row.estimatedPayable.plus(event.amount);
      if (isPayee) row.estimatedReceivable = row.estimatedReceivable.plus(event.amount);
    } else if (["CONFIRMED", "PARTIALLY_SETTLED", "SETTLED"].includes(event.status)) {
      if (isPayer) row.confirmedPayable = row.confirmedPayable.plus(event.amount);
      if (isPayee) row.confirmedReceivable = row.confirmedReceivable.plus(event.amount);
      if (event.status === "SETTLED") {
        if (isPayer) row.settledPayable = row.settledPayable.plus(event.amount);
        if (isPayee) row.settledReceivable = row.settledReceivable.plus(event.amount);
      }
      const key = `${event.currency}:${event.category.groupCode}`;
      byGroup.set(key, (byGroup.get(key) ?? new Decimal(0)).plus(isPayer ? event.amount : event.amount.negated()));
    }
    rows.set(event.currency, row);
  }

  return {
    eventCount: events.length,
    currencies: [...rows.values()].map((row) => ({
      currency: row.currency,
      estimatedPayable: row.estimatedPayable.toFixed(2),
      estimatedReceivable: row.estimatedReceivable.toFixed(2),
      confirmedPayable: row.confirmedPayable.toFixed(2),
      confirmedReceivable: row.confirmedReceivable.toFixed(2),
      actualProfitContribution: row.confirmedReceivable.minus(row.confirmedPayable).toFixed(2),
      settledPayable: row.settledPayable.toFixed(2),
      settledReceivable: row.settledReceivable.toFixed(2),
    })),
    byGroup: [...byGroup].map(([key, amount]) => {
      const [currency, groupCode] = key.split(":");
      return { currency, groupCode, netExpense: amount.toFixed(2) };
    }),
  };
}

const VALID_SALES_STATUS_FILTER = [...VALID_SALES_STATUSES];

export async function getBusinessOverview(storeId: string, range?: DateRange) {
  const converter = await createStoreMoneyConverter(storeId);
  const dateFilter =
    range?.dateFrom && range?.dateTo
      ? { gte: range.dateFrom, lte: range.dateTo }
      : undefined;

  const inventoryLots = await prisma.inventoryLot.findMany({
    where: { storeId, status: "ACTIVE" },
    select: { id: true, unitCost: true, costCurrency: true, receivedAt: true },
  });

  const itemUnits = await prisma.itemUnit.findMany({
    where: { storeId, status: "AVAILABLE" },
    select: { unitCost: true, costCurrency: true, createdAt: true },
  });

  const lotIds = inventoryLots.map((lot) => lot.id);
  const lotLedgers =
    lotIds.length > 0
      ? await prisma.stockLedger.groupBy({
          by: ["entityId"],
          where: {
            storeId,
            entityType: "LOT",
            entityId: { in: lotIds },
          },
          _sum: {
            deltaQty: true,
          },
        })
      : [];
  const lotQtyById = new Map(
    lotLedgers.map((row) => [
      row.entityId,
      new Decimal(row._sum.deltaQty?.toString() ?? "0"),
    ]),
  );

  const lotValues = await Promise.all(
    inventoryLots.map(async (lot) => {
      const lotQty = lotQtyById.get(lot.id) ?? new Decimal(0);
      if (lotQty.lte(0)) return new Decimal(0);
      const rawValue = new Decimal(lot.unitCost.toString()).mul(lotQty);
      return converter.convertToBase(rawValue, lot.costCurrency, {
        effectiveAt: lot.receivedAt,
      });
    }),
  );
  const itemUnitValues = await Promise.all(
    itemUnits.map((item) =>
      converter.convertToBase(item.unitCost.toString(), item.costCurrency, {
        effectiveAt: item.createdAt,
      }),
    ),
  );
  const totalInventoryValue = [...lotValues, ...itemUnitValues].reduce(
    (sum, value) => sum.plus(value),
    new Decimal(0),
  );

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: {
      storeId,
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
    select: {
      totalAmount: true,
      status: true,
      currency: true,
      fxRate: true,
      orderedAt: true,
      createdAt: true,
    },
  });

  const purchaseAmounts = await Promise.all(
    purchaseOrders.map((order) =>
      converter.convertToBase(order.totalAmount.toString(), order.currency, {
        preferredRate: order.fxRate?.toString(),
        effectiveAt: order.orderedAt ?? order.createdAt,
      }),
    ),
  );
  const totalPurchaseAmount = purchaseAmounts.reduce(
    (sum, amount) => sum.plus(amount),
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
    select: { totalPaid: true, orderStatus: true, currency: true, orderDate: true },
  });

  const validSalesOrders = customerOrders.filter((order) =>
    isValidSalesStatus(order.orderStatus)
  );
  const salesAmounts = await Promise.all(
    validSalesOrders.map((order) =>
      converter.convertToBase(order.totalPaid.toString(), order.currency, {
        effectiveAt: order.orderDate,
      }),
    ),
  );
  const totalSalesAmount = salesAmounts.reduce(
    (sum, amount) => sum.plus(amount),
    new Decimal(0),
  );

  const confirmedOrders = validSalesOrders.length;

  const listings = await prisma.listing.findMany({
    where: { storeId },
    select: { status: true },
  });

  const activeListings = listings.filter((l) => l.status === "ACTIVE").length;

  return {
    baseCurrency: converter.baseCurrency,
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
  const converter = await createStoreMoneyConverter(storeId);
  const salesOrders = await prisma.customerOrder.findMany({
    where: {
      storeId,
      orderDate: { gte: range.dateFrom, lte: range.dateTo },
      orderStatus: { in: VALID_SALES_STATUS_FILTER },
    },
    select: {
      id: true,
      currency: true,
      orderDate: true,
      totalPaid: true,
      platformFee: true,
      shippingFee: true,
      lines: {
        select: {
          skuId: true,
          allocations: {
            select: {
              costAmount: true,
              inventoryLot: {
                select: {
                  costCurrency: true,
                  receivedAt: true,
                },
              },
              itemUnit: {
                select: {
                  costCurrency: true,
                  createdAt: true,
                },
              },
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
      currency: true,
      fxRate: true,
      orderedAt: true,
      createdAt: true,
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

  const convertedSalesOrders = await Promise.all(
    salesOrders.map(async (order) => ({
      salesAmount: await converter.convertToBase(
        order.totalPaid.toString(),
        order.currency,
        {
          effectiveAt: order.orderDate,
        },
      ),
      platformFee: await converter.convertToBase(
        order.platformFee.toString(),
        order.currency,
        {
          effectiveAt: order.orderDate,
        },
      ),
      shippingFee: await converter.convertToBase(
        order.shippingFee.toString(),
        order.currency,
        {
          effectiveAt: order.orderDate,
        },
      ),
    })),
  );

  const salesAmount = convertedSalesOrders.reduce(
    (sum, row) => sum.plus(row.salesAmount),
    new Decimal(0),
  );
  const platformFee = convertedSalesOrders.reduce(
    (sum, row) => sum.plus(row.platformFee),
    new Decimal(0),
  );
  const shippingFee = convertedSalesOrders.reduce(
    (sum, row) => sum.plus(row.shippingFee),
    new Decimal(0),
  );

  let inventoryCost = new Decimal(0);
  for (const order of salesOrders) {
    for (const line of order.lines) {
      for (const allocation of line.allocations) {
        const costCurrency =
          allocation.inventoryLot?.costCurrency ??
          allocation.itemUnit?.costCurrency ??
          order.currency;
        const effectiveAt =
          allocation.inventoryLot?.receivedAt ??
          allocation.itemUnit?.createdAt ??
          order.orderDate;
        const convertedCost = await converter.convertToBase(
          allocation.costAmount.toString(),
          costCurrency,
          { effectiveAt },
        );
        inventoryCost = inventoryCost.plus(convertedCost);
      }
    }
  }

  const purchaseAmounts = await Promise.all(
    purchaseOrders.map((order) =>
      converter.convertToBase(order.totalAmount.toString(), order.currency, {
        preferredRate: order.fxRate?.toString(),
        effectiveAt: order.orderedAt ?? order.createdAt,
      }),
    ),
  );
  const purchaseAmount = purchaseAmounts.reduce(
    (sum, value) => sum.plus(value),
    new Decimal(0),
  );
  const profitMetrics = computeDashboardProfitMetrics({
    salesAmount,
    platformFee,
    shippingFee,
    inventoryCost,
  });
  const { grossProfit, profitRate } = profitMetrics;
  const movingSkuRatio =
    stockedSkuIds.size > 0
      ? new Decimal(soldSkuIds.size).div(stockedSkuIds.size).mul(100)
      : new Decimal(0);

  return {
    baseCurrency: converter.baseCurrency,
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
  const converter = await createStoreMoneyConverter(storeId);
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

  const lotIds = lots.map((lot) => lot.id);
  const lotLedgers =
    lotIds.length > 0
      ? await prisma.stockLedger.groupBy({
          by: ["entityId"],
          where: {
            storeId,
            entityType: "LOT",
            entityId: { in: lotIds },
          },
          _sum: {
            deltaQty: true,
          },
        })
      : [];
  const lotQtyById = new Map(
    lotLedgers.map((row) => [
      row.entityId,
      new Decimal(row._sum.deltaQty?.toString() ?? "0"),
    ]),
  );

  const convertedLots = await Promise.all(
    lots.map((lot) => {
      const lotQty = lotQtyById.get(lot.id) ?? new Decimal(0);
      if (lotQty.lte(0)) return new Decimal(0);
      const rawValue = new Decimal(lot.unitCost.toString()).mul(lotQty);
      return converter.convertToBase(rawValue, lot.costCurrency, {
        effectiveAt: lot.receivedAt,
      });
    }),
  );
  lots.forEach((lot, index) => {
    if (convertedLots[index].lte(0)) return;
    const key = lot.location.code;
    const current = byLocation.get(key) || {
      name: lot.location.name,
      value: 0,
    };
    current.value += convertedLots[index].toNumber();
    byLocation.set(key, current);
  });

  const convertedItems = await Promise.all(
    items.map((item) =>
      converter.convertToBase(item.unitCost.toString(), item.costCurrency, {
        effectiveAt: item.createdAt,
      }),
    ),
  );
  items.forEach((item, index) => {
    const key = item.location.code;
    const current = byLocation.get(key) || {
      name: item.location.name,
      value: 0,
    };
    current.value += convertedItems[index].toNumber();
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
  const converter = await createStoreMoneyConverter(storeId);
  const dateFilter =
    range?.dateFrom && range?.dateTo
      ? { gte: range.dateFrom, lte: range.dateTo }
      : undefined;

  const orders = await prisma.customerOrder.findMany({
    where: {
      storeId,
      ...(dateFilter ? { orderDate: dateFilter } : {}),
    },
    select: {
      createdAt: true,
      orderStatus: true,
      totalPaid: true,
      currency: true,
      orderDate: true,
    },
    orderBy: { orderDate: "asc" },
  });

  const convertedOrderAmounts = await Promise.all(
    orders.map((order) =>
      converter.convertToBase(order.totalPaid.toString(), order.currency, {
        effectiveAt: order.orderDate,
      }),
    ),
  );
  const byMonth = new Map<string, Decimal>();
  orders.forEach((order, index) => {
    if (!isValidSalesStatus(order.orderStatus)) return;
    const month = order.orderDate.toISOString().slice(0, 7);
    const current = byMonth.get(month) ?? new Decimal(0);
    byMonth.set(month, current.plus(convertedOrderAmounts[index]));
  });

  const byStatus = {
    draft: orders.filter((o) => o.orderStatus === "DRAFT").length,
    confirmed: orders.filter((o) => o.orderStatus === "CONFIRMED").length,
    shipped: orders.filter((o) => o.orderStatus === "SHIPPED").length,
    delivered: orders.filter((o) => o.orderStatus === "DELIVERED").length,
    returned: orders.filter((o) => o.orderStatus === "RETURNED").length,
    cancelled: orders.filter((o) => o.orderStatus === "CANCELLED").length,
  };

  return {
    byMonth: Array.from(byMonth.entries()).map(([month, amount]) => ({
      month,
      amount: amount.toNumber(),
    })),
    byStatus,
    totalOrders: orders.length,
    totalAmount: orders
      .reduce(
        (sum, order, index) =>
          isValidSalesStatus(order.orderStatus)
            ? sum.plus(convertedOrderAmounts[index])
            : sum,
        new Decimal(0)
      )
      .toNumber(),
  };
}

export async function getMonthlyPnL(storeId: string, monthsBack = 6) {
  const converter = await createStoreMoneyConverter(storeId);
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
      orderStatus: { in: VALID_SALES_STATUS_FILTER },
    },
    select: {
      orderDate: true,
      currency: true,
      totalPaid: true,
      platformFee: true,
      shippingFee: true,
      lines: {
        select: {
          allocations: {
            select: {
              costAmount: true,
              inventoryLot: {
                select: {
                  costCurrency: true,
                  receivedAt: true,
                },
              },
              itemUnit: {
                select: {
                  costCurrency: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      },
    },
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

  for (const order of orders) {
    const key = order.orderDate.toISOString().slice(0, 7);
    const entry = monthlyData.get(key);
    if (entry) {
      entry.revenue = entry.revenue.plus(
        await converter.convertToBase(order.totalPaid.toString(), order.currency, {
          effectiveAt: order.orderDate,
        }),
      );
      entry.platformFee = entry.platformFee.plus(
        await converter.convertToBase(order.platformFee.toString(), order.currency, {
          effectiveAt: order.orderDate,
        }),
      );
      entry.shippingFee = entry.shippingFee.plus(
        await converter.convertToBase(order.shippingFee.toString(), order.currency, {
          effectiveAt: order.orderDate,
        }),
      );
      for (const line of order.lines) {
        for (const allocation of line.allocations) {
          const costCurrency =
            allocation.inventoryLot?.costCurrency ??
            allocation.itemUnit?.costCurrency ??
            order.currency;
          const effectiveAt =
            allocation.inventoryLot?.receivedAt ??
            allocation.itemUnit?.createdAt ??
            order.orderDate;
          entry.purchaseCost = entry.purchaseCost.plus(
            await converter.convertToBase(allocation.costAmount.toString(), costCurrency, {
              effectiveAt,
            }),
          );
        }
      }
    }
  }

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
  const converter = await createStoreMoneyConverter(storeId);
  const dateFilter =
    range?.dateFrom && range?.dateTo
      ? { gte: range.dateFrom, lte: range.dateTo }
      : undefined;

  const orders = await prisma.customerOrder.findMany({
    where: {
      storeId,
      ...(dateFilter ? { orderDate: dateFilter } : {}),
      orderStatus: { in: VALID_SALES_STATUS_FILTER },
    },
    select: {
      platformId: true,
      platformFee: true,
      totalPaid: true,
      currency: true,
      orderDate: true,
      platform: { select: { name: true, code: true } },
    },
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

  for (const order of orders) {
    const key = order.platformId || "DIRECT";
    const name = order.platform?.name || "直销";
    const entry = platformMap.get(key) || {
      name,
      totalSales: new Decimal(0),
      orderCount: 0,
      totalPlatformFee: new Decimal(0),
    };
    entry.totalSales = entry.totalSales.plus(
      await converter.convertToBase(order.totalPaid.toString(), order.currency, {
        effectiveAt: order.orderDate,
      }),
    );
    entry.orderCount += 1;
    entry.totalPlatformFee = entry.totalPlatformFee.plus(
      await converter.convertToBase(order.platformFee.toString(), order.currency, {
        effectiveAt: order.orderDate,
      }),
    );
    platformMap.set(key, entry);
  }

  return Array.from(platformMap.values()).map((e) => ({
    name: e.name,
    totalSales: e.totalSales.toNumber(),
    orderCount: e.orderCount,
    totalPlatformFee: e.totalPlatformFee.toNumber(),
  }));
}

export async function getFeeDetails(storeId: string, range?: DateRange) {
  const converter = await createStoreMoneyConverter(storeId);
  const dateFilter =
    range?.dateFrom && range?.dateTo
      ? { gte: range.dateFrom, lte: range.dateTo }
      : undefined;

  const orders = await prisma.customerOrder.findMany({
    where: {
      storeId,
      ...(dateFilter ? { orderDate: dateFilter } : {}),
      orderStatus: { in: VALID_SALES_STATUS_FILTER },
    },
    select: {
      platformFee: true,
      shippingFee: true,
      shippingProviderFeeRate: true,
      totalPaid: true,
      currency: true,
      orderDate: true,
    },
  });

  let totalPlatformFee = new Decimal(0);
  let totalShippingFee = new Decimal(0);
  let totalAgentFee = new Decimal(0);

  for (const order of orders) {
    totalPlatformFee = totalPlatformFee.plus(
      await converter.convertToBase(order.platformFee.toString(), order.currency, {
        effectiveAt: order.orderDate,
      }),
    );
    totalShippingFee = totalShippingFee.plus(
      await converter.convertToBase(order.shippingFee.toString(), order.currency, {
        effectiveAt: order.orderDate,
      }),
    );
    if (order.shippingProviderFeeRate) {
      const rawAgentFee = new Decimal(order.totalPaid.toString()).times(
        new Decimal(order.shippingProviderFeeRate.toString()),
      );
      totalAgentFee = totalAgentFee.plus(
        await converter.convertToBase(rawAgentFee, order.currency, {
          effectiveAt: order.orderDate,
        }),
      );
    }
  }

  return {
    platformFee: totalPlatformFee.toFixed(2),
    shippingFee: totalShippingFee.toFixed(2),
    agentFee: totalAgentFee.toFixed(2),
  };
}

export async function getSettlementSummary(storeId: string, range?: DateRange) {
  const converter = await createStoreMoneyConverter(storeId);
  const dateFilter =
    range?.dateFrom && range?.dateTo
      ? { gte: range.dateFrom, lte: range.dateTo }
      : undefined;

  const settlements = await prisma.settlement.findMany({
    where: {
      storeId,
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
      lines: {
        select: {
          lineType: true,
          amount: true,
          currency: true,
          direction: true,
          baseAmount: true,
          baseCurrency: true,
        },
      },
    },
  });

  const statusCounts = {
    draft: 0,
    confirmed: 0,
    paid: 0,
    void: 0,
  };
  const lineBreakdown = new Map<string, Decimal>();
  let pendingPayable = new Decimal(0);
  let pendingReceivable = new Decimal(0);
  let paidPayable = new Decimal(0);
  let paidReceivable = new Decimal(0);

  for (const settlement of settlements) {
    if (settlement.status === "DRAFT") statusCounts.draft += 1;
    if (settlement.status === "CONFIRMED") statusCounts.confirmed += 1;
    if (settlement.status === "PAID") statusCounts.paid += 1;
    if (settlement.status === "VOID") statusCounts.void += 1;
    if (settlement.status === "VOID") continue;

    for (const line of settlement.lines) {
      const baseAmount =
        line.baseAmount && line.baseCurrency === converter.baseCurrency
          ? new Decimal(line.baseAmount.toString())
          : await converter.convertToBase(line.amount.toString(), line.currency, {
              effectiveAt: settlement.createdAt,
            });

      lineBreakdown.set(
        line.lineType,
        (lineBreakdown.get(line.lineType) ?? new Decimal(0)).plus(baseAmount),
      );

      // Informational lines explain how the agreement was calculated, but they
      // are not money that this settlement asks either party to pay or receive.
      if (line.direction === "INFORMATIONAL") continue;

      if (settlement.status === "PAID") {
        if (line.direction === "RECEIVABLE") {
          paidReceivable = paidReceivable.plus(baseAmount);
        } else {
          paidPayable = paidPayable.plus(baseAmount);
        }
      } else if (line.direction === "RECEIVABLE") {
        pendingReceivable = pendingReceivable.plus(baseAmount);
      } else {
        pendingPayable = pendingPayable.plus(baseAmount);
      }
    }
  }

  return {
    baseCurrency: converter.baseCurrency,
    settlementCount: settlements.length,
    activeSettlementCount: settlements.length - statusCounts.void,
    pendingCount: statusCounts.draft + statusCounts.confirmed,
    paidCount: statusCounts.paid,
    statusCounts,
    pendingPayable: pendingPayable.toFixed(2),
    pendingReceivable: pendingReceivable.toFixed(2),
    pendingNetPayable: pendingPayable.minus(pendingReceivable).toFixed(2),
    paidPayable: paidPayable.toFixed(2),
    paidReceivable: paidReceivable.toFixed(2),
    paidNetPayable: paidPayable.minus(paidReceivable).toFixed(2),
    lineBreakdown: Array.from(lineBreakdown.entries()).map(([lineType, amount]) => ({
      lineType,
      amount: amount.toFixed(2),
    })),
  };
}
