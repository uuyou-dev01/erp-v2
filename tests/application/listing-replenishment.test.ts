import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  consolidationBatch: { findMany: vi.fn() },
  platform: { findMany: vi.fn() },
  listing: { findMany: vi.fn() },
  sKU: { findMany: vi.fn() },
  itemUnit: { findMany: vi.fn() },
  orderLine: { findMany: vi.fn() },
  inventoryLot: { findMany: vi.fn() },
  fulfillmentInventoryAllocation: { findMany: vi.fn() },
  orderAllocation: { findMany: vi.fn() },
  inboundShipmentInventoryLine: { findMany: vi.fn() },
  purchaseLine: { findMany: vi.fn() },
  stockLedger: { groupBy: vi.fn(), findMany: vi.fn() },
}));
const stock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/application/inventory", () => ({ getStoreStockBreakdown: stock }));

import {
  buildScopedListingCoverageProduct,
  buildVariantView,
  getListingCoverageProducts,
} from "@/lib/application/listing-coverage";
import type { SkuStockBreakdown, StockLocationBreakdown } from "@/lib/application/inventory";

const now = new Date("2026-09-20T12:00:00.000Z");
const jp = {
  id: "jp",
  code: "JP",
  name: "日本仓",
  region: "JP",
  type: "WAREHOUSE",
  isSellableDefault: true,
};
const cn = {
  id: "cn",
  code: "CN",
  name: "中国仓",
  region: "CN",
  type: "WAREHOUSE",
  isSellableDefault: true,
};
function sku(id = "sku", parentSkuId: string | null = null) {
  return {
    id,
    parentSkuId,
    catalogRole: parentSkuId ? "VARIANT" : "SIMPLE",
    code: id,
    name: id,
    imageUrl: null,
    brand: null,
    categoryId: null,
    category: null,
    attributes: {},
  };
}
function locationStock(location: typeof jp, qty: number): StockLocationBreakdown {
  return {
    locationId: location.id,
    code: location.code,
    name: location.name,
    region: location.region,
    type: location.type,
    fulfillableMarkets: [location.region === "JP" ? "JP" : "CN"],
    qty,
  };
}
function breakdown(skuId: string, locations: StockLocationBreakdown[] = []): SkuStockBreakdown {
  const qty = locations.reduce((sum, location) => sum + location.qty, 0);
  return {
    skuId,
    sellableQty: qty,
    sellableLotQty: qty,
    sellableItemUnitCount: 0,
    inTransitQty: 0,
    inTransitLotQty: 0,
    inTransitItemUnitCount: 0,
    heldQty: 0,
    heldLotQty: 0,
    heldItemUnitCount: 0,
    sellableLocations: locations,
    sellableLotLocations: locations,
    sellableItemUnitLocations: [],
    inTransitLocations: [],
    inTransitLotLocations: [],
    inTransitItemUnitLocations: [],
    heldLocations: [],
    heldLotLocations: [],
    heldItemUnitLocations: [],
  };
}
function sale(orderId: string, quantity: number, source: typeof jp | null = jp, skuId = "sku") {
  return {
    id: `${orderId}:${skuId}:${quantity}`,
    skuId,
    orderId,
    quantity,
    afterSalesLines: [],
    order: {
      orderDate: new Date("2026-09-18T12:00:00.000Z"),
      platform: { country: "CN", code: "TAOBAO" },
    },
    allocations: source
      ? [
          {
            id: "allocation",
            status: "DELIVERED",
            quantity,
            lotId: "source-lot",
            itemUnitId: null,
            inventoryLot: { locationId: source.id, location: source },
            itemUnit: null,
          },
        ]
      : [],
  };
}
function purchases(
  id: string,
  quantity: number,
  destination: typeof jp | null,
  etaDate: string | null
) {
  return {
    id,
    skuId: "sku",
    quantity,
    purchaseOrder: {
      inboundShipments: [],
      destinationLocation: destination,
      etaDate: etaDate ? new Date(etaDate) : null,
    },
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.clearAllMocks();
  Object.values(db).forEach((model) => {
    if ("findMany" in model) model.findMany.mockResolvedValue([]);
  });
  db.stockLedger.groupBy.mockResolvedValue([]);
  db.sKU.findMany.mockResolvedValue([sku()]);
  stock.mockResolvedValue(new Map());
});
afterEach(() => vi.useRealTimers());

