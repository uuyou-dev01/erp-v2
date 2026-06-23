import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  allocateAmountByLineAmount,
  computeAllocatedOrderProfitSummary,
  computeOrderFees,
  computeOrderProfitSummary,
  parseFeeText,
} from "@/lib/application/order-fees";

describe("order fee and profit calculations", () => {
  it("parses percentage and amount fee text", () => {
    expect(parseFeeText("10%", new Decimal(200)).toFixed(4)).toBe("20.0000");
    expect(parseFeeText("300", new Decimal(200)).toFixed(4)).toBe("300.0000");
    expect(parseFeeText("", new Decimal(200)).toFixed(4)).toBe("0.0000");
  });

  it("keeps net revenue separate from inventory-cost profit", () => {
    const fees = computeOrderFees({
      subtotal: new Decimal("180"),
      platformFeeRate: new Decimal("0.1"),
      shippingFee: new Decimal("12"),
      inventoryCost: new Decimal("100"),
    });

    expect(fees.platformFee.toFixed(4)).toBe("18.0000");
    expect(fees.netRevenue.toFixed(4)).toBe("150.0000");
  });

  it("allocates order-level amounts by line amount and assigns rounding remainder to the largest line", () => {
    const result = allocateAmountByLineAmount({
      amount: new Decimal("10.00"),
      lines: [
        { id: "small", lineAmount: new Decimal("33.33") },
        { id: "large", lineAmount: new Decimal("66.67") },
      ],
      scale: 2,
    });

    expect(result.map((line) => [line.id, line.amount.toFixed(2)])).toEqual([
      ["small", "3.33"],
      ["large", "6.67"],
    ]);
    expect(result.reduce((sum, line) => sum.plus(line.amount), new Decimal(0)).toFixed(2)).toBe("10.00");
  });

  it("calculates order profit summary from revenue, allocated fees, shipping, and inventory cost", () => {
    const summary = computeOrderProfitSummary({
      lines: [
        { id: "a", lineAmount: new Decimal("100"), inventoryCost: new Decimal("60") },
        { id: "b", lineAmount: new Decimal("50"), inventoryCost: new Decimal("20") },
      ],
      discountTotal: new Decimal("15"),
      platformFee: new Decimal("12"),
      shippingFee: new Decimal("8"),
      miscFee: new Decimal("5"),
      scale: 4,
    });

    expect(summary.grossRevenue.toFixed(4)).toBe("150.0000");
    expect(summary.netRevenue.toFixed(4)).toBe("110.0000");
    expect(summary.inventoryCost.toFixed(4)).toBe("80.0000");
    expect(summary.grossProfit.toFixed(4)).toBe("30.0000");
    expect(summary.lines.map((line) => line.grossProfit.toFixed(4))).toEqual([
      "13.3334",
      "16.6666",
    ]);
  });

  it("calculates fulfilled order profit from allocated inventory costs", () => {
    const summary = computeAllocatedOrderProfitSummary({
      revenueAmount: new Decimal("200"),
      platformFee: new Decimal("20"),
      shippingFee: new Decimal("10"),
      lines: [
        {
          id: "line-a",
          lineAmount: new Decimal("120"),
          allocations: [
            { costAmount: new Decimal("40") },
            { costAmount: new Decimal("15") },
          ],
        },
        {
          id: "line-b",
          lineAmount: new Decimal("80"),
          allocations: [{ costAmount: new Decimal("30") }],
        },
      ],
    });

    expect(summary.inventoryCost.toFixed(4)).toBe("85.0000");
    expect(summary.netRevenue.toFixed(4)).toBe("170.0000");
    expect(summary.grossProfit.toFixed(4)).toBe("85.0000");
    expect(summary.lines.map((line) => line.grossProfit.toFixed(4))).toEqual([
      "47.0000",
      "38.0000",
    ]);
  });
});
