import Decimal from "decimal.js";

export const VALID_SALES_STATUSES = ["CONFIRMED", "SHIPPED", "DELIVERED"] as const;

interface SalesMetricOrder {
  orderStatus: string;
  totalPaid: { toString(): string } | string | number;
  platformId?: string | null;
}

export function isValidSalesStatus(status: string) {
  return VALID_SALES_STATUSES.includes(status as (typeof VALID_SALES_STATUSES)[number]);
}

export function summarizeSalesOrders<T extends SalesMetricOrder>(orders: T[]) {
  const platformTotals = new Map<string, Decimal>();
  let totalRevenue = new Decimal(0);

  for (const order of orders) {
    if (!isValidSalesStatus(order.orderStatus)) continue;

    const amount = new Decimal(order.totalPaid.toString());
    totalRevenue = totalRevenue.plus(amount);

    if (order.platformId) {
      const current = platformTotals.get(order.platformId) ?? new Decimal(0);
      platformTotals.set(order.platformId, current.plus(amount));
    }
  }

  return {
    totalRevenue,
    platformSales: Array.from(platformTotals.entries()).map(([platformId, total]) => ({
      platformId,
      total: total.toFixed(2),
    })),
  };
}
