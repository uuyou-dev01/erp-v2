import { describe, expect, it } from "vitest";
import { buildAgreementRule, calculateAgreement } from "@/lib/application/trading-agreement";

describe("agreement-driven resale calculations", () => {
  it("treats a positive supply-to-sale spread as the reseller margin", async () => {
    const result = await calculateAgreement({
      rule: buildAgreementRule({ kind: "MARGIN" }),
      quantity: 1,
      saleUnitPrice: 180,
      saleCurrency: "CNY",
      supplyUnitPrice: 120,
      supplyCurrency: "CNY",
    });

    expect(result.resellerCommission?.toFixed(2)).toBe("60.00");
  });

  it("clamps a negative supply-to-sale spread to zero", async () => {
    const result = await calculateAgreement({
      rule: buildAgreementRule({ kind: "MARGIN" }),
      quantity: 1,
      saleUnitPrice: 90,
      saleCurrency: "CNY",
      supplyUnitPrice: 120,
      supplyCurrency: "CNY",
    });

    expect(result.resellerCommission?.toFixed(2)).toBe("0.00");
  });

  it("treats profit percentage as one optional template instead of a global rule", async () => {
    const result = await calculateAgreement({
      rule: buildAgreementRule({ kind: "PROFIT_PERCENT", rate: "0.20" }),
      quantity: 1,
      saleUnitPrice: 300,
      saleCurrency: "CNY",
      supplyUnitPrice: 180,
      supplyCurrency: "CNY",
      platformFeeRate: "0.05",
      fulfillmentFeePerUnit: 10,
      fulfillmentFeeCurrency: "CNY",
    });

    expect(result.distributableProfit?.toFixed(2)).toBe("95.00");
    expect(result.resellerCommission?.toFixed(2)).toBe("19.00");
  });

  it("supports a fixed amount agreement without changing the data model", async () => {
    const result = await calculateAgreement({
      rule: buildAgreementRule({
        kind: "FIXED_PER_UNIT",
        fixedAmount: "20",
        fixedCurrency: "CNY",
      }),
      quantity: 3,
      saleUnitPrice: 300,
      saleCurrency: "CNY",
    });

    expect(result.resellerCommission?.toFixed(2)).toBe("60.00");
  });

  it("uses only the expense lines the parties agreed to include in the profit basis", async () => {
    const result = await calculateAgreement({
      rule: buildAgreementRule({
        kind: "PROFIT_PERCENT",
        rate: "0.50",
        profitDeductions: ["SUPPLY_COST", "PLATFORM_FEE"],
      }),
      quantity: 1,
      saleUnitPrice: 5000,
      saleCurrency: "JPY",
      supplyUnitPrice: 2000,
      supplyCurrency: "JPY",
      platformFeeRate: "0.10",
      fulfillmentFeePerUnit: 240,
      fulfillmentFeeCurrency: "JPY",
      shippingFee: 200,
      shippingCurrency: "JPY",
    });

    expect(result.distributableProfit?.toFixed(2)).toBe("2500.00");
    expect(result.resellerCommission?.toFixed(2)).toBe("1250.00");
  });

  it("uses the actual shipping fee in the full-deduction golden example", async () => {
    const result = await calculateAgreement({
      rule: buildAgreementRule({ kind: "PROFIT_PERCENT", rate: "0.40" }),
      quantity: 1,
      saleUnitPrice: 800,
      saleCurrency: "CNY",
      supplyUnitPrice: 500,
      supplyCurrency: "CNY",
      platformFeeRate: "0.05",
      fulfillmentFeePerUnit: 20,
      fulfillmentFeeCurrency: "CNY",
      shippingFee: 30,
      shippingCurrency: "CNY",
    });

    expect(result.distributableProfit?.toFixed(2)).toBe("210.00");
    expect(result.resellerCommission?.toFixed(2)).toBe("84.00");
  });

  it("allows the agreement to use gross sales as the percentage basis", async () => {
    const result = await calculateAgreement({
      rule: buildAgreementRule({
        kind: "PROFIT_PERCENT",
        rate: "0.20",
        profitDeductions: [],
      }),
      quantity: 1,
      saleUnitPrice: 300,
      saleCurrency: "CNY",
      supplyUnitPrice: 180,
      supplyCurrency: "CNY",
      platformFeeRate: "0.05",
    });

    expect(result.distributableProfit?.toFixed(2)).toBe("300.00");
    expect(result.resellerCommission?.toFixed(2)).toBe("60.00");
  });

  it("does not invent a settlement when the parties chose manual confirmation", async () => {
    const result = await calculateAgreement({
      rule: buildAgreementRule({ kind: "MANUAL" }),
      quantity: 1,
      saleUnitPrice: 300,
      saleCurrency: "CNY",
    });

    expect(result.automatic).toBe(false);
    expect(result.resellerCommission).toBeNull();
    expect(result.distributableProfit).toBeNull();
  });
});
