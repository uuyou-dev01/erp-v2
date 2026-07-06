import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEMO_STORE_ID = "store_1";

async function resetDemoBusinessData(storeId: string) {
  const inventorySplits = await prisma.inventorySplit.findMany({
    where: { storeId },
    select: { id: true },
  });

  await prisma.settlementLine.deleteMany({ where: { settlement: { storeId } } });
  await prisma.settlement.deleteMany({ where: { storeId } });
  await prisma.fulfillmentRequest.deleteMany({ where: { storeId } });
  await prisma.supplyReservation.deleteMany({ where: { storeId } });
  await prisma.resaleListing.deleteMany({ where: { storeId } });
  await prisma.offerVisibility.deleteMany({ where: { offer: { storeId } } });
  await prisma.supplyOfferItem.deleteMany({ where: { offer: { storeId } } });
  await prisma.supplyOffer.deleteMany({ where: { storeId } });

  await prisma.orderAllocation.deleteMany({
    where: { orderLine: { order: { storeId } } },
  });
  await prisma.orderLine.deleteMany({ where: { order: { storeId } } });
  await prisma.customerOrder.deleteMany({ where: { storeId } });

  await prisma.listing.deleteMany({ where: { storeId } });
  await prisma.stockLedger.deleteMany({ where: { storeId } });
  await prisma.inventoryLot.deleteMany({ where: { storeId } });
  await prisma.itemUnit.deleteMany({ where: { storeId } });

  await prisma.purchaseLine.deleteMany({
    where: { purchaseOrder: { storeId } },
  });
  await prisma.purchaseOrder.deleteMany({ where: { storeId } });

  await prisma.inventorySplitLine.deleteMany({
    where: { splitId: { in: inventorySplits.map((split) => split.id) } },
  });
  await prisma.inventorySplit.deleteMany({ where: { storeId } });

  await prisma.inboundShipment.deleteMany({ where: { storeId } });
  await prisma.consolidationBatch.deleteMany({ where: { storeId } });
  await prisma.inspectionEvent.deleteMany({ where: { storeId } });
  await prisma.quickEntry.deleteMany({ where: { storeId } });
  await prisma.importJob.deleteMany({ where: { storeId } });

  await prisma.productIntelligenceObservation.deleteMany({ where: { storeId } });
  await prisma.productIntelligenceItem.deleteMany({ where: { storeId } });
  await prisma.tradingRelationship.deleteMany({ where: { storeId } });
  await prisma.partner.deleteMany({ where: { storeId } });
  await prisma.sKU.deleteMany({ where: { storeId } });
}

function catalogAttrs(input: {
  productKind?: "NEW" | "USED";
  referencePrice?: string;
  referenceCost?: string;
  currency?: string;
  series?: string;
  tags?: string[];
  notes?: string;
}) {
  return {
    catalogStatus: "active",
    productKind: input.productKind ?? "NEW",
    referencePrice: input.referencePrice,
    referenceCost: input.referenceCost,
    currency: input.currency ?? "CNY",
    series: input.series,
    tags: input.tags ?? [],
    notes: input.notes,
  };
}

async function createVariant(input: {
  storeId: string;
  parentSkuId: string;
  parentName: string;
  parentCode: string;
  label: string;
  axis: string;
  category: string;
  brand: string;
  currency?: string;
  referencePrice?: string;
  referenceCost?: string;
  productKind?: "NEW" | "USED";
}) {
  const variantValues = { [input.axis]: input.label };
  return prisma.sKU.create({
    data: {
      storeId: input.storeId,
      parentSkuId: input.parentSkuId,
      catalogRole: "VARIANT",
      code: `${input.parentCode}-${input.label.replace(/\s+/g, "").toUpperCase()}`,
      name: `${input.parentName} · ${input.label}`,
      variantLabel: input.label,
      variantValues,
      nameSource: "AUTO",
      codeSource: "AUTO",
      category: input.category,
      brand: input.brand,
      attributes: {
        ...catalogAttrs({
          productKind: input.productKind,
          referencePrice: input.referencePrice,
          referenceCost: input.referenceCost,
          currency: input.currency,
        }),
        ...variantValues,
      },
    },
  });
}

