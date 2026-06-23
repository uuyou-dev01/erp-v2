import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { computeDashboardProfitMetrics } from "@/lib/application/report-metrics";

describe("report metrics", () => {
  it("computes dashboard gross profit and profit rate from converted totals", () => {
    const result = computeDashboardProfitMetrics({
      salesAmount: new Decimal("200"),
      platformFee: new Decimal("20"),
      shippingFee: new Decimal("10"),
      inventoryCost: new Decimal("90"),
    });

    expect(result.grossProfit.toFixed(4)).toBe("80.0000");
    expect(result.profitRate.toFixed(1)).toBe("40.0");
  });

  it("keeps profit rate at zero when there is no sales amount", () => {
    const result = computeDashboardProfitMetrics({
      salesAmount: new Decimal("0"),
      platformFee: new Decimal("0"),
      shippingFee: new Decimal("0"),
      inventoryCost: new Decimal("30"),
    });

    expect(result.grossProfit.toFixed(4)).toBe("-30.0000");
    expect(result.profitRate.toFixed(1)).toBe("0.0");
  });
});
