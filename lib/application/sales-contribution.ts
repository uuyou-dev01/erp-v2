import Decimal from "decimal.js";
import type { ReportSale } from "./operating-report";
import { sumReportMoney } from "./operating-report-math";

/** Allocate cents without losing the order total, including bundles and discounts. */
export function allocateReportAmount(
  total: string | null,
  weights: string[]
): Array<string | null> {
  if (total === null) return weights.map(() => null);
  if (!weights.length) return [];
  const positive = weights.map((value) => Decimal.max(0, value));
  const sum = positive.reduce((value, weight) => value.plus(weight), new Decimal(0));
  const signedCents = new Decimal(total).mul(100).toDecimalPlaces(0);
  const sign = signedCents.isNegative() ? -1 : 1;
  const cents = signedCents.abs();
  const exact = positive.map((weight) =>
    cents.mul(sum.gt(0) ? weight.div(sum) : new Decimal(1).div(weights.length))
  );
  const parts = exact.map((value) => value.floor());
  const remaining = cents
    .minus(parts.reduce((value, part) => value.plus(part), new Decimal(0)))
    .toNumber();
  const order = exact
    .map((value, index) => ({ index, remainder: value.minus(parts[index]) }))
    .sort((a, b) => b.remainder.comparedTo(a.remainder) || a.index - b.index);
  for (let index = 0; index < remaining; index++)
    parts[order[index].index] = parts[order[index].index].plus(1);
  return parts.map((part) => part.mul(sign).div(100).toFixed(2));
}

export function salesCurrencyBreakdown(sales: ReportSale[]) {
  const valid = sales.filter((sale) => sale.included);
  return [...new Set(valid.map((sale) => sale.money.currency))].map((currency) => {
    const rows = valid.filter((sale) => sale.money.currency === currency);
    const revenue = sumReportMoney(rows.map((sale) => sale.money.original))!;
    const profits = rows.map((sale) =>
      sale.profit !== null && sale.money.rate && new Decimal(sale.money.rate).gt(0)
        ? new Decimal(sale.profit).div(sale.money.rate).toFixed(2)
        : null
    );
    return {
      currency,
      orderCount: rows.length,
      revenue,
      averageOrderValue: new Decimal(revenue).div(rows.length).toFixed(2),
      profit: sumReportMoney(profits),
      provisional: rows.some((sale) => sale.provisional),
    };
  });
}

export function aggregateSalesContribution(sales: ReportSale[], dimension: "sku" | "group") {
  const groups = new Map<
    string,
    {
      id: string;
      name: string;
      code: string;
      orders: Set<string>;
      quantity: Decimal;
      revenue: Array<string | null>;
      cost: Array<string | null>;
      profit: Array<string | null>;
      provisional: boolean;
    }
  >();
  for (const sale of sales.filter((sale) => sale.included)) {
    for (const item of sale.items) {
      const id =
        (dimension === "group" ? item.groupId : item.skuId) ?? item.skuId ?? item.code ?? item.name;
      const group = groups.get(id) ?? {
        id,
        name: dimension === "group" ? (item.groupName ?? item.name) : item.name,
        code: dimension === "group" ? (item.groupCode ?? item.code) : item.code,
        orders: new Set<string>(),
        quantity: new Decimal(0),
        revenue: [],
        cost: [],
        profit: [],
        provisional: false,
      };
      group.orders.add(sale.id);
      group.quantity = group.quantity.plus(item.quantity);
      group.revenue.push(item.baseRevenue ?? null);
      group.cost.push(item.baseCost ?? null);
      group.profit.push(item.baseProfit ?? null);
      group.provisional ||= sale.provisional;
      groups.set(id, group);
    }
  }
  const totalRevenue = sumReportMoney(
    sales.filter((sale) => sale.included).map((sale) => sale.money.base)
  );
  return [...groups.values()]
    .map((group) => {
      const revenue = sumReportMoney(group.revenue),
        profit = sumReportMoney(group.profit);
      return {
        id: group.id,
        name: group.name,
        code: group.code,
        orderCount: group.orders.size,
        quantity: group.quantity.toString(),
        revenue,
        cost: sumReportMoney(group.cost),
        profit,
        provisional: group.provisional,
        profitRate:
          revenue !== null && profit !== null && new Decimal(revenue).gt(0)
            ? new Decimal(profit).div(revenue).mul(100).toFixed(1)
            : null,
        revenueShare:
          revenue !== null && totalRevenue !== null && new Decimal(totalRevenue).gt(0)
            ? new Decimal(revenue).div(totalRevenue).mul(100).toFixed(1)
            : null,
      };
    })
    .sort((a, b) => Number(b.revenue ?? -Infinity) - Number(a.revenue ?? -Infinity));
}