async function seedDemoCatalog(storeId: string, userId: string) {
  const [cnWarehouse, jpWarehouse, forwarder, mercari, xianyu] = await Promise.all([
    prisma.location.findUniqueOrThrow({
      where: { storeId_code: { storeId, code: "WH-CN-01" } },
    }),
    prisma.location.findUniqueOrThrow({
      where: { storeId_code: { storeId, code: "WH-JP-01" } },
    }),
    prisma.location.findUniqueOrThrow({
      where: { storeId_code: { storeId, code: "FWD-01" } },
    }),
    prisma.platform.findUniqueOrThrow({
      where: { storeId_code: { storeId, code: "MERCARI" } },
    }),
    prisma.platform.findUniqueOrThrow({
      where: { storeId_code: { storeId, code: "XIAN_YU" } },
    }),
  ]);

  const aj1Group = await prisma.sKU.create({
    data: {
      storeId,
      catalogRole: "GROUP",
      code: "NIKE-555088-101",
      name: "Nike AJ1 芝加哥 2015",
      manufacturerCode: "555088-101",
      variantAxes: ["尺码"],
      nameSource: "MANUAL",
      codeSource: "AUTO",
      category: "球鞋",
      brand: "Nike",
      attributes: catalogAttrs({
        referencePrice: "45000",
        currency: "JPY",
        series: "AJ1 Chicago 2015",
        tags: ["球鞋", "高周转", "尺码"],
      }),
      description: "商品组类似 SPU，用于承载 AJ1 芝加哥 2015 这一系列。",
    },
  });
  const aj1Size41 = await createVariant({
    storeId,
    parentSkuId: aj1Group.id,
    parentName: aj1Group.name,
    parentCode: aj1Group.code,
    label: "41码",
    axis: "尺码",
    category: "球鞋",
    brand: "Nike",
    currency: "JPY",
    referencePrice: "42000",
    referenceCost: "28000",
  });
  const aj1Size42 = await createVariant({
    storeId,
    parentSkuId: aj1Group.id,
    parentName: aj1Group.name,
    parentCode: aj1Group.code,
    label: "42码",
    axis: "尺码",
    category: "球鞋",
    brand: "Nike",
    currency: "JPY",
    referencePrice: "48000",
    referenceCost: "30000",
  });
  await createVariant({
    storeId,
    parentSkuId: aj1Group.id,
    parentName: aj1Group.name,
    parentCode: aj1Group.code,
    label: "43码",
    axis: "尺码",
    category: "球鞋",
    brand: "Nike",
    currency: "JPY",
    referencePrice: "46000",
    referenceCost: "29500",
  });

  const narutoGroup = await prisma.sKU.create({
    data: {
      storeId,
      catalogRole: "GROUP",
      code: "POP-NARUTO-AKATSUKI",
      name: "火影忍者 晓组织系列",
      manufacturerCode: "NARUTO-AKATSUKI",
      variantAxes: ["角色"],
      nameSource: "MANUAL",
      codeSource: "AUTO",
      category: "潮玩",
      brand: "POP MART",
      attributes: catalogAttrs({
        referencePrice: "180",
        referenceCost: "95",
        currency: "CNY",
        series: "火影忍者 晓组织",
        tags: ["潮玩", "盲盒", "角色"],
      }),
    },
  });
  const konan = await createVariant({
    storeId,
    parentSkuId: narutoGroup.id,
    parentName: narutoGroup.name,
    parentCode: narutoGroup.code,
    label: "小南",
    axis: "角色",
    category: "潮玩",
    brand: "POP MART",
    currency: "CNY",
    referencePrice: "220",
    referenceCost: "90",
  });
  const deidara = await createVariant({
    storeId,
    parentSkuId: narutoGroup.id,
    parentName: narutoGroup.name,
    parentCode: narutoGroup.code,
    label: "迪达拉",
    axis: "角色",
    category: "潮玩",
    brand: "POP MART",
    currency: "CNY",
    referencePrice: "160",
    referenceCost: "85",
    productKind: "USED",
  });
  await createVariant({
    storeId,
    parentSkuId: narutoGroup.id,
    parentName: narutoGroup.name,
    parentCode: narutoGroup.code,
    label: "佩恩",
    axis: "角色",
    category: "潮玩",
    brand: "POP MART",
    currency: "CNY",
    referencePrice: "260",
    referenceCost: "110",
  });

  const braceletGroup = await prisma.sKU.create({
    data: {
      storeId,
      catalogRole: "GROUP",
      code: "BRACELET-AGATE",
      name: "黑胶玛瑙手串",
      variantAxes: ["规格"],
      nameSource: "MANUAL",
      codeSource: "AUTO",
      category: "饰品",
      brand: "自有",
      attributes: catalogAttrs({
        referencePrice: "299",
        referenceCost: "120",
        currency: "CNY",
        tags: ["手串", "规格"],
      }),
    },
  });
  await createVariant({
    storeId,
    parentSkuId: braceletGroup.id,
    parentName: braceletGroup.name,
    parentCode: braceletGroup.code,
    label: "10cm",
    axis: "规格",
    category: "饰品",
    brand: "自有",
    currency: "CNY",
    referencePrice: "199",
    referenceCost: "80",
  });
  await createVariant({
    storeId,
    parentSkuId: braceletGroup.id,
    parentName: braceletGroup.name,
    parentCode: braceletGroup.code,
    label: "20cm",
    axis: "规格",
    category: "饰品",
    brand: "自有",
    currency: "CNY",
    referencePrice: "299",
    referenceCost: "120",
  });
  await createVariant({
    storeId,
    parentSkuId: braceletGroup.id,
    parentName: braceletGroup.name,
    parentCode: braceletGroup.code,
    label: "30cm",
    axis: "规格",
    category: "饰品",
    brand: "自有",
    currency: "CNY",
    referencePrice: "399",
    referenceCost: "180",
  });

  const shirtGroup = await prisma.sKU.create({
    data: {
      storeId,
      catalogRole: "GROUP",
      code: "NIKE-SB-CAT-2011-BK",
      name: "Nike SB 短袖 2011 小花猫 黑色",
      manufacturerCode: "NKSB-CAT-2011-BK",
      variantAxes: ["尺码"],
      nameSource: "MANUAL",
      codeSource: "AUTO",
      category: "服装",
      brand: "Nike",
      attributes: catalogAttrs({
        referencePrice: "320",
        referenceCost: "140",
        currency: "CNY",
        tags: ["服装", "尺码", "中古可售"],
      }),
    },
  });
  await createVariant({
    storeId,
    parentSkuId: shirtGroup.id,
    parentName: shirtGroup.name,
    parentCode: shirtGroup.code,
    label: "S",
    axis: "尺码",
    category: "服装",
    brand: "Nike",
    currency: "CNY",
    referencePrice: "320",
    referenceCost: "140",
  });
  await createVariant({
    storeId,
    parentSkuId: shirtGroup.id,
    parentName: shirtGroup.name,
    parentCode: shirtGroup.code,
    label: "M",
    axis: "尺码",
    category: "服装",
    brand: "Nike",
    currency: "CNY",
    referencePrice: "340",
    referenceCost: "150",
  });
  await createVariant({
    storeId,
    parentSkuId: shirtGroup.id,
    parentName: shirtGroup.name,
    parentCode: shirtGroup.code,
    label: "L",
    axis: "尺码",
    category: "服装",
    brand: "Nike",
    currency: "CNY",
    referencePrice: "340",
    referenceCost: "150",
  });

  const basket = await prisma.sKU.create({
    data: {
      storeId,
      catalogRole: "SIMPLE",
      code: "SKU-BAMBOO-BASKET-001",
      name: "竹筐",
      nameSource: "MANUAL",
      codeSource: "AUTO",
      category: "杂货",
      brand: "无品牌",
      attributes: catalogAttrs({
        referencePrice: "68",
        referenceCost: "28",
        currency: "CNY",
        tags: ["单规格", "杂货"],
      }),
    },
  });

  const purchaseOrder = await prisma.purchaseOrder.create({
    data: {
      storeId,
      orderNo: "PO-DEMO-SPU-001",
      supplierName: "Demo Supplier",
      currency: "JPY",
      subtotal: "90000",
      totalAmount: "90000",
      status: "RECEIVED",
      orderedAt: new Date("2026-07-01T00:00:00.000Z"),
      receivedAt: new Date("2026-07-03T00:00:00.000Z"),
      destinationLocationId: jpWarehouse.id,
    },
  });

  await prisma.purchaseLine.createMany({
    data: [
      {
        purchaseOrderId: purchaseOrder.id,
        skuId: aj1Size41.id,
        quantity: "1",
        unitPrice: "28000",
        lineAmount: "28000",
      },
      {
        purchaseOrderId: purchaseOrder.id,
        skuId: aj1Size42.id,
        quantity: "2",
        unitPrice: "30000",
        lineAmount: "60000",
      },
    ],
  });

  const aj1Lot = await prisma.inventoryLot.create({
    data: {
      storeId,
      skuId: aj1Size42.id,
      locationId: jpWarehouse.id,
      unitCost: "30000",
      costCurrency: "JPY",
      sourceType: "PURCHASE",
      sourceId: purchaseOrder.id,
      receivedAt: new Date("2026-07-03T00:00:00.000Z"),
      batchLabel: "AJ1-42-DEMO",
    } as never,
  });
  await prisma.stockLedger.create({
    data: {
      storeId,
      entityType: "LOT",
      entityId: aj1Lot.id,
      locationId: jpWarehouse.id,
      deltaQty: "2",
      reason: "INBOUND_PURCHASE",
      refType: "PURCHASE_ORDER",
      refId: purchaseOrder.id,
    },
  });

  const basketLot = await prisma.inventoryLot.create({
    data: {
      storeId,
      skuId: basket.id,
      locationId: cnWarehouse.id,
      unitCost: "28",
      costCurrency: "CNY",
      sourceType: "PURCHASE",
      sourceId: "DEMO-SEED",
      receivedAt: new Date("2026-07-04T00:00:00.000Z"),
      batchLabel: "BASKET-DEMO",
    } as never,
  });
  await prisma.stockLedger.create({
    data: {
      storeId,
      entityType: "LOT",
      entityId: basketLot.id,
      locationId: cnWarehouse.id,
      deltaQty: "12",
      reason: "INBOUND_PURCHASE",
      refType: "SEED",
      refId: "DEMO-SEED",
    },
  });

  const deidaraUnit = await prisma.itemUnit.create({
    data: {
      storeId,
      skuId: deidara.id,
      locationId: forwarder.id,
      unitCost: "95",
      costCurrency: "CNY",
      unitCode: "UNIT-DEIDARA-USED-001",
      conditionGrade: "B",
      photos: ["https://placehold.co/600x600?text=Deidara"],
      notes: "中古样例：盒角轻微压痕，主体无明显瑕疵。",
      sourceType: "PURCHASE",
      sourceId: "DEMO-SEED",
    },
  });
  await prisma.stockLedger.create({
    data: {
      storeId,
      entityType: "ITEM_UNIT",
      entityId: deidaraUnit.id,
      locationId: forwarder.id,
      deltaQty: "1",
      reason: "INBOUND_PURCHASE",
      refType: "SEED",
      refId: "DEMO-SEED",
    },
  });

  await prisma.listing.createMany({
    data: [
      {
        storeId,
        platformId: mercari.id,
        skuId: aj1Size42.id,
        listingType: "SKU",
        listedPrice: "48000",
        currency: "JPY",
        status: "ACTIVE",
      },
      {
        storeId,
        platformId: xianyu.id,
        skuId: konan.id,
        listingType: "SKU",
        listedPrice: "220",
        currency: "CNY",
        status: "ACTIVE",
      },
      {
        storeId,
        platformId: xianyu.id,
        itemUnitId: deidaraUnit.id,
        listingType: "ITEM_UNIT",
        listedPrice: "160",
        currency: "CNY",
        status: "ACTIVE",
      },
    ],
  });

  const customerOrder = await prisma.customerOrder.create({
    data: {
      storeId,
      platformId: mercari.id,
      orderNumber: "SO-DEMO-SPU-001",
      customerName: "Demo Buyer",
      orderDate: new Date("2026-07-05T00:00:00.000Z"),
      currency: "JPY",
      subtotal: "52000",
      totalPaid: "52000",
      orderStatus: "CONFIRMED",
      createdAt: new Date("2026-07-05T00:00:00.000Z"),
      confirmedAt: new Date("2026-07-05T00:00:00.000Z"),
    },
  });
  await prisma.orderLine.create({
    data: {
      orderId: customerOrder.id,
      skuId: aj1Size42.id,
      quantity: "1",
      unitPrice: "52000",
      lineAmount: "52000",
      supplyStatus: "ALLOCATED_FROM_STOCK",
    },
  });

  await prisma.productIntelligenceItem.create({
    data: {
      storeId,
      title: "Nike AJ1 芝加哥 2015",
      brand: "Nike",
      category: "球鞋",
      model: "555088-101",
      productKind: "NEW",
      tags: ["公开行情", "日本", "中国"],
      visibility: "PUBLIC",
      status: "ACTIVE",
      createdById: userId,
      updatedById: userId,
      observations: {
        create: [
          {
            storeId,
            sourceType: "MARKET_SEEN",
            priceType: "SALE",
            amount: "52000",
            currency: "JPY",
            platformName: "Mercari",
            conditionGrade: "全新",
            confidence: "HIGH",
            visibility: "PUBLIC",
            observedAt: new Date("2026-07-05T00:00:00.000Z"),
            createdById: userId,
          },
          {
            storeId,
            sourceType: "MARKET_SEEN",
            priceType: "SALE",
            amount: "2380",
            currency: "CNY",
            platformName: "得物",
            conditionGrade: "全新",
            confidence: "MEDIUM",
            visibility: "PUBLIC",
            observedAt: new Date("2026-07-05T00:00:00.000Z"),
            createdById: userId,
          },
        ],
      },
    },
  });
}

