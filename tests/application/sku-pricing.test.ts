import { describe, expect, it } from "vitest";
import {
  buildSkuPricingBasis,
  calculateMaxAcquisitionPrice,
  calculateSuggestedPrice,
} from "@/lib/application/sku-pricing";
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
    expect(calculateSuggestedPrice(input)).toMatchObject({
      price: "527.15",
      profit: "158.15",
      actualMarginPercent: "30.00",
    });
    expect(calculateSuggestedPrice({ ...input, feePercent: "10", shipping: "20" })).toMatchObject({
      price: "648.34",
      profit: "194.51",
      actualMarginPercent: "30.00",
    });
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
    expect(calculateSuggestedPrice({ ...input, reference })).toMatchObject({
      price: "600.00",
      profit: "231.00",
      actualMarginPercent: "38.50",
    });
    expect(
      calculateSuggestedPrice({ ...input, reference: { ...reference, amount: "400" } }).price
    ).toBe("527.15");
    expect(
      calculateSuggestedPrice({ ...input, reference: { ...reference, currency: "JPY" } }).price
    ).toBe("527.15");
  });
  it("reverses a known yen selling price into the maximum acquisition price", () => {
    expect(
      calculateMaxAcquisitionPrice({
        salePrice: "2400",
        costCurrency: "CNY",
        currency: "JPY",
        exchangeRate: "23",
        marginPercent: "30",
        feePercent: "0",
        shipping: "520",
      })
    ).toMatchObject({ maxCost: "50.43", profit: "720", actualMarginPercent: "30.00" });
    expect(
      calculateMaxAcquisitionPrice({
        salePrice: "2400",
        costCurrency: "CNY",
        currency: "JPY",
        exchangeRate: "23",
        marginPercent: "30",
        feePercent: "10",
        shipping: "520",
      })
    ).toMatchObject({ maxCost: "40.00", profit: "720", actualMarginPercent: "30.00" });
  });
  it("validates reverse pricing inputs and supports same-currency estimates", () => {
    const reverse = {
      salePrice: "100",
      costCurrency: "CNY",
      currency: "CNY",
      exchangeRate: "",
      marginPercent: "30",
      feePercent: "10",
      shipping: "5",
    };
    expect(calculateMaxAcquisitionPrice(reverse)).toMatchObject({
      maxCost: "55.00",
      profit: "30.00",
      actualMarginPercent: "30.00",
    });
    expect(calculateMaxAcquisitionPrice({ ...reverse, currency: "JPY" }).error).toContain("汇率");
    expect(
      calculateMaxAcquisitionPrice({ ...reverse, salePrice: "10", shipping: "7" }).error
    ).toContain("不足");
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
