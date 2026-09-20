import { describe, expect, it } from "vitest";
import {
  buildReplenishmentDecision,
  DEFAULT_REPLENISHMENT_POLICY,
  isReplenishmentAlert,
  resolveReplenishmentPolicy,
  type ReplenishmentInput,
} from "@/lib/application/replenishment";

const input: ReplenishmentInput = {
  sellableQty: 10,
  sales7Qty: 7,
  sales30Qty: 30,
  sales90Qty: 60,
  orderCount30: 10,
  now: new Date("2026-09-20T23:30:00.000Z"),
};

describe("replenishment policy", () => {
  it("uses explicit planning defaults when no query settings are supplied", () => {
    expect(resolveReplenishmentPolicy({})).toEqual(DEFAULT_REPLENISHMENT_POLICY);
  });

  it("accepts integer settings including zero safety days and supported boundaries", () => {
    expect(
      resolveReplenishmentPolicy({ leadDays: "180", bufferDays: "0", coverDays: "1" })
    ).toEqual({ leadTimeDays: 180, safetyDays: 0, targetCoverDays: 1 });
  });

  it.each(["", "-1", "Infinity", "NaN", "3.5", "4days", "1e2", "181"])(
    "falls back for invalid lead time %s without discarding valid settings",
    (leadDays) => {
      expect(resolveReplenishmentPolicy({ leadDays, bufferDays: "2", coverDays: "40" })).toEqual({
        leadTimeDays: 14,
        safetyDays: 2,
        targetCoverDays: 40,
      });
    }
  );

  it("rejects values outside each setting's own range", () => {
    expect(resolveReplenishmentPolicy({ leadDays: "0", bufferDays: "61", coverDays: "0" })).toEqual(
      DEFAULT_REPLENISHMENT_POLICY
    );
  });
});