async function main() {
  console.log("开始初始化数据...");

  const organization = await prisma.organization.upsert({
    where: { code: "main" },
    update: { name: "默认经营主体" },
    create: {
      name: "默认经营主体",
      code: "main",
    },
  });

  // Create default store
  const store = await prisma.store.upsert({
    where: { id: DEMO_STORE_ID },
    update: {
      name: "默认店铺",
      code: "STORE_1",
      currency: "CNY",
      organizationId: organization.id,
    },
    create: {
      id: DEMO_STORE_ID,
      organizationId: organization.id,
      name: "默认店铺",
      code: "STORE_1",
      currency: "CNY",
    },
  });

  // Create default user
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {
      role: "OWNER",
      storeId: store.id,
    },
    create: {
      email: "admin@example.com",
      name: "管理员",
      password: "hashed_password_placeholder",
      role: "OWNER",
      storeId: store.id,
    },
  });

  await prisma.membership.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: adminUser.id,
      },
    },
    update: { role: "OWNER", status: "ACTIVE" },
    create: {
      organizationId: organization.id,
      userId: adminUser.id,
      role: "OWNER",
      status: "ACTIVE",
    },
  });

  await prisma.storeAccess.upsert({
    where: {
      storeId_userId: {
        storeId: store.id,
        userId: adminUser.id,
      },
    },
    update: { role: "OWNER" },
    create: {
      storeId: store.id,
      userId: adminUser.id,
      role: "OWNER",
    },
  });

  // Create default platforms for the current Japan + China resale flow.
  const platforms = [
    {
      code: "MERCARI",
      name: "Mercari（メルカリ）",
      country: "JP",
      defaultFeeRate: 0.1,
      defaultCurrency: "JPY",
    },
    {
      code: "YAHOO_AUCTION",
      name: "Yahoo拍卖（ヤフオク）",
      country: "JP",
      defaultFeeRate: 0.088,
      defaultCurrency: "JPY",
    },
    {
      code: "SNKRDUNK",
      name: "SNKRDUNK",
      country: "JP",
      defaultFeeRate: 0.099,
      defaultCurrency: "JPY",
    },
    {
      code: "XIAN_YU",
      name: "闲鱼（Xianyu）",
      country: "CN",
      defaultFeeRate: 0,
      defaultCurrency: "CNY",
    },
  ];

  for (const p of platforms) {
    await prisma.platform.upsert({
      where: { storeId_code: { storeId: store.id, code: p.code } },
      update: {
        name: p.name,
        country: p.country,
        defaultFeeRate: p.defaultFeeRate,
        defaultCurrency: p.defaultCurrency,
      },
      create: {
        storeId: store.id,
        code: p.code,
        name: p.name,
        country: p.country,
        defaultFeeRate: p.defaultFeeRate,
        defaultCurrency: p.defaultCurrency,
      },
    });
  }

  // Create default locations
  const locations = [
    {
      code: "WH-CN-01",
      name: "中国主仓",
      type: "WAREHOUSE",
      region: "CN_SHANGHAI",
    },
    {
      code: "WH-JP-01",
      name: "日本仓库",
      type: "WAREHOUSE",
      region: "JP_TOKYO",
    },
    {
      code: "FWD-01",
      name: "集运仓",
      type: "FORWARDER",
      region: "JP_OSAKA",
    },
  ];

  for (const loc of locations) {
    await prisma.location.upsert({
      where: { storeId_code: { storeId: store.id, code: loc.code } },
      update: { name: loc.name, type: loc.type, region: loc.region },
      create: {
        storeId: store.id,
        code: loc.code,
        name: loc.name,
        type: loc.type,
        region: loc.region,
      },
    });
  }

  // Create default FX rates
  const fxRates = [
    { fromCurrency: "CNY", toCurrency: "JPY", rate: 20.5 },
    { fromCurrency: "JPY", toCurrency: "CNY", rate: 0.0488 },
    { fromCurrency: "USD", toCurrency: "CNY", rate: 7.25 },
    { fromCurrency: "USD", toCurrency: "JPY", rate: 148.5 },
  ];

  for (const fx of fxRates) {
    await prisma.fxRate.create({
      data: {
        fromCurrency: fx.fromCurrency,
        toCurrency: fx.toCurrency,
        rate: fx.rate,
        effectiveDate: new Date(),
      },
    });
  }

  await resetDemoBusinessData(store.id);
  await seedDemoCatalog(store.id, adminUser.id);

  console.log("数据初始化完成！");
  console.log(`  店铺: ${store.name}`);
  console.log(`  平台: ${platforms.length} 个`);
  console.log(`  仓库: ${locations.length} 个`);
  console.log(`  汇率: ${fxRates.length} 条`);
  console.log("  商品档案: 商品组 4 个，规格 SKU 12 个，独立 SKU 1 个");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
