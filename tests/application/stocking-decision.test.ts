import { describe, expect, it } from "vitest";
import {
  buildStockingDecision,
  summarizeStockingPools,
} from "@/lib/application/stocking-decision";

describe("stocking decision labels", () => {
  it("does not place reference-only products into the good selling pool", () => {
    const decision = buildStockingDecision({
      sellableQty: 6,
      inTransitQty: 0,
      sales30Qty: 0,
      sales90Qty: 0,
      oldestStockAgeDays: 12,
      hasReferenceSignal: true,
    });

    expect(decision.pool).toBe("testing");
    expect(decision.labels).toContain("数据不足");
    expect(decision.labels).toContain("参考热度");
    expect(decision.reason).toContain("缺少真实销售");
  });

  it("places products with real fast sales into the good selling pool", () => {
    const decision = buildStockingDecision({
      sellableQty: 4,
      inTransitQty: 2,
      sales30Qty: 8,
      sales90Qty: 18,
      oldestStockAgeDays: 18,
      grossMarginRate: 24,
      hasReferenceSignal: false,
    });

    expect(decision.pool).toBe("good");
    expect(decision.labels).toContain("实销好卖");
    expect(decision.labels).toContain("可小批补");
    expect(decision.score).toBeGreaterThanOrEqual(80);
  });

  it("separates profitable but slow moving products from the good selling pool", () => {
    const decision = buildStockingDecision({
      sellableQty: 8,
      inTransitQty: 0,
      sales30Qty: 1,
      sales90Qty: 3,
      oldestStockAgeDays: 42,
      grossMarginRate: 38,
      hasReferenceSignal: false,
    });

    expect(decision.pool).toBe("slowProfit");
    expect(decision.labels).toContain("利润好但慢");
    expect(decision.labels).not.toContain("实销好卖");
  });

  it("marks old stock without real sales for clearance", () => {
    const decision = buildStockingDecision({
      sellableQty: 5,
      inTransitQty: 0,
      sales30Qty: 0,
      sales90Qty: 0,
      oldestStockAgeDays: 96,
      hasReferenceSignal: false,
    });

    expect(decision.pool).toBe("clearance");
    expect(decision.labels).toContain("建议清仓");
    expect(decision.reason).toContain("90 天");
  });

  it("summarizes pool counts for the inventory dashboard tab", () => {
    const summary = summarizeStockingPools([
      buildStockingDecision({ sellableQty: 4, sales30Qty: 6, sales90Qty: 10, oldestStockAgeDays: 10 }),
      buildStockingDecision({ sellableQty: 3, sales30Qty: 0, sales90Qty: 0, oldestStockAgeDays: 8, hasReferenceSignal: true }),
      buildStockingDecision({ sellableQty: 2, sales30Qty: 0, sales90Qty: 0, oldestStockAgeDays: 100 }),
    ]);

    expect(summary.good).toBe(1);
    expect(summary.testing).toBe(1);
    expect(summary.clearance).toBe(1);
  });
});
