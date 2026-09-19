import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  platform: { findMany: vi.fn() },
  sKU: { findMany: vi.fn() },
  itemUnit: { findMany: vi.fn() },
  orderLine: { findMany: vi.fn() },
  listing: { findMany: vi.fn() },
}));
const stock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/application/inventory", () => ({ getStoreStockBreakdown: stock }));
import { getListingPendingItems } from "@/lib/application/listing-pending";
const custom = { id: "custom", code: "NEW_JAPAN_CHANNEL", name: "新平台", country: "JP" };
const mercari = { id: "mercari", code: "MERCARI", name: "煤炉", country: "JP" };
beforeEach(() => {
  vi.clearAllMocks();
  for (const model of Object.values(db)) model.findMany.mockResolvedValue([]);
  db.platform.findMany.mockResolvedValue([custom, mercari]);
  stock.mockResolvedValue(
    new Map([
      [
        "sku",
        {
          sellableLotQty: 2,
          inTransitLotQty: 0,
          sellableLotLocations: [{ name: "日本仓", region: "JP", isSellableDefault: true }],
          inTransitLotLocations: [],
        },
      ],
    ])
  );
});
it("offers a newly configured platform and recognizes its existing active listing", async () => {
  const sku = {
    id: "sku",
    code: "SKU",
    name: "商品",
    imageUrl: null,
    updatedAt: new Date(),
    listings: [],
  };
  db.sKU.findMany.mockResolvedValue([sku]);
  const before = await getListingPendingItems("store-a");
  expect(db.platform.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { storeId: "store-a" } })
  );
  expect(before[0].availablePlatforms.map((p) => p.code)).toEqual(["MERCARI", "NEW_JAPAN_CHANNEL"]);
  db.sKU.findMany.mockResolvedValue([
    { ...sku, listings: [{ platformId: custom.id, platform: custom }] },
  ]);
  const after = await getListingPendingItems("store-a");
  expect(after[0].activePlatforms).toEqual([custom]);
  expect(after[0].availablePlatforms.map((p) => p.code)).toEqual(["MERCARI"]);
});