describe("SKU replenishment data and scoping", () => {
  it("keeps sold-out demand without stock or listings, with order deduplication and a bounded valid-sales query", async () => {
    db.orderLine.findMany.mockResolvedValue([sale("one", 2), sale("one", 1), sale("two", 1)]);
    const [product] = await getListingCoverageProducts("store");
    expect(product.variantRows[0].replenishment).toMatchObject({
      sales7Qty: 4,
      sales30Qty: 4,
      sales90Qty: 4,
      orderCount30: 2,
      status: "out_of_stock",
    });
    expect(buildScopedListingCoverageProduct(product, { market: "JP" })).toBeNull();
    const scoped = buildScopedListingCoverageProduct(product, {
      market: "JP",
      includeDemandOnly: true,
    });
    expect(scoped?.variantRows).toHaveLength(1);
    expect(scoped?.sellableQty).toBe(0);
    expect(
      buildScopedListingCoverageProduct(product, { market: "CN", includeDemandOnly: true })
    ).toBeNull();
    expect(db.orderLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sku: { storeId: "store" },
          order: {
            storeId: "store",
            OR: [{ orderStatus: { in: ["CONFIRMED", "SHIPPED", "DELIVERED"] } }, { isPresale: true, orderStatus: "DRAFT" }],
            orderDate: { gte: new Date("2026-06-22T12:00:00.000Z"), lte: now },
          },
        }),
      })
    );
  });

  it("keeps replenishment source queries store-scoped and excludes purchases reserved for specific orders", async () => {
    await getListingCoverageProducts("store");
    expect(db.purchaseLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          purchaseOrder: { storeId: "store", status: { in: ["ORDERED", "SHIPPED"] } },
        },
      })
    );
    expect(db.inventoryLot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          storeId: "store",
          status: { in: ["ACTIVE", "CONSOLIDATING"] },
        },
      })
    );
    expect(db.inboundShipmentInventoryLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "IN_TRANSIT", shipment: { storeId: "store", receivedAt: null, status: { in: ["IN_TRANSIT", "EXCEPTION"] } } },
      })
    );
    expect(db.fulfillmentInventoryAllocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "ALLOCATED", fulfillmentRequest: { storeId: "store" } },
      })
    );
    expect(db.stockLedger.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["refId"],
        where: {
          storeId: "store",
          reason: "INBOUND_PURCHASE",
          refType: "PURCHASE_LINE",
          deltaQty: { gt: 0 },
        },
      })
    );
    expect(db.orderAllocation.findMany).toHaveBeenCalledTimes(1);
    expect(db.purchaseLine.findMany).toHaveBeenCalledTimes(1);
  });

  it("uses allocated source market for cross-border sales and never spreads unallocated demand across warehouses", async () => {
    db.orderLine.findMany.mockResolvedValue([
      sale("one", 6),
      sale("two", 1),
      sale("three", 2, null),
    ]);
    stock.mockResolvedValue(
      new Map([["sku", breakdown("sku", [locationStock(jp, 1), locationStock(cn, 20)])]])
    );
    const [product] = await getListingCoverageProducts("store");
    const japan = buildScopedListingCoverageProduct(product, {
      market: "JP",
      includeDemandOnly: true,
    })!;
    const china = buildScopedListingCoverageProduct(product, {
      market: "CN",
      includeDemandOnly: true,
    })!;
    const chinaWarehouse = buildScopedListingCoverageProduct(product, {
      market: "CN",
      locationId: "cn",
      includeDemandOnly: true,
    })!;
    expect(japan.variantRows[0]).toMatchObject({
      sellableQty: 1,
      replenishment: { sales30Qty: 7, orderCount30: 2, status: "reorder_now" },
    });
    expect(china.variantRows[0]).toMatchObject({
      sellableQty: 20,
      replenishment: { sales30Qty: 2, orderCount30: 1, status: "insufficient_data" },
    });
    expect(chinaWarehouse.variantRows[0].replenishment?.sales30Qty).toBe(0);
    expect(japan.stockingDecision?.sales30Qty).toBe(7);
    expect(china.stockingDecision?.sales30Qty).toBe(2);
  });

  it("uses the historical outbound warehouse if a sold batch has moved since the sale", async () => {
    db.orderLine.findMany.mockResolvedValue([sale("one", 7, cn)]);
    db.stockLedger.findMany.mockResolvedValue([
      {
        refId: "one:sku:7",
        entityType: "LOT",
        entityId: "source-lot",
        deltaQty: -7,
        locationId: "jp",
        location: jp,
      },
    ]);
    const [product] = await getListingCoverageProducts("store");
    expect(
      buildScopedListingCoverageProduct(product, { market: "CN", includeDemandOnly: true })
    ).toBeNull();
    expect(
      buildScopedListingCoverageProduct(product, { market: "JP", includeDemandOnly: true })
        ?.variantRows[0].replenishment?.sales30Qty
    ).toBe(7);
    expect(db.stockLedger.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store",
          refType: "ORDER_LINE",
          reason: "OUTBOUND_SALE",
        }),
      })
    );
  });

  it("nets actual partial and full returns while preserving the original outbound market", async () => {
    const partial = sale("partial", 7, jp);
    partial.allocations[0].status = "PARTIALLY_RETURNED";
    const full = sale("full", 3, jp);
    full.allocations[0].status = "RETURNED";
    db.orderLine.findMany.mockResolvedValue([
      {
        ...partial,
        afterSalesLines: [{ receipts: [{ orderAllocationId: "allocation", quantity: 2 }] }],
      },
      full,
    ]);
    db.stockLedger.findMany.mockResolvedValue([
      {
        refId: "partial:sku:7",
        entityType: "LOT",
        entityId: "source-lot",
        deltaQty: -7,
        locationId: "jp",
        location: jp,
      },
    ]);
    const [product] = await getListingCoverageProducts("store");
    expect(product.variantRows[0].replenishment).toMatchObject({ sales30Qty: 5, orderCount30: 1 });
    expect(
      buildScopedListingCoverageProduct(product, { market: "CN", includeDemandOnly: true })
    ).toBeNull();
  });

  it("retains an exhausted variant alongside stock in another variant, and keeps policy on repeated views", async () => {
    db.sKU.findMany.mockResolvedValue([
      sku("parent"),
      sku("fast", "parent"),
      sku("slow", "parent"),
    ]);
    db.orderLine.findMany.mockResolvedValue([
      sale("one", 6, jp, "fast"),
      sale("two", 1, jp, "fast"),
    ]);
    stock.mockResolvedValue(new Map([["slow", breakdown("slow", [locationStock(jp, 5)])]]));
    const policy = { leadTimeDays: 4, safetyDays: 1, targetCoverDays: 7 };
    const [product] = await getListingCoverageProducts("store", policy);
    const scoped = buildScopedListingCoverageProduct(product, {
      market: "JP",
      includeDemandOnly: true,
    })!;
    expect(scoped.variantRows).toHaveLength(2);
    const fast = scoped.variantRows.find((variant) => variant.skuId === "fast")!;
    const view = buildVariantView({
      variant: fast,
      records: [],
      itemUnits: [],
      platforms: [],
      market: "JP",
    });
    expect(view.replenishment).toMatchObject({ status: "out_of_stock", suggestedQty: 12 });
    expect(view.replenishmentPolicy).toEqual(policy);
    expect(scoped.sellableQty).toBe(5);
  });

  it("calculates age from remaining lots, excludes emptied or fully reserved old lots, and scopes age by warehouse", async () => {
    stock.mockResolvedValue(
      new Map([["sku", breakdown("sku", [locationStock(jp, 4), locationStock(cn, 2)])]])
    );
    db.inventoryLot.findMany.mockResolvedValue([
      {
        id: "empty",
        skuId: "sku",
        receivedAt: new Date("2025-01-01"),
        locationId: "jp",
        location: jp,
      },
      {
        id: "reserved",
        skuId: "sku",
        receivedAt: new Date("2025-02-01"),
        locationId: "jp",
        location: jp,
      },
      {
        id: "fresh",
        skuId: "sku",
        receivedAt: new Date("2026-09-10T12:00:00Z"),
        locationId: "jp",
        location: jp,
      },
      {
        id: "old-cn",
        skuId: "sku",
        receivedAt: new Date("2026-06-01T12:00:00Z"),
        locationId: "cn",
        location: cn,
      },
    ]);
    db.stockLedger.groupBy.mockImplementation(({ by }) =>
      Promise.resolve(
        by[0] === "entityId"
          ? [
              { entityId: "empty", _sum: { deltaQty: 0 } },
              { entityId: "reserved", _sum: { deltaQty: 2 } },
              { entityId: "fresh", _sum: { deltaQty: 4 } },
              { entityId: "old-cn", _sum: { deltaQty: 2 } },
            ]
          : []
      )
    );
    db.orderAllocation.findMany.mockResolvedValue([{ lotId: "reserved", quantity: 2 }]);
    const [product] = await getListingCoverageProducts("store");
    const japan = buildScopedListingCoverageProduct(product, { market: "JP" })!;
    const china = buildScopedListingCoverageProduct(product, { market: "CN" })!;
    expect(japan.variantRows[0].stockingDecision?.oldestStockAgeDays).toBe(10);
    expect(china.variantRows[0].stockingDecision?.oldestStockAgeDays).toBe(111);
  });

  it("deducts purchase receipts once and only credits known sellable destinations with timely ETAs", async () => {
    stock.mockResolvedValue(new Map([["sku", breakdown("sku", [locationStock(jp, 7)])]]));
    db.orderLine.findMany.mockResolvedValue([sale("one", 6), sale("two", 1)]);
    db.purchaseLine.findMany.mockResolvedValue([
      purchases("timely", 8, jp, "2026-09-24T23:59:59Z"),
      purchases("late", 3, jp, "2026-10-15"),
      purchases("unknown-eta", 4, jp, null),
      purchases("unknown-location", 5, null, "2026-09-24"),
      purchases(
        "held-destination",
        6,
        { ...jp, id: "hold", isSellableDefault: false },
        "2026-09-24"
      ),
    ]);
    db.stockLedger.groupBy.mockImplementation(({ by }) =>
      Promise.resolve(by[0] === "refId" ? [{ refId: "timely", _sum: { deltaQty: 2 } }] : [])
    );
    const [product] = await getListingCoverageProducts("store");
    expect(product.variantRows[0].replenishment).toMatchObject({
      onOrderQty: 24,
      timelyIncomingQty: 6,
    });
    const japan = buildScopedListingCoverageProduct(product, { market: "JP" })!;
    expect(japan.variantRows[0].replenishment).toMatchObject({
      onOrderQty: 19,
      timelyIncomingQty: 6,
    });
    const warehouse = buildScopedListingCoverageProduct(product, { locationId: "jp" })!;
    expect(warehouse.variantRows[0].replenishment?.onOrderQty).toBe(13);
  });

  it("summarizes next arrival, unknown and overdue quantities within the selected market and warehouse", async () => {
    stock.mockResolvedValue(
      new Map([["sku", breakdown("sku", [locationStock(jp, 7), locationStock(cn, 1)])]])
    );
    db.orderLine.findMany.mockResolvedValue([sale("one", 6), sale("two", 1)]);
    const [product] = await getListingCoverageProducts("store");
    const variant = product.variantRows[0];
    variant.incomingSignals = [
      {
        kind: "purchase",
        market: "JP",
        locationId: "hold",
        qty: 1,
        etaDate: "2026-09-20T00:01:00Z",
        sellableDestination: false,
      },
      {
        kind: "purchase",
        market: "JP",
        locationId: "jp",
        qty: 2,
        etaDate: "2026-09-25",
        sellableDestination: true,
      },
      {
        kind: "transit",
        market: "JP",
        locationId: "jp",
        qty: 4,
        etaDate: "2026-09-19T23:59:59Z",
        sellableDestination: true,
      },
      {
        kind: "purchase",
        market: "JP",
        locationId: "jp",
        qty: 2,
        etaDate: null,
        sellableDestination: true,
      },
      {
        kind: "transit",
        market: "JP",
        locationId: "jp",
        qty: 3,
        etaDate: "invalid-date",
        sellableDestination: true,
      },
      {
        kind: "purchase",
        market: "CN",
        locationId: "cn",
        qty: 6,
        etaDate: "2026-09-21",
        sellableDestination: true,
      },
    ];
    const japan = buildScopedListingCoverageProduct(product, { market: "JP" })!;
    expect(japan.variantRows[0].incomingSummary).toEqual({
      nextArrivalDate: "2026-09-20",
      unknownEtaQty: 5,
      overdueQty: 4,
    });
    // The holding destination's arrival is displayed, but cannot cover sellable demand.
    expect(japan.variantRows[0].replenishment?.timelyIncomingQty).toBe(2);
    const warehouse = buildScopedListingCoverageProduct(japan, { market: "JP", locationId: "jp" })!;
    expect(warehouse.variantRows[0].incomingSummary).toEqual({
      nextArrivalDate: "2026-09-25",
      unknownEtaQty: 5,
      overdueQty: 4,
    });
    const china = buildScopedListingCoverageProduct(product, { market: "CN" })!;
    expect(china.variantRows[0].incomingSummary).toEqual({
      nextArrivalDate: "2026-09-21",
      unknownEtaQty: 0,
      overdueQty: 0,
    });
    const empty = buildVariantView({
      variant: { ...variant, incomingSignals: [] },
      records: [],
      itemUnits: [],
      platforms: [],
    });
    expect(empty.incomingSummary).toEqual({
      nextArrivalDate: null,
      unknownEtaQty: 0,
      overdueQty: 0,
    });
  });

  it("keeps a sold-out alert but avoids buying again when an existing order arrives before a new order could", async () => {
    db.orderLine.findMany.mockResolvedValue([sale("one", 6), sale("two", 1)]);
    db.purchaseLine.findMany.mockResolvedValue([purchases("existing", 100, jp, "2026-09-21")]);
    const [product] = await getListingCoverageProducts("store");
    const japan = buildScopedListingCoverageProduct(product, {
      market: "JP",
      includeDemandOnly: true,
    })!;
    expect(japan.variantRows[0].replenishment).toMatchObject({
      status: "out_of_stock",
      onOrderQty: 100,
      timelyIncomingQty: 100,
      suggestedQty: 0,
    });
  });

  it("does not call held item-unit inventory in transit", async () => {
    db.orderLine.findMany.mockResolvedValue([sale("one", 1)]);
    db.itemUnit.findMany.mockResolvedValue([
      {
        id: "held",
        skuId: "sku",
        locationId: "hold",
        status: "AVAILABLE",
        sku: sku(),
        location: { ...jp, id: "hold", isSellableDefault: false },
        allocations: [],
        createdAt: now,
      },
    ]);
    const held = breakdown("sku");
    held.heldQty = held.heldItemUnitCount = 1;
    held.heldLocations = held.heldItemUnitLocations = [locationStock({ ...jp, id: "hold" }, 1)];
    stock.mockResolvedValue(new Map([["sku", held]]));
    const [product] = await getListingCoverageProducts("store");
    expect(product.inTransitQty).toBe(0);
    expect(product.itemUnits).toEqual([]);
    expect(product.variantRows[0].replenishment?.inTransitQty).toBe(0);
  });

  it("scopes true transfer stock to its destination warehouse, and does not double count received purchases", async () => {
    const transit = breakdown("sku", [locationStock(jp, 7)]);
    const moving = { ...locationStock(jp, 3), locationId: "shipment:transfer", type: "TRANSIT" };
    transit.inTransitQty = transit.inTransitLotQty = 3;
    transit.inTransitLocations = transit.inTransitLotLocations = [moving];
    stock.mockResolvedValue(new Map([["sku", transit]]));
    db.orderLine.findMany.mockResolvedValue([sale("one", 6), sale("two", 1)]);
    db.inventoryLot.findMany.mockResolvedValue([
      {
        id: "lot",
        skuId: "sku",
        receivedAt: new Date("2026-01-01"),
        locationId: "cn",
        location: cn,
      },
    ]);
    db.stockLedger.groupBy.mockImplementation(({ by }) =>
      Promise.resolve(
        by[0] === "entityId"
          ? [{ entityId: "lot", _sum: { deltaQty: 3 } }]
          : [{ refId: "received", _sum: { deltaQty: 3 } }]
      )
    );
    db.inboundShipmentInventoryLine.findMany.mockResolvedValue([
      {
        entityType: "LOT",
        entityId: "lot",
        quantity: 3,
        shipmentId: "transfer",
        shipment: { toLocation: jp, etaDate: new Date("2026-09-24") },
      },
    ]);
    db.purchaseLine.findMany.mockResolvedValue([purchases("received", 3, jp, "2026-09-24")]);
    const [product] = await getListingCoverageProducts("store");
    const japan = buildScopedListingCoverageProduct(product, { market: "JP", locationId: "jp" })!;
    expect(japan.variantRows[0].replenishment).toMatchObject({
      inTransitQty: 3,
      onOrderQty: 0,
      timelyIncomingQty: 3,
    });
    expect(japan.stockingDecision?.oldestStockAgeDays).toBeNull();
  });
});

