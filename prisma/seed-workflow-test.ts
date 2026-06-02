import { PrismaClient } from "@prisma/client";
import Decimal from "decimal.js";

const prisma = new PrismaClient();
const STORE_ID = "store_1";

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

async function ensureBaseData() {
  const existingStore =
    (await prisma.store.findUnique({ where: { id: STORE_ID } })) ??
    (await prisma.store.findUnique({ where: { code: "STORE_1" } }));

  const store = existingStore
    ? await prisma.store.update({
        where: { id: existingStore.id },
        data: {
          name: existingStore.name || "默认店铺",
          currency: existingStore.currency || "CNY",
        },
      })
    : await prisma.store.create({
      data: {
      id: STORE_ID,
      name: "默认店铺",
      code: "STORE_1",
      currency: "CNY",
    },
  });

  const platforms = await Promise.all(
    [
      { code: "MERCARI", name: "Mercari", country: "JP", defaultFeeRate: "0.10", defaultCurrency: "JPY" },
      { code: "XIAN_YU", name: "闲鱼", country: "CN", defaultFeeRate: "0.00", defaultCurrency: "CNY" },
      { code: "EBAY", name: "eBay", country: "US", defaultFeeRate: "0.13", defaultCurrency: "USD" },
    ].map((platform) =>
      prisma.platform.upsert({
        where: { storeId_code: { storeId: store.id, code: platform.code } },
        update: platform,
        create: { ...platform, storeId: store.id },
      })
    )
  );

  const locations = await Promise.all(
    [
      {
        code: "TEST-WH-CN",
        name: "测试中国仓",
        type: "WAREHOUSE",
        region: "CN_SHANGHAI",
        isSellableDefault: true,
      },
      {
        code: "TEST-WH-JP",
        name: "测试日本仓",
        type: "WAREHOUSE",
        region: "JP_TOKYO",
        isSellableDefault: true,
      },
      {
        code: "TEST-FWD-JP",
        name: "测试集运仓",
        type: "FORWARDER",
        region: "JP_OSAKA",
        isSellableDefault: false,
      },
    ].map((location) =>
      prisma.location.upsert({
        where: { storeId_code: { storeId: store.id, code: location.code } },
        update: location,
        create: { ...location, storeId: store.id },
      })
    )
  );

  return {
    store,
    platforms: Object.fromEntries(platforms.map((platform) => [platform.code, platform])),
    locations: Object.fromEntries(locations.map((location) => [location.code, location])),
  };
}

