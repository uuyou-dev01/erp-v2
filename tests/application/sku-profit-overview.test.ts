import { describe, it, expect, vi } from "vitest";
import Decimal from "decimal.js";
vi.mock("@/lib/fx", () => {
  class FxRateUnavailableError extends Error {}
  return {
    FxRateUnavailableError,
    createStoreMoneyConverter: async () => ({
      baseCurrency: "CNY",
      convertToBase: async (amount: string, currency: string) => {
        if (currency === "USD") throw new FxRateUnavailableError("missing");
        return new Decimal(amount).mul(currency === "JPY" ? "0.05" : 1);
      },
    }),
  };
});
import { buildSkuProfitOverview } from "@/lib/application/sku-profit-overview";
const date = new Date("2026-09-19");
const line = () => ({
  quantity: "1",
  lineAmount: "2880",
  order: { currency: "JPY", orderDate: date },
  allocations: [
    {
      quantity: "1",
      costAmount: "33",
      costCurrency: null as string | null,
      status: "SHIPPED",
      inventoryLot: { costCurrency: "CNY", costStatus: "CONFIRMED", receivedAt: date },
      itemUnit: null,
    },
  ],
});
describe("SKU profit currency and completeness", () => {
  it("converts revenue and source costs before subtracting", async () => {
    expect(await buildSkuProfitOverview("store", [line()])).toMatchObject({
      currency: "CNY",
      costMatchedSalesAmount: "144.00",
      allocatedInventoryCost: "33.00",
      grossProfit: "111.00",
      profitRate: "77.1",
      fulfilledLineCount: 1,
    });
  });
  it("excludes partial allocations and unknown costs", async () => {
    const partial = line();
    partial.quantity = "2";
    const pending = line();
    pending.allocations[0].inventoryLot.costStatus = "PENDING";
    expect(await buildSkuProfitOverview("store", [partial, pending])).toMatchObject({
      pendingCostLineCount: 2,
      costMatchedSalesAmount: "0.00",
      allocatedInventoryCost: "0.00",
    });
  });
  it("accepts a confirmed zero cost", async () => {
    const free = line();
    free.allocations[0].costAmount = "0";
    expect(await buildSkuProfitOverview("store", [free])).toMatchObject({
      fulfilledLineCount: 1,
      grossProfit: "144.00",
    });
  });
  it("does not turn missing FX into a false profit", async () => {
    const missing = line();
    missing.allocations[0].costCurrency = "USD";
    expect(await buildSkuProfitOverview("store", [missing])).toMatchObject({
      pendingCostLineCount: 1,
      grossProfit: "0.00",
      costMatchedSalesAmount: "0.00",
    });
  });
});