describe("SKU replenishment decisions", () => {
  it("warns ahead of stockout and estimates the quantity through delivery and target cover", () => {
    const result = buildReplenishmentDecision(input);
    expect(result).toMatchObject({
      status: "reorder_now",
      confidence: "normal",
      dailySales: 1,
      coverageDays: 10,
      daysUntilReorder: -11,
      suggestedQty: 41,
      projectedStockoutDate: "2026-09-30",
      reorderByDate: "2026-09-09",
    });
  });

  it("uses the faster recent demand when sales accelerate", () => {
    const result = buildReplenishmentDecision({ ...input, sales7Qty: 14, sellableQty: 40 });
    expect(result).toMatchObject({
      dailySales: 2,
      coverageDays: 20,
      status: "reorder_now",
      suggestedQty: 62,
    });
  });

  it("preserves decimal demand and inventory while recommending whole purchase units", () => {
    const result = buildReplenishmentDecision({
      ...input,
      sellableQty: 0.75,
      sales7Qty: 3.5,
      sales30Qty: 10.5,
      sales90Qty: 20.25,
      inTransitQty: 1.25,
      onOrderQty: 2.5,
      timelyIncomingQty: 0.5,
      orderCount30: 4.5,
    });
    expect(result).toMatchObject({
      status: "reorder_now",
      sales7Qty: 3.5,
      sales30Qty: 10.5,
      sales90Qty: 20.25,
      dailySales: 0.5,
      coverageDays: 1.5,
      inTransitQty: 1.25,
      onOrderQty: 2.5,
      timelyIncomingQty: 0.5,
      suggestedQty: 25,
      orderCount30: 4,
    });
  });

  it("does not turn a fractional low-sample stock remainder into a stockout", () => {
    const result = buildReplenishmentDecision({
      ...input,
      sellableQty: 0.5,
      sales7Qty: 0.5,
      sales30Qty: 2.5,
      sales90Qty: 2.5,
      orderCount30: 2,
    });
    expect(result).toMatchObject({
      status: "insufficient_data",
      sales7Qty: 0.5,
      sales30Qty: 2.5,
      suggestedQty: null,
    });
  });

  it.each([
    [0, "out_of_stock"],
    [21, "reorder_now"],
    [22, "reorder_soon"],
    [28, "reorder_soon"],
    [29, "covered"],
  ] as const)("uses the warning boundary for %s available units", (sellableQty, status) => {
    expect(buildReplenishmentDecision({ ...input, sellableQty }).status).toBe(status);
  });

  it("keeps a sold-out SKU urgent even when another SKU has enough stock", () => {
    const soldOut = buildReplenishmentDecision({ ...input, sellableQty: 0 });
    const stocked = buildReplenishmentDecision({ ...input, sellableQty: 100 });
    expect(soldOut.status).toBe("out_of_stock");
    expect(stocked.status).toBe("covered");
    expect(soldOut.priority).toBeGreaterThan(stocked.priority);
  });

  it.each([
    { sales7Qty: 2, sales30Qty: 2, orderCount30: 2 },
    { sales7Qty: 7, sales30Qty: 30, orderCount30: 1 },
  ])("withholds dates and quantities for a weak demand sample: %j", (sales) => {
    expect(buildReplenishmentDecision({ ...input, ...sales })).toMatchObject({
      status: "insufficient_data",
      confidence: "low",
      coverageDays: null,
      projectedStockoutDate: null,
      reorderByDate: null,
      suggestedQty: null,
    });
  });

  it("retains sold-out products with sales in the last 90 days without inventing a forecast", () => {
    const result = buildReplenishmentDecision({
      ...input,
      sellableQty: 0,
      sales7Qty: 0,
      sales30Qty: 0,
      sales90Qty: 2,
      orderCount30: 0,
    });
    expect(result).toMatchObject({ status: "out_of_stock", confidence: "low", suggestedQty: null });
    expect(result.reason).toContain("样本不足");
  });

  it.each([0, 10])("does not treat %s units with no sales as a demand warning", (sellableQty) => {
    const result = buildReplenishmentDecision({
      ...input,
      sellableQty,
      sales7Qty: 0,
      sales30Qty: 0,
      sales90Qty: 0,
      orderCount30: 0,
    });
    expect(result).toMatchObject({
      status: "insufficient_data",
      coverageDays: null,
      suggestedQty: null,
    });
  });

  it("does not let incoming quantities without a confirmed ETA hide an urgent shortage", () => {
    const result = buildReplenishmentDecision({ ...input, inTransitQty: 100, onOrderQty: 50 });
    expect(result).toMatchObject({
      status: "reorder_now",
      coverageDays: 10,
      suggestedQty: 41,
      inTransitQty: 100,
      onOrderQty: 50,
    });
    expect(result.reason).toContain("核对到货安排");
  });

  it("subtracts confirmed replenishment-window receipts, retaining the current stock coverage warning", () => {
    const result = buildReplenishmentDecision({
      ...input,
      inTransitQty: 100,
      timelyIncomingQty: 15,
    });
    expect(result).toMatchObject({ status: "reorder_now", coverageDays: 10, suggestedQty: 26 });
  });

  it("does not ask for duplicate purchases when replenishment-window receipts cover the target", () => {
    const result = buildReplenishmentDecision({
      ...input,
      inTransitQty: 100,
      timelyIncomingQty: 100,
    });
    expect(result).toMatchObject({ status: "reorder_now", suggestedQty: 0 });
    expect(result.action).toContain("催促到货");
    expect(result.action).toContain("现货缺口仍需处理");
  });

  it("retains a stockout but avoids another order when existing purchases arrive within the lead time", () => {
    // The data layer confirmed these 100 units arrive tomorrow, within the 14-day
    // procurement lead time. They do not erase today's stockout.
    const result = buildReplenishmentDecision({
      ...input,
      sellableQty: 0,
      onOrderQty: 100,
      timelyIncomingQty: 100,
    });
    expect(result).toMatchObject({
      status: "out_of_stock",
      coverageDays: 0,
      suggestedQty: 0,
      onOrderQty: 100,
      projectedStockoutDate: "2026-09-20",
    });
    expect(result.reason).toContain("补货窗口内预计到货");
    expect(result.action).toContain("催促到货");
    expect(result.action).toContain("现货缺口仍需处理");
  });

  it.each([
    { catalogStatus: "disabled" as const, status: "paused" },
    { productKind: "USED" as const, status: "non_replenishable" },
  ])("does not recommend automated purchasing for %j", ({ status, ...settings }) => {
    expect(buildReplenishmentDecision({ ...input, ...settings, sellableQty: 0 })).toMatchObject({
      status,
      suggestedQty: null,
      reorderByDate: null,
      priority: 0,
    });
  });

  it("changes lead-time forecasts using the selected policy", () => {
    const result = buildReplenishmentDecision({
      ...input,
      policy: { leadTimeDays: 2, safetyDays: 1, targetCoverDays: 20 },
    });
    expect(result).toMatchObject({
      status: "reorder_soon",
      daysUntilReorder: 7,
      suggestedQty: 13,
      reorderByDate: "2026-09-27",
    });
  });

  it("rounds estimated calendar dates in UTC and orders whole units", () => {
    const result = buildReplenishmentDecision({
      ...input,
      sales7Qty: 0,
      sales30Qty: 9,
      sellableQty: 1,
      now: new Date("2026-09-21T08:30:00+09:00"),
    });
    expect(result).toMatchObject({
      projectedStockoutDate: "2026-09-24",
      reorderByDate: "2026-09-02",
      suggestedQty: 15,
    });
  });

  it("normalizes invalid quantities and invalid policy values without NaN forecasts", () => {
    const result = buildReplenishmentDecision({
      ...input,
      sellableQty: -3,
      inTransitQty: Number.POSITIVE_INFINITY,
      onOrderQty: Number.NaN,
      policy: { leadTimeDays: Number.NaN, safetyDays: -1, targetCoverDays: 999 },
    });
    expect(result).toMatchObject({
      status: "out_of_stock",
      coverageDays: 0,
      inTransitQty: 0,
      onOrderQty: 0,
      suggestedQty: 51,
    });
  });

  it("avoids meaningless calendar dates for extremely long inventory coverage", () => {
    const result = buildReplenishmentDecision({ ...input, sellableQty: Number.MAX_VALUE });
    expect(result).toMatchObject({
      status: "covered",
      projectedStockoutDate: null,
      reorderByDate: null,
    });
    expect(Number.isFinite(result.coverageDays)).toBe(true);
    expect(Number.isFinite(result.daysUntilReorder)).toBe(true);
    expect(Number.isFinite(result.suggestedQty)).toBe(true);
  });

  it("exposes only actionable shortages as inventory alerts", () => {
    expect(isReplenishmentAlert()).toBe(false);
    expect(isReplenishmentAlert(buildReplenishmentDecision(input))).toBe(true);
    expect(isReplenishmentAlert(buildReplenishmentDecision({ ...input, sellableQty: 0 }))).toBe(
      true
    );
    expect(isReplenishmentAlert(buildReplenishmentDecision({ ...input, sellableQty: 28 }))).toBe(
      true
    );
    expect(isReplenishmentAlert(buildReplenishmentDecision({ ...input, sellableQty: 29 }))).toBe(
      false
    );
  });
});
