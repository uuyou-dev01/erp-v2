import { beforeEach, describe, it, expect, vi } from "vitest";
import Decimal from "decimal.js";
const db = vi.hoisted(() => ({
  skus: vi.fn(),
  listings: vi.fn(),
  sales: vi.fn(),
  purchases: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    sKU: { findMany: db.skus },
    listing: { findMany: db.listings },
    orderLine: { findMany: db.sales },
    purchaseLine: { findMany: db.purchases },
  },
}));
vi.mock("@/lib/application/inventory", () => ({
  getStoreStockBreakdown: async () =>
    new Map([
      ["child1", { sellableQty: 4, inTransitQty: 1 }],
      ["child2", { sellableQty: 2, inTransitQty: 0 }],
    ]),
}));
vi.mock("@/lib/fx", () => ({
  FxRateUnavailableError: class extends Error {},
  createStoreMoneyConverter: async () => ({
    baseCurrency: "CNY",
    convertToBase: async (amount: string, currency: string) =>
      new Decimal(amount).mul(currency === "JPY" ? ".05" : 1),
  }),
}));
import { getSkuCatalogList } from "@/lib/application/sku-catalog";
const day = new Date("2026-09-19T12:00:00+08:00");
const sku = (id: string, parentSkuId: string | null, catalogRole: string) => ({
  id,
  parentSkuId,
  catalogRole,
  name: id,
  code: id,
  brand: null,
  category: null,
  attributes: {},
  _count: { childSkus: parentSkuId ? 0 : 2 },
  variantAxes: [],
  variantValues: {},
});
beforeEach(() => {
  vi.clearAllMocks();
  db.skus.mockResolvedValue([
    sku("parent", null, "GROUP"),
    sku("child1", "parent", "VARIANT"),
    sku("child2", "parent", "VARIANT"),
  ]);
  db.listings.mockResolvedValue([
    { skuId: "child1", itemUnit: null, platform: { name: "煤炉" } },
    { skuId: null, itemUnit: { skuId: "child2" }, platform: { name: "雅虎" } },
  ]);
  db.sales.mockResolvedValue(
    ["child1", "child2"].map((skuId) => ({
      skuId,
      orderId: "same-order",
      quantity: "2",
      lineAmount: "4000",
      order: { orderDate: day, currency: "JPY", platform: { name: "煤炉", code: "MERCARI" } },
      allocations: [
        {
          quantity: "2",
          costAmount: "60",
          costCurrency: "CNY",
          status: "SHIPPED",
          inventoryLot: null,
          itemUnit: null,
        },
      ],
    }))
  );
  db.purchases.mockResolvedValue([
    {
      skuId: "child1",
      quantity: "2",
      lineAmount: "60",
      purchaseOrder: { currency: "CNY", status: "RECEIVED", createdAt: day },
    },
    {
      skuId: "child1",
      quantity: "1",
      lineAmount: "9999",
      purchaseOrder: { currency: "CNY", status: "DRAFT", createdAt: day },
    },
  ]);
});
describe("catalog list server metrics", () => {
  it("scopes sales to store and selected dates while keeping current stock and actual platform coverage", async () => {
    const period = { dateFrom: new Date("2026-09-01"), dateTo: new Date("2026-09-30") };
    const rows = await getSkuCatalogList("store", period);
    expect(db.sales.mock.calls[0][0].where).toEqual({
      sku: { storeId: "store" },
      order: {
        orderStatus: { in: ["CONFIRMED", "SHIPPED", "DELIVERED"] },
        orderDate: { gte: period.dateFrom, lte: period.dateTo },
      },
    });
    const parent = rows.find((row) => row.id === "parent")!;
    expect(parent.business.sellableQty).toBe("6");
    expect(parent.operations).toMatchObject({
      orderIds: ["same-order"],
      soldQty: "4",
      matchedRevenue: "400",
      matchedCost: "120",
      pendingLines: 0,
    });
    expect(parent.operations?.platforms).toHaveLength(2);
    expect(rows.find((row) => row.id === "child1")?.operations?.purchasePrices).toEqual([
      { currency: "CNY", amount: "60", quantity: "2" },
    ]);
  });
});
