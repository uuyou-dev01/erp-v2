import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getSkuCatalogDetail } from "@/lib/application/sku-catalog";

const runId = `sku_catalog_${Date.now()}`;
const organizationCode = `org_${runId}`;
const storeId = `store_${runId}`;
let sellableLocationId = "";

describe("sku catalog detail reference metrics", () => {
  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: {
        code: organizationCode,
        name: "SKU Catalog Detail Test Organization",
      },
    });

    const store = await prisma.store.create({
      data: {
        id: storeId,
        organizationId: organization.id,
        code: `STORE_${runId}`,
        name: "SKU Catalog Detail Test Store",
        currency: "CNY",
      },
    });

    const location = await prisma.location.create({
      data: {
        storeId: store.id,
        code: `SELL_${runId}`,
        name: "Detail Sellable Warehouse",
        type: "WAREHOUSE",
        region: "JP_TOKYO",
        isSellableDefault: true,
      },
    });
    sellableLocationId = location.id;
  });

  afterAll(async () => {
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.organization.deleteMany({ where: { code: organizationCode } });
  });

  it("counts only valid sales lines in SKU detail sales references", async () => {
    const sku = await prisma.sKU.create({
      data: {
        storeId,
        code: `SKU_${runId}_SALES_COUNT`,
        name: "SKU Catalog Sales Count Product",
      },
    });

    await createOrderWithLine(sku.id, "CONFIRMED", "100");
    await createOrderWithLine(sku.id, "CANCELLED", "200");
    await createOrderWithLine(sku.id, "RETURNED", "300");

    const detail = await getSkuCatalogDetail(sku.id);

    expect(detail?.reference.salesLineCount).toBe(1);
    expect(detail?.reference.recentSalesLines).toHaveLength(1);
    expect(detail?.reference.recentSalesLines[0].lineAmount).toBe("100");
  });

  it("builds SKU detail analysis from full sales history and active listings", async () => {
    const sku = await prisma.sKU.create({
      data: {
        storeId,
        code: `SKU_${runId}_ANALYSIS`,
        name: "SKU Catalog Analysis Product",
      },
    });
    const platform = await prisma.platform.create({
      data: {
        storeId,
        code: `ANALYSIS_${runId}`,
        name: "Analysis Platform",
        country: "JP",
        defaultCurrency: "CNY",
      },
    });

    await prisma.listing.create({
      data: {
        storeId,
        platformId: platform.id,
        listingType: "SKU",
        skuId: sku.id,
        listedPrice: "260",
        currency: "CNY",
        estimatedNet: "230",
        status: "ACTIVE",
        listedAt: new Date("2026-06-20T10:00:00.000Z"),
      },
    });
    await createOrderWithLine(sku.id, "CONFIRMED", "180", {
      platformId: platform.id,
      orderDate: "2026-06-21T12:00:00.000Z",
      allocationCost: "100",
    });
    await createOrderWithLine(sku.id, "SHIPPED", "220", {
      platformId: platform.id,
      orderDate: "2026-06-24T12:00:00.000Z",
      allocationCost: "120",
    });
    await createOrderWithLine(sku.id, "CANCELLED", "999", {
      platformId: platform.id,
      orderDate: "2026-06-25T12:00:00.000Z",
      allocationCost: "1",
    });

    const detail = await getSkuCatalogDetail(sku.id);

    expect(detail?.business.salesCount).toBe(2);
    expect(detail?.business.latestSalePrice).toBe("220.00");
    expect(detail?.business.averageSalePrice).toBe("200.00");
    expect(detail?.business.primaryPlatformName).toBe("Analysis Platform");
    expect(detail?.analysis.activeListings[0]).toMatchObject({
      platformName: "Analysis Platform",
      listedPrice: "260",
      estimatedNet: "230",
    });
    expect(detail?.analysis.platformPerformance[0]).toMatchObject({
      platformName: "Analysis Platform",
      salesCount: 2,
      averagePrice: "200.00",
      totalAmount: "400.00",
    });
    expect(detail?.analysis.profitOverview).toMatchObject({
      salesAmount: "400.00",
      allocatedInventoryCost: "220.00",
      grossProfit: "180.00",
      profitRate: "45.0",
      fulfilledLineCount: 2,
      pendingCostLineCount: 0,
    });
    expect(detail?.analysis.salesTimeline).toEqual([
      {
        date: "2026-06-20",
        soldQty: "0",
        orderCount: 0,
        salesAmount: "0.00",
        currency: null,
        listedCount: 1,
      },
      {
        date: "2026-06-21",
        soldQty: "1",
        orderCount: 1,
        salesAmount: "180.00",
        currency: "CNY",
        listedCount: 0,
      },
      {
        date: "2026-06-24",
        soldQty: "1",
        orderCount: 1,
        salesAmount: "220.00",
        currency: "CNY",
        listedCount: 0,
      },
    ]);
    expect(detail?.analysis.listingSellThrough).toMatchObject({
      soldCount: 2,
      matchedSaleCount: 2,
      averageDaysToSell: "3.5",
      medianDaysToSell: "3.5",
      fastestDaysToSell: 2,
      slowestDaysToSell: 5,
    });
    expect(detail?.analysis.listingLifecycle.map((item) => item.matchQuality)).toEqual([
      "SKU/平台推断",
      "SKU/平台推断",
    ]);
    expect(detail?.analysis.skuAverages).toMatchObject({
      soldQty: "2",
      salesCount: 2,
      averageSalePrice: "200.00",
      latestSalePrice: "220.00",
      minSalePrice: "180.00",
      maxSalePrice: "220.00",
      salesCurrency: "CNY",
      averageGrossProfit: null,
      grossMarginRate: null,
    });
  });

  it("rolls child SKU lot stock, item units, listings, and sales into parent detail", async () => {
    const parent = await createSku("PARENT_DETAIL");
    const childWithLot = await createSku("PARENT_DETAIL_CHILD_LOT", parent.id);
    const childWithUnit = await createSku("PARENT_DETAIL_CHILD_UNIT", parent.id);
    const platform = await prisma.platform.create({
      data: {
        storeId,
        code: `PARENT_DETAIL_${runId}`,
        name: "Parent Detail Platform",
        country: "JP",
        defaultCurrency: "CNY",
      },
    });
    const lot = await prisma.inventoryLot.create({
      data: {
        storeId,
        skuId: childWithLot.id,
        locationId: sellableLocationId,
        unitCost: "70",
        costCurrency: "CNY",
        sourceType: "TEST",
        sourceId: `${runId}_parent_detail_lot`,
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
        refId: `${runId}_parent_detail_lot`,
      },
    });
    const itemUnit = await prisma.itemUnit.create({
      data: {
        storeId,
        skuId: childWithUnit.id,
        locationId: sellableLocationId,
        unitCost: "90",
        costCurrency: "CNY",
        sourceType: "TEST",
        sourceId: `${runId}_parent_detail_unit`,
        unitCode: `UNIT_${runId}_PARENT`,
        labelCode: `LBL_${runId}_PARENT`,
        labelStatus: "ATTACHED",
        photos: ["https://example.com/parent-unit.jpg"],
        status: "AVAILABLE",
      },
    });
    await prisma.listing.createMany({
      data: [
        {
          storeId,
          platformId: platform.id,
          listingType: "SKU",
          skuId: childWithLot.id,
          listedPrice: "150",
          currency: "CNY",
          status: "ACTIVE",
          listedAt: new Date("2026-06-23T01:00:00.000Z"),
        },
        {
          storeId,
          platformId: platform.id,
          listingType: "ITEM_UNIT",
          itemUnitId: itemUnit.id,
          listedPrice: "210",
          currency: "CNY",
          status: "ACTIVE",
          listedAt: new Date("2026-06-23T02:00:00.000Z"),
        },
      ],
    });
    await createOrderWithLine(childWithLot.id, "CONFIRMED", "150", {
      platformId: platform.id,
      orderDate: "2026-06-24T12:00:00.000Z",
      allocationCost: "70",
    });
    await createOrderWithLine(childWithUnit.id, "SHIPPED", "210", {
      platformId: platform.id,
      orderDate: "2026-06-25T12:00:00.000Z",
      allocationCost: "90",
    });

    const detail = await getSkuCatalogDetail(parent.id);

    expect(detail?.childSkus.map((child) => child.id)).toEqual([
      childWithLot.id,
      childWithUnit.id,
    ]);
    expect(detail?.business.sellableQty).toBe("4");
    expect(detail?.business.activeListingCount).toBe(2);
    expect(detail?.business.salesCount).toBe(2);
    expect(detail?.analysis.inventoryDistribution).toMatchObject({
      sellableQty: "4",
      sellableLotQty: "3",
      sellableItemUnitCount: 1,
    });
    expect(detail?.reference).toMatchObject({
      sellableLotQty: "3",
      availableItemUnits: 1,
      activeListingCount: 2,
      salesLineCount: 2,
    });
    expect(detail?.analysis.activeListings).toHaveLength(2);
    expect(detail?.analysis.profitOverview).toMatchObject({
      salesAmount: "360.00",
      allocatedInventoryCost: "160.00",
      grossProfit: "200.00",
      fulfilledLineCount: 2,
    });
    expect(detail?.inventorySections.newStockLots[0]).toMatchObject({
      id: lot.id,
      skuId: childWithLot.id,
      skuCode: childWithLot.code,
      quantity: "3",
      locationName: "Detail Sellable Warehouse",
    });
    expect(detail?.inventorySections.itemUnits[0]).toMatchObject({
      id: itemUnit.id,
      skuId: childWithUnit.id,
      skuCode: childWithUnit.code,
      unitCode: `UNIT_${runId}_PARENT`,
      labelStatus: "ATTACHED",
      photoCount: 1,
      status: "AVAILABLE",
      isSellableLocation: true,
    });
  });

  it("exposes child SKU item-unit inventory rows with label and photo compliance", async () => {
    const sku = await createSku("CHILD_DETAIL_ITEM_UNITS");
    await prisma.itemUnit.create({
      data: {
        storeId,
        skuId: sku.id,
        locationId: sellableLocationId,
        unitCost: "88",
        costCurrency: "CNY",
        sourceType: "TEST",
        sourceId: `${runId}_child_detail_unit`,
        unitCode: `UNIT_${runId}_CHILD`,
        labelCode: `LBL_${runId}_CHILD`,
        labelStatus: "PRINTED",
        photos: [
          "https://example.com/child-unit-1.jpg",
          "https://example.com/child-unit-2.jpg",
        ],
        status: "AVAILABLE",
      },
    });

    const detail = await getSkuCatalogDetail(sku.id);

    expect(detail?.inventorySections.itemUnitSummary).toMatchObject({
      totalCount: 1,
      sellableCount: 1,
      pendingLabelCount: 1,
      pendingPhotoCount: 0,
    });
    expect(detail?.inventorySections.itemUnits[0]).toMatchObject({
      skuId: sku.id,
      skuCode: sku.code,
      unitCode: `UNIT_${runId}_CHILD`,
      labelCode: `LBL_${runId}_CHILD`,
      labelStatus: "PRINTED",
      photoCount: 2,
      locationName: "Detail Sellable Warehouse",
      status: "AVAILABLE",
    });
  });
});

