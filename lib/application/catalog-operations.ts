import Decimal from "decimal.js";
import { reportDay } from "./operating-report-math";

export type CatalogPrice = { currency: string; amount: string; quantity: string };
export type CatalogOperations = {
  orderIds: string[];
  soldQty: string;
  platforms: string[];
  salePrices: CatalogPrice[];
  purchasePrices: CatalogPrice[];
  latest: { price: string; currency: string; date: string } | null;
  matchedRevenue: string;
  matchedCost: string;
  matchedLines: number;
  pendingLines: number;
};

export function combineCatalogOperations(values: CatalogOperations[]): CatalogOperations {
  const sum = (key: "soldQty" | "matchedRevenue" | "matchedCost") =>
    values.reduce((total, v) => total.plus(v[key]), new Decimal(0)).toString();
  return {
    orderIds: [...new Set(values.flatMap((v) => v.orderIds))],
    soldQty: sum("soldQty"),
    platforms: [...new Set(values.flatMap((v) => v.platforms))].sort(),
    salePrices: values.flatMap((v) => v.salePrices),
    purchasePrices: values.flatMap((v) => v.purchasePrices),
    latest:
      values
        .flatMap((v) => (v.latest ? [v.latest] : []))
        .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null,
    matchedRevenue: sum("matchedRevenue"),
    matchedCost: sum("matchedCost"),
    matchedLines: values.reduce((n, v) => n + v.matchedLines, 0),
    pendingLines: values.reduce((n, v) => n + v.pendingLines, 0),
  };
}

/** Monetary averages never mix currencies; grouped products show their SKU price range. */
export function catalogPriceRanges(prices: CatalogPrice[]) {
  const currencies = new Map<string, Decimal[]>();
  for (const price of prices) {
    if (new Decimal(price.quantity).lte(0)) continue;
    const bucket = currencies.get(price.currency) ?? [];
    bucket.push(new Decimal(price.amount).div(price.quantity));
    currencies.set(price.currency, bucket);
  }
  return [...currencies].map(([currency, values]) => ({
    currency,
    min: Decimal.min(...values).toFixed(2),
    max: Decimal.max(...values).toFixed(2),
  }));
}

export function catalogMoneyBuckets(
  lines: Array<{
    quantity: { toString(): string };
    lineAmount: { toString(): string };
    currency: string;
  }>
): CatalogPrice[] {
  const buckets = new Map<string, { amount: Decimal; quantity: Decimal }>();
  for (const line of lines) {
    const bucket = buckets.get(line.currency) ?? {
      amount: new Decimal(0),
      quantity: new Decimal(0),
    };
    bucket.amount = bucket.amount.plus(line.lineAmount.toString());
    bucket.quantity = bucket.quantity.plus(line.quantity.toString());
    buckets.set(line.currency, bucket);
  }
  return [...buckets].map(([currency, v]) => ({
    currency,
    amount: v.amount.toString(),
    quantity: v.quantity.toString(),
  }));
}

export function resolveCatalogRange(
  params: { range?: string; from?: string; to?: string },
  now = new Date()
) {
  const today = reportDay(now);
  const start = new Date(`${today}T00:00:00Z`);
  const range = ["30d", "90d", "month", "custom"].includes(params.range ?? "")
    ? params.range!
    : "30d";
  let from = new Date(start.getTime() - (range === "90d" ? 89 : 29) * 86400000)
    .toISOString()
    .slice(0, 10);
  let to = today,
    error: string | null = null;
  if (range === "month") from = `${today.slice(0, 7)}-01`;
  if (range === "custom") {
    const valid = (v?: string): v is string =>
      !!v &&
      /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      Number.isFinite(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v;
    if (valid(params.from) && valid(params.to) && params.from <= params.to) {
      from = params.from;
      to = params.to;
    } else error = "日期范围无效，已显示近30天。";
  }
  return {
    range: error ? "30d" : range,
    from,
    to,
    error,
    dateFrom: new Date(`${from}T00:00:00+08:00`),
    dateTo: new Date(`${to}T23:59:59.999+08:00`),
  };
}
