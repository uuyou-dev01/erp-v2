import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  sKU: { findFirst: vi.fn() },
  orderLine: { findMany: vi.fn() },
}));
const requireContext = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth/user-context", () => ({ requireUserContext: requireContext }));

import { getLatestNewSkuSale } from "@/lib/application/sku-latest-sale";
import { getSkuLatestSale } from "@/app/actions/sku-latest-sale";

const now = new Date("2026-09-20T12:00:00.000Z");

function allocation(id: string, quantity: string, allocationType = "LOT", status = "DELIVERED") {
  return { id, quantity, allocationType, status };
}

function sale(
  id: string,
  quantity = "2",
  lineAmount = "3000",
  allocations = [allocation(`${id}-lot`, quantity)]
) {
  return {
    id,
    quantity,
    lineAmount,
    allocations,
    afterSalesLines: [] as Array<{
      receipts: Array<{ orderAllocationId: string; quantity: string }>;
    }>,
    order: {
      orderDate: new Date("2026-09-18T12:00:00.000Z"),
      currency: "JPY",
      platform: { name: "煤炉" } as { name: string } | null,
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.resetAllMocks();
  db.sKU.findFirst.mockResolvedValue({ attributes: {} });
  db.orderLine.findMany.mockResolvedValue([]);
  requireContext.mockResolvedValue({ activeStoreId: "store" });
});

afterEach(() => vi.useRealTimers());

describe("latest new SKU sale", () => {
  it("returns the current SKU's original unit price with its currency, date, and platform", async () => {
    db.orderLine.findMany.mockResolvedValue([sale("latest")]);

    await expect(getLatestNewSkuSale("store", "sku")).resolves.toEqual({
      price: "1500.00",
      currency: "JPY",
      soldAt: "2026-09-18T12:00:00.000Z",
      platformName: "煤炉",
    });
  });

  it("queries only valid orders in the requested store and SKU, without a recent-sales cutoff", async () => {
    const old = sale("old");
    old.order.orderDate = new Date("2025-01-01T12:00:00.000Z");
    db.orderLine.findMany.mockResolvedValue([old]);

    expect((await getLatestNewSkuSale("store", "sku"))?.soldAt).toBe("2025-01-01T12:00:00.000Z");
    expect(db.sKU.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sku", storeId: "store" } })
    );
    const query = db.orderLine.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({
      skuId: "sku",
      sku: { storeId: "store" },
      order: {
        storeId: "store",
        orderStatus: { in: ["CONFIRMED", "SHIPPED", "DELIVERED"] },
        orderDate: { lte: now },
      },
      quantity: { gt: 0 },
      lineAmount: { gte: 0 },
    });
    expect(query.where.order.orderDate).not.toHaveProperty("gte");
    expect(query.orderBy).toEqual([
      { order: { orderDate: "desc" } },
      { createdAt: "desc" },
      { id: "desc" },
    ]);
    expect(query.take).toBe(50);
  });

  it("preserves zero-price transactions and missing platforms", async () => {
    const zero = sale("free", "1", "0");
    zero.order.platform = null;
    zero.order.currency = "CNY";
    db.orderLine.findMany.mockResolvedValue([zero]);

    await expect(getLatestNewSkuSale("store", "sku")).resolves.toMatchObject({
      price: "0.00",
      currency: "CNY",
      platformName: null,
    });
  });

  it("skips fully returned lines, including legacy returns with no receipts", async () => {
    const returned = sale("receipts");
    returned.allocations[0].status = "PARTIALLY_RETURNED";
    returned.afterSalesLines = [
      { receipts: [{ orderAllocationId: "receipts-lot", quantity: "1" }] },
      { receipts: [{ orderAllocationId: "receipts-lot", quantity: "1" }] },
    ];
    const legacy = sale("legacy", "1", "9000", [allocation("legacy-lot", "1", "LOT", "RETURNED")]);
    db.orderLine.findMany.mockResolvedValue([returned, legacy, sale("retained", "1", "1800")]);

    expect((await getLatestNewSkuSale("store", "sku"))?.price).toBe("1800.00");
  });

  it("keeps the original per-unit price when only part of the quantity was returned", async () => {
    const partial = sale("partial");
    partial.allocations[0].status = "PARTIALLY_RETURNED";
    partial.afterSalesLines = [{ receipts: [{ orderAllocationId: "partial-lot", quantity: "1" }] }];
    db.orderLine.findMany.mockResolvedValue([partial]);

    expect((await getLatestNewSkuSale("store", "sku"))?.price).toBe("1500.00");
  });

  it("does not use single-item sales or a mixed line whose new stock was all returned", async () => {
    const used = sale("used", "1", "800", [allocation("used-unit", "1", "ITEM_UNIT")]);
    const mixed = sale("mixed", "2", "2400", [
      allocation("mixed-lot", "1", "LOT", "RETURNED"),
      allocation("mixed-unit", "1", "ITEM_UNIT"),
    ]);
    db.orderLine.findMany.mockResolvedValue([used, mixed]);

    await expect(getLatestNewSkuSale("store", "sku")).resolves.toBeNull();
  });

  it("accepts a mixed line while an unreturned new-stock quantity remains", async () => {
    const mixed = sale("mixed", "3", "6000", [
      allocation("mixed-lot", "2", "LOT", "PARTIALLY_RETURNED"),
      allocation("mixed-unit", "1", "ITEM_UNIT"),
    ]);
    mixed.afterSalesLines = [{ receipts: [{ orderAllocationId: "mixed-lot", quantity: "1" }] }];
    db.orderLine.findMany.mockResolvedValue([mixed]);

    expect((await getLatestNewSkuSale("store", "sku"))?.price).toBe("2000.00");
  });

  it("includes confirmed new-stock orders that still have an unallocated quantity", async () => {
    const pending = sale("pending", "2", "3600", [allocation("used-unit", "1", "ITEM_UNIT")]);
    db.orderLine.findMany.mockResolvedValue([pending]);

    expect((await getLatestNewSkuSale("store", "sku"))?.price).toBe("1800.00");
  });

  it("continues past a full page of returned lines to find an older valid sale", async () => {
    const returnedPage = Array.from({ length: 50 }, (_, index) =>
      sale(`returned-${index}`, "1", "9999", [
        allocation(`allocation-${index}`, "1", "LOT", "RETURNED"),
      ])
    );
    db.orderLine.findMany
      .mockResolvedValueOnce(returnedPage)
      .mockResolvedValueOnce([sale("retained", "1", "2100")]);

    expect((await getLatestNewSkuSale("store", "sku"))?.price).toBe("2100.00");
    expect(db.orderLine.findMany).toHaveBeenCalledTimes(2);
    expect(db.orderLine.findMany.mock.calls[1][0]).toMatchObject({
      take: 50,
      cursor: { id: "returned-49" },
      skip: 1,
    });
  });

  it.each([null, { attributes: { productKind: "USED" } }])(
    "does not query new-stock sale prices for an unavailable or used SKU (%j)",
    async (sku) => {
      db.sKU.findFirst.mockResolvedValue(sku);

      await expect(getLatestNewSkuSale("store", "sku")).resolves.toBeNull();
      expect(db.orderLine.findMany).not.toHaveBeenCalled();
    }
  );

  it("returns no price when the SKU has no qualifying sale", async () => {
    await expect(getLatestNewSkuSale("store", "sku")).resolves.toBeNull();
  });
});

describe("latest sale action authorization", () => {
  it("does not query SKU or sale data when the requested store is unauthorized", async () => {
    requireContext.mockRejectedValue(new Error("无权访问该店铺"));

    await expect(getSkuLatestSale({ storeId: "other-store", skuId: "sku" })).resolves.toEqual({
      success: false,
    });
    expect(requireContext).toHaveBeenCalledWith({ storeId: "other-store" });
    expect(db.sKU.findFirst).not.toHaveBeenCalled();
    expect(db.orderLine.findMany).not.toHaveBeenCalled();
  });

  it("uses the authorized context store for both SKU and order queries", async () => {
    requireContext.mockResolvedValue({ activeStoreId: "authorized-store" });
    db.orderLine.findMany.mockResolvedValue([sale("latest")]);

    await expect(
      getSkuLatestSale({ storeId: "requested-store", skuId: "sku" })
    ).resolves.toMatchObject({
      success: true,
      sale: { price: "1500.00" },
    });
    expect(requireContext).toHaveBeenCalledWith({ storeId: "requested-store" });
    expect(db.sKU.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sku", storeId: "authorized-store" } })
    );
    expect(db.orderLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          skuId: "sku",
          sku: { storeId: "authorized-store" },
          order: expect.objectContaining({ storeId: "authorized-store" }),
        }),
      })
    );
  });
});