async function cleanup() {
  const skus = await prisma.sKU.findMany({
    where: { storeId: STORE_ID, code: { startsWith: "TEST-" } },
    select: { id: true },
  });
  const skuIds = skus.map((sku) => sku.id);
  const lots = skuIds.length
    ? await prisma.inventoryLot.findMany({
        where: { storeId: STORE_ID, skuId: { in: skuIds } },
        select: { id: true },
      })
    : [];
  const itemUnits = skuIds.length
    ? await prisma.itemUnit.findMany({
        where: { storeId: STORE_ID, skuId: { in: skuIds } },
        select: { id: true },
      })
    : [];
  const lotIds = lots.map((lot) => lot.id);
  const itemUnitIds = itemUnits.map((item) => item.id);

  const orders = await prisma.customerOrder.findMany({
    where: { storeId: STORE_ID, orderNumber: { startsWith: "TEST-" } },
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);

  const orderLines = orderIds.length
    ? await prisma.orderLine.findMany({
        where: { orderId: { in: orderIds } },
        select: { id: true },
      })
    : [];
  const orderLineIds = orderLines.map((line) => line.id);

  if (orderLineIds.length) {
    await prisma.orderAllocation.deleteMany({ where: { orderLineId: { in: orderLineIds } } });
  }
  if (skuIds.length) {
    await prisma.orderAllocation.deleteMany({ where: { orderLine: { skuId: { in: skuIds } } } });
  }
  if (orderLineIds.length) {
    await prisma.orderLine.deleteMany({ where: { id: { in: orderLineIds } } });
  }
  if (skuIds.length) {
    await prisma.orderLine.deleteMany({ where: { skuId: { in: skuIds } } });
  }
  if (orderIds.length) {
    await prisma.customerOrder.deleteMany({ where: { id: { in: orderIds } } });
  }

  await prisma.quickEntry.deleteMany({
    where: {
      storeId: STORE_ID,
      OR: [{ rawProductName: { startsWith: "TEST-" } }, { batchNote: { startsWith: "TEST-" } }],
    },
  });

  await prisma.inboundShipment.deleteMany({
    where: {
      storeId: STORE_ID,
      OR: [{ trackingNo: { startsWith: "TEST-" } }, { shipmentNote: { startsWith: "TEST-" } }],
    },
  });
  await prisma.purchaseLine.deleteMany({
    where: { OR: [{ skuId: { in: skuIds } }, { purchaseOrder: { orderNo: { startsWith: "TEST-" } } }] },
  });
  await prisma.purchaseOrder.deleteMany({ where: { storeId: STORE_ID, orderNo: { startsWith: "TEST-" } } });
  await prisma.listing.deleteMany({ where: { storeId: STORE_ID, OR: [{ skuId: { in: skuIds } }, { itemUnit: { skuId: { in: skuIds } } }] } });
  await prisma.inspectionEvent.deleteMany({
    where: {
      storeId: STORE_ID,
      OR: [
        { refId: { startsWith: "test-" } },
        lotIds.length ? { refId: { in: lotIds } } : undefined,
        itemUnitIds.length ? { refId: { in: itemUnitIds } } : undefined,
      ].filter(Boolean) as Array<{ refId: { startsWith: string } } | { refId: { in: string[] } }>,
    },
  });
  await prisma.stockLedger.deleteMany({
    where: { storeId: STORE_ID, OR: [{ refId: { startsWith: "test-" } }, { entityId: { startsWith: "test-" } }] },
  });
  await prisma.itemUnit.deleteMany({ where: { storeId: STORE_ID, skuId: { in: skuIds } } });
  await prisma.inventoryLot.deleteMany({ where: { storeId: STORE_ID, skuId: { in: skuIds } } });
  await prisma.sKU.deleteMany({ where: { id: { in: skuIds } } });
}

async function createSku(code: string, name: string, brand: string, variant?: string) {
  return prisma.sKU.create({
    data: {
      storeId: STORE_ID,
      code,
      name,
      brand,
      category: "测试商品",
      attributes: variant ? { variant } : undefined,
      isAutoCreated: false,
      mergeStatus: "CONFIRMED",
    },
  });
}

async function createLot(input: {
  skuId: string;
  locationId: string;
  qty: string;
  unitCost: string;
  sourceId: string;
  receivedAt: Date;
}) {
  const lot = await prisma.inventoryLot.create({
    data: {
      storeId: STORE_ID,
      skuId: input.skuId,
      locationId: input.locationId,
      unitCost: input.unitCost,
      costCurrency: "CNY",
      sourceType: "QUICK_ENTRY",
      sourceId: input.sourceId,
      receivedAt: input.receivedAt,
      status: "ACTIVE",
      batchLabel: input.sourceId,
    },
  });

  await prisma.stockLedger.create({
    data: {
      storeId: STORE_ID,
      occurredAt: input.receivedAt,
      entityType: "LOT",
      entityId: lot.id,
      locationId: input.locationId,
      deltaQty: input.qty,
      reason: "INBOUND_PURCHASE",
      refType: "QUICK_ENTRY",
      refId: input.sourceId,
      meta: { seed: "workflow-test", unitCost: input.unitCost },
    },
  });

  return lot;
}

async function main() {
  console.log("重建工作流测试数据...");
  const { platforms, locations } = await ensureBaseData();
  await cleanup();

  const skuListed = await createSku("TEST-POP-MART-001", "TEST-泡泡玛特 打哈哈", "POP MART", "打哈哈");
  const skuNoListing = await createSku("TEST-ELEC-001", "TEST-iPhone 15 Pro 黑色", "Apple", "黑色 256G");
  const skuUsed = await createSku("TEST-USED-001", "TEST-中古相机 Canon AE-1", "Canon", "AE-1");
  const skuTransit = await createSku("TEST-FIGURE-001", "TEST-MOLLY 星际旅行", "POP MART", "隐藏款");

  await prisma.purchaseOrder.create({
    data: {
      storeId: STORE_ID,
      orderNo: "TEST-PO-MISSING-LOGISTICS",
      supplierName: "千岛",
      currency: "CNY",
      subtotal: "5100",
      totalAmount: "5100",
      status: "ORDERED",
      orderedAt: daysAgo(2),
      lines: {
        create: {
          skuId: skuNoListing.id,
          quantity: "1",
          unitPrice: "5100",
          lineAmount: "5100",
        },
      },
    },
  });

  const transitPo = await prisma.purchaseOrder.create({
    data: {
      storeId: STORE_ID,
      orderNo: "TEST-PO-IN-TRANSIT",
      supplierName: "抽盒机",
      currency: "CNY",
      subtotal: "130",
      totalAmount: "130",
      status: "SHIPPED",
      trackingNo: "TEST-TRACK-IN-TRANSIT",
      shippedAt: daysAgo(1),
      orderedAt: daysAgo(3),
      lines: {
        create: {
          skuId: skuTransit.id,
          quantity: "2",
          unitPrice: "65",
          lineAmount: "130",
        },
      },
    },
  });

  await prisma.inboundShipment.create({
    data: {
      storeId: STORE_ID,
      purchaseOrderId: transitPo.id,
      legIndex: 1,
      trackingNo: "TEST-TRACK-IN-TRANSIT",
      fromLocationId: locations["TEST-FWD-JP"].id,
      toLocationId: locations["TEST-WH-JP"].id,
      status: "IN_TRANSIT",
      shippedAt: daysAgo(1),
      shipmentNote: "TEST-正式物流待确认到货",
    },
  });

  const listedLot = await createLot({
    skuId: skuListed.id,
    locationId: locations["TEST-WH-JP"].id,
    qty: "12",
    unitCost: "48",
    sourceId: "test-listed-stock",
    receivedAt: daysAgo(18),
  });

  await prisma.listing.create({
    data: {
      storeId: STORE_ID,
      platformId: platforms.MERCARI.id,
      skuId: skuListed.id,
      listingType: "SKU",
      listedPrice: "1680",
      currency: "JPY",
      feeRateOverride: "0.10",
      shippingFeeOverride: "210",
      estimatedNet: "1302",
      status: "ACTIVE",
      listedAt: daysAgo(17),
    },
  });

  const replenishmentLot = await createLot({
    skuId: skuListed.id,
    locationId: locations["TEST-WH-JP"].id,
    qty: "10",
    unitCost: "46",
    sourceId: "test-replenishment-stock",
    receivedAt: daysAgo(2),
  });

  await prisma.quickEntry.create({
    data: {
      storeId: STORE_ID,
      sourceType: "MANUAL",
      rawBrand: "POP MART",
      rawProductName: "TEST-泡泡玛特 打哈哈 补货",
      rawVariant: "打哈哈",
      conditionType: "新品",
      quantity: "10",
      purchasePrice: "46",
      purchaseCurrency: "CNY",
      purchasePlatformText: "1688",
      purchaseTrackingNo: "TEST-REPLENISH-001",
      currentLocationText: "测试日本仓",
      listingPlatformsText: "Mercari",
      workflowStage: "INSPECTION",
      inspectionResult: "PASSED",
      processedStatus: "PARTIAL",
      generatedSkuId: skuListed.id,
      generatedLotId: replenishmentLot.id,
      batchNote: "TEST-新品补货到已有 Listing，不应进入待创建 Listing",
      createdAt: daysAgo(3),
      updatedAt: daysAgo(2),
    },
  });

  await prisma.quickEntry.create({
    data: {
      storeId: STORE_ID,
      sourceType: "MANUAL",
      rawBrand: "Apple",
      rawProductName: "TEST-iPhone 15 Pro 黑色",
      rawVariant: "黑色 256G",
      conditionType: "新品",
      quantity: "1",
      purchasePrice: "5100",
      purchaseCurrency: "CNY",
      purchasePlatformText: "闲鱼",
      workflowStage: "PURCHASE",
      processedStatus: "PARTIAL",
      batchNote: "TEST-待补物流",
      createdAt: daysAgo(5),
      updatedAt: daysAgo(5),
    },
  });

  await prisma.quickEntry.create({
    data: {
      storeId: STORE_ID,
      sourceType: "MANUAL",
      rawBrand: "POP MART",
      rawProductName: "TEST-MOLLY 星际旅行 在途",
      rawVariant: "隐藏款",
      conditionType: "新品",
      quantity: "2",
      purchasePrice: "65",
      purchaseCurrency: "CNY",
      purchaseTrackingNo: "TEST-CN-TRANSIT-001",
      transitTrackingNo: "TEST-JP-TRANSIT-001",
      currentLocationText: "测试集运仓",
      workflowStage: "LOGISTICS",
      processedStatus: "PARTIAL",
      generatedSkuId: skuTransit.id,
      batchNote: "TEST-运输中",
      createdAt: daysAgo(16),
      updatedAt: daysAgo(16),
    },
  });

  const pendingListingLot = await createLot({
    skuId: skuNoListing.id,
    locationId: locations["TEST-WH-JP"].id,
    qty: "1",
    unitCost: "5200",
    sourceId: "test-pending-listing-new",
    receivedAt: daysAgo(8),
  });
  await prisma.quickEntry.create({
    data: {
      storeId: STORE_ID,
      rawBrand: "Apple",
      rawProductName: "TEST-iPhone 15 Pro 首次 Listing",
      rawVariant: "黑色 256G",
      conditionType: "新品",
      quantity: "1",
      purchasePrice: "5200",
      purchaseCurrency: "CNY",
      purchaseTrackingNo: "TEST-LIST-001",
      currentLocationText: "测试日本仓",
      listingPlatformsText: "Mercari",
      workflowStage: "INSPECTION",
      inspectionResult: "PASSED",
      processedStatus: "PARTIAL",
      generatedSkuId: skuNoListing.id,
      generatedLotId: pendingListingLot.id,
      batchNote: "TEST-首次创建 Listing",
      createdAt: daysAgo(9),
      updatedAt: daysAgo(8),
    },
  });

  await prisma.inspectionEvent.createMany({
    data: [
      {
        storeId: STORE_ID,
        refType: "INVENTORY_LOT",
        refId: listedLot.id,
        locationId: locations["TEST-WH-JP"].id,
        result: "PASSED",
        inspectedAt: daysAgo(17),
      },
      {
        storeId: STORE_ID,
        refType: "INVENTORY_LOT",
        refId: replenishmentLot.id,
        locationId: locations["TEST-WH-JP"].id,
        result: "PASSED",
        inspectedAt: daysAgo(2),
      },
      {
        storeId: STORE_ID,
        refType: "INVENTORY_LOT",
        refId: pendingListingLot.id,
        locationId: locations["TEST-WH-JP"].id,
        result: "PASSED",
        inspectedAt: daysAgo(8),
      },
    ],
  });

  const usedItems = await Promise.all(
    ["A", "B", "C"].map((grade, index) =>
      prisma.itemUnit.create({
        data: {
          storeId: STORE_ID,
          skuId: skuUsed.id,
          locationId: locations["TEST-WH-JP"].id,
          unitCost: new Decimal(9800 + index * 300).toFixed(4),
          costCurrency: "JPY",
          conditionGrade: grade,
          sourceType: "QUICK_ENTRY",
          sourceId: `test-used-${index + 1}`,
          status: "AVAILABLE",
          notes: "TEST-中古单件待处理",
          createdAt: daysAgo(10 + index),
          updatedAt: daysAgo(10 + index),
        },
      })
    )
  );

  for (const item of usedItems) {
    await prisma.stockLedger.create({
      data: {
        storeId: STORE_ID,
        entityType: "ITEM_UNIT",
        entityId: item.id,
        locationId: item.locationId,
        deltaQty: "1",
        reason: "INBOUND_PURCHASE",
        refType: "QUICK_ENTRY",
        refId: item.sourceId,
        occurredAt: item.createdAt,
        meta: { seed: "workflow-test" },
      },
    });
  }

  await prisma.inspectionEvent.createMany({
    data: usedItems.map((item, index) => ({
      storeId: STORE_ID,
      refType: "ITEM_UNIT",
      refId: item.id,
      locationId: item.locationId,
      result: "PASSED",
      inspectedAt: daysAgo(9 + index),
    })),
  });

  await prisma.listing.create({
    data: {
      storeId: STORE_ID,
      platformId: platforms.EBAY.id,
      itemUnitId: usedItems[0].id,
      listingType: "ITEM_UNIT",
      listedPrice: "120",
      currency: "USD",
      feeRateOverride: "0.13",
      shippingFeeOverride: "18",
      status: "ACTIVE",
      listedAt: daysAgo(5),
    },
  });

  const confirmedOrder = await prisma.customerOrder.create({
    data: {
      storeId: STORE_ID,
      orderNumber: "TEST-ORDER-SHIP-001",
      platformId: platforms.MERCARI.id,
      customerName: "测试待发货客户",
      orderDate: daysAgo(1),
      currency: "JPY",
      subtotal: "1980",
      totalPaid: "1980",
      platformFee: "198",
      shippingFee: "210",
      netRevenue: "1100",
      orderStatus: "CONFIRMED",
      confirmedAt: daysAgo(1),
    },
  });
  const confirmedLine = await prisma.orderLine.create({
    data: {
      orderId: confirmedOrder.id,
      skuId: skuListed.id,
      quantity: "1",
      unitPrice: "1980",
      lineAmount: "1980",
      supplyStatus: "READY_TO_SHIP",
    },
  });
  await prisma.orderAllocation.create({
    data: {
      orderLineId: confirmedLine.id,
      allocationType: "LOT",
      lotId: listedLot.id,
      quantity: "1",
      unitCost: "48",
      costAmount: "48",
      status: "ALLOCATED",
    },
  });

  const shippedOrder = await prisma.customerOrder.create({
    data: {
      storeId: STORE_ID,
      orderNumber: "TEST-ORDER-SETTLE-001",
      platformId: platforms.EBAY.id,
      customerName: "测试待结算客户",
      orderDate: daysAgo(4),
      currency: "USD",
      subtotal: "120",
      totalPaid: "120",
      platformFee: "15.6",
      shippingFee: "18",
      netRevenue: "70",
      orderStatus: "SHIPPED",
      confirmedAt: daysAgo(4),
      shippedAt: daysAgo(3),
      trackingNo: "TEST-SHIP-SETTLE-001",
    },
  });
  await prisma.orderLine.create({
    data: {
      orderId: shippedOrder.id,
      skuId: skuUsed.id,
      quantity: "1",
      unitPrice: "120",
      lineAmount: "120",
      supplyStatus: "CONSUMED",
    },
  });

  await prisma.quickEntry.create({
    data: {
      storeId: STORE_ID,
      rawBrand: "BANDAI",
      rawProductName: "TEST-检查异常 手办",
      rawVariant: "破损盒",
      conditionType: "中古",
      quantity: "1",
      purchasePrice: "320",
      purchaseCurrency: "CNY",
      currentLocationText: "测试日本仓",
      workflowStage: "INSPECTION",
      inspectionResult: "FAILED",
      inspectionNote: "盒损严重，缺件",
      processedStatus: "PARTIAL",
      errorMessage: "TEST-质检未通过：盒损严重，缺件",
      batchNote: "TEST-检查异常",
      createdAt: daysAgo(2),
      updatedAt: daysAgo(2),
    },
  });

  console.log("工作流测试数据完成。");
  console.log("覆盖场景：");
  console.log("- 录入待补全 QuickEntry");
  console.log("- 待补物流 PurchaseOrder");
  console.log("- 运输中 InboundShipment");
  console.log("- 到货检查通过后待创建 Listing 的 InventoryLot");
  console.log("- 待创建 Listing：首次 SKU 库存批次 + 中古单件");
  console.log("- 新品补货到已有 Mercari Listing（不进入待创建 Listing）");
  console.log("- 待发货订单");
  console.log("- 待结算订单");
  console.log("- 检查异常");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
