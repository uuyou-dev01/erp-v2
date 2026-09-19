import { describe, it, expect } from "vitest";
import {
  catalogMoneyBuckets,
  catalogPriceRanges,
  combineCatalogOperations,
  resolveCatalogRange,
} from "@/lib/application/catalog-operations";
import type { CatalogOperations } from "@/lib/application/catalog-operations";
const metrics = (input: Partial<CatalogOperations>): CatalogOperations => ({
  orderIds: [],
  soldQty: "0",
  platforms: [],
  salePrices: [],
  purchasePrices: [],
  latest: null,
  matchedRevenue: "0",
  matchedCost: "0",
  matchedLines: 0,
  pendingLines: 0,
  ...input,
});
describe("catalog operating metrics", () => {
  it("deduplicates orders across variants while summing sold quantities and matched costs", () => {
    const combined = combineCatalogOperations([
      metrics({
        orderIds: ["shared", "a"],
        soldQty: "3",
        platforms: ["煤炉"],
        matchedRevenue: "100",
        matchedCost: "40",
        matchedLines: 2,
      }),
      metrics({
        orderIds: ["shared"],
        soldQty: "2",
        platforms: ["煤炉", "雅虎"],
        matchedRevenue: "80",
        matchedCost: "30",
        matchedLines: 1,
        pendingLines: 1,
      }),
    ]);
    expect(combined.orderIds).toEqual(["shared", "a"]);
    expect(combined.soldQty).toBe("5");
    expect(combined.platforms).toHaveLength(2);
    expect(combined.matchedRevenue).toBe("180");
    expect(combined.matchedCost).toBe("70");
    expect(combined.pendingLines).toBe(1);
  });
  it("weights SKU averages by quantity and keeps original currencies separate", () => {
    const buckets = catalogMoneyBuckets([
      { currency: "JPY", lineAmount: "1000", quantity: "1" },
      { currency: "JPY", lineAmount: "9000", quantity: "3" },
      { currency: "CNY", lineAmount: "150", quantity: "1" },
    ]);
    expect(catalogPriceRanges(buckets)).toEqual([
      { currency: "JPY", min: "2500.00", max: "2500.00" },
      { currency: "CNY", min: "150.00", max: "150.00" },
    ]);
  });
  it("shows ranges from different variant averages instead of using the first variant price", () => {
    expect(
      catalogPriceRanges([
        { currency: "CNY", amount: "40", quantity: "2" },
        { currency: "CNY", amount: "90", quantity: "3" },
      ])
    ).toEqual([{ currency: "CNY", min: "20.00", max: "30.00" }]);
  });
  it("returns an empty range for unknown prices or zero quantity", () => {
    expect(catalogPriceRanges([{ currency: "CNY", amount: "0", quantity: "0" }])).toEqual([]);
  });
  it("uses inclusive calendar days in Beijing time and rejects invalid custom dates", () => {
    const now = new Date("2026-09-19T17:00:00Z");
    const period = resolveCatalogRange({}, now);
    expect(period.from).toBe("2026-08-22");
    expect(period.to).toBe("2026-09-20");
    expect(period.dateTo.toISOString()).toBe("2026-09-20T15:59:59.999Z");
    expect(resolveCatalogRange({ range: "month" }, now).from).toBe("2026-09-01");
    expect(
      resolveCatalogRange({ range: "custom", from: "2026-02-30", to: "2026-03-01" }, now).error
    ).not.toBeNull();
  });
});