async function createSku(suffix: string, parentSkuId?: string) {
  return await prisma.sKU.create({
    data: {
      storeId,
      code: `SKU_${runId}_${suffix}`,
      name: `SKU Catalog Detail ${suffix}`,
      parentSkuId,
    },
  });
}

async function createOrderWithLine(
  skuId: string,
  status: string,
  amount: string,
  options: {
    platformId?: string;
    orderDate?: string;
    allocationCost?: string;
  } = {}
) {
  const order = await prisma.customerOrder.create({
    data: {
      storeId,
      platformId: options.platformId,
      orderNumber: `ORD_${runId}_${status}_${amount}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`,
      customerName: `${status} Buyer`,
      orderDate: new Date(options.orderDate ?? "2026-06-22T12:00:00.000Z"),
      currency: "CNY",
      subtotal: amount,
      totalPaid: amount,
      orderStatus: status,
    },
  });

  const line = await prisma.orderLine.create({
    data: {
      orderId: order.id,
      skuId,
      quantity: "1",
      unitPrice: amount,
      lineAmount: amount,
    },
  });

  if (options.allocationCost) {
    await prisma.orderAllocation.create({
      data: {
        orderLineId: line.id,
        allocationType: "LOT",
        quantity: "1",
        unitCost: options.allocationCost,
        costAmount: options.allocationCost,
        status: "SHIPPED",
      },
    });
  }
}
