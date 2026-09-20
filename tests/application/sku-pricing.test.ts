import { describe, expect, it } from "vitest";
import { buildSkuPricingBasis, calculateSuggestedPrice } from "@/lib/application/sku-pricing";
import type { SkuCatalogDetail } from "@/lib/application/sku-catalog";

const input = {
  cost: "369",
  costCurrency: "CNY",
  currency: "CNY",
  exchangeRate: "",
  marginPercent: "30",
  feePercent: "",
  shipping: "",
  reference: null,
};
const sku = (overrides = {}) =>
  ({
    childSkus: [],
    productKind: "NEW",
    referencePrice: null,
    currency: null,
    meta: {},
    reference: { recentPurchaseLines: [], recentSalesLines: [] },
    ...overrides,
  }) as unknown as SkuCatalogDetail;

describe("suggested selling price", () => {
  it("uses margin on selling price, rounds up, and includes fees and shipping", () => {
    expect(calculateSuggestedPrice(input).price).toBe("527.15");
    expect(calculateSuggestedPrice({ ...input, feePercent: "10", shipping: "20" }).price).toBe(
      "648.34"
    );
  });
  it("requires explicit foreign exchange and rounds yen up to whole units", () => {
    expect(calculateSuggestedPrice({ ...input, currency: "JPY" }).price).toBeNull();
    expect(
      calculateSuggestedPrice({
        ...input,
        currency: "JPY",
        exchangeRate: "20",
        feePercent: "10",
        shipping: "520",
      }).price
    ).toBe("13167");
  });
  it("uses a higher same-currency reference, without treating another currency as comparable", () => {
    const reference = { amount: "600", currency: "CNY", source: "最近成交" };
    expect(calculateSuggestedPrice({ ...input, reference }).price).toBe("600.00");
    expect(
      calculateSuggestedPrice({ ...input, reference: { ...reference, amount: "400" } }).price
    ).toBe("527.15");
    expect(
      calculateSuggestedPrice({ ...input, reference: { ...reference, currency: "JPY" } }).price
    ).toBe("527.15");
  });
  it("can show a reference without claiming a margin when no cost is available", () => {
    const result = calculateSuggestedPrice({
      ...input,
      cost: "",
      reference: { amount: "600", currency: "CNY", source: "档案价" },
    });
    expect(result).toMatchObject({ price: "600.00", floor: null });
    expect(result.source).toContain("待补进价");
    expect(calculateSuggestedPrice({ ...input, cost: "" }).price).toBeNull();
  });
  it.each([
    { marginPercent: "100" },
    { marginPercent: "80", feePercent: "20" },
    { shipping: "-1" },
    { feePercent: "NaN" },
    { cost: "abc" },
    { marginPercent: "" },
  ])("rejects invalid or impossible pricing inputs %j", (override) => {
    expect(calculateSuggestedPrice({ ...input, ...override }).error).toBeTruthy();
  });
  it("does not merge currencies when deriving weighted purchase cost", () => {
    const purchase = (
      currency: string,
      quantity: string,
      lineAmount: string,
      orderedAt: string,
      status = "RECEIVED"
    ) => ({ currency, quantity, lineAmount, orderedAt, status });
    const basis = buildSkuPricingBasis(
      sku({
        reference: {
          recentSalesLines: [],
          recentPurchaseLines: [
            purchase("CNY", "2", "600", "2026-09-10"),
            purchase("CNY", "1", "450", "2026-09-12"),
            purchase("JPY", "1", "10000", "2026-09-11"),
            purchase("JPY", "1", "15000", "2026-09-13", "CANCELLED"),
            purchase("JPY", "1", "20000", "2027-01-01"),
          ],
        },
      }),
      new Date("2026-09-20")
    );
    expect(basis.cost).toMatchObject({ amount: "350.0000", currency: "CNY" });
  });
  it("uses dated transaction line amounts instead of list prices, ignoring future and zero sales", () => {
    const sale = (lineAmount: string, currency: string, orderDate: string) => ({
      quantity: "2",
      lineAmount,
      unitPrice: "9999",
      currency,
      orderDate,
    });
    const basis = buildSkuPricingBasis(
      sku({
        reference: {
          recentPurchaseLines: [],
          recentSalesLines: [
            sale("400", "CNY", "2026-08-01"),
            sale("6000", "JPY", "2026-09-01"),
            sale("0", "JPY", "2026-09-02"),
            sale("9000", "JPY", "2027-01-01"),
          ],
        },
      }),
      new Date("2026-09-20")
    );
    expect(basis.reference).toMatchObject({ amount: "3000.0000", currency: "JPY" });
  });
  it("uses explicit catalog currencies as a fallback and avoids group or used-item estimates", () => {
    expect(
      buildSkuPricingBasis(
        sku({
          referencePrice: "50",
          meta: {
            referencePriceCurrency: "USD",
            referenceCost: "20",
            referenceCostCurrency: "CNY",
          },
        })
      )
    ).toMatchObject({
      reference: { amount: "50", currency: "USD" },
      cost: { amount: "20", currency: "CNY" },
    });
    expect(buildSkuPricingBasis(sku({ childSkus: [{ id: "child" }] })).unavailable).toBeTruthy();
    expect(buildSkuPricingBasis(sku({ productKind: "USED" })).unavailable).toBeTruthy();
  });
});
