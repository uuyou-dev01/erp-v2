import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import type { ReportSale } from "@/lib/application/operating-report";
import {
  allocateReportAmount,
  aggregateSalesContribution,
  salesCurrencyBreakdown,
} from "@/lib/application/sales-contribution";
const sale = (overrides: Partial<ReportSale> = {}): ReportSale => ({
  id: "bundle",
  date: "2026-09-30",
  occurredAt: "2026-09-30T00:00:00Z",
  settled: false,
  label: "ORDER",
  detail: "平台",
  status: "CONFIRMED",
  href: "/sales/bundle",
  included: true,
  money: {
    original: "2000",
    currency: "JPY",
    base: "100",
    rate: "0.05",
    basis: "test",
    error: null,
  },
  platformFee: "10",
  shippingFee: "0",
  cost: "30",
  profit: "60",
  provisional: true,
  costDetails: [],
  providerFeeEstimate: "0",
  note: "",
  items: [
    {
      skuId: "a",
      groupId: "group",
      groupName: "系列",
      name: "A",
      code: "A",
      quantity: "1",
      unitPrice: "1000",
      lineAmount: "1000",
      baseRevenue: "50",
      baseCost: "10",
      baseProfit: "35",
    },
    {
      skuId: "b",
      groupId: "group",
      groupName: "系列",
      name: "B",
      code: "B",
      quantity: "1",
      unitPrice: "1000",
      lineAmount: "1000",
      baseRevenue: "50",
      baseCost: "20",
      baseProfit: "25",
    },
  ],
  ...overrides,
});
describe("sales contribution", () => {
  it("preserves cents for low-value bundles and zero-price lines", () => {
    for (const [total, weights] of [
      ["0.03", ["1", "1", "1", "1", "1", "1"]],
      ["100.01", ["0", "0", "0"]],
    ] as const) {
      const parts = allocateReportAmount(total, [...weights]);
      expect(parts.reduce((sum, part) => sum.plus(part!), new Decimal(0)).toFixed(2)).toBe(total);
      expect(parts.every((part) => Number(part) >= 0)).toBe(true);
    }
    expect(allocateReportAmount(null, ["1", "1"])).toEqual([null, null]);
  });
  it("deduplicates bundle orders inside a group while retaining distinct SKU costs", () => {
    const result = aggregateSalesContribution([sale()], "group");
    expect(result[0]).toMatchObject({
      orderCount: 1,
      quantity: "2",
      revenue: "100.00",
      profit: "60.00",
      profitRate: "60.0",
    });
    expect(aggregateSalesContribution([sale()], "sku").map((row) => row.profit)).toEqual([
      "35.00",
      "25.00",
    ]);
  });
  it("never treats missing costs as zero, and excludes cancelled orders", () => {
    const pending = sale();
    pending.items[0].baseProfit = null;
    expect(aggregateSalesContribution([pending], "group")[0].profit).toBeNull();
    expect(aggregateSalesContribution([sale({ included: false })], "sku")).toEqual([]);
  });
  it("separates currencies and converts each profit using its own sale rate", () => {
    const rows = salesCurrencyBreakdown([
      sale(),
      sale({ id: "second", money: { ...sale().money, rate: "0.04" }, profit: "40" }),
    ]);
    expect(rows[0]).toMatchObject({
      currency: "JPY",
      revenue: "4000.00",
      averageOrderValue: "2000.00",
      profit: "2200.00",
      orderCount: 2,
    });
  });
});