it("classifies dispatched purchases as transit once and excludes order-specific purchases from general supply", async () => {
  const dispatched = purchases("moving", 8, jp, "2026-09-24");
  db.purchaseLine.findMany.mockResolvedValue([
    { ...dispatched, purchaseOrder: { ...dispatched.purchaseOrder, inboundShipments: [{ id: "shipment", status: "IN_TRANSIT", receivedAt: null, toLocation: jp, etaDate: new Date("2026-09-24") }] } },
    { ...purchases("reserved", 20, jp, "2026-09-24"), forOrderLineId: "customer-line" },
  ]);
  const [product] = await getListingCoverageProducts("store");
  expect(product.variantRows[0].incomingSignals).toHaveLength(1);
  expect(product.variantRows[0].incomingSignals?.[0]).toMatchObject({ kind: "transit", qty: 8 });
  expect(product.variantRows[0].replenishment?.onOrderQty).toBe(0);
});

it("retains old outstanding presales in their market without inventing warehouse demand", async () => {
  db.orderLine.findMany.mockImplementation(({ where }) => Promise.resolve(where.order.isPresale ? [{
    skuId: "sku", quantity: 10, allocations: [{ quantity: 2 }],
    order: { isPresale: true, shippingCountry: "JP", platform: null },
  }] : []));
  const [product] = await getListingCoverageProducts("store");
  const scoped = buildScopedListingCoverageProduct(product, { market: "JP", includeDemandOnly: true });
  expect(scoped?.variantRows[0].replenishment).toMatchObject({ pendingPresaleQty: 8, suggestedQty: 8 });
  expect(buildScopedListingCoverageProduct(product, { market: "CN", includeDemandOnly: true })).toBeNull();
  expect(buildScopedListingCoverageProduct(product, { locationId: "jp", includeDemandOnly: true })).toBeNull();
});
