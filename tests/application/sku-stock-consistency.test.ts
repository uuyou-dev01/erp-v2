import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getListingCoverageProducts } from "@/lib/application/listing-coverage";
import {
  getSkuCatalogDetail,
  getSkuCatalogList,
} from "@/lib/application/sku-catalog";

const runId = `sku_stock_${Date.now()}`;
const organizationCode = `org_${runId}`;
const storeId = `store_${runId}`;

let sellableLocationId = "";
let transitLocationId = "";

describe("SKU stock consistency", () => {
  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: {
        code: organizationCode,
        name: "SKU Stock Consistency Organization",
      },
    });

    const store = await prisma.store.create({
      data: {
        id: storeId,
        organizationId: organization.id,
        code: `STORE_${runId}`,
        name: "SKU Stock Consistency Store",
        currency: "CNY",
      },
    });

    const [sellableLocation, transitLocation] = await Promise.all([
      prisma.location.create({
        data: {
          storeId: store.id,
          code: `SELL_${runId}`,
          name: "Sellable Warehouse",
          type: "WAREHOUSE",
          region: "JP_TOKYO",
          isSellableDefault: true,
        },
      }),
      prisma.location.create({
        data: {
          storeId: store.id,
          code: `TRANSIT_${runId}`,
          name: "Transit Warehouse",
          type: "TRANSIT",
          region: "CN_SHANGHAI",
          isSellableDefault: false,
        },
      }),
    ]);

    sellableLocationId = sellableLocation.id;
    transitLocationId = transitLocation.id;
  });

  afterAll(async () => {
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.organization.deleteMany({ where: { code: organizationCode } });
  });

  it("does not double count sellable item units on the sellable inventory board", async () => {
    const sku = await createSku("ITEM_UNIT_ONLY");

    await prisma.itemUnit.create({
      data: {
        storeId,
        skuId: sku.id,
        locationId: sellableLocationId,
        unitCost: "100",
        costCurrency: "CNY",
        sourceType: "TEST",
        sourceId: `${runId}_item_unit`,
        status: "AVAILABLE",
      },
    });

    const products = await getListingCoverageProducts(storeId);
    const product = products.find((item) => item.skuId === sku.id);

    expect(product?.sellableItemUnitCount).toBe(1);
    expect(product?.sellableLotQty).toBe(0);
    expect(product?.sellableQty).toBe(1);
  });

  it("separates new stock and item-unit sellable listing summaries", async () => {
    const sku = await createSku("LISTING_SUMMARIES");
    const [skuPlatform, itemPlatform] = await Promise.all([
      prisma.platform.create({
        data: {
          storeId,
          code: `MERCARI`,
          name: "Mercari",
          country: "JP",
          defaultCurrency: "CNY",
        },
      }),
      prisma.platform.create({
        data: {
          storeId,
          code: `YAHOO_AUCTION`,
          name: "Yahoo Auction",
          country: "JP",
          defaultCurrency: "CNY",
        },
      }),
    ]);
    const lot = await prisma.inventoryLot.create({
      data: {
        storeId,
        skuId: sku.id,
        locationId: sellableLocationId,
        unitCost: "100",
        costCurrency: "CNY",
        sourceType: "TEST",
        sourceId: `${runId}_summary_lot`,
        receivedAt: new Date("2026-06-23T00:00:00.000Z"),
        status: "ACTIVE",
      },
    });
    await prisma.stockLedger.create({
      data: {
        storeId,
        entityType: "LOT",
        entityId: lot.id,
        locationId: sellableLocationId,
        deltaQty: "5",
        reason: "INBOUND_PURCHASE",
        refType: "TEST",
        refId: `${runId}_summary_lot`,
      },
    });
    const [pendingUnit, attachedUnit] = await Promise.all([
      prisma.itemUnit.create({
        data: {
          storeId,
          skuId: sku.id,
          locationId: sellableLocationId,
          unitCost: "80",
          costCurrency: "CNY",
          sourceType: "TEST",
          sourceId: `${runId}_summary_item_pending`,
          status: "AVAILABLE",
          photos: [],
          labelStatus: "PENDING",
        },
      }),
      prisma.itemUnit.create({
        data: {
          storeId,
          skuId: sku.id,
          locationId: sellableLocationId,
          unitCost: "90",
          costCurrency: "CNY",
          sourceType: "TEST",
          sourceId: `${runId}_summary_item_attached`,
          status: "AVAILABLE",
          photos: ["https://example.com/item-attached.jpg"],
          labelStatus: "ATTACHED",
        },
      }),
    ]);
    await prisma.listing.createMany({
      data: [
        {
          storeId,
          platformId: skuPlatform.id,
          listingType: "SKU",
          skuId: sku.id,
          listedPrice: "150",
          currency: "CNY",
          status: "ACTIVE",
          listedAt: new Date("2026-06-23T01:00:00.000Z"),
        },
        {
          storeId,
          platformId: itemPlatform.id,
          listingType: "ITEM_UNIT",
          itemUnitId: attachedUnit.id,
          listedPrice: "170",
          currency: "CNY",
          status: "ACTIVE",
          listedAt: new Date("2026-06-23T02:00:00.000Z"),
        },
      ],
    });

    const products = await getListingCoverageProducts(storeId);
    const product = products.find((item) => item.skuId === sku.id);

    expect(pendingUnit.status).toBe("AVAILABLE");
    expect(product?.newStockSummary).toMatchObject({
      sellableQty: 5,
      activeListingCount: 1,
    });
    expect(product?.itemUnitSummary).toMatchObject({
      sellableCount: 2,
      activeListingCount: 1,
      pendingListingCount: 1,
      pendingPhotoCount: 1,
      pendingLabelCount: 1,
    });
  });

  it("rolls child SKU stock, item units, and listings into the parent listing coverage product", async () => {
    const parent = await createSku("LISTING_PARENT_ROLLUP");
    const childWithLot = await createSku("LISTING_PARENT_ROLLUP_CHILD_LOT", parent.id);
    const childWithUnit = await createSku("LISTING_PARENT_ROLLUP_CHILD_UNIT", parent.id);
    const [skuPlatform, itemPlatform] = await Promise.all([
      ensureCorePlatform("SNKRDUNK", "Snkrdunk"),
      ensureCorePlatform("XIAN_YU", "Xian Yu"),
    ]);
    const lot = await prisma.inventoryLot.create({
      data: {
        storeId,
        skuId: childWithLot.id,
        locationId: sellableLocationId,
        unitCost: "100",
        costCurrency: "CNY",
        sourceType: "TEST",
        sourceId: `${runId}_rollup_lot`,
        receivedAt: new Date("2026-06-23T00:00:00.000Z"),
        status: "ACTIVE",
      },
    });
    await prisma.stockLedger.create({
      data: {
        storeId,
        entityType: "LOT",
        entityId: lot.id,
        locationId: sellableLocationId,
        deltaQty: "4",
        reason: "INBOUND_PURCHASE",
        refType: "TEST",
        refId: `${runId}_rollup_lot`,
      },
    });
    const itemUnit = await prisma.itemUnit.create({
      data: {
        storeId,
        skuId: childWithUnit.id,
        locationId: sellableLocationId,
        unitCost: "80",
        costCurrency: "CNY",
        sourceType: "TEST",
        sourceId: `${runId}_rollup_item_unit`,
        status: "AVAILABLE",
        photos: ["https://example.com/rollup-item.jpg"],
        labelStatus: "ATTACHED",
      },
    });
    await prisma.listing.createMany({
      data: [
        {
          storeId,
          platformId: skuPlatform.id,
          listingType: "SKU",
          skuId: childWithLot.id,
          listedPrice: "160",
          currency: "CNY",
          status: "ACTIVE",
          listedAt: new Date("2026-06-23T01:00:00.000Z"),
        },
        {
          storeId,
          platformId: itemPlatform.id,
          listingType: "ITEM_UNIT",
          itemUnitId: itemUnit.id,
          listedPrice: "180",
          currency: "CNY",
          status: "ACTIVE",
          listedAt: new Date("2026-06-23T02:00:00.000Z"),
        },
      ],
    });

    const products = await getListingCoverageProducts(storeId);
    const parentProduct = products.find((item) => item.skuId === parent.id);

    expect(parentProduct?.skuCode).toBe(parent.code);
    expect(parentProduct?.newStockSummary).toMatchObject({
      sellableQty: 4,
      activeListingCount: 1,
    });
    expect(parentProduct?.itemUnitSummary).toMatchObject({
      sellableCount: 1,
      activeListingCount: 1,
      pendingListingCount: 0,
      pendingPhotoCount: 0,
      pendingLabelCount: 0,
    });
    expect(parentProduct?.sellableQty).toBe(5);
    expect(parentProduct?.itemUnits.map((item) => item.id)).toContain(itemUnit.id);
    expect(products.some((item) => item.skuId === childWithLot.id)).toBe(false);
    expect(products.some((item) => item.skuId === childWithUnit.id)).toBe(false);
  });

  it("counts duplicate active SKU listings on one core platform once for new-stock coverage", async () => {
    const sku = await createSku("DUPLICATE_PLATFORM_LISTINGS");
    const platform = await ensureCorePlatform("MERCARI", "Mercari");
    const lot = await prisma.inventoryLot.create({
      data: {
        storeId,
        skuId: sku.id,
        locationId: sellableLocationId,
        unitCost: "100",
        costCurrency: "CNY",
        sourceType: "TEST",
        sourceId: `${runId}_duplicate_platform_lot`,
        receivedAt: new Date("2026-06-23T00:00:00.000Z"),
        status: "ACTIVE",
      },
    });
    await prisma.stockLedger.create({
      data: {
        storeId,
        entityType: "LOT",
        entityId: lot.id,
        locationId: sellableLocationId,
        deltaQty: "2",
        reason: "INBOUND_PURCHASE",
        refType: "TEST",
        refId: `${runId}_duplicate_platform_lot`,
      },
    });
    await prisma.listing.createMany({
      data: [
        {
          storeId,
          platformId: platform.id,
          listingType: "SKU",
          skuId: sku.id,
          listedPrice: "150",
          currency: "CNY",
          status: "ACTIVE",
          listedAt: new Date("2026-06-23T01:00:00.000Z"),
        },
        {
          storeId,
          platformId: platform.id,
          listingType: "SKU",
          skuId: sku.id,
          listedPrice: "155",
          currency: "CNY",
          status: "ACTIVE",
          listedAt: new Date("2026-06-23T02:00:00.000Z"),
        },
      ],
    });

    const products = await getListingCoverageProducts(storeId);
    const product = products.find((item) => item.skuId === sku.id);

    expect(product?.newStockSummary.activeListingCount).toBe(1);
    expect(product?.newStockSummary.pendingListingCount).toBe((product?.platforms.length ?? 0) - 1);
  });

  it("does not create new-stock pending listings for item-unit-only stock", async () => {
    const sku = await createSku("ITEM_UNIT_ONLY_NEW_STOCK_PENDING");
    await ensureCorePlatform("YAHOO_AUCTION", "Yahoo Auction");
    await prisma.itemUnit.create({
      data: {
        storeId,
        skuId: sku.id,
        locationId: sellableLocationId,
        unitCost: "100",
        costCurrency: "CNY",
        sourceType: "TEST",
        sourceId: `${runId}_item_only_pending_unit`,
        status: "AVAILABLE",
      },
    });

    const products = await getListingCoverageProducts(storeId);
    const product = products.find((item) => item.skuId === sku.id);

    expect(product?.newStockSummary.sellableQty).toBe(0);
    expect(product?.newStockSummary.pendingListingCount).toBe(0);
    expect(product?.itemUnitSummary.sellableCount).toBe(1);
    expect(product?.itemUnitSummary.pendingListingCount).toBe(1);
  });

  it("keeps in-transit stock out of SKU detail sellable quantity", async () => {
    const sku = await createSku("TRANSIT_ONLY");
    const lot = await prisma.inventoryLot.create({
      data: {
        storeId,
        skuId: sku.id,
        locationId: transitLocationId,
        unitCost: "100",
        costCurrency: "CNY",
        sourceType: "TEST",
        sourceId: `${runId}_transit_lot`,
        receivedAt: new Date("2026-06-23T00:00:00.000Z"),
        status: "ACTIVE",
      },
    });

    await prisma.stockLedger.create({
      data: {
        storeId,
        entityType: "LOT",
        entityId: lot.id,
        locationId: transitLocationId,
        deltaQty: "2",
        reason: "INBOUND_PURCHASE",
        refType: "TEST",
        refId: `${runId}_transit_lot`,
      },
    });

    const detail = await getSkuCatalogDetail(sku.id);

    expect(detail?.reference.sellableLotQty).toBe("0");
    expect(detail?.reference.availableItemUnits).toBe(0);
    expect(detail?.reference.inTransitQty).toBe("2");
  });

  it("shows SKU catalog business metrics for stock, listings, sales, and top platform", async () => {
    const sku = await createSku("CATALOG_METRICS");
    const platform = await prisma.platform.create({
      data: {
        storeId,
        code: `METRIC_${runId}`,
        name: "Metric Platform",
        country: "CN",
        defaultCurrency: "CNY",
      },
    });
    const lot = await prisma.inventoryLot.create({
      data: {
        storeId,
        skuId: sku.id,
        locationId: sellableLocationId,
        unitCost: "90",
        costCurrency: "CNY",
        sourceType: "TEST",
        sourceId: `${runId}_metrics_lot`,
        receivedAt: new Date("2026-06-23T00:00:00.000Z"),
        status: "ACTIVE",
      },
    });
    await prisma.stockLedger.create({
      data: {
        storeId,
        entityType: "LOT",
        entityId: lot.id,
        locationId: sellableLocationId,
        deltaQty: "2",
        reason: "INBOUND_PURCHASE",
        refType: "TEST",
        refId: `${runId}_metrics_lot`,
      },
    });
    await prisma.listing.create({
      data: {
        storeId,
        platformId: platform.id,
        listingType: "SKU",
        skuId: sku.id,
        listedPrice: "180",
        currency: "CNY",
        status: "ACTIVE",
        listedAt: new Date("2026-06-23T02:00:00.000Z"),
      },
    });
    await createOrderWithLine(sku.id, platform.id, "CONFIRMED", "180", "2026-06-23T03:00:00.000Z");
    await createOrderWithLine(sku.id, platform.id, "SHIPPED", "220", "2026-06-24T03:00:00.000Z");
    await createOrderWithLine(sku.id, platform.id, "CANCELLED", "999", "2026-06-25T03:00:00.000Z");

    const list = await getSkuCatalogList(storeId);
    const row = list.find((item) => item.id === sku.id);

    expect(row?.business.sellableQty).toBe("2");
    expect(row?.business.inTransitQty).toBe("0");
    expect(row?.business.activeListingCount).toBe(1);
    expect(row?.business.salesCount).toBe(2);
    expect(row?.business.latestSalePrice).toBe("220.00");
    expect(row?.business.averageSalePrice).toBe("200.00");
    expect(row?.business.primaryPlatformName).toBe("Metric Platform");
  });

  it("aggregates child SKU stock, item units, listings, and sales onto the parent SKU", async () => {
    const parent = await createSku("PARENT_GROUP");
    const childA = await createSku("PARENT_GROUP_CHILD_A", parent.id);
    const childB = await createSku("PARENT_GROUP_CHILD_B", parent.id);
    const platform = await prisma.platform.create({
      data: {
        storeId,
        code: `PARENT_METRIC_${runId}`,
        name: "Parent Metric Platform",
        country: "JP",
        defaultCurrency: "CNY",
      },
    });

    const lot = await prisma.inventoryLot.create({
      data: {
        storeId,
        skuId: childA.id,
        locationId: sellableLocationId,
        unitCost: "50",
        costCurrency: "CNY",
        sourceType: "TEST",
        sourceId: `${runId}_parent_child_lot`,
        receivedAt: new Date("2026-06-23T00:00:00.000Z"),
        status: "ACTIVE",
      },
    });
    await prisma.stockLedger.create({
      data: {
        storeId,
        entityType: "LOT",
        entityId: lot.id,
        locationId: sellableLocationId,
        deltaQty: "3",
        reason: "INBOUND_PURCHASE",
        refType: "TEST",
        refId: `${runId}_parent_child_lot`,
      },
    });
    const itemUnit = await prisma.itemUnit.create({
      data: {
        storeId,
        skuId: childB.id,
        locationId: sellableLocationId,
        unitCost: "80",
        costCurrency: "CNY",
        sourceType: "TEST",
        sourceId: `${runId}_parent_child_item`,
        status: "AVAILABLE",
      },
    });
    await prisma.listing.createMany({
      data: [
        {
          storeId,
          platformId: platform.id,
          listingType: "SKU",
          skuId: childA.id,
          listedPrice: "120",
          currency: "CNY",
          status: "ACTIVE",
          listedAt: new Date("2026-06-23T01:00:00.000Z"),
        },
        {
          storeId,
          platformId: platform.id,
          listingType: "ITEM_UNIT",
          itemUnitId: itemUnit.id,
          listedPrice: "180",
          currency: "CNY",
          status: "ACTIVE",
          listedAt: new Date("2026-06-23T02:00:00.000Z"),
        },
      ],
    });
    await createOrderWithLine(childA.id, platform.id, "CONFIRMED", "120", "2026-06-24T03:00:00.000Z");
    await createOrderWithLine(childB.id, platform.id, "SHIPPED", "180", "2026-06-25T03:00:00.000Z");

    const list = await getSkuCatalogList(storeId);
    const parentRow = list.find((item) => item.id === parent.id);

    expect(parentRow?.business.sellableQty).toBe("4");
    expect(parentRow?.business.activeListingCount).toBe(2);
    expect(parentRow?.business.salesCount).toBe(2);
    expect(parentRow?.business.latestSalePrice).toBe("180.00");
    expect(parentRow?.business.averageSalePrice).toBe("150.00");
    expect(parentRow?.business.primaryPlatformName).toBe("Parent Metric Platform");
  });
});

async function createSku(suffix: string, parentSkuId?: string) {
  return await prisma.sKU.create({
    data: {
      storeId,
      code: `SKU_${runId}_${suffix}`,
      name: `SKU Stock ${suffix}`,
      parentSkuId,
    },
  });
}

async function ensureCorePlatform(code: string, name: string) {
  return await prisma.platform.upsert({
    where: { storeId_code: { storeId, code } },
    update: {},
    create: {
      storeId,
      code,
      name,
      country: "JP",
      defaultCurrency: "CNY",
    },
  });
}

async function createOrderWithLine(
  skuId: string,
  platformId: string,
  status: string,
  amount: string,
  orderDate: string,
) {
  const order = await prisma.customerOrder.create({
    data: {
      storeId,
      platformId,
      orderNumber: `SKU_STOCK_${runId}_${status}_${amount}`,
      customerName: `${status} Buyer`,
      orderDate: new Date(orderDate),
      currency: "CNY",
      subtotal: amount,
      totalPaid: amount,
      orderStatus: status,
    },
  });

  await prisma.orderLine.create({
    data: {
      orderId: order.id,
      skuId,
      quantity: "1",
      unitPrice: amount,
      lineAmount: amount,
    },
  });
}
