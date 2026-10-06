import Decimal from "decimal.js";

export const VALID_SALES_STATUSES = ["CONFIRMED", "SHIPPED", "DELIVERED"] as const;

interface SalesMetricOrder {
  orderStatus: string;
  isPresale?: boolean;
  totalPaid: { toString(): string } | string | number;
  platformId?: string | null;
}

/** Accepted demand includes presales; booked revenue keeps its existing confirmation boundary. */
export const ACCEPTED_SALES_WHERE = {
  OR: [
    { orderStatus: { in: [...VALID_SALES_STATUSES] } },
    { orderStatus: "DRAFT", isPresale: true },
  ],
};

export function isPendingPresale(order: { orderStatus: string; isPresale?: boolean }) {
  return order.isPresale === true && order.orderStatus === "DRAFT";
}

export function isValidSalesStatus(status: string) {
  return VALID_SALES_STATUSES.includes(status as (typeof VALID_SALES_STATUSES)[number]);
}

export function summarizeSalesOrders<T extends SalesMetricOrder>(orders: T[]) {
  const platformTotals = new Map<string, Decimal>();
  let totalRevenue = new Decimal(0);
  let pendingPresaleAmount = new Decimal(0);
  let pendingPresaleCount = 0;

  for (const order of orders) {
    if (isPendingPresale(order)) {
      pendingPresaleAmount = pendingPresaleAmount.plus(order.totalPaid.toString());
      pendingPresaleCount++;
    }
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
    pendingPresaleAmount,
    pendingPresaleCount,
    platformSales: Array.from(platformTotals.entries()).map(([platformId, total]) => ({
      platformId,
      total: total.toFixed(2),
    })),
  };
}
